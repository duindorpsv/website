#!/usr/bin/env python3
"""Root-owned deploy wrapper: verified image plus allowlisted Environment settings."""
import fcntl
import io
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from release import api, validate, REGISTRY
from deploy_config import (ConfigurationError, atomic_private, compose_environment,
                           database_password_file, fingerprint, private_directory,
                           read_generation, read_private, require, validate_configuration,
                           write_generation)

CONFIG_ROOT = Path('/etc/duindorp')
STATE_ROOT = Path('/var/lib/duindorp')


def command(arguments, environment, input=None):
    result = subprocess.run(arguments, env=environment, input=input, capture_output=True,
                            timeout=300, text=True)
    if result.returncode:
        # Child output may contain credentials, connection URLs or personal data.
        raise RuntimeError('Deployment command failed')
    return result.stdout


def verify(release, token, target):
    run = api('actions/runs/' + str(release['runId']), token)
    if (target != 'production' or run['head_sha'] != release['sourceSha'] or run['head_branch'] != 'main'
            or run['event'] not in ('push', 'workflow_dispatch')
            or run['path'] != '.github/workflows/production.yml'
            or run.get('conclusion') not in (None, 'success')):
        raise ValueError('Build provenance rejected')
    # A deploy-only rerun reuses checks/build from an earlier attempt. Select the
    # newest execution of each required job, so an older success cannot hide a
    # later failed rebuild. Bound the history instead of accepting a partial page.
    jobs = []
    for page in range(1, 11):
        result = api('actions/runs/' + str(release['runId'])
                     + '/jobs?filter=all&per_page=100&page=' + str(page), token)
        jobs.extend(result['jobs'])
        if len(jobs) >= result['total_count']:
            break
    else:
        raise ValueError('Workflow job history exceeds verification limit')
    for name in ('checks / verify', 'build'):
        matching = [job for job in jobs if job['name'] == name]
        if (not matching or max(matching, key=lambda job: (job['run_attempt'], job['id']))
                ['conclusion'] != 'success'):
            raise ValueError('Build checks not successful')
    artifacts = api('actions/runs/' + str(release['runId']) + '/artifacts', token)['artifacts']
    artifact = next((a for a in artifacts if a['name'] == 'release' and not a['expired']), None)
    if not artifact:
        raise ValueError('Verified production release artifact absent')
    with zipfile.ZipFile(io.BytesIO(api('actions/artifacts/' + str(artifact['id']) + '/zip',
                                     token, binary=True))) as archive:
        binding = validate(json.loads(archive.read('release.json')))
    if binding != release:
        raise ValueError('Digest is not bound to the trusted build artifact')


def installed_configuration(target):
    config = json.loads((CONFIG_ROOT / target / 'deploy.json').read_text())
    require(set(config) == {'dockerHost', 'webPort', 'baseUrl'}, 'Invalid installed configuration')
    require(config['dockerHost'] == 'unix:///run/user/' + str(os.getuid()) + '/docker.sock',
            'Installed Docker socket does not match the application identity')
    require(type(config['webPort']) is int and 1024 <= config['webPort'] <= 65535,
            'Invalid installed web port')
    return config


def ready(port, digest):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open('http://127.0.0.1:' + str(port) + '/health/ready', timeout=5) as response:
        value = json.load(response)
    if value.get('release') != digest or value.get('status') != 'ready':
        raise RuntimeError('Readiness/release check failed')


def deploy(target, request):
    if (target != 'production'
            or pwd.getpwuid(os.getuid()).pw_name != 'duindorpsv-' + target):
        raise PermissionError('Deployment identity rejected')
    if not isinstance(request, dict) or set(request) != {'release', 'token', 'configuration'}:
        raise ValueError('Invalid request')
    release = validate(request['release'])
    token = request['token']
    require(isinstance(token, str) and 1 < len(token) < 4096, 'Invalid deployment token')
    config = installed_configuration(target)
    values = validate_configuration(request['configuration'], target, config)
    os.umask(0o077)
    state = private_directory(STATE_ROOT / target)
    compose = ['docker', 'compose', '-p', 'duindorp-' + target,
               '-f', str(CONFIG_ROOT / target / 'compose.yml')]
    with open(state / 'deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = state / 'current.json'
        require(not (state / 'active.json').exists(),
                'Legacy deployment state requires an operator-reviewed upgrade')
        previous = json.loads(read_private(current)) if current.exists() else None
        latest = state / 'latest-run-id'
        if latest.exists() and int(read_private(latest)) > release['runId']:
            raise ValueError('Stale deployment rejected')
        if previous:
            previous_release = validate(previous['release'])
            if (previous_release['runId'] > release['runId']
                    or (previous_release['runId'] == release['runId'] and previous_release != release)):
                raise ValueError('Stale deployment rejected')
        verify(release, token, target)
        sha = api('git/ref/heads/main', token)['object']['sha']
        if (sha != release['sourceSha']
                or api('git/commits/' + sha, token)['tree']['sha'] != release['treeSha']):
            raise ValueError('Current main commit differs from tested release')
        if previous:
            old_values = read_generation(state, previous['configuration'])
            for key in ('DATABASE_PASSWORD', 'APP_DATABASE_PASSWORD', 'AUTH_SESSION_SECRET'):
                require(values[key] == old_values[key],
                        key + ' changed; perform a controlled credential migration first')
            for key in ('S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION'):
                require(values[key] == old_values[key],
                        key + ' changed; migrate media before changing its storage location')
            if previous['release'] == release and previous['configuration'] == fingerprint(values):
                print('Release and GitHub configuration already active')
                return
        identifier = write_generation(state, values, target)
        database_password_file(state, values)
        environment = compose_environment(target, config, state, identifier, release, REGISTRY)
        with tempfile.TemporaryDirectory(prefix='duindorp-registry-') as registry:
            environment['DOCKER_CONFIG'] = registry
            command(['docker', 'login', 'ghcr.io', '-u', 'duindorpsv', '--password-stdin'],
                    environment, input=token)
            command([*compose, 'pull', 'web', 'worker', 'migration', 'provision'], environment)
            labels = json.loads(command(['docker', 'image', 'inspect', environment['APP_IMAGE'],
                                         '--format', '{{json .Config.Labels}}'], environment))
            if labels.get('org.opencontainers.image.revision') != release['sourceSha']:
                raise ValueError('Image source label mismatch')
            if labels.get('nl.duindorpsv.source-tree') != release['treeSha']:
                raise ValueError('Image tree label mismatch')
            command([*compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'database'], environment)
            environment['DUINDORP_INITIAL_BACKUP'] = 'true' if previous is None else 'false'
            if previous:
                environment['DUINDORP_SNAPSHOT_CONFIGURATION'] = previous['configuration']
            command([str(CONFIG_ROOT / target / 'backup.sh')], environment)
            try:
                command([*compose, '--profile', 'migration', 'run', '--rm', 'migration'], environment)
                command([*compose, '--profile', 'bootstrap', 'run', '--rm', 'provision'], environment)
                if previous is None:
                    command([*compose, 'run', '--rm', '--no-deps', 'web', 'seed'], environment)
                command([*compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'web', 'worker'], environment)
                ready(config['webPort'], release['digest'])
            except Exception:
                if previous:
                    restored = compose_environment(target, config, state, previous['configuration'],
                                                   previous['release'], REGISTRY)
                    restored['DOCKER_CONFIG'] = registry
                    command([*compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'web', 'worker'], restored)
                    ready(config['webPort'], previous['release']['digest'])
                raise
            if previous:
                atomic_private(state / 'previous.json', json.dumps(previous, indent=2))
            atomic_private(latest, str(release['runId']))
            atomic_private(current, json.dumps({'release': release, 'configuration': identifier}, indent=2))
            print('Deployment healthy: ' + target + ' ' + release['digest'])


if __name__ == '__main__':
    try:
        target = Path(sys.argv[0]).name.removeprefix('duindorp-deploy-')
        raw = sys.stdin.buffer.read(131073)
        require(len(raw) <= 131072, 'Oversized deployment request')
        deploy(target, json.loads(raw))
    except Exception as error:
        message = str(error) if isinstance(error, ConfigurationError) else type(error).__name__
        print('Deployment rejected: ' + message, file=sys.stderr)
        sys.exit(1)

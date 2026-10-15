#!/usr/bin/env python3
"""Fixed S3 media and encrypted external backup; configuration is data, never shell."""
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tempfile

from deploy_config import (ConfigurationError, generation_path, read_generation,
                           read_private, require, validate_configuration)

STATE_ROOT = Path('/var/lib/duindorp')
CONFIG_ROOT = Path('/etc/duindorp')


def quiet(arguments, environment):
    result = subprocess.run(arguments, env=environment, capture_output=True, timeout=300)
    if result.returncode:
        raise RuntimeError('Backup command failed')


def backup(target, identifier, environment, initialize=False):
    require(target in ('staging', 'production')
            and pwd.getpwuid(os.getuid()).pw_name == 'duindorpsv-' + target,
            'Backup identity rejected')
    state = STATE_ROOT / target
    installed = json.loads((CONFIG_ROOT / target / 'deploy.json').read_text())
    values = validate_configuration(read_generation(state, identifier), target, installed)
    snapshot_id = environment.get('DUINDORP_SNAPSHOT_CONFIGURATION', identifier)
    source = validate_configuration(read_generation(state, snapshot_id), target, installed)
    # A credential rotation can revoke the previous key before this deployment.
    # Storage location changes are blocked by the deployer until a media migration.
    source.update(S3_ACCESS_KEY_ID=values['S3_ACCESS_KEY_ID'],
                  S3_SECRET_ACCESS_KEY=values['S3_SECRET_ACCESS_KEY'])
    # Do not inherit arbitrary credential helpers, rclone configuration or flags.
    base = {key: environment[key] for key in ('PATH', 'HOME', 'DOCKER_HOST', 'WEB_PORT',
            'APP_IMAGE', 'RELEASE_DIGEST', 'RUNTIME_ENV_FILE', 'MIGRATION_ENV_FILE',
            'PROVISION_ENV_FILE', 'DATABASE_PASSWORD_FILE')}
    media = {**base, 'RCLONE_CONFIG_MEDIA_TYPE': 's3',
             'RCLONE_CONFIG_MEDIA_PROVIDER': 'Other' if source['S3_ENDPOINT'] else 'AWS',
             'RCLONE_CONFIG_MEDIA_ACCESS_KEY_ID': source['S3_ACCESS_KEY_ID'],
             'RCLONE_CONFIG_MEDIA_SECRET_ACCESS_KEY': source['S3_SECRET_ACCESS_KEY'],
             'RCLONE_CONFIG_MEDIA_REGION': source['S3_REGION'],
             'RCLONE_CONFIG_MEDIA_ENDPOINT': source['S3_ENDPOINT'],
             'RCLONE_CONFIG_MEDIA_ENV_AUTH': 'false',
             'RCLONE_CONFIG_MEDIA_FORCE_PATH_STYLE': 'true' if source['S3_ENDPOINT'] else 'false'}
    external = {**base, 'RESTIC_REPOSITORY': values['RESTIC_REPOSITORY'],
                'RESTIC_PASSWORD': values['RESTIC_PASSWORD'],
                'AWS_ACCESS_KEY_ID': values['BACKUP_S3_ACCESS_KEY_ID'],
                'AWS_SECRET_ACCESS_KEY': values['BACKUP_S3_SECRET_ACCESS_KEY'],
                'AWS_DEFAULT_REGION': values['BACKUP_S3_REGION']}
    with tempfile.TemporaryDirectory(prefix='duindorp-backup-') as temporary:
        directory = Path(temporary)
        compose = ['docker', 'compose', '-p', 'duindorp-' + target,
                   '-f', str(CONFIG_ROOT / target / 'compose.yml')]
        with open(directory / 'database.dump', 'wb') as dump:
            result = subprocess.run([*compose, 'exec', '-T', 'database', 'pg_dump',
                                     '-U', 'duindorp_migration', '-d', 'duindorp', '--format=custom'],
                                    env=base, stdout=dump, stderr=subprocess.PIPE, timeout=300)
        if result.returncode:
            raise RuntimeError('Database backup failed')
        quiet(['rclone', 'copy', 'media:' + source['S3_BUCKET'], str(directory / 'media'),
               '--config', '/dev/null', '--quiet'], media)
        configuration = directory / 'configuration'
        configuration.mkdir(mode=0o700)
        for filename in ('runtime.env', 'migration.env', 'provision.env'):
            contents = read_private(generation_path(state, snapshot_id) / filename)
            (configuration / filename).write_text(contents)
            (configuration / filename).chmod(0o600)
        shutil.copyfile(base['DATABASE_PASSWORD_FILE'], configuration / 'database-password')
        (configuration / 'database-password').chmod(0o600)
        if initialize:
            probe = subprocess.run(['restic', 'snapshots', '--json'], env=external,
                                   capture_output=True, timeout=60)
            if probe.returncode:
                # restic init refuses an existing repository, including one with
                # a different password. An error never permits an app deployment.
                quiet(['restic', 'init'], external)
        quiet(['restic', 'backup', str(directory), '--host', 'duindorp-' + target,
               '--tag', 'duindorp-' + target, '--quiet'], external)
        quiet(['restic', 'forget', '--host', 'duindorp-' + target,
               '--tag', 'duindorp-' + target, '--group-by', 'host,tags',
               '--keep-daily', '14', '--prune', '--quiet'], external)


if __name__ == '__main__':
    try:
        backup(os.environ['DUINDORP_BACKUP_ENV'], os.environ['DUINDORP_CONFIGURATION'],
               os.environ, os.environ.get('DUINDORP_INITIAL_BACKUP') == 'true')
    except Exception as error:
        message = str(error) if isinstance(error, ConfigurationError) else type(error).__name__
        print('Backup rejected: ' + message, file=sys.stderr)
        sys.exit(1)

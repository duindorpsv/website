#!/usr/bin/env python3
"""Operator preflight/install for isolated staging helpers; never touches production."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import stat
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
import host_check
from release import validate

ROOT = Path('/')
ROOT_OWNER = 0
SOURCE = Path(__file__).resolve().parent
HELPERS = ('release.py', 'deploy_config.py', 'backup.py', 'rollback.py')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def protected(path, owner, directory=False, private=False):
    entry = path.lstat()
    require((stat.S_ISDIR(entry.st_mode) if directory else stat.S_ISREG(entry.st_mode))
            and entry.st_uid == owner and not entry.st_mode & (0o077 if private else 0o022),
            'Unsafe staging installation path')


def atomic(path, data, mode, uid, gid):
    descriptor, temporary = tempfile.mkstemp(prefix='.staging-install-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            os.fchown(stream.fileno(), uid, gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prepare(port, origin, install=False):
    require(os.geteuid() == 0, 'Run this operator preflight using sudo')
    host_check.validate_target('staging', port, origin)
    for binary in ('python3', 'runuser', 'docker', 'systemctl', 'ss', 'visudo', 'restic', 'rclone'):
        require(shutil.which(binary), 'Missing prerequisite: ' + binary)
    app = pwd.getpwnam('duindorpsv-staging')
    config = ROOT / 'etc/duindorp/staging'
    state = ROOT / 'var/lib/duindorp/staging'
    helpers = ROOT / 'usr/local/libexec/duindorp/staging-v5'
    wrapper = helpers.parent / 'duindorp-deploy-staging'
    sudoers = ROOT / 'etc/sudoers.d/duindorp-staging'
    for parent in (ROOT / 'etc/duindorp', ROOT / 'var/lib/duindorp', helpers.parent,
                   ROOT / 'etc/sudoers.d'):
        if parent.exists() or parent.is_symlink():
            protected(parent, ROOT_OWNER, directory=True)
    if config.exists() or config.is_symlink():
        protected(config, ROOT_OWNER, directory=True)
        for name in ('deploy.json', 'compose.yml', 'backup.sh'):
            file = config / name
            if file.exists() or file.is_symlink():
                protected(file, ROOT_OWNER)
    if state.exists() or state.is_symlink():
        protected(state, app.pw_uid, directory=True, private=True)
        require(not (state / 'active.json').exists() and not (state / 'active.json').is_symlink(),
                'Legacy active.json requires operator-reviewed migration; preserve its data and state')
        for name in ('current.json', 'previous.json'):
            if (state / name).exists() or (state / name).is_symlink():
                protected(state / name, app.pw_uid, private=True)
                validate(json.loads((state / name).read_text())['release'], 'staging')
    installed = {'dockerHost': 'unix:///run/user/' + str(app.pw_uid) + '/docker.sock',
                 'webPort': int(port), 'baseUrl': origin.rstrip('/')}
    if (config / 'deploy.json').exists():
        require(json.loads((config / 'deploy.json').read_text()) == installed,
                'Existing staging port/origin/socket differs; review it without replacing configuration')
    for file in (wrapper, sudoers):
        if file.exists() or file.is_symlink():
            protected(file, ROOT_OWNER)
    if helpers.exists() or helpers.is_symlink():
        protected(helpers, ROOT_OWNER, directory=True)
    # Includes isolated accounts, rootless socket, resource limits and a free
    # port. An active legacy listener must be reviewed/stopped by its operator.
    host_check.check('staging', port, origin)
    sources = {name: (SOURCE / name).read_bytes() for name in HELPERS}
    sources['duindorp-deploy-staging'] = (SOURCE / 'deploy.py').read_bytes()
    sources['deploy.py'] = sources['duindorp-deploy-staging']
    sources['compose.yml'] = (SOURCE.parent / 'compose.yml').read_bytes()
    version = hashlib.sha256(b''.join(name.encode() + data for name, data in sorted(sources.items()))).hexdigest()
    destination = helpers / version
    for name, data in sources.items():
        if destination.exists() or destination.is_symlink():
            protected(destination, ROOT_OWNER, directory=True)
            protected(destination / name, ROOT_OWNER)
            require((destination / name).read_bytes() == data, 'Installed staging helper generation differs')
    if not install:
        print('Staging preflight passed; no files, services, releases or production helpers changed')
        return version
    rule = ('runner-duindorpsv-staging ALL=(duindorpsv-staging) NOPASSWD: '
            '/usr/local/libexec/duindorp/duindorp-deploy-staging ""\n').encode()
    with tempfile.NamedTemporaryFile() as temporary:
        temporary.write(rule)
        temporary.flush()
        subprocess.run(['visudo', '-cf', temporary.name], check=True, capture_output=True, timeout=10)
    for parent in (ROOT / 'etc/duindorp', ROOT / 'var/lib/duindorp', helpers.parent, helpers):
        parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    destination.mkdir(mode=0o755, exist_ok=True)
    for name, data in sources.items():
        if not (destination / name).exists():
            atomic(destination / name, data, 0o755 if name == 'duindorp-deploy-staging' else 0o644,
                   ROOT_OWNER, ROOT_OWNER)
    config.mkdir(mode=0o750, exist_ok=True)
    os.chown(config, ROOT_OWNER, app.pw_gid)
    state.mkdir(mode=0o700, exist_ok=True)
    os.chown(state, app.pw_uid, app.pw_gid)
    atomic(config / 'deploy.json', (json.dumps(installed, indent=2) + '\n').encode(),
           0o640, ROOT_OWNER, app.pw_gid)
    atomic(config / 'compose.yml', sources['compose.yml'], 0o640, ROOT_OWNER, app.pw_gid)
    # -I ignores user PYTHONPATH; only the immutable root-owned helper directory
    # is added by the fixed deploy entrypoint. The old global helpers stay intact.
    atomic(config / 'backup.sh', ('#!/bin/sh\nset -eu\nexec /usr/bin/python3 -I '
           + str(destination / 'backup.py') + '\n').encode(), 0o750, ROOT_OWNER, app.pw_gid)
    atomic(sudoers, rule, 0o440, ROOT_OWNER, ROOT_OWNER)
    atomic(wrapper, ('#!/bin/sh\nset -eu\nexec /usr/bin/python3 -I '
           + str(destination / 'duindorp-deploy-staging') + '\n').encode(),
           0o755, ROOT_OWNER, ROOT_OWNER)
    print('Isolated staging helpers installed; no application release, restart or production change')
    return version


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port')
    parser.add_argument('origin')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Read-only preflight (default)')
    mode.add_argument('--install', action='store_true', help='Explicit operator installation; staging only')
    arguments = parser.parse_args()
    try:
        prepare(arguments.port, arguments.origin, arguments.install)
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        print('Staging setup rejected: ' + message, file=sys.stderr)
        sys.exit(1)

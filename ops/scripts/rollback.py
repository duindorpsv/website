#!/usr/bin/env python3
"""Operator-only rollback of the registered image/configuration pair; DB stays intact."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import sys

from deploy_config import (atomic_private, compose_environment, read_generation,
                           read_private, require, validate_configuration)
from deploy import command, installed_configuration, ready, STATE_ROOT, CONFIG_ROOT
from release import validate, REGISTRY


def rollback(target):
    require(target in ('staging', 'production')
            and pwd.getpwuid(os.getuid()).pw_name == 'duindorpsv-' + target,
            'Rollback requires the matching application account')
    state = STATE_ROOT / target
    with open(state / 'deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = json.loads(read_private(state / 'previous.json'))
        release = validate(previous['release'])
        installed = installed_configuration(target)
        validate_configuration(read_generation(state, previous['configuration']), target, installed)
        environment = compose_environment(target, installed, state, previous['configuration'], release, REGISTRY)
        command(['docker', 'compose', '-p', 'duindorp-' + target,
                 '-f', str(CONFIG_ROOT / target / 'compose.yml'), 'up', '-d',
                 '--wait', '--wait-timeout', '120', 'web', 'worker'], environment)
        ready(installed['webPort'], release['digest'])
        # Keep latest-run-id: rollback never permits a stale queued deployment.
        atomic_private(state / 'current.json', json.dumps(previous, indent=2))
        print('Previous image and configuration restored; database unchanged')


if __name__ == '__main__':
    try:
        require(len(sys.argv) == 2, 'Choose staging or production')
        rollback(sys.argv[1])
    except Exception as error:
        print('Rollback rejected: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)

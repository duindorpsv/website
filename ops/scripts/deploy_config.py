"""Allowlisted GitHub Environment input; private, immutable runtime generations."""
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import quote, urlsplit

SECRETS = (
    'DATABASE_PASSWORD', 'APP_DATABASE_PASSWORD', 'AUTH_SESSION_SECRET',
    'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'RESEND_API_KEY',
    'RESTIC_PASSWORD', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY',
    'SPORTLINK_CLIENT_ID',
)
VARIABLES = (
    'APP_BASE_URL', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET',
    'MAIL_FROM',
    'TRUST_PROXY_IP',
    'RESTIC_REPOSITORY', 'BACKUP_S3_REGION',
    'NEWS_IMPORT_MAX_MB', 'NEWS_IMPORT_MAX_UNPACKED_MB', 'NEWS_IMPORT_MAX_ENTRIES',
)
REQUIRED = (
    'APP_BASE_URL', 'DATABASE_PASSWORD', 'APP_DATABASE_PASSWORD', 'AUTH_SESSION_SECRET',
    'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
    'RESEND_API_KEY', 'MAIL_FROM', 'RESTIC_REPOSITORY', 'RESTIC_PASSWORD',
    'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY',
)


class ConfigurationError(ValueError):
    """Messages contain setting names only, never input values."""


def require(condition, message):
    if not condition:
        raise ConfigurationError(message)


def https_origin(value, key):
    try:
        url = urlsplit(value)
        valid = (url.scheme == 'https' and url.hostname and not url.username
                 and not url.password and url.path in ('', '/')
                 and not url.query and not url.fragment and url.port in (None, 443))
    except ValueError:
        valid = False
    require(valid and not any(c.isspace() for c in value), 'Invalid ' + key)
    return value.rstrip('/')


def validate_configuration(values, target, installed):
    require(target == 'production', 'Invalid deployment target')
    require(isinstance(values, dict) and not set(values) - set(SECRETS + VARIABLES),
            'Unknown deployment configuration keys')
    for key, value in values.items():
        require(isinstance(value, str) and len(value.encode()) <= 4096
                and not any(ord(c) < 32 or ord(c) == 127 for c in value),
                'Invalid configuration value: ' + key)
    result = {key: values.get(key, '') for key in SECRETS + VARIABLES}
    for key, default in {'S3_REGION': 'eu-west-1', 'TRUST_PROXY_IP': 'false',
                         'NEWS_IMPORT_MAX_MB': '512',
                         'NEWS_IMPORT_MAX_UNPACKED_MB': '2048', 'NEWS_IMPORT_MAX_ENTRIES': '10000'}.items():
        result[key] = result[key] or default
    result['BACKUP_S3_REGION'] = result['BACKUP_S3_REGION'] or result['S3_REGION']
    for key, minimum, maximum in [('NEWS_IMPORT_MAX_MB', 32, 2048),
                                  ('NEWS_IMPORT_MAX_UNPACKED_MB', 512, 4096),
                                  ('NEWS_IMPORT_MAX_ENTRIES', 100, 50000)]:
        require(result[key].isascii() and result[key].isdecimal()
                and minimum <= int(result[key]) <= maximum, 'Invalid ' + key)
    for key in REQUIRED:
        require(bool(result[key]), 'Missing GitHub Environment setting: ' + key)
    for key, length in [('DATABASE_PASSWORD', 24), ('APP_DATABASE_PASSWORD', 24),
                        ('AUTH_SESSION_SECRET', 32), ('RESTIC_PASSWORD', 24)]:
        require(len(result[key]) >= length, 'Configuration value too short: ' + key)
    require(result['DATABASE_PASSWORD'] != result['APP_DATABASE_PASSWORD'],
            'Use separate migration and runtime database passwords')
    result['APP_BASE_URL'] = https_origin(result['APP_BASE_URL'], 'APP_BASE_URL')
    require(result['APP_BASE_URL'] == installed['baseUrl'].rstrip('/'),
            'APP_BASE_URL differs from the installed proxy origin')
    if result['S3_ENDPOINT']:
        result['S3_ENDPOINT'] = https_origin(result['S3_ENDPOINT'], 'S3_ENDPOINT')
    require(re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', result['S3_BUCKET'])
            and '..' not in result['S3_BUCKET'], 'Invalid S3_BUCKET')
    for key in ('S3_REGION', 'BACKUP_S3_REGION'):
        require(bool(re.fullmatch(r'[A-Za-z0-9-]{1,64}', result[key])), 'Invalid ' + key)
    require(not any(c.isspace() for c in result['RESEND_API_KEY']), 'Invalid RESEND_API_KEY')
    require(result['TRUST_PROXY_IP'] in ('true', 'false'), 'Invalid TRUST_PROXY_IP')
    require(bool(re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', result['MAIL_FROM'])),
            'MAIL_FROM must be an email address')
    require(result['RESTIC_REPOSITORY'].startswith('s3:https://'),
            'RESTIC_REPOSITORY must use an external S3 HTTPS repository')
    try:
        backup = urlsplit(result['RESTIC_REPOSITORY'][3:])
        valid = (backup.hostname and not backup.username and not backup.password
                 and not backup.query and not backup.fragment and backup.path not in ('', '/')
                 and backup.port in (None, 443))
    except ValueError:
        valid = False
    require(valid and not any(c.isspace() for c in result['RESTIC_REPOSITORY']),
            'Invalid RESTIC_REPOSITORY')
    return result


def dotenv(values):
    # JSON quoting escapes quotes/backslashes; $$ suppresses Compose expansion.
    return ''.join(key + '=' + json.dumps(value.replace('$', '$$'), ensure_ascii=False)
                   + '\n' for key, value in values.items())


def private_directory(path):
    path = Path(path)
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and not info.st_mode & 0o077, 'Unsafe configuration directory')
    return path


def read_private(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and not info.st_mode & 0o077, 'Unsafe configuration file')
    return path.read_text()


def atomic_private(path, contents):
    fd, temporary = tempfile.mkstemp(prefix='.configuration-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(contents)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fingerprint(values):
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def generation_path(state, identifier):
    require(isinstance(identifier, str) and re.fullmatch(r'[0-9a-f]{64}', identifier),
            'Invalid configuration generation')
    parent = private_directory(state / 'configuration')
    path = parent / identifier
    private_directory(path)
    return path


def read_generation(state, identifier):
    values = json.loads(read_private(generation_path(state, identifier) / 'configuration.json'))
    require(fingerprint(values) == identifier, 'Configuration generation was modified')
    return values


def generation_files(values, target):
    password = quote(values['APP_DATABASE_PASSWORD'], safe='')
    migration_password = quote(values['DATABASE_PASSWORD'], safe='')
    runtime_keys = ('APP_BASE_URL', 'AUTH_SESSION_SECRET', 'S3_ENDPOINT', 'S3_REGION',
                    'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'RESEND_API_KEY',
                    'MAIL_FROM', 'TRUST_PROXY_IP', 'SPORTLINK_CLIENT_ID',
                    'NEWS_IMPORT_MAX_MB', 'NEWS_IMPORT_MAX_UNPACKED_MB', 'NEWS_IMPORT_MAX_ENTRIES')
    runtime = {key: values[key] for key in runtime_keys if values[key] != ''}
    runtime.update(APP_ENV=target, MEDIA_DRIVER='s3',
                   DATABASE_URL='postgres://duindorp_app:' + password + '@database:5432/duindorp')
    migration = {'MIGRATION_DATABASE_URL': 'postgres://duindorp_migration:'
                 + migration_password + '@database:5432/duindorp'}
    return {'configuration.json': json.dumps(values, sort_keys=True),
            'runtime.env': dotenv(runtime), 'migration.env': dotenv(migration),
            'provision.env': dotenv({**migration, 'APP_DATABASE_PASSWORD': values['APP_DATABASE_PASSWORD']})}


def write_generation(state, values, target):
    identifier = fingerprint(values)
    path = generation_path(state, identifier)
    for name, contents in generation_files(values, target).items():
        file = path / name
        if file.exists() or file.is_symlink():
            require(read_private(file) == contents, 'Configuration generation was modified')
        else:
            atomic_private(file, contents)
    return identifier


def database_password_file(state, values):
    path = state / 'database-password'
    if path.exists() or path.is_symlink():
        require(read_private(path) == values['DATABASE_PASSWORD'],
                'DATABASE_PASSWORD changed; perform a controlled database rotation first')
    else:
        atomic_private(path, values['DATABASE_PASSWORD'])
    return path


def compose_environment(target, installed, state, identifier, release, registry):
    directory = generation_path(state, identifier)
    for name, contents in generation_files(read_generation(state, identifier), target).items():
        require(read_private(directory / name) == contents, 'Configuration generation was modified')
    return {'PATH': '/usr/bin:/bin', 'HOME': pwd.getpwuid(os.getuid()).pw_dir,
            'DOCKER_HOST': installed['dockerHost'], 'WEB_PORT': str(installed['webPort']),
            'RUNTIME_ENV_FILE': str(directory / 'runtime.env'),
            'MIGRATION_ENV_FILE': str(directory / 'migration.env'),
            'PROVISION_ENV_FILE': str(directory / 'provision.env'),
            'DATABASE_PASSWORD_FILE': str(state / 'database-password'),
            'DUINDORP_BACKUP_ENV': target, 'DUINDORP_CONFIGURATION': identifier,
            'RELEASE_DIGEST': release['digest'], 'APP_IMAGE': registry + '@' + release['digest']}

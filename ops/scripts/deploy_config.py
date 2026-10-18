"""Allowlisted GitHub Environment input; private, immutable runtime generations."""
import base64
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import stat
import ssl
import tempfile
from urllib.parse import parse_qs, unquote, urlsplit

SECRETS = (
    'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'APP_DATABASE_PASSWORD', 'SUPABASE_SECRET_KEY',
    'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'RESEND_API_KEY',
    'RESTIC_PASSWORD', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY',
    'SPORTLINK_CLIENT_ID',
)
VARIABLES = (
    'APP_BASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_DB_CA_CERT_B64', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET',
    'MAIL_FROM',
    'TRUST_PROXY_IP',
    'RESTIC_REPOSITORY', 'BACKUP_S3_REGION',
    'NEWS_IMPORT_MAX_MB', 'NEWS_IMPORT_MAX_UNPACKED_MB', 'NEWS_IMPORT_MAX_ENTRIES',
)
REQUIRED = (
    'APP_BASE_URL', 'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'APP_DATABASE_PASSWORD', 'SUPABASE_SECRET_KEY',
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_DB_CA_CERT_B64', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
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
    for key, length in [('APP_DATABASE_PASSWORD', 24), ('RESTIC_PASSWORD', 24)]:
        require(len(result[key]) >= length, 'Configuration value too short: ' + key)
    result['APP_BASE_URL'] = https_origin(result['APP_BASE_URL'], 'APP_BASE_URL')
    require(result['APP_BASE_URL'] == installed['baseUrl'].rstrip('/'),
            'APP_BASE_URL differs from the installed proxy origin')
    result['SUPABASE_URL'] = https_origin(result['SUPABASE_URL'], 'SUPABASE_URL')
    project = urlsplit(result['SUPABASE_URL']).hostname
    require(bool(re.fullmatch(r'[a-z0-9]{20}\.supabase\.co', project)), 'Use the dedicated Supabase project URL')
    reference = project.split('.')[0]
    for key, prefix in [('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_'), ('SUPABASE_SECRET_KEY', 'sb_secret_')]:
        require(result[key].startswith(prefix) and not any(c.isspace() for c in result[key]), 'Invalid ' + key)
    try:
        ca = base64.b64decode(result['SUPABASE_DB_CA_CERT_B64'], validate=True).decode('ascii')
    except (ValueError, UnicodeError):
        raise ConfigurationError('Invalid SUPABASE_DB_CA_CERT_B64') from None
    require(ca.startswith('-----BEGIN CERTIFICATE-----') and '-----END CERTIFICATE-----' in ca,
            'Invalid SUPABASE_DB_CA_CERT_B64')
    try:
        ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT).load_verify_locations(cadata=ca)
    except ssl.SSLError:
        raise ConfigurationError('Invalid SUPABASE_DB_CA_CERT_B64') from None
    for key, username in [('DATABASE_URL', 'duindorp_app'), ('MIGRATION_DATABASE_URL', 'postgres')]:
        try:
            database = urlsplit(result[key])
            direct = database.hostname == 'db.' + project and database.username == username
            pooled = (bool(re.fullmatch(r'[a-z0-9-]+\.pooler\.supabase\.com', database.hostname or ''))
                      and database.username == username + '.' + reference)
            valid = (database.scheme in ('postgres', 'postgresql') and (direct or pooled)
                     and database.port in (None, 5432) and database.path == '/postgres'
                     and not database.fragment and len(unquote(database.password or '')) >= 24
                     and parse_qs(database.query) == {'sslmode': ['verify-full']})
        except ValueError:
            valid = False
        require(valid, 'Invalid Supabase session connection: ' + key)
        if key == 'DATABASE_URL':
            require(unquote(database.password) == result['APP_DATABASE_PASSWORD'], 'DATABASE_URL password differs from APP_DATABASE_PASSWORD')
        else:
            require(unquote(database.password) != result['APP_DATABASE_PASSWORD'], 'Use separate migration and runtime database passwords')
    result['S3_ENDPOINT'] = https_origin(result['S3_ENDPOINT'], 'S3_ENDPOINT')
    endpoint = urlsplit(result['S3_ENDPOINT'])
    require(endpoint.hostname in ('fsn1.your-objectstorage.com', 'nbg1.your-objectstorage.com',
                                  'hel1.your-objectstorage.com')
            and result['S3_REGION'] == endpoint.hostname.split('.')[0],
            'S3_ENDPOINT must address the configured Hetzner region without a bucket path')
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
    if backup.hostname == endpoint.hostname and backup.path.split('/')[1] == result['S3_BUCKET']:
        require(backup.path == '/' + result['S3_BUCKET'] + '/.duindorp-backups/production',
                'A shared media/backup bucket requires the reserved .duindorp-backups/production prefix')
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


def postgres_environment(connection):
    # libpq does not expand a URL supplied only through PGDATABASE. Separate
    # environment fields also keep passwords out of pg_dump command arguments.
    url = urlsplit(connection)
    return {'PGHOST': url.hostname, 'PGPORT': str(url.port or 5432),
            'PGUSER': unquote(url.username or ''), 'PGPASSWORD': unquote(url.password or ''),
            'PGDATABASE': unquote(url.path.lstrip('/')),
            'PGSSLMODE': parse_qs(url.query).get('sslmode', ['verify-full'])[0]}


def generation_files(values, target):
    runtime_keys = ('APP_BASE_URL', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
                    'SUPABASE_SECRET_KEY', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET',
                    'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'RESEND_API_KEY',
                    'MAIL_FROM', 'TRUST_PROXY_IP', 'SPORTLINK_CLIENT_ID',
                    'NEWS_IMPORT_MAX_MB', 'NEWS_IMPORT_MAX_UNPACKED_MB', 'NEWS_IMPORT_MAX_ENTRIES')
    runtime = {key: values[key] for key in runtime_keys if values[key] != ''}
    runtime.update(APP_ENV=target, MEDIA_DRIVER='s3', DATABASE_CA_CERT_B64=values['SUPABASE_DB_CA_CERT_B64'])
    migration = {'MIGRATION_DATABASE_URL': values['MIGRATION_DATABASE_URL'],
                 'DATABASE_CA_CERT_B64': values['SUPABASE_DB_CA_CERT_B64'],
                 **postgres_environment(values['MIGRATION_DATABASE_URL'])}
    return {'configuration.json': json.dumps(values, sort_keys=True),
            'database-ca.crt': base64.b64decode(values['SUPABASE_DB_CA_CERT_B64']).decode('ascii'),
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


def compose_environment(target, installed, state, identifier, release, registry):
    directory = generation_path(state, identifier)
    for name, contents in generation_files(read_generation(state, identifier), target).items():
        require(read_private(directory / name) == contents, 'Configuration generation was modified')
    return {'PATH': '/usr/bin:/bin', 'HOME': pwd.getpwuid(os.getuid()).pw_dir,
            'DOCKER_HOST': installed['dockerHost'], 'WEB_PORT': str(installed['webPort']),
            'RUNTIME_ENV_FILE': str(directory / 'runtime.env'),
            'MIGRATION_ENV_FILE': str(directory / 'migration.env'),
            'PROVISION_ENV_FILE': str(directory / 'provision.env'),
            'DUINDORP_BACKUP_ENV': target, 'DUINDORP_CONFIGURATION': identifier,
            'RELEASE_DIGEST': release['digest'], 'APP_IMAGE': registry + '@' + release['digest']}

#!/bin/bash
# Read-only backup proof against the isolated GitHub-hosted Supabase stack.
set -euo pipefail
umask 077
python3 - <<'PY'
import base64,json,os,pathlib,sys
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
sys.path.insert(0,'ops/scripts')
from deploy_config import dotenv,postgres_environment
url=urlsplit(os.environ.get('MIGRATION_DATABASE_URL',''))
if (os.environ.get('APP_ENV')!='test' or os.environ.get('SUPABASE_LOCAL_TESTS')!='true'
    or os.environ.get('GITHUB_ACTIONS')!='true' or url.hostname!='127.0.0.1'):
    raise RuntimeError('Backup verification requires the isolated local CI database')
# Production verifies TLS with the project CA. This local-only probe checks the
# actual pg_dump role/format/permissions against Supabase without a cloud target.
query=[(key,value) for key,value in parse_qsl(url.query) if key!='sslmode']+[('sslmode','disable')]
connection=urlunsplit((url.scheme,url.netloc,url.path,urlencode(query),''))
certificate=base64.b64encode(pathlib.Path('ops/tests/fixtures/supabase-ca.crt').read_bytes()).decode()
pathlib.Path('.runtime/database-backup-probe.env').write_text(dotenv({**postgres_environment(connection),'DATABASE_CA_CERT_B64':certificate}))
pathlib.Path('.runtime/database-backup-probe.override.json').write_text(json.dumps({'services':{'database-backup':{'network_mode':'host'}}}))
PY
export APP_IMAGE=duindorp-backup-unused RELEASE_DIGEST=backup-probe WEB_PORT=3000
export RUNTIME_ENV_FILE="$PWD/.runtime/local-supabase.env"
export MIGRATION_ENV_FILE="$PWD/.runtime/database-backup-probe.env"
export PROVISION_ENV_FILE="$MIGRATION_ENV_FILE"
trap 'rm -f .runtime/database-backup-probe.env .runtime/database-backup-probe.dump .runtime/database-backup-probe.list .runtime/database-backup-probe.override.json' EXIT
# Exactly the production Compose service/entrypoint; host networking is needed
# only because this disposable test database is on the runner's loopback port.
docker compose -p duindorp-backup-verification -f ops/compose.yml -f .runtime/database-backup-probe.override.json --profile backup run --rm --no-deps -T database-backup > .runtime/database-backup-probe.dump
docker run --rm -i --network none --read-only --entrypoint pg_restore postgres:17-bookworm --list < .runtime/database-backup-probe.dump > .runtime/database-backup-probe.list
python3 - <<'PY'
import json,pathlib
listing=pathlib.Path('.runtime/database-backup-probe.list').read_text()
expected=['TABLE DATA public cms_records','TABLE DATA auth users','TABLE DATA storage objects','TABLE DATA drizzle __drizzle_migrations']
if not all(name in listing for name in expected):
    raise RuntimeError('Supabase backup is missing required application/provider data')
proof={'format':'PostgreSQL custom','readable':True,'cms':True,'auth':True,'storageMetadata':True,'migrationJournal':True}
pathlib.Path('.runtime/database-backup-proof.json').write_text(json.dumps(proof)+'\n')
print('Supabase database backup verified: CMS, Auth, Storage metadata and migration journal')
PY

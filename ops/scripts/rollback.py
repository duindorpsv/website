#!/usr/bin/env python3
"""Operator-only application rollback; never restores/deletes database data."""
import json,os,pathlib,subprocess,sys,fcntl
from release import validate,REGISTRY
if len(sys.argv)!=2 or sys.argv[1] not in ['staging','production']:raise SystemExit('Choose environment')
target=sys.argv[1];root=pathlib.Path('/etc/duindorp')/target;state=pathlib.Path('/var/lib/duindorp')/target
with open(state/'deploy.lock','a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 previous=validate(json.loads((state/'previous.json').read_text()));config=json.loads((root/'deploy.json').read_text())
 environment={**os.environ,'DOCKER_HOST':config['dockerHost'],'WEB_PORT':str(config['webPort']),'RUNTIME_ENV_FILE':str(root/'runtime.env'),'MIGRATION_ENV_FILE':str(root/'migration.env'),'DATABASE_PASSWORD_FILE':str(root/'database-password'),'RELEASE_DIGEST':previous['digest'],'APP_IMAGE':REGISTRY+'@'+previous['digest']}
 subprocess.run(['docker','compose','-p','duindorp-'+target,'-f',str(root/'compose.yml'),'up','-d','--wait','--wait-timeout','120','web','worker'],env=environment,check=True)
 (state/'active.json').write_text(json.dumps(previous,indent=2));print('Previous app restored; database unchanged')

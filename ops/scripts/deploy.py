#!/usr/bin/env python3
"""Installed root-owned deployment entrypoint; never run code from a checkout."""
import fcntl,io,json,os,pathlib,pwd,subprocess,sys,tempfile,time,urllib.request,zipfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from release import api,validate,REGISTRY
CONFIG_ROOT=pathlib.Path('/etc/duindorp')
STATE_ROOT=pathlib.Path('/var/lib/duindorp')
def command(arguments,environment,input=None):
 result=subprocess.run(arguments,env=environment,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=300,text=True)
 if result.returncode:raise RuntimeError('Deployment command failed: '+arguments[0])
 return result.stdout

def verify(release,token,target):
 run=api('actions/runs/'+str(release['runId']),token)
 if run['head_sha']!=release['sourceSha'] or run['head_branch']!='staging' or run['event']!='push' or run['path']!='.github/workflows/staging.yml':raise ValueError('Build provenance rejected')
 jobs=api('actions/runs/'+str(release['runId'])+'/jobs',token)['jobs']
 if not any(j['name']=='build' and j['conclusion']=='success' for j in jobs):raise ValueError('Build checks not successful')
 artifacts=api('actions/runs/'+str(release['runId'])+'/artifacts',token)['artifacts']
 name='staging-approved' if target=='production' else 'release'
 artifact=next((a for a in artifacts if a['name']==name and not a['expired']),None)
 if not artifact or (target=='production' and run['conclusion']!='success'):raise ValueError('Required staging evidence absent')
 with zipfile.ZipFile(io.BytesIO(api('actions/artifacts/'+str(artifact['id'])+'/zip',token,binary=True))) as z:
  binding=validate(json.loads(z.read('release.json')))
 if binding!=release:raise ValueError('Digest is not bound to the trusted build artifact')
 return run

def deploy(target,request):
 if target not in ['staging','production'] or pwd.getpwuid(os.getuid()).pw_name!='duindorp-'+target:raise PermissionError('Deployment identity rejected')
 if set(request)!=set(['release','token']):raise ValueError('Invalid request')
 release=validate(request['release']);token=request['token']
 if not isinstance(token,str) or not 1<len(token)<4096:raise ValueError('Invalid token')
 config=json.loads((CONFIG_ROOT/target/'deploy.json').read_text())
 if set(config)!=set(['dockerHost','webPort','baseUrl']):raise ValueError('Invalid installed configuration')
 import shlex
 runtime={}
 for line in (CONFIG_ROOT/target/'runtime.env').read_text().splitlines():
  if not line.strip() or line.lstrip().startswith('#') or '=' not in line:continue
  key,value=line.split('=',1);parts=shlex.split(value);runtime[key.strip()]=parts[0] if parts else ''
 if runtime.get('APP_ENV')!=target or runtime.get('MEDIA_DRIVER')!='s3' or runtime.get('APP_BASE_URL','').rstrip('/')!=config['baseUrl'].rstrip('/'):raise ValueError('Runtime environment does not match the installed target')
 state=STATE_ROOT/target;state.mkdir(parents=True,exist_ok=True)
 with open(state/'deploy.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  active=state/'active.json';previous=json.loads(active.read_text()) if active.exists() else None
  if previous and previous['runId']>=release['runId']:
   if previous==release:print('Release already active');return
   raise ValueError('Stale deployment rejected')
  verify(release,token,target)
  production=api('git/ref/heads/'+target,token)['object']['sha'];tree=api('git/commits/'+production,token)['tree']['sha']
  if tree!=release['treeSha']:raise ValueError('Current branch tree differs from tested release')
  # Only protected installed files set Compose, runtime values and socket.
  base={'PATH':'/usr/bin:/bin','HOME':pwd.getpwuid(os.getuid()).pw_dir,'DOCKER_HOST':config['dockerHost'],'WEB_PORT':str(config['webPort']),'RUNTIME_ENV_FILE':str(CONFIG_ROOT/target/'runtime.env'),'MIGRATION_ENV_FILE':str(CONFIG_ROOT/target/'migration.env'),'DATABASE_PASSWORD_FILE':str(CONFIG_ROOT/target/'database-password'),'DUINDORP_BACKUP_ENV':target,'RELEASE_DIGEST':release['digest'],'APP_IMAGE':REGISTRY+'@'+release['digest']}
  compose=['docker','compose','-p','duindorp-'+target,'-f',str(CONFIG_ROOT/target/'compose.yml')]
  with tempfile.TemporaryDirectory(prefix='duindorp-registry-') as registry:
   base['DOCKER_CONFIG']=registry
   command(['docker','login','ghcr.io','-u','duindorpsv','--password-stdin'],base,input=token)
   command([*compose,'pull','web','worker','migration'],base)
   labels=json.loads(command(['docker','image','inspect',base['APP_IMAGE'],'--format','{{json .Config.Labels}}'],base))
   if labels.get('org.opencontainers.image.revision')!=release['sourceSha']:raise ValueError('Image source label mismatch')
   if target=='production':
    evidence=json.loads((state/'restore-tested.json').read_text())
    if evidence.get('digest')!=release['digest'] or evidence.get('externalBackup') is not True or not evidence.get('backupRef') or evidence.get('checks')!={'login':True,'page':True,'media':True,'formHistory':True}:raise ValueError('Production requires matching external restore evidence')
   # Backup execution is a separately installed fixed command; no destructive DB rollback.
   command([str(CONFIG_ROOT/target/'backup.sh')],base)
   command([*compose,'up','-d','database'],base)
   command([*compose,'--profile','migration','run','--rm','migration'],base)
   try:
    command([*compose,'up','-d','--wait','--wait-timeout','120','web','worker'],base)
    with urllib.request.urlopen(f"http://127.0.0.1:{config['webPort']}/health/ready",timeout=5) as response:
     ready=json.load(response)
    if ready.get('release')!=release['digest'] or ready.get('status')!='ready':raise RuntimeError('Readiness/release check failed')
   except Exception:
    if previous:
     base['APP_IMAGE']=REGISTRY+'@'+previous['digest'];base['RELEASE_DIGEST']=previous['digest'];command([*compose,'up','-d','web','worker'],base)
    raise
   if previous:(state/'previous.json').write_text(json.dumps(previous,indent=2))
   temp=state/'active.tmp';temp.write_text(json.dumps(release,indent=2));os.replace(temp,active)
   print('Deployment healthy: '+target+' '+release['digest'])
if __name__=='__main__':
 try:
  target=pathlib.Path(sys.argv[0]).name.removeprefix('duindorp-deploy-')
  raw=sys.stdin.read(16385)
  if len(raw)>16384:raise ValueError('Oversized request')
  deploy(target,json.loads(raw))
 except Exception as error:
  print('Deployment rejected: '+type(error).__name__,file=sys.stderr);sys.exit(1)

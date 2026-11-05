#!/usr/bin/env python3
"""Fixed manifests bound to the matching trusted deployment branch and workflow."""
import hashlib,json,os,re,subprocess,sys,urllib.request
REPOSITORY='duindorpsv/website'
REGISTRY='ghcr.io/duindorpsv/website'
TARGETS = {
 'production': {'branch': 'main', 'workflow': '.github/workflows/production.yml'},
 'staging': {'branch': 'staging', 'workflow': '.github/workflows/staging.yml'},
}
def deployment_target(target):
 if target not in TARGETS:raise ValueError('Invalid deployment target')
 return TARGETS[target]
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
class SafeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  from urllib.parse import urlparse
  target=urlparse(newurl)
  if target.scheme!='https':raise ValueError('Insecure artifact redirect')
  result=super().redirect_request(req,fp,code,msg,headers,newurl)
  if target.hostname!=urlparse(req.full_url).hostname:result.remove_header('Authorization')
  return result

def api(path,token=None,binary=False):
 req=urllib.request.Request('https://api.github.com/repos/'+REPOSITORY+'/'+path,headers={'Authorization':'Bearer '+(token or os.environ['GH_TOKEN']),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
 with urllib.request.build_opener(urllib.request.ProxyHandler({}),SafeRedirect()).open(req,timeout=20) as r:return r.read() if binary else json.load(r)
def validate(m,target='production'):
 expected=deployment_target(target)
 if set(m)!=set(['schemaVersion','repository','workflow','runId','sourceSha','treeSha','digest','migrationHash','configVersion']):raise ValueError('Invalid release fields')
 if m['schemaVersion']!=1 or m['repository']!=REPOSITORY or m['workflow']!=expected['workflow'] or m['configVersion']!=5:raise ValueError('Unsupported release')
 if not re.fullmatch(r'sha256:[0-9a-f]{64}',m['digest']):raise ValueError('Invalid digest')
 for k in ['sourceSha','treeSha']:
  if not re.fullmatch(r'[0-9a-f]{40}',m[k]):raise ValueError('Invalid source binding')
 if not isinstance(m['runId'],int) or m['runId']<=0 or not re.fullmatch('[0-9a-f]{64}',m['migrationHash']):raise ValueError('Invalid provenance')
 return m
if __name__=='__main__':
 action,destination=sys.argv[1:]
 if action=='create':
  h=hashlib.sha256()
  from pathlib import Path
  for p in sorted(Path('db/migrations').glob('*.sql')):h.update(p.name.encode());h.update(p.read_bytes())
  target=os.environ.get('DEPLOY_TARGET','production')
  expected=deployment_target(target)
  if os.environ.get('GITHUB_REF')!='refs/heads/'+expected['branch']:raise ValueError('Release branch rejected')
  m=validate(dict(schemaVersion=1,repository=REPOSITORY,workflow=expected['workflow'],runId=int(os.environ['BUILD_RUN_ID']),sourceSha=git('rev-parse','HEAD'),treeSha=git('rev-parse','HEAD^{tree}'),digest=os.environ['IMAGE_DIGEST'],migrationHash=h.hexdigest(),configVersion=5),target)
 else:raise ValueError('Unknown release action')
 with open(destination,'w') as file:json.dump(m,file,indent=2);file.write('\n')

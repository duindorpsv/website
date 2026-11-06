/** Read-only incident probe. Never accepts a user identifier or returns provider text. */
const trustedOrigin='https://aeykhztxyhkzyugchehv.supabase.co';
const probePath='/auth/v1/admin/users/not-a-uuid';
const timeoutMs=8000,maxBodyBytes=16*1024;
const providerCodes=['validation_failed','not_admin','bad_jwt','invalid_jwt','user_not_found','unexpected_failure','request_timeout','over_request_rate_limit'] as const;
type ProviderCode=typeof providerCodes[number];
type HeaderMode='apikey-only'|'apikey-and-bearer';
type ProbeResult='admin-route-validated'|'authorization-rejected'|'inconclusive'|'configuration-invalid'|'transport-failed';
type ErrorClass=ProviderCode|'unknown'|'none'|'invalid_response'|'transport_timeout'|'transport_unavailable'|'configuration_invalid';
export type AuthProviderProbe={header_mode:HeaderMode;http_status:number|null;elapsed_ms:number;result:ProbeResult;error_class:ErrorClass};
type Configuration={url?:string;secret?:string};

function validConfiguration(config:Configuration):config is {url:string;secret:string}{
 // An origin change must be reviewed; never send the existing production secret
 // to another project, a custom host, URL credentials, or an encoded path.
 return (config.url===trustedOrigin||config.url===trustedOrigin+'/')&&typeof config.secret==='string'&&/^sb_secret_[A-Za-z0-9_-]{1,4000}$/.test(config.secret);
}
async function boundedJson(response:Response):Promise<unknown>{
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBodyBytes)){void response.body?.cancel().catch(()=>{});throw new Error('invalid-response');}
 if(!response.body)throw new Error('invalid-response');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maxBodyBytes){void reader.cancel().catch(()=>{});throw new Error('invalid-response');}chunks.push(chunk.value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function normalizedCode(body:unknown):ErrorClass{
 if(!body||typeof body!=='object'||Array.isArray(body))return 'invalid_response';
 const {code,error_code:legacyCode}=body as Record<string,unknown>;
 // Auth API 2024-01-01 uses string code. Older hosted builds use numeric
 // code for the HTTP status, plus string error_code for the Auth error.
 // Conflicting shapes are inconclusive rather than a positive admin proof.
 if(typeof code==='string'&&typeof legacyCode==='string'&&code!==legacyCode)return 'invalid_response';
 const candidate=typeof code==='string'?code:legacyCode;
 return typeof candidate==='string'&&providerCodes.includes(candidate as ProviderCode)?candidate as ProviderCode:'unknown';
}
async function probe(secret:string,headerMode:HeaderMode,fetcher:typeof fetch):Promise<AuthProviderProbe>{
 const started=performance.now(),controller=new AbortController();let timedOut=false,status:number|null=null;
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const report=(result:ProbeResult,error_class:ErrorClass):AuthProviderProbe=>({header_mode:headerMode,http_status:status,elapsed_ms:Math.max(0,Math.round(performance.now()-started)),result,error_class});
 try{
  const headers:Record<string,string>={apikey:secret,'X-Supabase-Api-Version':'2024-01-01'};
  if(headerMode==='apikey-and-bearer')headers.Authorization='Bearer '+secret;
  const response=await fetcher(trustedOrigin+probePath,{method:'GET',headers,redirect:'error',signal:controller.signal,cache:'no-store'});
  status=response.status;
  const errorCode=normalizedCode(await boundedJson(response));
  if(status===404&&errorCode==='validation_failed')return report('admin-route-validated',errorCode);
  if(status===401||status===403)return report('authorization-rejected',errorCode);
  return report('inconclusive',errorCode);
 }catch(error){
  if(timedOut||error instanceof Error&&error.name==='TimeoutError')return report('transport-failed','transport_timeout');
  if(status!==null){controller.abort();return report(status===401||status===403?'authorization-rejected':'inconclusive','invalid_response');}
  return report('transport-failed','transport_unavailable');
 }finally{clearTimeout(timer);}
}
/**
 * A 404 + validation_failed supports the current official Auth router's ordering:
 * requireAdminCredentials precedes loadUser, whose UUID parsing precedes lookup.
 * Hosted versions can differ. A plain 404, user_not_found, or a 200 is inconclusive.
 * This does not test a linked identity, generateLink, OTP length, mail, or delivery.
 * Sources: github.com/supabase/auth internal/api/{api.go,admin.go,errors.go};
 * supabase.com/docs/guides/getting-started/api-keys (checked 2026-11-06).
 */
export async function inspectAuthProvider(config:Configuration,fetcher:typeof fetch=fetch){
 const modes:HeaderMode[]=['apikey-only','apikey-and-bearer'];
 const probes:AuthProviderProbe[]=[];
 if(!validConfiguration(config)){
  for(const mode of modes)probes.push({header_mode:mode,http_status:null,elapsed_ms:0,result:'configuration-invalid',error_class:'configuration_invalid'});
 }else{
  // Exactly two bounded GETs, no SDK validation, redirects, retries or user lookup.
  for(const mode of modes)probes.push(await probe(config.secret,mode,fetcher));
 }
 return {probe:'supabase-auth-admin-readonly' as const,context:'github-production-environment' as const,inference:'current-auth-router-order-version-dependent' as const,probes};
}

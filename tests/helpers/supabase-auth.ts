import {getAuth} from '../../lib/server/auth';

export async function authPost(action:string,body:unknown,cookies=''){
  return getAuth().handler(new Request(new URL('/api/auth/'+action,process.env.APP_BASE_URL),{method:'POST',headers:{origin:new URL(process.env.APP_BASE_URL!).origin,'Content-Type':'application/json',cookie:cookies},body:JSON.stringify(body)}));
}
export function authCookies(response:Response,previous=''){
  const jar=new Map(previous.split('; ').filter(Boolean).map(value=>{const at=value.indexOf('=');return [value.slice(0,at),value.slice(at+1)];}));
  for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  return Array.from(jar,([name,value])=>name+'='+value).join('; ');
}
export function assertLocalSupabaseTests(){
  const db=new URL(process.env.DATABASE_URL||'postgres://invalid/invalid'),api=new URL(process.env.SUPABASE_URL||'http://invalid');
  if(process.env.APP_ENV!=='test'||process.env.SUPABASE_LOCAL_TESTS!=='true'||!['127.0.0.1','localhost'].includes(db.hostname)||!['127.0.0.1','localhost'].includes(api.hostname)||!['/postgres','/duindorp_test'].includes(db.pathname))throw new Error('Integratietests vereisen de geïsoleerde lokale Supabase-teststack.');
}

export async function emailCodeFixture(email:string,resetCooldown=true){
 assertLocalSupabaseTests();
 const {clearEmailCooldown,capturedEmailCode}=await import('./email-code');
 const {sqlClient}=await import('../../db');
 const {runOnce}=await import('../../lib/server/worker');
 const {createHash}=await import('node:crypto');
 if(resetCooldown)await clearEmailCooldown(email);
 const after=Date.now(),response=await authPost('email-code/request',{email});
 if(response.status!==200)throw new Error('Synthetic code request failed');
 const cookie=authCookies(response),nonce=/duindorp-login=([a-f0-9]{64})/.exec(cookie)?.[1];
 if(!nonce)throw new Error('Synthetic code challenge missing');
 const sql=sqlClient(),operation='login-'+createHash('sha256').update(nonce).digest('hex');
 await sql`update cms_jobs set run_at='1800-01-01T00:00:00Z' where operation_id=${operation} and status='pending'`;
 await runOnce();
 const [job]=await sql`select status,last_error from cms_jobs where operation_id=${operation}`;
 if(job?.status!=='done')throw new Error('Synthetic code delivery failed: '+(job?.last_error||'unknown'));
 return {response,cookie,code:await capturedEmailCode(email,after),operation};
}
export async function loginEmail(email:string){
 const fixture=await emailCodeFixture(email),response=await authPost('email-code/verify',{email,code:fixture.code},fixture.cookie);
 if(response.status!==200)throw new Error('Synthetic email code verification failed');
 return response;
}

import {createHmac} from 'node:crypto';
import {getAuth} from '../../lib/server/auth';

export async function authPost(action:string,body:unknown,cookies=''){
  return getAuth().handler(new Request(new URL('/api/auth/'+action,process.env.APP_BASE_URL),{method:'POST',headers:{origin:new URL(process.env.APP_BASE_URL!).origin,'Content-Type':'application/json',cookie:cookies},body:JSON.stringify(body)}));
}
export function authCookies(response:Response,previous=''){
  const jar=new Map(previous.split('; ').filter(Boolean).map(value=>{const at=value.indexOf('=');return [value.slice(0,at),value.slice(at+1)];}));
  for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  return Array.from(jar,([name,value])=>name+'='+value).join('; ');
}
// RFC 6238 fixture generator, used only by tests against the real GoTrue server.
export function totp(secret:string,at=Date.now()){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=Array.from(secret.toUpperCase().replace(/=+$/,''),c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');
  const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2))),counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)!&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export function assertLocalSupabaseTests(){
  const db=new URL(process.env.DATABASE_URL||'postgres://invalid/invalid'),api=new URL(process.env.SUPABASE_URL||'http://invalid');
  if(process.env.APP_ENV!=='test'||process.env.SUPABASE_LOCAL_TESTS!=='true'||!['127.0.0.1','localhost'].includes(db.hostname)||!['127.0.0.1','localhost'].includes(api.hostname)||!['/postgres','/duindorp_test'].includes(db.pathname))throw new Error('Integratietests vereisen de geïsoleerde lokale Supabase-teststack.');
}

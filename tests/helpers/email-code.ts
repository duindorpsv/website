import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
export function assertMailFixture(){
 const database=new URL(process.env.DATABASE_URL||'http://invalid'),api=new URL(process.env.SUPABASE_URL||'http://invalid');
 if(process.env.APP_ENV!=='test'||process.env.SUPABASE_LOCAL_TESTS!=='true'||database.hostname!=='127.0.0.1'||api.hostname!=='127.0.0.1')throw new Error('Email fixtures require isolated localhost Supabase');
}
async function clearEmailLimits(email:string,prefixes:string[]){
 assertMailFixture();const sql=postgres(process.env.DATABASE_URL!,{max:1,prepare:false});
 const digest=createHash('sha256').update(email.toLowerCase()).digest('hex');
 try{await sql`delete from cms_rate_limits where key in ${sql(prefixes.map(prefix=>prefix+digest))}`;}finally{await sql.end();}
}
export async function clearEmailCooldown(email:string){
 await clearEmailLimits(email,['auth:email-send:']);
}
/** Each isolated browser test starts with its own synthetic account login budget. */
export async function clearBrowserLoginLimits(email:string){
 await clearEmailLimits(email,['auth:email-send:','auth:email-verify:']);
}
export async function capturedEmailCode(email:string,after=0){
 assertMailFixture();
 for(let attempt=0;attempt<100;attempt++){
  const body=await readFile('.runtime/mail-sink.jsonl','utf8').catch(()=>'');
  const messages=body.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const message=messages.reverse().find(message=>message.at>=after&&message.subject==='Jouw inlogcode voor Duindorp SV'&&String(message.text).includes(email));
  const code=message?.text.match(/Jouw inlogcode: (\d{8})/)?.[1];if(code)return code as string;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Synthetic login email not captured');
}

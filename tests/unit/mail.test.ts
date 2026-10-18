import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {afterEach,beforeEach,test} from 'node:test';
import {sendMail} from '../../lib/server/mail';
import {env} from '../../lib/server/env';
const settings={APP_ENV:'test',APP_BASE_URL:'http://localhost:3000',DATABASE_URL:'postgres://synthetic@localhost/unused',AUTH_SESSION_SECRET:'synthetic-session-'.repeat(4),MEDIA_DRIVER:'filesystem',RESEND_API_KEY:'synthetic-resend-contract',MAIL_FROM:'club@example.org',TEST_MAIL_TO:'mail-test@example.org',S3_BUCKET:'synthetic',S3_ACCESS_KEY_ID:'synthetic',S3_SECRET_ACCESS_KEY:'synthetic'};
const input={to:['one@example.org','two@example.org'],subject:'Ontvangstbevestiging',text:'Uw bericht is ontvangen.',messageId:'<operation-1@duindorp.invalid>',replyTo:'visitor@example.org'};
let previous:Record<string,string|undefined>;const realFetch=globalThis.fetch;
const receipt=()=>({id:crypto.randomUUID()});
const production=()=>Object.assign(process.env,{APP_ENV:'production',APP_BASE_URL:'https://club.example.org',MEDIA_DRIVER:'s3',TEST_MAIL_TO:''});
beforeEach(()=>{previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));Object.assign(process.env,settings);});
afterEach(()=>{globalThis.fetch=realFetch;for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('Resend HTTPS contract preserves content, reply-to and a stable private operation key',async()=>{
 let calls=0;const operation=createHash('sha256').update('test\0'+input.messageId).digest('hex');
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');assert.ok(options?.signal instanceof AbortSignal);
  assert.deepEqual(options?.headers,{'Authorization':'Bearer '+settings.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':`cms/${operation}/0`});
  assert.deepEqual(JSON.parse(String(options?.body)),{from:`Duindorp SV <${settings.MAIL_FROM}>`,to:[settings.TEST_MAIL_TO],subject:input.subject,text:input.text,reply_to:input.replyTo,tags:[{name:'cms_operation',value:operation}]});
  assert.ok(!String(options?.body).includes(settings.RESEND_API_KEY));return Response.json(receipt());
 };
 await sendMail(input);assert.equal(calls,1);
});
test('production batches separate envelopes without sharing addresses or using contacts/lists',async()=>{
 production();let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(url,'https://api.resend.com/emails/batch');const messages=JSON.parse(String(options?.body));
  assert.equal(messages.length,2);assert.deepEqual(messages.map((v:any)=>v.to),input.to.map(email=>[email]));
  assert.ok(messages.every((v:any)=>!('reply_to' in v)&&!('bcc' in v)&&!('cc' in v)));return Response.json({data:messages.map(receipt)});
 };
 await sendMail({...input,to:[...input.to,input.to[0]],replyTo:undefined});assert.equal(calls,1);
});
test('partial batch retries reuse identical payloads and keys; batches never exceed 100',async()=>{
 production();const requests:{url:string;body:string;headers:any}[]=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url:String(url),body:String(options?.body),headers:options?.headers});const body=JSON.parse(String(options?.body));
  if(requests.length===2)return new Response('sensitive-provider-error',{status:429});
  return Response.json(Array.isArray(body)?{data:body.map(receipt)}:receipt());
 };
 const to=Array.from({length:101},(_,i)=>`recipient-${String(i).padStart(3,'0')}@example.org`);
 await assert.rejects(sendMail({...input,to}),(e:any)=>e.code==='mail-rejected');
 await sendMail({...input,to:[...to].reverse()});assert.equal(requests.length,4);
 assert.deepEqual(requests[0],requests[2]);assert.deepEqual(requests[1],requests[3]);assert.equal(JSON.parse(requests[0].body).length,100);
 assert.equal(requests[1].url,'https://api.resend.com/emails');assert.notEqual(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
});
test('development and test require an explicit safe recipient before any API request',async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};
 for(const mode of ['development','test']){process.env.APP_ENV=mode;process.env.TEST_MAIL_TO='';await assert.rejects(sendMail(input),(error:any)=>error.code==='mail-unconfigured');}assert.equal(called,false);
});
test('missing Resend settings leave mail retryable without accessing the network',async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};process.env.RESEND_API_KEY='';
 await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-unconfigured');process.env.RESEND_API_KEY=settings.RESEND_API_KEY;process.env.MAIL_FROM='';
 await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-unconfigured');assert.equal(called,false);
});
test('only HTTP 200 with valid receipts is accepted; provider errors stay redacted',async()=>{
 for(const status of [201,202,204,301,400,401,403,409,429,500,503]){
  globalThis.fetch=async()=>new Response(status===204?null:'sensitive-provider-response',{status});
  await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-rejected'&&e.status===503&&!e.message.includes('sensitive'));
 }
 for(const invalid of [{},null,{id:'not-a-receipt'}]){globalThis.fetch=async()=>Response.json(invalid);await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-rejected');}
 production();globalThis.fetch=async()=>Response.json({data:[receipt()]});await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-rejected');
});
test('network failures and timeouts are redacted and remain retryable',async()=>{
 for(const error of [new Error(settings.RESEND_API_KEY),new DOMException('sensitive-message','TimeoutError')]){
  globalThis.fetch=async()=>{throw error;};await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-unavailable'&&e.status===503&&!e.message.includes('sensitive')&&!e.message.includes(settings.RESEND_API_KEY));
 }
});
test('invalid recipients, reply-to and header injection never reach Resend',async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};
 for(const change of [{to:[]},{to:['invalid']},{replyTo:'invalid'},{subject:'Hello\r\nBCC: bad@example.org'},{messageId:'id\nother'}])await assert.rejects(sendMail({...input,...change}),(e:any)=>e.code==='mail-invalid');assert.equal(called,false);
});
test('production rejects test redirection and requires Resend, HTTPS and S3; staging is unsupported',()=>{
 Object.assign(process.env,{APP_ENV:'production',APP_BASE_URL:'https://club.example.org',MEDIA_DRIVER:'s3'});assert.throws(env,/TEST_MAIL_TO/);process.env.TEST_MAIL_TO='';assert.equal(env().APP_ENV,'production');
 process.env.RESEND_API_KEY='';assert.throws(env,/RESEND_API_KEY/);process.env.RESEND_API_KEY=settings.RESEND_API_KEY;process.env.APP_BASE_URL='http://club.example.org';assert.throws(env,/HTTPS/);
 process.env.APP_BASE_URL='https://club.example.org';process.env.MEDIA_DRIVER='filesystem';assert.throws(env,/S3/);process.env.APP_ENV='staging';assert.throws(env,/APP_ENV/);
});

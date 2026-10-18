import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {sendMail} from '../../lib/server/mail';
import {env} from '../../lib/server/env';

const settings = {
  APP_ENV:'test', APP_BASE_URL:'http://localhost:3000',
  DATABASE_URL:'postgres://synthetic@localhost/unused', AUTH_SESSION_SECRET:'synthetic-session-'.repeat(4),
  MEDIA_DRIVER:'filesystem', SENDGRID_API_KEY:'synthetic-sendgrid-contract',
  MAIL_FROM:'club@example.org', TEST_MAIL_TO:'mail-test@example.org',
  S3_BUCKET:'synthetic', S3_ACCESS_KEY_ID:'synthetic', S3_SECRET_ACCESS_KEY:'synthetic',
};
const input = {to:['one@example.org','two@example.org'],subject:'Ontvangstbevestiging',text:'Uw bericht is ontvangen.',messageId:'<operation-1@duindorp.invalid>',replyTo:'visitor@example.org'};
let previous: Record<string,string|undefined>;
const realFetch = globalThis.fetch;
beforeEach(()=>{previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));Object.assign(process.env,settings);});
afterEach(()=>{globalThis.fetch=realFetch;for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('SendGrid HTTPS contract preserves content, reply-to and operation binding with a bounded timeout',async()=>{
  let calls=0;
  globalThis.fetch=async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.sendgrid.com/v3/mail/send');
    assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');
    assert.deepEqual(options?.headers,{'Authorization':'Bearer '+settings.SENDGRID_API_KEY,'Content-Type':'application/json'});
    assert.ok(options?.signal instanceof AbortSignal);
    const body=JSON.parse(String(options?.body));
    assert.deepEqual(body,{
      from:{email:settings.MAIL_FROM,name:'Duindorp SV'},
      personalizations:[{to:[{email:settings.TEST_MAIL_TO}]}],
      subject:input.subject,content:[{type:'text/plain',value:input.text}],reply_to:{email:input.replyTo},
      custom_args:{cms_operation_id:input.messageId},
      tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}},
    });
    assert.ok(!String(options?.body).includes(settings.SENDGRID_API_KEY));
    return new Response(null,{status:202});
  };
  await sendMail(input);assert.equal(calls,1);
});

test('production sends separate envelopes to actual recipients without a test redirect',async()=>{
  Object.assign(process.env,{APP_ENV:'production',APP_BASE_URL:'https://club.example.org',MEDIA_DRIVER:'s3',TEST_MAIL_TO:''});
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(String(options?.body));
    assert.deepEqual(body.personalizations,[{to:[{email:input.to[0]}]},{to:[{email:input.to[1]}]}]);
    assert.ok(!('reply_to' in body));return new Response(null,{status:202});
  };
  await sendMail({...input,to:[...input.to,input.to[0]],replyTo:undefined});
});

test('development and test require an explicit safe recipient before any API request',async()=>{
  let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};
  for(const mode of ['development','test']){
    process.env.APP_ENV=mode;process.env.TEST_MAIL_TO='';
    await assert.rejects(sendMail(input),(error:any)=>error.code==='mail-unconfigured');
  }
  assert.equal(called,false);
});

test('missing SendGrid settings leave mail retryable without accessing the network',async()=>{
  let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};
  process.env.SENDGRID_API_KEY='';await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-unconfigured');
  process.env.SENDGRID_API_KEY=settings.SENDGRID_API_KEY;process.env.MAIL_FROM='';
  await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-unconfigured');assert.equal(called,false);
});

test('only 202 is accepted; provider bodies and credentials never become errors',async()=>{
  for(const status of [200,204,301,400,401,403,429,500,503]){
    globalThis.fetch=async()=>new Response(status===204?null:'sensitive-provider-response',{status});
    await assert.rejects(sendMail(input),(error:any)=>error.code==='mail-rejected'&&error.status===503&&!error.message.includes('sensitive'));
  }
});

test('network failures and timeouts are redacted and remain retryable',async()=>{
  for(const error of [new Error(settings.SENDGRID_API_KEY),new DOMException('sensitive-message','TimeoutError')]){
    globalThis.fetch=async()=>{throw error;};
    await assert.rejects(sendMail(input),(e:any)=>e.code==='mail-unavailable'&&e.status===503&&!e.message.includes('sensitive')&&!e.message.includes(settings.SENDGRID_API_KEY));
  }
});

test('invalid recipients, reply-to and header injection never reach SendGrid',async()=>{
  let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};
  for(const change of [{to:[]},{to:['invalid']},{replyTo:'invalid'},{subject:'Hello\r\nBCC: bad@example.org'},{messageId:'id\nother'}]){
    await assert.rejects(sendMail({...input,...change}),(e:any)=>e.code==='mail-invalid');
  }
  assert.equal(called,false);
});

test('production rejects test redirection and requires SendGrid, HTTPS and S3; staging is unsupported',()=>{
  Object.assign(process.env,{APP_ENV:'production',APP_BASE_URL:'https://club.example.org',MEDIA_DRIVER:'s3'});
  assert.throws(env,/TEST_MAIL_TO/);process.env.TEST_MAIL_TO='';
  assert.equal(env().APP_ENV,'production');process.env.SENDGRID_API_KEY='';assert.throws(env,/SENDGRID_API_KEY/);
  process.env.SENDGRID_API_KEY=settings.SENDGRID_API_KEY;process.env.APP_BASE_URL='http://club.example.org';assert.throws(env,/HTTPS/);
  process.env.APP_BASE_URL='https://club.example.org';process.env.MEDIA_DRIVER='filesystem';assert.throws(env,/S3/);
  process.env.APP_ENV='staging';assert.throws(env,/APP_ENV/);
});

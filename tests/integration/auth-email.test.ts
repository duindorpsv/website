import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {serializeCookieHeader} from '@supabase/ssr';
import {assertLocalSupabaseTests,authPost,authCookies,emailCodeFixture,loginEmail} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {getAuth} from '../../lib/server/auth';
import {supabaseAdmin,supabaseRequest} from '../../lib/server/supabase';
import {principal,authorize} from '../../lib/server/permissions';
assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);
async function user(role='editor'){
 const password=crypto.randomUUID()+crypto.randomUUID(),created=await getAuth().api.createUser({body:{email:'code-'+crypto.randomUUID()+'@example.invalid',name:'Email code fixture',password,role:role==='admin'?'admin':'user'}});
 await sql`insert into cms_memberships(user_id,role_id) values (${created.user.id},${role})`;
 return {...created.user,password};
}
test('OTP01: real Supabase eight-digit code, HttpOnly browser binding, hash-only persistence and one-time verification',async()=>{
 const u=await user(),f=await emailCodeFixture(u.email);
 assert.ok(/^\d{8}$/.test(f.code));assert.ok(f.response.headers.getSetCookie().some(cookie=>cookie.includes('duindorp-login=')&&cookie.includes('HttpOnly')&&cookie.includes('SameSite=Strict')));
 const [pending]=await sql`select * from cms_auth_login_challenges where user_id=${u.id}`;
 assert.ok(/^[a-f0-9]{64}$/.test(pending.code_hash));assert.ok(pending.code_hash!==f.code);
 const [job]=await sql`select payload,max_attempts from cms_jobs where operation_id=${f.operation}`;
 assert.equal(job.max_attempts,1);assert.ok(!JSON.stringify(job.payload).includes(f.code));assert.equal(Object.keys(job.payload).sort().join(','),'email,nonceHash');
 assert.equal((await authPost('email-code/verify',{email:u.email,code:f.code})).status,401);
 const verified=await authPost('email-code/verify',{email:u.email,code:f.code},f.cookie);assert.equal(verified.status,200);
 const session=await getAuth().api.getSession({headers:new Headers({cookie:authCookies(verified)})});assert.equal(session?.user.id,u.id);
 assert.equal((await authPost('email-code/verify',{email:u.email,code:f.code},f.cookie)).status,401);
});
test('OTP02: five wrong guesses lock a challenge, including a later correct code',async()=>{
 const u=await user(),f=await emailCodeFixture(u.email),wrong=f.code==='00000000'?'11111111':'00000000';
 for(let i=0;i<5;i++)assert.equal((await authPost('email-code/verify',{email:u.email,code:wrong},f.cookie)).status,401);
 assert.equal((await authPost('email-code/verify',{email:u.email,code:f.code},f.cookie)).status,401);
 assert.equal((await sql`select attempts from cms_auth_login_challenges where user_id=${u.id}`)[0].attempts,5);
});
test('OTP03: expiry, changed email and a replacement challenge cannot bypass the browser/code binding',async()=>{
 const u=await user(),f=await emailCodeFixture(u.email);
 assert.equal((await authPost('email-code/verify',{email:'different@example.invalid',code:f.code},f.cookie)).status,401);
 await sql`update cms_auth_login_challenges set expires_at=now()-interval '1 second' where user_id=${u.id}`;
 assert.equal((await authPost('email-code/verify',{email:u.email,code:f.code},f.cookie)).status,401);
 const old=await emailCodeFixture(u.email),fresh=await emailCodeFixture(u.email);
 assert.equal((await authPost('email-code/verify',{email:u.email,code:old.code},old.cookie)).status,401);
 assert.equal((await authPost('email-code/verify',{email:u.email,code:fresh.code},fresh.cookie)).status,200);
});
test('OTP04: concurrent verification consumes a challenge once and global sign-out revokes every CMS session',async()=>{
 const u=await user(),first=await loginEmail(u.email),f=await emailCodeFixture(u.email);
 const results=await Promise.all([authPost('email-code/verify',{email:u.email,code:f.code},f.cookie),authPost('email-code/verify',{email:u.email,code:f.code},f.cookie)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
 const second=results.find(r=>r.status===200)!,firstCookie=authCookies(first),secondCookie=authCookies(second);
 assert.equal((await authPost('sign-out',{},secondCookie)).status,200);
 assert.equal(await getAuth().api.getSession({headers:new Headers({cookie:firstCookie})}),null);
 assert.equal(await getAuth().api.getSession({headers:new Headers({cookie:secondCookie})}),null);
});
test('OTP05: request cooldown and origin checks do not replace a pending browser challenge',async()=>{
 const u=await user(),f=await emailCodeFixture(u.email);
 const repeated=await authPost('email-code/request',{email:u.email},f.cookie);assert.equal(repeated.status,429);assert.equal(repeated.headers.getSetCookie().length,0);
 assert.equal((await authPost('email-code/verify',{email:u.email,code:f.code},f.cookie)).status,200);
 const denied=await getAuth().handler(new Request(new URL('/api/auth/email-code/request',process.env.APP_BASE_URL),{method:'POST',headers:{origin:'https://other.example.org','Content-Type':'application/json'},body:JSON.stringify({email:u.email})}));assert.equal(denied.status,403);
});
test('OTP06: unknown and disabled accounts receive the same response without account creation or a usable challenge',async()=>{
 const unknown='missing-'+crypto.randomUUID()+'@example.invalid',u=await user();await sql`update cms_memberships set active=false where user_id=${u.id}`;
 const [before]=await sql`select count(*)::int as n from auth_user`;
 const a=await authPost('email-code/request',{email:unknown}),b=await authPost('email-code/request',{email:u.email});assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(await a.json(),await b.json());
 assert.equal((await sql`select count(*)::int as n from auth_user`)[0].n,before.n);
 assert.equal((await sql`select user_id from cms_auth_login_challenges where user_id=${u.id}`).length,0);
 assert.equal((await authPost('email-code/verify',{email:unknown,code:'12345678'},authCookies(a))).status,401);
});
test('OTP07: native provider password and direct OTP sessions never receive CMS access; old password/MFA endpoints are closed',async()=>{
 const u=await user();
 for(const action of ['sign-in/email','request-password-reset','reset-password','two-factor/enable','two-factor/verify-totp'])assert.equal((await authPost(action,{email:u.email,password:u.password})).status,404);
 for(const method of ['password','otp']){
  const outgoing=new Headers(),client=supabaseRequest(new Headers(),cookies=>{for(const cookie of cookies)outgoing.append('Set-Cookie',serializeCookieHeader(cookie.name,cookie.value,cookie.options));});
  if(method==='password')assert.equal((await client.auth.signInWithPassword({email:u.email,password:u.password})).error,null);
  else{const generated=await supabaseAdmin().auth.admin.generateLink({type:'magiclink',email:u.email});assert.ok(generated.data.properties?.email_otp);assert.equal((await client.auth.verifyOtp({email:u.email,token:generated.data.properties!.email_otp,type:'email'})).error,null);}
  assert.equal(await getAuth().api.getSession({headers:new Headers({cookie:authCookies(new Response(null,{headers:outgoing}))})}),null);
 }
});
test('OTP08: an email-only administrator can authorize in production without an authenticator; CMS sessions expire after twelve hours',async()=>{
 const u=await user('admin'),login=await loginEmail(u.email),headers=new Headers({cookie:authCookies(login)}),previous=process.env.APP_ENV;
 try{process.env.APP_ENV='production';const p=await principal(headers);assert.equal(p.id,u.id);assert.equal(p.mfa,false);authorize(p,'pages','publish');}finally{process.env.APP_ENV=previous;}
 await sql`update cms_auth_email_sessions set created_at=now()-interval '13 hours' where user_id=${u.id}`;
 assert.equal(await getAuth().api.getSession({headers}),null);
});

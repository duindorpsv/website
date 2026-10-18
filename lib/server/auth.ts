import {createHash,randomBytes} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {supabaseAdmin,supabaseRequest} from './supabase';
import {CmsError,bodyJson,errorResponse} from './errors';
import {requestKey} from './request-key';

const fail=()=>new CmsError('authentication-failed','Inloggen of verifiëren is niet gelukt.',401);
const uuid=z.string().uuid();
type LoginInput={body:{email:string;password:string};headers?:Headers};

async function verified(client:SupabaseClient){
  // Never trust the cookie's user or AAL. Validate identity and JWT, then check
  // the live provider session so sign-out/revocation takes effect immediately.
  const user=await client.auth.getUser();
  if(user.error||!user.data.user)return null;
  const claims=await client.auth.getClaims();
  if(claims.error||claims.data?.claims.sub!==user.data.user.id)return null;
  const sessionId=uuid.safeParse(claims.data.claims.session_id);
  if(!sessionId.success)return null;
  const sql=sqlClient(),[session]=await sql`select id,created_at from auth.sessions where id=${sessionId.data}::uuid and user_id=${user.data.user.id}::uuid and (not_after is null or not_after>now())`;
  if(!session||Date.now()-new Date(session.created_at).getTime()>12*3600_000)return null;
  const [profile]=await sql`select id,name,email,banned from auth_user where supabase_user_id=${user.data.user.id}::uuid`;
  if(!profile||profile.banned)return null;
  const [revoked]=await sql`select user_id from cms_auth_revocations where user_id=${profile.id} and invalid_before>=${session.created_at}`;
  if(revoked)return null;
  const enrolled=!!user.data.user.factors?.some(f=>f.factor_type==='totp'&&f.status==='verified');
  return {user:{id:String(profile.id),name:String(profile.name),email:String(profile.email),twoFactorEnabled:enrolled},session:{id:sessionId.data,createdAt:new Date(session.created_at).getTime()},mfaVerified:enrolled&&claims.data.claims.aal==='aal2'};
}

async function createUser({body}:{body:{email:string;name:string;password:string;role?:string}}){
  const input=z.object({email:z.string().email(),name:z.string().min(1).max(120),password:z.string().min(12),role:z.string().optional()}).parse(body);
  const admin=supabaseAdmin(),result=await admin.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true,user_metadata:{name:input.name}});
  if(result.error||!result.data.user)throw new CmsError('account-create','Het account kon niet worden aangemaakt.',422);
  const user=result.data.user,sql=sqlClient();
  try{await sql`insert into auth_user(id,supabase_user_id,name,email,email_verified,role) values (${user.id},${user.id}::uuid,${input.name},${user.email!},true,${input.role==='admin'?'admin':'user'})`;}
  catch(error){await admin.auth.admin.deleteUser(user.id);throw error;}
  return {user:{id:user.id,email:user.email!,name:input.name}};
}

async function requestPasswordReset({body}:{body:{email:string;redirectTo?:string}}){
  const email=z.string().email().parse(body.email).toLowerCase(),sql=sqlClient();
  const [profile]=await sql`select u.id from auth_user u join cms_memberships m on m.user_id=u.id where lower(u.email)=${email} and u.supabase_user_id is not null and m.active=true and coalesce(u.banned,false)=false`;
  if(!profile)return {status:true};
  // generateLink sends no email. Activation/recovery goes through the durable
  // Resend outbox, without configuring SMTP in Supabase.
  const result=await supabaseAdmin().auth.admin.generateLink({type:'recovery',email});
  if(result.error||!result.data.properties?.hashed_token)throw new CmsError('recovery-unavailable','Accountherstel is tijdelijk niet beschikbaar.',503);
  const url=new URL('/beheer/herstel',process.env.APP_BASE_URL);
  url.searchParams.set('token',result.data.properties.hashed_token);
  await sql`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'reset-'+crypto.randomUUID()},'mail',${sql.json({to:[email],subject:'Duindorp SV — account activeren of herstellen',text:`Stel je wachtwoord in via ${url}`})})`;
  return {status:true};
}

async function signInEmail(input:LoginInput&{asResponse:true}):Promise<Response>;
async function signInEmail(input:LoginInput&{asResponse?:false}):Promise<{twoFactorRedirect:boolean}>;
async function signInEmail(input:LoginInput&{asResponse?:boolean}){
  if(input.asResponse)return handler(new Request(new URL('/api/auth/sign-in/email',process.env.APP_BASE_URL),{method:'POST',headers:{'Content-Type':'application/json',origin:new URL(process.env.APP_BASE_URL!).origin},body:JSON.stringify(input.body)}));
  const result=await supabaseRequest(input.headers||new Headers()).auth.signInWithPassword(input.body);
  if(result.error)throw fail();
  return {twoFactorRedirect:!!result.data.user?.factors?.some(f=>f.status==='verified')};
}

async function rate(request:Request,subject:string){
  const key='auth:'+requestKey(request,subject),sql=sqlClient();
  const [row]=await sql`insert into cms_rate_limits(key,count,expires_at) values (${key},1,now()+interval '15 minutes') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+interval '15 minutes' else cms_rate_limits.expires_at end returning count`;
  if(row.count>20)throw new CmsError('rate-limit','Probeer het over een kwartier opnieuw.',429);
}

async function handler(request:Request){
  const responseHeaders=new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
  try{
    const client=supabaseRequest(request.headers,(cookies,headers)=>{
      for(const cookie of cookies)responseHeaders.append('Set-Cookie',serializeCookieHeader(cookie.name,cookie.value,cookie.options));
      for(const [key,value] of Object.entries(headers))responseHeaders.set(key,value);
    });
    if(request.method!=='POST')throw new CmsError('method','Deze actie vereist POST.',405);
    if(request.headers.get('origin')!==new URL(process.env.APP_BASE_URL!).origin)throw new CmsError('origin-rejected','De herkomst van dit verzoek is niet toegestaan.',403);
    const action=new URL(request.url).pathname.replace('/api/auth/',''),body=await bodyJson(request,16_384);
    let data:unknown={status:true};
    if(action==='sign-in/email'){
      const input=z.object({email:z.string().email(),password:z.string().min(1).max(1024)}).strict().parse(body);
      await rate(request,input.email);const result=await client.auth.signInWithPassword(input);
      if(result.error||!await verified(client)){await client.auth.signOut({scope:'local'});throw fail();}
      data=result.data.user?.factors?.some(f=>f.status==='verified')?{twoFactorRedirect:true}:{};
    }else if(action==='sign-out'){
      const session=await verified(client);
      if(session)await sqlClient()`insert into cms_auth_revocations(user_id,invalid_before) values (${session.user.id},now()) on conflict(user_id) do update set invalid_before=now()`;
      if((await client.auth.signOut({scope:'global'})).error)throw fail();
    }else if(action==='request-password-reset'){
      const input=z.object({email:z.string().email(),redirectTo:z.literal('/beheer/herstel').optional()}).strict().parse(body);
      await rate(request,input.email);
      try{await requestPasswordReset({body:input});}catch{console.error(JSON.stringify({code:'auth-recovery-unavailable'}));}
    }else if(action==='reset-password'){
      const input=z.object({newPassword:z.string().min(12).max(1024),token:z.string().min(16).max(256),code:z.string().regex(/^\d{6}$/).optional()}).strict().parse(body);
      await rate(request,'recovery');
      const sql=sqlClient(),existingNonce=parseCookieHeader(request.headers.get('cookie')||'').find(c=>c.name==='duindorp-recovery')?.value;
      let session=await verified(client),nonce=existingNonce&&/^[a-f0-9]{64}$/.test(existingNonce)?existingNonce:'';
      let hash=createHash('sha256').update(nonce).digest('hex');
      const [pending]=await sql`select user_id,session_id from cms_auth_recoveries where token_hash=${hash} and expires_at>now()`;
      if(!pending||pending.user_id!==session?.user.id||pending.session_id!==session?.session.id){
        if((await client.auth.verifyOtp({type:'recovery',token_hash:input.token})).error)throw fail();
        session=await verified(client);if(!session)throw fail();
        nonce=randomBytes(32).toString('hex');hash=createHash('sha256').update(nonce).digest('hex');
        await sql`insert into cms_auth_recoveries(token_hash,user_id,session_id,expires_at) values (${hash},${session.user.id},${session.session.id}::uuid,now()+interval '10 minutes') on conflict(user_id) do update set token_hash=excluded.token_hash,session_id=excluded.session_id,expires_at=excluded.expires_at`;
        responseHeaders.append('Set-Cookie',serializeCookieHeader('duindorp-recovery',nonce,{httpOnly:true,secure:process.env.APP_BASE_URL?.startsWith('https://'),sameSite:'strict',path:'/api/auth',maxAge:600}));
      }
      if(!session)throw fail();
      if(session.user.twoFactorEnabled&&!session.mfaVerified){
        if(!input.code)return Response.json({mfaRequired:true},{headers:responseHeaders});
        const factors=await client.auth.mfa.listFactors(),factor=factors.data?.totp.find(f=>f.status==='verified');
        if(!factor||(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:input.code})).error)throw fail();
        session=await verified(client);if(!session?.mfaVerified)throw fail();
      }
      // Consume before changing the provider password: concurrent requests cannot
      // reuse the same recovery challenge for two different password updates.
      const consumed=await sql`delete from cms_auth_recoveries where token_hash=${hash} and user_id=${session.user.id} and session_id=${session.session.id}::uuid and expires_at>now() returning user_id`;
      if(consumed.length!==1)throw fail();
      if((await client.auth.updateUser({password:input.newPassword})).error)throw fail();
      await sql`insert into cms_auth_revocations(user_id,invalid_before) values (${session.user.id},now()) on conflict(user_id) do update set invalid_before=now()`;
      if((await client.auth.signOut({scope:'global'})).error)throw fail();
      responseHeaders.append('Set-Cookie',serializeCookieHeader('duindorp-recovery','',{httpOnly:true,secure:process.env.APP_BASE_URL?.startsWith('https://'),sameSite:'strict',path:'/api/auth',maxAge:0}));
    }else if(action==='two-factor/enable'||action==='two-factor/verify-totp'){
      const session=await verified(client);if(!session)throw fail();
      await rate(request,session.user.id);
      const factors=await client.auth.mfa.listFactors();if(factors.error)throw fail();
      if(action==='two-factor/enable'){
        z.object({}).strict().parse(body);
        if(Date.now()-session.session.createdAt>300_000)throw new CmsError('reauthenticate','Log opnieuw in voordat je de authenticator instelt.',401);
        if(session.user.twoFactorEnabled)throw new CmsError('mfa-enabled','Dit account heeft al een tweede factor. Log opnieuw in om die te controleren.',409);
        for(const factor of factors.data.all.filter(f=>f.status==='unverified'))if((await client.auth.mfa.unenroll({factorId:factor.id})).error)throw fail();
        const enrolled=await client.auth.mfa.enroll({factorType:'totp',issuer:'Duindorp SV',friendlyName:'Duindorp SV authenticator'});
        if(enrolled.error)throw fail();data={method:'totp',totpURI:enrolled.data.totp.uri};
      }else{
        const {code}=z.object({code:z.string().regex(/^\d{6}$/)}).strict().parse(body),factor=factors.data.all.find(f=>f.factor_type==='totp');
        if(!factor||(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code})).error)throw fail();
        await sqlClient()`update auth_user set two_factor_enabled=true where id=${session.user.id}`;
      }
    }else throw new CmsError('missing','Deze inlogactie bestaat niet.',404);
    return Response.json(data,{headers:responseHeaders});
  }catch(error){
    const response=errorResponse(error);
    for(const cookie of responseHeaders.getSetCookie())response.headers.append('Set-Cookie',cookie);
    return response;
  }
}

export function getAuth(){return {handler,api:{createUser,requestPasswordReset,signInEmail,getSession:({headers}:{headers:Headers})=>verified(supabaseRequest(headers))}};}

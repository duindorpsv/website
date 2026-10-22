import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {supabaseAdmin,supabaseRequest} from './supabase';
import {CmsError,bodyJson,errorResponse} from './errors';
import {requestKey} from './request-key';
import {sendMail} from './mail';
import {loginCodeMail,accountAccessMail} from './auth-mail';
const fail=()=>new CmsError('authentication-failed','De inlogcode is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.',401);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const codeDigest=(nonceHash:string,code:string)=>{const key=process.env.SUPABASE_SECRET_KEY;if(!key)throw new CmsError('auth-unavailable','Inloggen is tijdelijk niet beschikbaar.',503);return createHmac('sha256',key).update('duindorp-email-code\0'+nonceHash+'\0'+code).digest('hex');};
const uuid=z.string().uuid(),emailInput=z.string().trim().toLowerCase().email().max(254),cookieName='duindorp-login';
async function verified(client:SupabaseClient){
 const user=await client.auth.getUser();if(user.error||!user.data.user)return null;
 const claims=await client.auth.getClaims();if(claims.error||claims.data?.claims.sub!==user.data.user.id)return null;
 const sessionId=uuid.safeParse(claims.data.claims.session_id);if(!sessionId.success)return null;
 // CMS access requires a session registered by this app's eight-digit code flow.
 // Direct provider password/recovery/magic-link sessions cannot bypass it.
 const sql=sqlClient(),[profile]=await sql`select u.id,u.name,u.email,u.banned from auth_user u join cms_auth_email_sessions s on s.user_id=u.id where u.supabase_user_id=${user.data.user.id}::uuid and s.session_id=${sessionId.data}::uuid and s.created_at>now()-interval '12 hours'`;
 if(!profile||profile.banned)return null;
 const live=await supabaseAdmin().rpc('cms_auth_session',{provider_session:sessionId.data,provider_user:user.data.user.id});
 if(live.error)throw new CmsError('auth-unavailable','Inloggen is tijdelijk niet beschikbaar.',503);
 const session=live.data?.[0];if(!session||Date.now()-new Date(session.created_at).getTime()>12*3600_000)return null;
 const [revoked]=await sql`select user_id from cms_auth_revocations where user_id=${profile.id} and invalid_before>=${session.created_at}`;
 if(revoked)return null;
 return {user:{id:String(profile.id),name:String(profile.name),email:String(profile.email),providerEmail:user.data.user.email||''},session:{id:sessionId.data,createdAt:new Date(session.created_at).getTime()}};
}
async function createUser({body}:{body:{email:string;name:string;password:string;role?:string}}){
 const input=z.object({email:emailInput,name:z.string().min(1).max(120),password:z.string().min(12),role:z.string().optional()}).parse(body);
 const admin=supabaseAdmin(),result=await admin.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true,user_metadata:{name:input.name}});
 if(result.error||!result.data.user)throw new CmsError('account-create','Het account kon niet worden aangemaakt.',422);
 const user=result.data.user,sql=sqlClient();
 try{await sql.begin(async tx=>{
  await tx`insert into auth_user(id,supabase_user_id,name,email,email_verified,role) values (${user.id},${user.id}::uuid,${input.name},${user.email!},true,${input.role==='admin'?'admin':'user'})`;
  const personId='person-account-'+user.id;
  await tx`insert into cms_records(id,module,title,draft,status) values (${personId},'people',${input.name},${tx.json({id:personId,name:input.name,role:'',group:'',teamId:'',bio:'',mediaId:'',email:user.email!,phone:'',showContact:false,published:false,order:0})},'draft')`;
  await tx`insert into cms_person_accounts(person_id,user_id) values (${personId},${user.id})`;
  await tx`insert into cms_directory_profiles(person_id,data) values (${personId},${tx.json({personId,birthDate:'',membership:'none',status:'active',labels:[],teamIds:[],address:'',postalCode:'',city:'',source:'account',sourceUpdatedAt:'',updatedAt:new Date().toISOString(),sponsorIds:[]})})`;
 });}
 catch(error){await admin.auth.admin.deleteUser(user.id);throw error;}
 return {user:{id:user.id,email:user.email!,name:input.name}};
}
async function notifyAccountAccess({body}:{body:{email:string}}){
 const email=emailInput.parse(body.email),sql=sqlClient();
 const [profile]=await sql`select u.id from auth_user u join cms_memberships m on m.user_id=u.id where lower(u.email)=${email} and u.supabase_user_id is not null and m.active=true and coalesce(u.banned,false)=false`;
 if(profile)await sql`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'access-'+crypto.randomUUID()},'mail',${sql.json({to:[email],...accountAccessMail(email)})})`;
 return {status:true};
}
export async function deliverEmailCode(input:{email:string;nonceHash:string},messageId:string){
 const sql=sqlClient();
 // Atomically issue each challenge only once. Timeout/crash retries cannot
 // invalidate a code already accepted by Resend or reuse its idempotency key
 // with a different email body. The user can request a fresh code after a minute.
 const [pending]=await sql`with issued as (update cms_auth_login_challenges set issued_at=now() where nonce_hash=${input.nonceHash} and issued_at is null and expires_at>now() and attempts<5 returning *) select i.*,u.supabase_user_id,u.email from issued i join auth_user u on u.id=i.user_id join cms_memberships m on m.user_id=u.id where lower(u.email)=${input.email} and m.active=true and coalesce(u.banned,false)=false`;
 if(!pending)return;
 const admin=supabaseAdmin(),provider=await admin.auth.admin.getUserById(pending.supabase_user_id);
 if(provider.error||provider.data.user?.email?.toLowerCase()!==input.email)throw new CmsError('auth-identity','De inlogmail kon niet worden voorbereid.',503);
 const generated=await admin.auth.admin.generateLink({type:'magiclink',email:input.email}),code=generated.data.properties?.email_otp;
 if(generated.error||!code||!/^\d{8}$/.test(code))throw new CmsError('auth-otp-configuration','Stel in Supabase de e-mailcode in op acht cijfers.',503);
 const changed=await sql`update cms_auth_login_challenges set code_hash=${codeDigest(input.nonceHash,code)} where nonce_hash=${input.nonceHash} and expires_at>now() and attempts<5 returning user_id`;
 if(!changed.length)return;
 await sendMail({to:[input.email],...loginCodeMail(input.email,code),messageId});
}

async function rate(key:string,maximum:number,seconds:number){
 const sql=sqlClient();
 const [row]=await sql`insert into cms_rate_limits(key,count,expires_at) values (${key},1,now()+${seconds}*interval '1 second') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+${seconds}*interval '1 second' else cms_rate_limits.expires_at end returning count`;
 if(row.count>maximum)throw new CmsError('rate-limit',seconds===60?'Wacht een minuut voordat je een nieuwe code aanvraagt.':'Te veel pogingen. Probeer het over een kwartier opnieuw.',429);
}
async function handler(request:Request){
 const responseHeaders=new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
 const setNonce=(nonce:string)=>responseHeaders.append('Set-Cookie',serializeCookieHeader(cookieName,nonce,{httpOnly:true,secure:process.env.APP_BASE_URL?.startsWith('https://'),sameSite:'strict',path:'/api/auth',maxAge:nonce?600:0}));
 try{
  const client=supabaseRequest(request.headers,(cookies,headers)=>{
   for(const cookie of cookies)responseHeaders.append('Set-Cookie',serializeCookieHeader(cookie.name,cookie.value,cookie.options));
   for(const [key,value] of Object.entries(headers))responseHeaders.set(key,value);
  });
  if(request.method!=='POST')throw new CmsError('method','Deze actie vereist POST.',405);
  if(request.headers.get('origin')!==new URL(process.env.APP_BASE_URL!).origin)throw new CmsError('origin-rejected','De herkomst van dit verzoek is niet toegestaan.',403);
  const action=new URL(request.url).pathname.replace('/api/auth/',''),body=await bodyJson(request,16384),sql=sqlClient();
  if(action==='email-code/request'){
   const {email}=z.object({email:emailInput}).strict().parse(body);
   await rate('auth:request-ip:'+requestKey(request,'email-code'),150,900);
   await rate('auth:email-send:'+hash(email),1,60);
   const nonce=randomBytes(32).toString('hex');setNonce(nonce);
   await sql.begin(async tx=>{
    await tx`delete from cms_auth_login_challenges where expires_at<now()`;
    await tx`delete from cms_auth_email_sessions where created_at<now()-interval '12 hours'`;
    const [profile]=await tx`select u.id from auth_user u join cms_memberships m on m.user_id=u.id where lower(u.email)=${email} and u.supabase_user_id is not null and m.active=true and coalesce(u.banned,false)=false`;
    const nonceHash=hash(nonce);
    if(profile)await tx`insert into cms_auth_login_challenges(user_id,nonce_hash,code_hash,expires_at) values (${profile.id},${nonceHash},${hash(randomBytes(32).toString('hex'))},now()+interval '10 minutes') on conflict(user_id) do update set nonce_hash=excluded.nonce_hash,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,issued_at=null`;
    // Same durable job shape for unknown and allowed addresses. The worker
    // generates the native code, so public response timing reveals no provider
    // lookup or Resend request. Raw codes never enter the database or job log.
    await tx`insert into cms_jobs(id,operation_id,kind,payload,max_attempts) values (${crypto.randomUUID()},${'login-'+nonceHash},'auth-code-mail',${tx.json({email,nonceHash})},1)`;
   });
   return Response.json({status:true,message:'Als dit e-mailadres toegang heeft, ontvang je een inlogcode.'},{headers:responseHeaders});
  }
  if(action==='email-code/verify'){
   const {email,code}=z.object({email:emailInput,code:z.string().regex(/^\d{8}$/)}).strict().parse(body);
   await rate('auth:verify-ip:'+requestKey(request,'email-code'),150,900);
   await rate('auth:email-verify:'+hash(email),30,900);
   const nonce=parseCookieHeader(request.headers.get('cookie')||'').find(c=>c.name===cookieName)?.value;
   if(!nonce||!/^[a-f0-9]{64}$/.test(nonce))throw fail();
   const nonceHash=hash(nonce),codeHash=codeDigest(nonceHash,code);
   const [pending]=await sql`with attempted as (update cms_auth_login_challenges set attempts=attempts+1 where nonce_hash=${nonceHash} and expires_at>now() and attempts<5 returning *) select a.*,u.supabase_user_id from attempted a join auth_user u on u.id=a.user_id join cms_memberships m on m.user_id=u.id where lower(u.email)=${email} and m.active=true and coalesce(u.banned,false)=false`;
   if(!pending||!timingSafeEqual(Buffer.from(pending.code_hash,'hex'),Buffer.from(codeHash,'hex')))throw fail();
   const consumed=await sql`delete from cms_auth_login_challenges where nonce_hash=${nonceHash} and code_hash=${codeHash} and expires_at>now() returning user_id`;
   if(!consumed.length)throw fail();setNonce('');
   const result=await client.auth.verifyOtp({email,token:code,type:'email'});
   if(result.error||result.data.user?.id!==pending.supabase_user_id){await client.auth.signOut({scope:'local'});throw fail();}
   const claims=await client.auth.getClaims(),sessionId=uuid.safeParse(claims.data?.claims.session_id);
   if(claims.error||!sessionId.success){await client.auth.signOut({scope:'local'});throw fail();}
   await sql`insert into cms_auth_email_sessions(session_id,user_id) values (${sessionId.data}::uuid,${pending.user_id})`;
   if(!await verified(client)){await client.auth.signOut({scope:'local'});throw fail();}
   return Response.json({status:true},{headers:responseHeaders});
  }
  if(action==='sign-out'){
   z.object({}).strict().parse(body);const session=await verified(client);
   if(session){
    await sql`insert into cms_auth_revocations(user_id,invalid_before) values (${session.user.id},now()) on conflict(user_id) do update set invalid_before=now()`;
    await sql`delete from cms_auth_email_sessions where user_id=${session.user.id}`;
   }
   if((await client.auth.signOut({scope:'global'})).error)throw fail();setNonce('');
   return Response.json({status:true},{headers:responseHeaders});
  }
  throw new CmsError('missing','Deze inlogactie bestaat niet.',404);
 }catch(error){
  const response=errorResponse(error);
  for(const cookie of responseHeaders.getSetCookie())response.headers.append('Set-Cookie',cookie);
  return response;
 }
}
export function getAuth(){return {handler,api:{createUser,notifyAccountAccess,getSession:({headers}:{headers:Headers})=>verified(supabaseRequest(headers))}};}

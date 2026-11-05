import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {sqlClient} from '../../db';
import {supabaseAdmin,supabaseRequest} from './supabase';
import {CmsError,bodyJson,errorResponse} from './errors';
import {verifyOrigin} from './permissions';
import {secureCodeHash,codeMatches,workspaceRate,workspaceLocks} from './sponsor-access';
import {digestText,maskEmail} from './sponsor-store';
import {sponsorMail} from './sponsor-mail';
import {requestKey} from './request-key';
const cookie='duindorp-invitation';
const invalid=()=>new CmsError('invitation-unavailable','Deze uitnodiging is ongeldig, verlopen of al gebruikt. Vraag de club om een nieuwe uitnodiging.',410);
const wrong=()=>new CmsError('verification-failed','Het e-mailadres of de code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.',422);
const email=z.string().trim().toLowerCase().email().max(254);
async function invitationFor(headers:Headers){
 const nonce=parseCookieHeader(headers.get('cookie')||'').find(c=>c.name===cookie)?.value;
 if(!nonce||!/^[a-f0-9]{64}$/.test(nonce))throw invalid();
 const sql=sqlClient();const [invite]=await sql`select i.*,v.nonce_hash from cms_directory_invitations i join cms_directory_invitation_views v on v.invitation_id=i.id where v.nonce_hash=${digestText(nonce)} and v.expires_at>now() and i.expires_at>now() and i.status='pending' and i.mail_status='accepted'`;
 if(!invite)throw invalid();return invite;
}
export async function invitationHandler(request:Request,action:string){
 const responseHeaders=new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
 const setView=(value:string)=>responseHeaders.append('Set-Cookie',serializeCookieHeader(cookie,value,{httpOnly:true,secure:process.env.APP_BASE_URL?.startsWith('https://'),sameSite:'strict',path:'/api/portal/invitation',maxAge:value?3600:0}));
 const client=supabaseRequest(request.headers,(cookies,headers)=>{for(const c of cookies)responseHeaders.append('Set-Cookie',serializeCookieHeader(c.name,c.value,c.options));for(const [name,value]of Object.entries(headers))responseHeaders.set(name,value);});
 try{
  if(request.method!=='POST')throw new CmsError('method','Gebruik een beveiligd POST-verzoek.',405);
  verifyOrigin(request);const body=await bodyJson(request,4000),sql=sqlClient();
  await workspaceRate('invitation:ip:'+requestKey(request),100,900);
  if(action==='context'){
   const {token}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(body);
   const [invite]=await sql`select i.id,i.scope,i.email,i.expires_at,r.draft->>'name' as name,c.data->>'name' as company from cms_directory_invitations i join cms_records r on r.id=i.person_id left join cms_sponsor_companies c on c.id=i.sponsor_id where i.token_hash=${digestText(token)} and i.status='pending' and i.mail_status='accepted' and i.expires_at>now() and r.deleted_at is null`;
   if(!invite)throw invalid();
   const nonce=randomBytes(32).toString('hex');
   await sql`delete from cms_directory_invitation_views where expires_at<now()`;
   await sql`insert into cms_directory_invitation_views(nonce_hash,invitation_id,expires_at) values (${digestText(nonce)},${invite.id},now()+interval '1 hour')`;
   setView(nonce);
   return Response.json({personName:invite.name,emailHint:maskEmail(invite.email),scope:invite.scope,sponsorName:invite.company||'',expiresAt:invite.expires_at},{headers:responseHeaders});
  }
  const invite=await invitationFor(request.headers);
  if(action==='view'){z.object({}).strict().parse(body);const [person]=await sql`select r.draft->>'name' as name,c.data->>'name' as company from cms_records r left join cms_sponsor_companies c on c.id=${invite.sponsor_id} where r.id=${invite.person_id} and r.deleted_at is null`;if(!person)throw invalid();return Response.json({personName:person.name,emailHint:maskEmail(invite.email),sponsorName:person.company||'',scope:invite.scope},{headers:responseHeaders});}
  if(action==='code'){
   const input=z.object({email}).strict().parse(body);if(input.email!==invite.email)throw wrong();
   await workspaceRate('invitation:send:'+invite.id,1,60);
   const claimed=await sql`select a.person_id,u.banned,m.active from auth_user u left join cms_person_accounts a on a.user_id=u.id left join cms_memberships m on m.user_id=u.id where lower(u.email)=${invite.email}`;
   if(claimed.some(r=>r.person_id!==invite.person_id||r.banned||!r.active))throw wrong();
   const generated=await supabaseAdmin().auth.admin.generateLink({type:'magiclink',email:invite.email});
   const code=generated.data.properties?.email_otp,providerId=generated.data.user?.id;
   if(generated.error||!providerId||!code||!/^\d{8}$/.test(code))throw new CmsError('auth-unavailable','De inlogcode kon niet worden aangemaakt. Controleer de Supabase OTP-instelling (8 cijfers).',503);
   const digest=secureCodeHash('invitation',invite.id+'\0'+invite.nonce_hash,code);
   const prepared=await sql`update cms_directory_invitations set code_hash=${digest},code_nonce_hash=${invite.nonce_hash},provider_id=${providerId}::uuid,code_expires_at=now()+interval '10 minutes',issued_at=null,attempts=0 where id=${invite.id} and status='pending' and expires_at>now() returning id`;
   if(!prepared.length)throw invalid();
   try{
    await sponsorMail(invite.email,'Bevestig je e-mailadres bij Duindorp SV','Je code: '+code+'\nDe code is tien minuten geldig. Hiermee bevestig je jouw persoonlijke e-mailadres voor deze uitnodiging.','invitation-code-'+invite.id+'-'+digest);
    const accepted=await sql`update cms_directory_invitations set issued_at=now() where id=${invite.id} and code_hash=${digest} and status='pending' and expires_at>now() returning id`;
    if(!accepted.length)throw invalid();
   }catch(error){await sql`update cms_directory_invitations set code_hash=null,issued_at=null where id=${invite.id} and code_hash=${digest}`;throw error;}
   return Response.json({ok:true,message:'Je code is per e-mail verzonden.'},{headers:responseHeaders});
  }
  if(action==='accept'){
   const input=z.object({email,code:z.string().regex(/^\d{8}$/)}).strict().parse(body);
   const [attempt]=await sql`update cms_directory_invitations set attempts=attempts+1 where id=${invite.id} and email=${input.email} and status='pending' and expires_at>now() and code_expires_at>now() and issued_at is not null and code_nonce_hash=${invite.nonce_hash} and attempts<5 returning *`;
   if(!attempt||!codeMatches(attempt.code_hash||'',secureCodeHash('invitation',invite.id+'\0'+invite.nonce_hash,input.code)))throw wrong();
   const result=await client.auth.verifyOtp({email:input.email,token:input.code,type:'email'});
   if(result.error||!result.data.user||result.data.user.id!==attempt.provider_id||result.data.user.email?.toLowerCase()!==input.email||!result.data.user.email_confirmed_at)throw wrong();
   const claims=await client.auth.getClaims(),sessionId=z.string().uuid().safeParse(claims.data?.claims.session_id);
   if(claims.error||!sessionId.success)throw wrong();
   await sql.begin(async tx=>{
    await workspaceLocks(tx);
    const [current]=await tx`select * from cms_directory_invitations where id=${invite.id} for update`;
    if(!current||current.status!=='pending'||new Date(current.expires_at).getTime()<=Date.now()||current.code_hash!==attempt.code_hash||current.code_nonce_hash!==invite.nonce_hash)throw invalid();
    const [person]=await tx`select id,draft from cms_records where id=${current.person_id} and module='people' and deleted_at is null for update`;
    if(!person)throw invalid();
    const accounts=await tx`select u.*,a.person_id,m.active from auth_user u left join cms_person_accounts a on a.user_id=u.id left join cms_memberships m on m.user_id=u.id where lower(u.email)=${input.email} or u.supabase_user_id=${attempt.provider_id}::uuid or a.person_id=${person.id}`;
    if(accounts.some((a:any)=>a.person_id!==person.id||a.email.toLowerCase()!==input.email||a.banned||!a.active||a.supabase_user_id!==attempt.provider_id))throw new CmsError('account-conflict','Deze identiteit kan niet worden gekoppeld. Laat gebruikersbeheer dit beoordelen.',409);
    let userId=accounts[0]?.id;
    if(!userId){
     userId=attempt.provider_id;
     const portalRole=current.scope==='sponsor'?'sponsor':'portal';if((await tx`select 1 from cms_grants where role_id=${portalRole}`).length)throw new CmsError('portal-role-config','De portaalrol bevat onverwachte backofficerechten. Laat gebruikersbeheer dit controleren.',503);
     await tx`insert into auth_user(id,supabase_user_id,name,email,email_verified,role) values (${userId},${attempt.provider_id}::uuid,${person.draft.name},${input.email},true,'user')`;
     await tx`insert into cms_person_accounts(person_id,user_id) values (${person.id},${userId})`;
     await tx`insert into cms_memberships(user_id,role_id,active) values (${userId},${current.scope==='sponsor'?'sponsor':'portal'},true)`;
    }
    if(current.scope==='sponsor'){
     const roles=[...new Set(current.sponsor_roles as string[])];
     await tx`insert into cms_sponsor_memberships(id,sponsor_id,user_id,roles) values (${'membership-'+current.id},${current.sponsor_id},${userId},${roles}) on conflict(sponsor_id,user_id) do update set roles=ARRAY(select distinct unnest(cms_sponsor_memberships.roles||excluded.roles)),version=cms_sponsor_memberships.version+1`;
    }
    await tx`update cms_directory_invitations set status='accepted',accepted_at=now(),user_id=${userId},code_hash=null where id=${current.id}`;
    await tx`delete from cms_directory_invitation_views where invitation_id=${current.id}`;
    await tx`insert into cms_auth_email_sessions(session_id,user_id) values (${sessionId.data}::uuid,${userId})`;
    await tx`insert into cms_directory_events(id,person_id,actor_id,action) values (${crypto.randomUUID()},${person.id},${userId},'Persoonlijk e-mailadres geverifieerd; uitnodiging eenmalig geaccepteerd')`;
    await tx`insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${userId},'directory-invitation-accepted',${current.id},${crypto.randomUUID()})`;
   });
   setView('');return Response.json({ok:true,redirect:invite.scope==='sponsor'?'/sponsorportaal':'/portaal'},{headers:responseHeaders});
  }
  throw new CmsError('missing','Deze uitnodigingsactie bestaat niet.',404);
 }catch(error){
  // A partially verified provider session alone never grants application access.
  if(action==='accept')await client.auth.signOut({scope:'local'}).catch(()=>{});
  const response=errorResponse(error);for(const c of responseHeaders.getSetCookie())response.headers.append('Set-Cookie',c);response.headers.set('Referrer-Policy','no-referrer');return response;
 }
}

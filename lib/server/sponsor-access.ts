import {sqlClient} from '../../db';
import {getAuth} from './auth';
import {actorPrincipal,has,type Principal} from './permissions';
import {CmsError} from './errors';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
export async function workspaceActor(headers:Headers){
 const session=await getAuth().api.getSession({headers});
 if(!session)throw new CmsError('unauthenticated','Log in met je persoonlijke e-mailcode.',401);
 const p=await actorPrincipal(session.user.id);
 return {p,session};
}
export type WorkspaceActor=Awaited<ReturnType<typeof workspaceActor>>;
export async function freshActor(tx:any,actor:WorkspaceActor){
 const p=await actorPrincipal(actor.p.id,tx);
 const [valid]=await tx`select 1 from cms_auth_email_sessions s where s.session_id=${actor.session.session.id}::uuid and s.user_id=${p.id} and s.created_at>now()-interval '12 hours' and not exists(select 1 from cms_auth_revocations r where r.user_id=${p.id} and r.invalid_before>=${new Date(actor.session.session.createdAt)})`;
 if(!valid)throw new CmsError('unauthenticated','Je toegang is gewijzigd. Log opnieuw in.',401);
 return p;
}
export function requireWrite(p:Principal,module:string,action?:'create'|'update'|'delete'|'publish'|'manage'){const allowed=action?(has(p,module,action)||has(p,module,'manage')):['create','update','manage','*'].some(value=>has(p,module,value));if(p.teamScoped||!allowed)throw new CmsError('forbidden','Je hebt geen rechten voor deze handeling.',403);}
export function signingEmail(actor:WorkspaceActor,p:Principal){
 if(!actor.session.user.providerEmail||actor.session.user.providerEmail.toLowerCase()!==p.email.toLowerCase())throw new CmsError('email-changed','Je inlogadres is gewijzigd. Laat gebruikersbeheer dit controleren en log opnieuw in.',409);
 return p.email.toLowerCase();
}
export function secureCodeHash(purpose:string,id:string,code:string){
 const secret=process.env.SUPABASE_SECRET_KEY;
 if(!secret)throw new CmsError('auth-unavailable','E-mailverificatie is tijdelijk niet beschikbaar.',503);
 return createHmac('sha256',secret).update('duindorp-'+purpose+'\0'+id+'\0'+code).digest('hex');
}
export function codeMatches(hash:string,value:string){return /^[a-f0-9]{64}$/.test(hash)&&timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(value,'hex'));}
export function trustedAddress(request:Request){const value=process.env.TRUST_PROXY_IP==='true'?request.headers.get('x-real-ip')||'':'';return isIP(value)?value:'';}
export async function workspaceRate(key:string,maximum:number,seconds:number,transaction?:any){
 const sql=transaction||sqlClient();const [row]=await sql`insert into cms_rate_limits(key,count,expires_at) values (${key},1,now()+${seconds}*interval '1 second') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+${seconds}*interval '1 second' else cms_rate_limits.expires_at end returning count`;
 if(row.count>maximum)throw new CmsError('rate-limit','Te veel aanvragen. Wacht even voordat je opnieuw probeert.',429);
}
/** Same lock order for account changes, existing content and private relations. */
export async function workspaceLocks(tx:any){await tx`select pg_advisory_xact_lock(736403)`;await tx`select pg_advisory_xact_lock(736402)`;await tx`select pg_advisory_xact_lock(736499)`;}

import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {workspaceActor,freshActor,workspaceLocks,workspaceRate,requireWrite,secureCodeHash} from './sponsor-access';
import {fullDirectory,globalRight,digestText} from './sponsor-store';
import {CmsError} from './errors';
import {verifyOrigin} from './permissions';
export async function familyAction(request:Request,body:unknown){
 verifyOrigin(request);const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('code'),personId:z.string().min(1).max(191)}).strict(),
  z.object({action:z.literal('request'),operationId:z.string().uuid(),code:z.string().trim().toUpperCase().regex(/^[A-F0-9]{12}$/),relationship:z.enum(['parent','guardian','carer']),permissions:z.array(z.enum(['schedule','attendance','forms','profile','finance'])).min(1).max(5)}).strict()
 ]).parse(body);
 const actor=await workspaceActor(request.headers);await workspaceRate('family:'+actor.p.id,20,900);
 return sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);
  if(input.action==='code'){
   if(!fullDirectory(p))throw new CmsError('forbidden','Alleen ledenadministratie deelt persoonscodes.',403);
   if(!globalRight(p,'users','manage'))requireWrite(p,'directory');
   const [person]=await tx`select id from cms_records where id=${input.personId} and module='people' and deleted_at is null`;if(!person)throw new CmsError('missing','Persoon niet gevonden.',404);
   const code=randomBytes(6).toString('hex').toUpperCase();
   await tx`insert into cms_directory_family_codes(person_id,code_hash,expires_at,created_by) values (${person.id},${digestText(code)},now()+interval '90 days',${p.id}) on conflict(person_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,created_by=excluded.created_by`;
   await tx`insert into cms_directory_events(id,person_id,actor_id,action) values (${crypto.randomUUID()},${person.id},${p.id},'Nieuwe persoonlijke ouderrelatiecode aangemaakt (90 dagen geldig)')`;
   return {code,message:'Deel deze code uitsluitend met de bedoelde ouder of verzorger. De code verleent zelf geen toegang.'};
  }
  const hash=secureCodeHash('family-operation',input.operationId,JSON.stringify(input));
  const [old]=await tx`select * from cms_domain_operations where id=${input.operationId}::uuid`;
  if(old){if(old.actor_id!==p.id||old.request_hash!==hash)throw new CmsError('conflict','Verzoeknummer is al gebruikt.',409);return old.result;}
  const [parent]=await tx`select person_id from cms_person_accounts where user_id=${p.id}`;
  const [child]=await tx`select c.person_id from cms_directory_family_codes c join cms_records r on r.id=c.person_id where c.code_hash=${digestText(input.code)} and c.expires_at>now() and r.deleted_at is null`;
  if(!parent||!child||parent.person_id===child.person_id)throw new CmsError('family-unavailable','De relatie kon niet worden aangevraagd. Controleer de code met de club.',422);
  const existing=await tx`select id from cms_directory_guardians where guardian_person_id=${parent.person_id} and child_person_id=${child.person_id} and status<>'revoked'`;
  if(!existing.length){
   const data={id:crypto.randomUUID(),guardianPersonId:parent.person_id,childPersonId:child.person_id,relationship:input.relationship,permissions:[...new Set(input.permissions)],status:'pending',requestedAt:new Date().toISOString(),requestedBy:p.id,approvedAt:'',approvedBy:''};
   await tx`insert into cms_directory_guardians(id,guardian_person_id,child_person_id,status,data) values (${data.id},${data.guardianPersonId},${data.childPersonId},'pending',${tx.json(data)})`;
   await tx`insert into cms_directory_events(id,person_id,actor_id,action) values (${crypto.randomUUID()},${child.person_id},${p.id},'Ouderrelatie aangevraagd; wacht op clubcontrole')`;
  }
  const result={ok:true,message:'Je aanvraag wordt door de club beoordeeld. Je krijgt pas na goedkeuring toegang.'};
  await tx`insert into cms_domain_operations(id,actor_id,request_hash,result) values (${input.operationId}::uuid,${p.id},${hash},${tx.json(result)})`;
  return result;
 });
}

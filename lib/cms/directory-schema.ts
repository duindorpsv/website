import {z} from 'zod';
import type {CmsState} from './types';
const text=z.string(),id=text.min(1),date=text.refine(value=>!value||Number.isFinite(Date.parse(value)),'Ongeldige registerdatum');
const unique=<T extends z.ZodTypeAny>(item:T,key='id')=>z.array(item).refine(rows=>new Set(rows.map(row=>(row as Record<string,unknown>)[key])).size===rows.length,'Dubbele registeridentifiers');
const roles=z.array(z.enum(['signer','billing','marketing'])).refine(rows=>new Set(rows).size===rows.length);
export const directorySchema=z.object({version:z.literal(1),
 profiles:unique(z.object({personId:id,birthDate:date,membership:z.enum(['playing','non-playing','none']),status:z.enum(['active','former','archived']),labels:z.array(z.enum(['volunteer','donor','supporter','honorary'])),teamIds:z.array(text),address:text,postalCode:text,city:text,source:z.enum(['manual','sportlink','account']),sourceUpdatedAt:date,updatedAt:date,sponsorIds:z.array(id)}),'personId'),
 assignments:unique(z.object({id,personId:id,kind:z.enum(['board','committee','trainer','manager','referee','volunteer']),name:text,teamId:text,committeeId:text,startsAt:date,endsAt:date})),
 guardians:unique(z.object({id,guardianPersonId:id,childPersonId:id,relationship:z.enum(['parent','guardian','carer']),permissions:z.array(z.enum(['schedule','attendance','forms','profile','finance'])).min(1),status:z.enum(['pending','approved','revoked']),requestedAt:date,requestedBy:text,approvedAt:date,approvedBy:text})),
 invitations:unique(z.object({id,personId:id,email:text.email(),scope:z.enum(['club','sponsor']),sponsorId:text,sponsorRoles:roles,token:id,status:z.enum(['pending','accepted','revoked']),createdAt:date,expiresAt:date,createdBy:id,acceptedAt:date,userId:text})),
 events:unique(z.object({id,personId:text,at:date,actorId:text,action:text}))
}).superRefine((data,context)=>{
 const fail=(message:string)=>context.addIssue({code:'custom',message});
 if(new Set(data.invitations.map(invite=>invite.token)).size!==data.invitations.length)fail('Dubbele uitnodigingscodes');
 for(const invitation of data.invitations){if(invitation.scope==='sponsor'&&(!invitation.sponsorId||!invitation.sponsorRoles.length))fail('Sponsoruitnodiging mist bedrijfsrechten');if(invitation.scope==='club'&&(invitation.sponsorId||invitation.sponsorRoles.length))fail('Clubuitnodiging bevat bedrijfsrechten');if(invitation.createdAt>=invitation.expiresAt)fail('Uitnodiging heeft geen geldige looptijd');if(invitation.status==='accepted'&&(!invitation.acceptedAt||!invitation.userId))fail('Geaccepteerde uitnodiging mist registratie');}
 if(data.guardians.some(row=>row.guardianPersonId===row.childPersonId))fail('Een persoon is zijn eigen ouder/verzorger');
 const activeLinks=data.guardians.filter(row=>row.status!=='revoked');if(new Set(activeLinks.map(row=>row.guardianPersonId+'|'+row.childPersonId)).size!==activeLinks.length)fail('Dubbele ouder-kindrelaties');
 if(data.guardians.some(row=>row.status==='approved'&&(!row.approvedAt||!row.approvedBy)))fail('Ouderrelatie mist goedkeuring');
 if(data.assignments.some(row=>row.startsAt&&row.endsAt&&row.startsAt>row.endsAt))fail('Ongeldige functieperiode');
});
export function validateDirectoryLinks(state:CmsState){
 if(!state.directory)return;
 const data=state.directory,people=new Map(state.people.map(person=>[person.id,person])),users=new Map(state.members.map(user=>[user.id,user]));
 if(data.profiles.some(profile=>!people.has(profile.personId))||data.assignments.some(row=>!people.has(row.personId))||data.guardians.some(row=>!people.has(row.childPersonId)||!people.has(row.guardianPersonId))||data.invitations.some(row=>!people.has(row.personId)))throw new Error('Het register verwijst naar een ontbrekende persoon.');
 const linked=state.people.filter(person=>person.backofficeUserId);if(new Set(linked.map(person=>person.backofficeUserId)).size!==linked.length)throw new Error('Een account is aan meerdere personen gekoppeld.');
 if(linked.some(person=>!users.has(person.backofficeUserId!)||users.get(person.backofficeUserId!)?.personId&&users.get(person.backofficeUserId!)!.personId!==person.id))throw new Error('De persoon-accountkoppeling klopt niet.');
 if(state.members.some(user=>user.personId&&(!people.has(user.personId)||people.get(user.personId)!.backofficeUserId!==user.id)))throw new Error('Het account verwijst naar een ontbrekende of andere persoon.');
 const sponsorIds=new Set(state.sponsorship?.sponsors.map(sponsor=>sponsor.id)||[]);
 if(state.sponsorship&&(data.profiles.some(profile=>profile.sponsorIds.some(sponsorId=>!sponsorIds.has(sponsorId)))||data.invitations.some(invite=>invite.scope==='sponsor'&&!sponsorIds.has(invite.sponsorId))))throw new Error('Het register verwijst naar een ontbrekend sponsorbedrijf.');
}

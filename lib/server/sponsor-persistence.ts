import type {CmsPerson,CmsState} from '../cms/types';
import {sponsorshipEntitySchemas} from '../cms/sponsorship-schema';
import {directorySchema} from '../cms/directory-schema';
import type {DomainStore,Versions} from './sponsor-store';
import {digestText,sorted,sponsorKinds} from './sponsor-store';
import type {Principal} from './permissions';
import {CmsError} from './errors';

const same=(a:unknown,b:unknown)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,190}$/;
function validateIds(values:{id?:string;personId?:string}[]){for(const value of values){const id=value.id||value.personId;if(!id||!idPattern.test(id))throw new CmsError('validation','Deze identificatie is ongeldig.',422);}}
export function requireVersion(versions:Versions,actual:Versions,key:string){
 if(key in actual&&versions[key]!==actual[key])throw new CmsError('conflict','Dit dossier is ondertussen gewijzigd. Laad de actuele gegevens; je invoer blijft staan.',409);
}
const personDraft=(person:CmsPerson)=>{
 const {id,name,role='',group='',teamId='',bio='',mediaId='',email='',phone='',showContact=false,published=false,order=0,sportlinkId}=person;
 return {id,name,role,group,teamId,bio,mediaId,email,phone,showContact,published,order,...(sportlinkId?{sportlinkId}:{} )};
};
/** Domain writes share the existing content lock and leave every live snapshot intact. */
export async function persistDomainStore(tx:any,p:Principal,before:DomainStore,state:CmsState,requestId:string){
 const original=before.state,sponsors=state.sponsorship!,directory=state.directory!;
 validateIds(state.people);validateIds(sponsors.sponsors);
 for(const company of sponsors.sponsors){
  const old=original.sponsorship!.sponsors.find(s=>s.id===company.id);if(same(old,company))continue;
  const result=sponsorshipEntitySchemas.sponsors.safeParse([company]);
  if(!result.success)throw new CmsError('validation','Controleer de bedrijfsgegevens: '+result.error.issues[0].message,422);
  const data=result.data[0];data.demo=false;
  await tx`insert into cms_sponsor_companies(id,data) values (${company.id},${tx.json(data)}) on conflict(id) do update set data=excluded.data,version=cms_sponsor_companies.version+1,updated_at=now()`;
 }
 // Preserve original JSON bytes rather than deriving historical hashes from JSONB.
 for(const kind of sponsorKinds){
  const values=kind==='settings'?[{...sponsors.settings,id:'sponsor-settings'}]:(sponsors[kind]||[]) as any[];
  const previous=kind==='settings'?[{...original.sponsorship!.settings,id:'sponsor-settings'}]:(original.sponsorship![kind]||[]) as any[];
  if(kind!=='settings')validateIds(values);
  for(const value of values){
   const old=previous.find((v:any)=>v.id===value.id);if(same(old,value))continue;
   const stored=before.records.get(value.id);if(stored&&(stored.kind!==kind||(stored.sponsor_id||'')!==(value.sponsorId||'')))throw new CmsError('record-ownership','Een bestaand onderdeel kan niet naar een ander type of bedrijf worden verplaatst. Maak een nieuw onderdeel.',409);
   const candidate=kind==='settings'?sponsors.settings:value;
   const schema=sponsorshipEntitySchemas[kind];
   const parsed=schema.safeParse(kind==='settings'?candidate:[candidate]);
   if(!parsed.success)throw new CmsError('validation','Controleer dit onderdeel: '+parsed.error.issues[0].message,422);
   const data:any=kind==='settings'?parsed.data:(parsed.data as any[])[0];
   if(value.snapshot)data.snapshot=value.snapshot;
   if(kind==='agreements')data.signatures=value.signatures;
   const bytes=value.snapshot?(value.snapshotBytes||JSON.stringify(value.snapshot)):null;
   if(bytes&&!same(JSON.parse(bytes),value.snapshot))throw new CmsError('document-integrity','De vaste serialisatie komt niet overeen met het document.',409);
   const previousBytes=before.records.get(value.id)?.snapshot_bytes;
   if(previousBytes&&(bytes!==previousBytes||!same(old?.snapshot,value.snapshot)))throw new CmsError('document-immutable','De vastgelegde documentinhoud mag niet worden overschreven.',409);
   const saved=await tx`insert into cms_sponsor_records(id,kind,sponsor_id,data,snapshot_bytes) values (${value.id},${kind},${value.sponsorId||null},${tx.json(data)},${bytes}) on conflict(id) do update set data=excluded.data,snapshot_bytes=excluded.snapshot_bytes,version=cms_sponsor_records.version+1,updated_at=now() where cms_sponsor_records.kind=excluded.kind and cms_sponsor_records.sponsor_id is not distinct from excluded.sponsor_id returning id`;
   if(!saved.length)throw new CmsError('record-ownership','Deze identificatie is al gekoppeld aan een ander onderdeel of bedrijf.',409);
   if(kind==='agreements'){
    if(digestText(bytes!)!==value.documentHash)throw new CmsError('document-integrity','De documenthash komt niet overeen met de vaste inhoud.',409);
    await tx`insert into cms_sponsor_documents(agreement_id,sponsor_id,snapshot_bytes,document_hash,document_version) values (${value.id},${value.sponsorId},${bytes},${value.documentHash},${value.version}) on conflict(agreement_id) do nothing`;
   }
  }
  // Only the explicit template-removal command can remove an unused live resource.
  if(kind==='contractTemplates')for(const old of previous)if(!values.some((v:any)=>v.id===old.id))await tx`delete from cms_sponsor_records where id=${old.id} and kind='contractTemplates'`;
 }
 for(const person of state.people){
  const old=original.people.find(v=>v.id===person.id);if(same(old,person))continue;
  const data=personDraft(person);
  if(!data.name.trim()||data.name.length>500||data.email.length>254||data.phone.length>100)throw new CmsError('validation','Controleer naam en contactgegevens.',422);
  const [current]=await tx`select version,live from cms_records where id=${person.id} and module='people' for update`;
  if(current&&!before.people.has(person.id))throw new CmsError('person-ownership','Deze identificatie is niet beschikbaar. Voeg een nieuw contact toe of laat gebruikersbeheer de bestaande koppeling beoordelen.',409);
  if(current){
   const [version]=await tx`select greatest(${current.version},coalesce(max(version),0))+1 as next from cms_revisions where record_id=${person.id}`;
   await tx`update cms_records set title=${data.name},draft=${tx.json(data)},status='draft',version=${version.next},updated_at=now(),deleted_at=${person.deletedAt||null} where id=${person.id}`;
   await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},${person.id},${version.next},${tx.json(data)},'Privaat persoonsdossier bijgewerkt',${p.id})`;
  }else{
   const collision=await tx`select id from cms_records where id=${person.id}`;if(collision.length)throw new CmsError('conflict','Deze identificatie is al in gebruik.',409);
   await tx`insert into cms_records(id,module,title,draft,status) values (${person.id},'people',${data.name},${tx.json(data)},'draft')`;
   await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},${person.id},1,${tx.json(data)},'Privaat persoonsdossier aangemaakt',${p.id})`;
  }
 }
 for(const profile of directory.profiles){
  const old=original.directory!.profiles.find(v=>v.personId===profile.personId);if(same(old,profile))continue;
  const parsed=directorySchema.innerType().shape.profiles.safeParse([profile]);
  if(!parsed.success)throw new CmsError('validation','Controleer het private profiel: '+parsed.error.issues[0].message,422);
  const person=state.people.find(v=>v.id===profile.personId);if(!person)throw new CmsError('validation','Het persoonsdossier ontbreekt.',422);
  if(profile.teamIds.some(id=>!state.settings.teams.some(t=>t.id===id)))throw new CmsError('validation','Een team is niet beschikbaar.',422);
  if(profile.sponsorIds.some(id=>!sponsors.sponsors.some(s=>s.id===id)))throw new CmsError('validation','Een sponsorbedrijf is niet beschikbaar.',422);
  const existing=before.profiles.get(profile.personId);
  const sourceRef=person.sportlinkId?.trim().toUpperCase()||null;
  await tx`insert into cms_directory_profiles(person_id,data,source_club,source_ref) values (${profile.personId},${tx.json(profile)},${existing?.source_club||''},${sourceRef}) on conflict(person_id) do update set data=excluded.data,source_ref=excluded.source_ref,version=cms_directory_profiles.version+1,updated_at=now()`;
 }
 for(const assignment of directory.assignments){
  const old=original.directory!.assignments.find(v=>v.id===assignment.id);if(same(old,assignment))continue;
  if(old&&old.personId!==assignment.personId)throw new CmsError('assignment-ownership','Maak een nieuwe functie bij de andere persoon.',409);
  const result=directorySchema.innerType().shape.assignments.safeParse([assignment]);if(!result.success)throw new CmsError('validation','Controleer de clubfunctie.',422);
  await tx`insert into cms_directory_assignments(id,person_id,data) values (${assignment.id},${assignment.personId},${tx.json(result.data[0])}) on conflict(id) do update set data=excluded.data,version=cms_directory_assignments.version+1`;
 }
 for(const old of original.directory!.assignments)if(!directory.assignments.some(v=>v.id===old.id))await tx`delete from cms_directory_assignments where id=${old.id}`;
 for(const guardian of directory.guardians){
  const old=original.directory!.guardians.find(v=>v.id===guardian.id);if(same(old,guardian))continue;
  if(old&&(old.guardianPersonId!==guardian.guardianPersonId||old.childPersonId!==guardian.childPersonId))throw new CmsError('guardian-ownership','Trek de bestaande relatie in en maak een nieuwe koppeling voor andere personen.',409);
  const parsed=directorySchema.innerType().shape.guardians.safeParse([guardian]);if(!parsed.success)throw new CmsError('validation','Controleer de ouderrelatie en rechten.',422);
  await tx`insert into cms_directory_guardians(id,guardian_person_id,child_person_id,status,data) values (${guardian.id},${guardian.guardianPersonId},${guardian.childPersonId},${guardian.status},${tx.json(guardian)}) on conflict(id) do update set status=excluded.status,data=excluded.data,version=cms_directory_guardians.version+1`;
 }
 // Account links are authoritative; the public person JSON never grants account access.
 for(const account of state.members){
  const old=original.members.find(m=>m.id===account.id);if(!old)throw new CmsError('validation','Nieuwe accounts ontstaan uitsluitend via e-mailverificatie.',422);
  if(account.personId!==old.personId&&account.personId){
   await tx`select set_config('duindorp.canonical_account_write','register',true)`;
   await tx`delete from cms_person_accounts where user_id=${account.id}`;
   await tx`insert into cms_person_accounts(person_id,user_id) values (${account.personId},${account.id})`;
   await tx`select set_config('duindorp.canonical_account_write','',true)`;
  }
  if(account.name!==old.name)await tx`update auth_user set name=${account.name},updated_at=now() where id=${account.id}`;
  if(account.active!==old.active){
   await tx`update auth_user set banned=${!account.active},updated_at=now() where id=${account.id}`;
   await tx`update cms_memberships set active=${account.active},version=version+1 where user_id=${account.id}`;
   await tx`insert into cms_auth_revocations(user_id,invalid_before) values (${account.id},now()) on conflict(user_id) do update set invalid_before=now()`;
   await tx`delete from cms_auth_email_sessions where user_id=${account.id}`;
  }
 }
 for(const link of sponsors.memberships){
  const old=original.sponsorship!.memberships.find(v=>v.id===link.id);if(same(old,link))continue;
  if(old&&(old.sponsorId!==link.sponsorId||old.userId!==link.userId))throw new CmsError('membership-ownership','Maak een nieuwe bedrijf-accountkoppeling; een bestaande koppeling houdt haar identiteit.',409);
  await tx`insert into cms_sponsor_memberships(id,sponsor_id,user_id,roles) values (${link.id},${link.sponsorId},${link.userId},${link.roles}) on conflict(id) do update set roles=excluded.roles,version=cms_sponsor_memberships.version+1`;
 }
 for(const old of original.sponsorship!.memberships)if(!sponsors.memberships.some(v=>v.id===old.id))await tx`delete from cms_sponsor_memberships where id=${old.id}`;
 // Revoke old claims before inserting a replacement: the new invitation is
 // first in the UI array, while PostgreSQL enforces one pending email/person.
 for(const invite of directory.invitations){const old=original.directory!.invitations.find(v=>v.id===invite.id);if(old&&!same(old,invite))await tx`update cms_directory_invitations set status=${invite.status},code_hash=case when ${invite.status}='revoked' then null else code_hash end where id=${invite.id}`;}
 for(const invite of directory.invitations){
  const old=original.directory!.invitations.find(v=>v.id===invite.id);if(same(old,invite))continue;
  if(old)continue;
  if(!/^[a-f0-9]{64}$/.test(invite.token))throw new CmsError('token-storage','Een beveiligde uitnodiging kon niet worden opgeslagen.',500);
  await tx`update cms_directory_invitations set status='revoked' where status='pending' and expires_at<=now()`;
  await tx`insert into cms_directory_invitations(id,person_id,email,scope,sponsor_id,sponsor_roles,token_hash,status,created_by,expires_at) values (${invite.id},${invite.personId},${invite.email},${invite.scope},${invite.sponsorId||null},${invite.sponsorRoles},${invite.token},${invite.status},${p.id},${invite.expiresAt})`;
 }
 for(const event of directory.events)if(!original.directory!.events.some(v=>v.id===event.id))await tx`insert into cms_directory_events(id,person_id,actor_id,action,created_at) values (${event.id},${event.personId},${p.id},${event.action},now())`;
 await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${p.id},'private-workspace-update',null,${requestId},${tx.json({})})`;
}

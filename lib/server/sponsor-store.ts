import {createHash} from 'node:crypto';
import type {CmsMember,CmsPerson,CmsRole,CmsState,Permission} from '../cms/types';
import type {DirectoryInvitation,DirectoryProfile} from '../cms/directory-types';
import type {Sponsor,SponsorshipState} from '../cms/sponsorship-types';
import {createSponsorshipSeed,getSponsorStaffAccounts} from '../cms/sponsorship';
import {directoryProfileTemplate} from '../cms/directory';
import {emptyState} from './records';
import {has,type Principal} from './permissions';
import {CmsError} from './errors';

export const sponsorKinds=['items','packages','proposals','agreements','invoices','tasks','activities','profileRequests','businessChangeRequests','contractTemplates','events','settings'] as const;
export type SponsorKind=typeof sponsorKinds[number];
export type Versions=Record<string,number>;
export type DomainStore={state:CmsState;versions:Versions;people:Map<string,any>;profiles:Map<string,any>;records:Map<string,any>;accounts:Map<string,any>};
export type WorkspaceQuery={mode:'directory'|'sponsorship'|'portal'|'accounts';companyId:string;personId:string;search:string;feature:string;source:string;account:string;page:number;pageSize:number};
export const globalRight=(p:Principal,module:string,action='read')=>!p.teamScoped&&has(p,module,action);
export const fullDirectory=(p:Principal)=>globalRight(p,'directory')||globalRight(p,'directory','manage')||globalRight(p,'users','manage');
export const sponsorStaff=(p:Principal)=>globalRight(p,'sponsors')||globalRight(p,'sponsors','manage');
const iso=(value:any)=>value?new Date(value).toISOString():'';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rights:Permission[]=['news','stories','pages','media','people','forms','settings','users','directory','sponsors'];

export function rolePermissions(grants:{module:string;action:string}[]):Permission[]{
 const list=rights.filter(module=>grants.some(g=>(g.module==='*'||g.module===module)&&(module!=='users'||['*','manage'].includes(g.action))));
 if(grants.some(g=>(g.module==='*'||g.module==='people')&&(g.action==='*'||g.action==='publish')))list.push('publish');
 return list;
}
function minimalCompany(row:any):Sponsor{
 return {id:row.id,name:row.data.name,companyNumber:'',vatNumber:'',address:'',postalCode:'',city:'',email:'',phone:'',website:'',description:'',logoUrl:row.data.logoUrl||'',ownerId:'',stage:'lead',notes:'',publicProfile:{name:row.data.publicProfile?.name||row.data.name,description:'',website:'',logoUrl:row.data.publicProfile?.logoUrl||''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:'',updatedAt:'',demo:false};
}
function invitation(row:any):DirectoryInvitation{
 return {mailStatus:row.mail_status,id:row.id,personId:row.person_id,email:row.email,scope:row.scope,sponsorId:row.sponsor_id||'',sponsorRoles:row.sponsor_roles,token:row.token_hash,status:row.status,createdAt:iso(row.created_at),expiresAt:iso(row.expires_at),createdBy:row.created_by,acceptedAt:iso(row.accepted_at),userId:row.user_id||''};
}
/** Internal state is never returned directly. Queries are bounded to the actor's domain. */
export async function readDomainStore(tx:any,p:Principal,options:{peopleIds?:string[];companyId?:string;portal?:boolean}={}):Promise<DomainStore>{
 const state=emptyState();state.directory={version:1,profiles:[],assignments:[],guardians:[],invitations:[],events:[]};state.sponsorship=createSponsorshipSeed();
 const versions:Versions={},isDirectory=fullDirectory(p),isStaff=sponsorStaff(p),isUsers=globalRight(p,'users','manage');
 const [ownLinks,roleRows,grantRows,teamRows,siteRows]=await Promise.all([
  tx`select id,sponsor_id,user_id,roles,version from cms_sponsor_memberships where user_id=${p.id}`,
  tx`select * from cms_roles`,tx`select * from cms_grants`,tx`select id,name from cms_teams`,
  tx`select draft->>'clubName' as name,draft->>'season' as season from cms_records where id='settings'`
 ]);
 state.settings={...state.settings,clubName:siteRows[0]?.name||'Duindorp SV',season:siteRows[0]?.season||'',teams:teamRows};
 state.roles=roleRows.map((r:any):CmsRole=>({id:r.id,name:r.name,description:r.description,teamScoped:r.team_scoped,permissions:rolePermissions(grantRows.filter((g:any)=>g.role_id===r.id))}));
 const allowedCompanyIds:string[]=ownLinks.map((l:any)=>l.sponsor_id);
 if(options.portal&&options.companyId&&!allowedCompanyIds.includes(options.companyId))throw new CmsError('forbidden','Je hebt geen toegang tot dit bedrijfsdossier.',403);
 const companies=await tx`select * from cms_sponsor_companies where ${isStaff&&!options.portal?tx`true`:options.portal?allowedCompanyIds.length?tx`id in ${tx(allowedCompanyIds)}`:tx`false`:isDirectory?tx`true`:tx`false`} order by data->>'name',id`;
 state.sponsorship.sponsors=companies.map((r:any)=>isStaff&&!options.portal||options.portal&&r.id===options.companyId?{...r.data,id:r.id}:minimalCompany(r));
 for(const row of companies)versions['company:'+row.id]=row.version;
 const members=await tx`select u.id,u.name,u.email,u.email_verified,u.banned,u.supabase_user_id,m.role_id,m.active,a.person_id from auth_user u join cms_memberships m on m.user_id=u.id left join cms_person_accounts a on a.user_id=u.id
  where ${isDirectory&&!options.portal?tx`true`:tx`u.id=${p.id} or ${isStaff&&!options.portal?tx`exists(select 1 from cms_sponsor_memberships sm where sm.user_id=u.id) or exists(select 1 from cms_grants g join cms_roles r on r.id=g.role_id where g.role_id=m.role_id and r.team_scoped=false and g.module in ('sponsors','*') and g.action in ('read','manage','*'))`:tx`false`}`}`;
 const accounts=new Map<string,any>();
 state.members=members.map((r:any):CmsMember=>{accounts.set(r.id,r);return{id:r.id,name:r.name,email:r.email,roleId:r.role_id,active:r.active&&!r.banned,teamIds:[],personId:r.person_id||undefined,verifiedEmailAt:r.email_verified?'verified':undefined};});
 (state as CmsState & {sponsorStaffOptions:{id:string;name:string;active:boolean}[]}).sponsorStaffOptions=state.members.filter(m=>m.active&&state.roles.find(r=>r.id===m.roleId)?.teamScoped===false&&grantRows.some((g:any)=>g.role_id===m.roleId&&['sponsors','*'].includes(g.module)&&['*','create','update','manage'].includes(g.action))).map(({id,name,active})=>({id,name,active}));
 const links=await tx`select * from cms_sponsor_memberships where ${isStaff&&!options.portal||isDirectory&&!options.portal?tx`true`:tx`user_id=${p.id}`}`;
 state.sponsorship.memberships=links.map((r:any)=>({id:r.id,sponsorId:r.sponsor_id,userId:r.user_id,roles:r.roles}));for(const r of links)versions['membership:'+r.id]=r.version;
 if(isDirectory&&!options.portal&&options.peopleIds?.length){
  const related=await tx`select guardian_person_id,child_person_id from cms_directory_guardians where guardian_person_id in ${tx(options.peopleIds)} or child_person_id in ${tx(options.peopleIds)}`;
  options={...options,peopleIds:[...new Set([...options.peopleIds,...related.flatMap((r:any)=>[r.guardian_person_id,r.child_person_id])])]};
 }
 const visibility=options.peopleIds?options.peopleIds.length?tx`r.id in ${tx(options.peopleIds)}`:tx`false`:isDirectory&&!options.portal?tx`true`:options.portal?tx`exists(select 1 from cms_person_accounts a where a.person_id=r.id and a.user_id=${p.id}) or exists(select 1 from cms_directory_guardians g join cms_person_accounts a on a.person_id=g.guardian_person_id where g.child_person_id=r.id and a.user_id=${p.id} and g.status='approved')`:tx`exists(select 1 from cms_directory_profiles dp where dp.person_id=r.id and jsonb_array_length(coalesce(dp.data->'sponsorIds','[]'::jsonb))>0) or exists(select 1 from cms_person_accounts a join cms_sponsor_memberships sm on sm.user_id=a.user_id where a.person_id=r.id)`;
 const peopleRows=await tx`select r.*,a.user_id,dp.data as private_profile,dp.version as profile_version,dp.source_club,dp.source_ref from cms_records r left join cms_person_accounts a on a.person_id=r.id left join cms_directory_profiles dp on dp.person_id=r.id where r.module='people' and ${visibility} order by r.id`;
 const people=new Map<string,any>(),profiles=new Map<string,any>();
 for(const r of peopleRows){
  people.set(r.id,r);profiles.set(r.id,r);
  state.people.push({...r.draft,id:r.id,backofficeUserId:r.user_id||undefined,published:!!r.live,deletedAt:r.deleted_at?iso(r.deleted_at):undefined});
  state.directory.profiles.push(r.private_profile||directoryProfileTemplate(r.id));versions['person:'+r.id]=r.version;versions['profile:'+r.id]=r.profile_version||0;
 }
 const ids=peopleRows.map((r:any)=>r.id);
 const [assignments,guardians,invitations,events,committees]=await Promise.all([
  tx`select * from cms_directory_assignments where ${ids.length?tx`person_id in ${tx(ids)}`:tx`false`}`,
  tx`select * from cms_directory_guardians where ${isDirectory&&!options.portal?ids.length?tx`guardian_person_id in ${tx(ids)} or child_person_id in ${tx(ids)}`:tx`false`:options.portal?tx`exists(select 1 from cms_person_accounts a where a.person_id=guardian_person_id and a.user_id=${p.id})`:tx`false`}`,
  tx`select * from cms_directory_invitations where ${!options.portal&&ids.length?tx`person_id in ${tx(ids)}`:tx`false`} order by created_at desc`,
  tx`select * from cms_directory_events where ${isDirectory&&!options.portal&&ids.length?tx`person_id in ${tx(ids)}`:tx`false`} order by created_at desc limit 1000`,
  tx`select id,draft from cms_records where module='committees' and deleted_at is null`
 ]);
 state.directory.assignments=assignments.map((r:any)=>{versions['assignment:'+r.id]=r.version;return{...r.data,id:r.id,personId:r.person_id};});
 state.directory.guardians=guardians.map((r:any)=>{versions['guardian:'+r.id]=r.version;return{...r.data,id:r.id,status:r.status,guardianPersonId:r.guardian_person_id,childPersonId:r.child_person_id};});
 state.directory.invitations=invitations.map(invitation);
 state.directory.events=events.map((r:any)=>({id:r.id,personId:r.person_id,actorId:r.actor_id||'',at:iso(r.created_at),action:r.action}));
 state.planning.committees=committees.map((r:any)=>({...r.draft,id:r.id}));
 const companyRole=ownLinks.find((l:any)=>l.sponsor_id===options.companyId)?.roles||[];
 const documents=companyRole.some((r:string)=>r==='signer'||r==='billing'),billing=companyRole.includes('billing');
 const recordRows=await tx`select * from cms_sponsor_records where ${isStaff&&!options.portal?tx`true`:options.portal&&options.companyId?tx`(sponsor_id=${options.companyId} and (kind not in ('invoices','agreements','proposals') or kind='invoices' and ${billing} or kind in ('agreements','proposals') and ${documents})) or kind='events' or kind='settings'`:tx`false`} order by created_at desc,id`;
 const records=new Map<string,any>();
 if(recordRows.some((r:any)=>r.kind==='contractTemplates'))state.sponsorship.contractTemplates=[];
 for(const r of recordRows){
  versions['record:'+r.id]=r.version;records.set(r.id,r);let value={...r.data,id:r.id};
  if(r.snapshot_bytes){
   const original=JSON.parse(r.snapshot_bytes);
   if(digest(sorted(original))!==digest(sorted(r.data.snapshot)))throw new CmsError('document-integrity','De vastgelegde documentinhoud is niet intact.',409);
   value.snapshot=original;
  }
  if(r.kind==='settings')state.sponsorship.settings={...state.sponsorship.settings,...r.data};
  else (state.sponsorship as any)[r.kind]?.push(value);
 }
 const agreementIds=state.sponsorship.agreements.map(a=>a.id);
 if(agreementIds.length){
  const [documents,signatures,challenges]=await Promise.all([
   tx`select * from cms_sponsor_documents where agreement_id in ${tx(agreementIds)}`,
   tx`select * from cms_sponsor_signatures where agreement_id in ${tx(agreementIds)} order by created_at,id`,
   tx`select id,agreement_id,sponsor_id,user_id,party,email,document_hash,status,attempts,created_at,expires_at,consumed_at from cms_sponsor_signing_challenges where agreement_id in ${tx(agreementIds)} and user_id=${p.id} order by created_at desc limit 100`
  ]);
  for(const agreement of state.sponsorship.agreements){
   const doc=documents.find((d:any)=>d.agreement_id===agreement.id);
   if(!doc||doc.snapshot_bytes!==records.get(agreement.id)?.snapshot_bytes||digestText(doc.snapshot_bytes)!==doc.document_hash||doc.document_hash!==agreement.documentHash)throw new CmsError('document-integrity','De vaste overeenkomst kon niet worden gecontroleerd.',409);
   agreement.snapshot=JSON.parse(doc.snapshot_bytes);agreement.snapshotBytes=doc.snapshot_bytes;agreement.hashFormat=doc.hash_format;
   const proofs=signatures.filter((s:any)=>s.agreement_id===agreement.id).map((s:any)=>s.proof);
   if(agreement.signingMode==='dual-email-otp'){
    if(digest(sorted(proofs))!==digest(sorted(agreement.signatures)))throw new CmsError('signature-integrity','De ondertekenbewijzen zijn niet intact.',409);
    agreement.signatures=proofs;
   }
  }
  state.sponsorship.signingChallenges=challenges.map((r:any)=>({id:r.id,agreementId:r.agreement_id,sponsorId:r.sponsor_id,userId:r.user_id,party:r.party,email:r.email,emailHint:maskEmail(r.email),documentHash:r.document_hash,status:r.status,attempts:r.attempts,createdAt:iso(r.created_at),expiresAt:iso(r.expires_at),consumedAt:iso(r.consumed_at),codeHash:''}));
 }
 if(!isStaff||options.portal)state.sponsorship.contractTemplates=[];
 return {state,versions,people,profiles,records,accounts};
}
export function digestText(value:string){return createHash('sha256').update(value,'utf8').digest('hex');}
export function sorted(value:any):any{return Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;}
export function maskEmail(email:string){const [name,host]=email.split('@');return (name||'').slice(0,2)+'***@'+(host||'');}

export async function directoryListing(tx:any,p:Principal,q:WorkspaceQuery){
 const full=fullDirectory(p);if(!full&&!sponsorStaff(p))throw new CmsError('forbidden','Je hebt geen toegang tot dit register.',403);
 const sponsorScope=q.companyId?tx`(coalesce(dp.data->'sponsorIds','[]'::jsonb) ? ${q.companyId} or exists(select 1 from cms_sponsor_memberships sm where sm.user_id=a.user_id and sm.sponsor_id=${q.companyId}))`:tx`(jsonb_array_length(coalesce(dp.data->'sponsorIds','[]'::jsonb))>0 or exists(select 1 from cms_sponsor_memberships sm where sm.user_id=a.user_id))`;
 const scope=tx`r.module='people' and r.deleted_at is null and ${full?tx`true`:tx`${sponsorScope} and coalesce(dp.data->>'status','active')<>'archived'`} and ${q.companyId?sponsorScope:tx`true`}`;
 const search='%'+q.search.replace(/[\\%_]/g,'\\$&')+'%';
 const filter=tx`${scope} and ${q.search?tx`(r.draft->>'name' ilike ${search} or r.draft->>'email' ilike ${search} or r.draft->>'phone' ilike ${search} or ${full?tx`r.draft->>'sportlinkId' ilike ${search} or r.draft->>'role' ilike ${search} or exists(select 1 from cms_directory_assignments d where d.person_id=r.id and d.data->>'name' ilike ${search})`:tx`false`})`:tx`true`}
  and ${full&&q.feature&&q.feature!=='all'?q.feature==='parent'?tx`exists(select 1 from cms_directory_guardians g where g.guardian_person_id=r.id and g.status='approved')`:q.feature==='committee'?tx`exists(select 1 from cms_directory_assignments a where a.person_id=r.id and a.data->>'kind'='committee')`:q.feature==='sponsor'?sponsorScope:tx`(coalesce(dp.data->>'membership','none')=${q.feature} or dp.data->>'status'=${q.feature} or coalesce(dp.data->'labels','[]'::jsonb) ? ${q.feature})`:tx`true`}
  and ${full&&q.source&&q.source!=='all'?tx`dp.data->>'source'=${q.source}`:tx`true`}
  and ${!q.account||q.account==='all'?tx`true`:q.account==='active'?tx`u.id is not null and m.active=true and coalesce(u.banned,false)=false`:q.account==='blocked'?tx`u.id is not null and (m.active=false or coalesce(u.banned,false)=true)`:q.account==='none'?tx`u.id is null and inv.id is null`:q.account==='pending'?tx`u.id is null and inv.status='pending' and inv.expires_at>now()`:q.account==='expired'?tx`u.id is null and inv.status='pending' and inv.expires_at<=now()`:tx`u.id is null and inv.status='revoked'`}`;
 const join=tx`cms_records r left join cms_directory_profiles dp on dp.person_id=r.id left join cms_person_accounts a on a.person_id=r.id left join auth_user u on u.id=a.user_id left join cms_memberships m on m.user_id=u.id left join lateral (select i.id,i.status,i.expires_at from cms_directory_invitations i where i.person_id=r.id order by i.created_at desc limit 1) inv on true`;
 const [counts]=await tx`select count(*)::int as total from ${join} where ${filter}`;
 const page=Math.min(q.page,Math.max(1,Math.ceil(counts.total/q.pageSize)));
 const pageRows=await tx`select r.id from ${join} where ${filter} order by lower(r.draft->>'name'),r.id limit ${q.pageSize} offset ${(page-1)*q.pageSize}`;
 const [stats]=await tx`select count(*)::int as total,count(*) filter(where u.id is not null and m.active and not coalesce(u.banned,false))::int as active,count(*) filter(where u.id is null and inv.status='pending' and inv.expires_at>now())::int as pending,count(*) filter(where u.id is null and inv.id is null)::int as without_account from ${join} where ${scope}`;
 const ids=pageRows.map((r:any)=>r.id);
 if(q.personId&&!ids.includes(q.personId)){
  const selected=await tx`select r.id from ${join} where ${scope} and r.id=${q.personId}`;
  if(!selected.length)throw new CmsError('missing','Dit dossier is niet beschikbaar.',404);ids.push(q.personId);
 }
 return {ids,listingIds:pageRows.map((r:any)=>r.id),total:counts.total,page,pageSize:q.pageSize,stats};
}

/** Strip private columns before serialization, rather than hiding them in React. */
export function staffProjection(store:DomainStore,p:Principal,mode='sponsorship'){
 const state=structuredClone(store.state),full=fullDirectory(p),users=globalRight(p,'users','manage');
 if(!full){
  state.people=state.people.map(({id,name,email,phone})=>({id,name,email,phone}) as CmsPerson);
  state.directory!.profiles=state.directory!.profiles.map(({personId,sponsorIds,updatedAt})=>({personId,sponsorIds,updatedAt}) as DirectoryProfile);
  state.directory!.assignments=[];state.directory!.guardians=[];state.directory!.events=[];state.planning.committees=[];
 }
 if(mode==='directory'){const companies=state.sponsorship!.sponsors.map(s=>({id:s.id,name:s.name}) as Sponsor),links=state.sponsorship!.memberships;state.sponsorship=createSponsorshipSeed();state.sponsorship.sponsors=companies;state.sponsorship.memberships=links;state.sponsorship.contractTemplates=[];}
 const actualRole=state.roles.find(r=>r.id===p.roleId);if(!full&&actualRole)actualRole.permissions=actualRole.permissions.filter(permission=>permission!=='directory'&&permission!=='users');
 if(!users){state.roles=actualRole?[actualRole]:[];if(!full)state.members=state.members.filter(m=>m.id===p.id||state.sponsorship!.memberships.some(link=>link.userId===m.id));state.members=state.members.map(m=>m.id===p.id?m:{id:m.id,name:m.name,email:m.email,active:m.active,roleId:'',teamIds:[],personId:m.personId});}
 state.directory!.invitations=state.directory!.invitations.map(i=>({...i,token:''}));
 state.sponsorship!.signingChallenges=state.sponsorship!.signingChallenges?.map(c=>({...c,codeHash:''}));
 const staffOptions=sponsorStaff(p)||users?getSponsorStaffAccounts(store.state,p.id):[];
 return {state,versions:store.versions,userId:p.id,currentUser:state.members.find(m=>m.id===p.id)||{id:p.id,name:p.name,email:p.email,roleId:p.roleId,teamIds:p.teams,active:true},staffOptions};
}
export function contextFingerprint(p:Principal,store:DomainStore){
 return digest({id:p.id,role:p.roleId,grants:p.grants,teams:p.teams,companies:store.state.sponsorship?.memberships.filter(m=>m.userId===p.id),children:store.state.directory?.guardians.filter(g=>g.guardianPersonId===store.state.members.find(m=>m.id===p.id)?.personId).map(g=>({id:g.id,status:g.status,permissions:g.permissions}))});
}

export function portalProjection(store:DomainStore,p:Principal,companyId:string){
 const state=structuredClone(store.state),directory=state.directory!,data=state.sponsorship!;
 const me=state.members.find(m=>m.id===p.id),own=state.people.find(person=>person.id===me?.personId);
 const ownProfile=directory.profiles.find(profile=>profile.personId===own?.id);
 const guardians=directory.guardians.filter(g=>g.guardianPersonId===own?.id);
 const children=guardians.filter(g=>g.status==='approved').flatMap(g=>{
  const child=state.people.find(person=>person.id===g.childPersonId);if(!child)return[];
  const profile=directory.profiles.find(profile=>profile.personId===child.id);
  return [{linkId:g.id,personId:child.id,name:child.name,relationship:g.relationship,permissions:g.permissions,teamIds:g.permissions.some(r=>r==='schedule'||r==='attendance')?profile?.teamIds||[]:[]}];
 });
 const personal={person:own?{id:own.id,name:own.name,email:own.email,phone:own.phone}:null,profile:ownProfile?{membership:ownProfile.membership,status:ownProfile.status,labels:ownProfile.labels,teamIds:ownProfile.teamIds}:null,children,pendingGuardianRequests:guardians.filter(g=>g.status==='pending').map(g=>({id:g.id,status:g.status,childName:'Wacht op beoordeling door de club'})),sponsorIds:data.memberships.filter(m=>m.userId===p.id).map(m=>m.sponsorId),functions:directory.assignments.filter(a=>a.personId===own?.id&&(!a.startsAt||a.startsAt<=new Date().toISOString())&&(!a.endsAt||a.endsAt>=new Date().toISOString())).map(a=>a.name)};
 state.people=own?[{id:own.id,name:own.name,email:own.email,phone:own.phone} as CmsPerson]:[];
 state.members=me?[{id:me.id,name:me.name,email:me.email,active:me.active,roleId:me.roleId,teamIds:[],personId:me.personId}]:[];
 state.roles=state.roles.filter(r=>r.id===p.roleId).map(r=>({...r,permissions:[]}));
 state.directory={version:1,profiles:[],assignments:[],guardians:[],invitations:[],events:[]};
 state.settings.teams=state.settings.teams.filter(t=>personal.profile?.teamIds.includes(t.id)||children.some(c=>c.teamIds.includes(t.id)));
 state.planning.committees=[];
 data.sponsors=data.sponsors.map(company=>company.id===companyId?{...company,notes:'',ownerId:''}:{id:company.id,name:company.name} as Sponsor);
 data.memberships=data.memberships.filter(m=>m.userId===p.id);
 data.activities=[];data.contractTemplates=[];data.items=[];data.packages=[];
 data.profileRequests=data.profileRequests.filter(r=>r.sponsorId===companyId&&r.userId===p.id);
 data.businessChangeRequests=data.businessChangeRequests?.filter(r=>r.sponsorId===companyId&&r.userId===p.id);
 data.tasks=data.tasks.filter(t=>t.sponsorId===companyId&&t.visibleToSponsor).map(t=>({...t,ownerId:'',note:'',proofUrl:''}));
 data.proposals=data.proposals.filter(r=>r.sponsorId===companyId&&r.status!=='draft');
 data.agreements=data.agreements.filter(r=>r.sponsorId===companyId);
 data.invoices=data.invoices.filter(r=>r.sponsorId===companyId);
 data.events=data.events.map(e=>({...e,occupiedGuests:e.registrations.reduce((n,r)=>n+r.guests,0),registrations:e.registrations.filter(r=>r.userId===p.id&&r.sponsorId===companyId)}));
 data.signingChallenges=data.signingChallenges?.filter(c=>c.sponsorId===companyId&&c.userId===p.id).map(c=>({...c,codeHash:''}));
 data.settings={committeeEmail:data.settings.committeeEmail,defaultTerms:'',defaultPaymentTerms:'',vatNote:'',mollieEnabled:false,reminderDays:[]};
 return {state,versions:store.versions,userId:p.id,currentUser:me,personal,staffOptions:[]};
}

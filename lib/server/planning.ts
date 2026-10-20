import {createHash} from 'node:crypto';
import {activitySchema,planningInstant,locationsOverlap,validateLocationHierarchy,validateActivity,expandWeeklyTraining} from '../cms/planning';
import type {CmsActivity,CmsLocation,CmsState} from '../cms/types';
import {equalContent} from '../cms/compare';
import {authorize,type Principal} from './permissions';
import {CmsError} from './errors';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function activityAuthorization(p:Principal,action:string,value:any){
 const teams:string[]=value.teamIds||[];
 if(p.teamScoped&&(!teams.length||teams.some(id=>!p.teams.includes(id))))throw new CmsError('forbidden','Je mag alleen activiteiten voor je toegewezen teams beheren.',403);
 authorize(p,'pages',action,{teamId:teams[0]||''});
}
export async function planningLocations(tx:any):Promise<CmsLocation[]>{return (await tx`select id,draft,deleted_at from cms_records where module='locations' order by id for share`).map((row:any)=>({...row.draft,id:row.id,...(row.deleted_at?{deletedAt:row.deleted_at}: {})}));}
export async function validatePlanningWrite(tx:any,p:Principal,module:string,id:string,candidate:any,old:any,action:string,integration=false){
 if(module==='sportlinkSettings'){authorize(p,'settings','manage');if(p.teamScoped)throw new CmsError('forbidden','Sportlink-instellingen worden clubbreed beheerd.',403);return;}
 if(module==='people'){
  if(candidate.sportlinkId&&action!=='trash'){const [duplicate]=await tx`select id from cms_records where module='people' and deleted_at is null and id<>${id} and upper(btrim(draft->>'sportlinkId'))=${candidate.sportlinkId.trim().toUpperCase()}`;if(duplicate)throw new CmsError('person-source','Deze Sportlink-identiteit is al gekoppeld. Werk het bestaande persoonsprofiel bij.',409,{id:duplicate.id});}
  if(action==='trash'&&(await tx`select id from cms_records where module='activities' and deleted_at is null and draft->>'status'='planned' and draft->>'date'>=${today()} and draft->'personIds' ? ${id} limit 1`).length)throw new CmsError('person-in-use','Deze persoon is gekoppeld aan een toekomstige activiteit. Verwijder eerst die koppeling.',409);
  if((candidate.backofficeUserId||'')!==(old?.draft.backofficeUserId||'')||action==='restore'&&candidate.backofficeUserId){authorize(p,'users','manage');if(candidate.backofficeUserId&&!(await tx`select u.id from auth_user u join cms_memberships m on m.user_id=u.id where u.id=${candidate.backofficeUserId}`).length)throw new CmsError('account-link','Kies een bestaand CMS-account. Er wordt geen account aangemaakt.',422);}
  if(candidate.backofficeUserId&&action!=='trash'){const [linked]=await tx`select person_id from cms_person_accounts where user_id=${candidate.backofficeUserId} and person_id<>${id}`;if(linked)throw new CmsError('account-linked','Dit account is al aan een actief persoonsprofiel gekoppeld. Ontkoppel het daar eerst.',409);}
  return;
 }
 if(module==='locations'){
  authorize(p,'settings',old?'update':'create');if(p.teamScoped)throw new CmsError('forbidden','Locaties worden clubbreed beheerd.',403);
  const locations=await planningLocations(tx),next=locations.filter(item=>item.id!==id);next.push({...candidate,...(action==='trash'?{deletedAt:new Date().toISOString()}: {})});
  const hierarchy=validateLocationHierarchy(next.filter(item=>!item.deletedAt));if(hierarchy.length)throw new CmsError('location-hierarchy',hierarchy.join(' '),422);
  for(const child of next.filter(item=>item.active&&!item.deletedAt&&item.parentId)){const parent=next.find(item=>item.id===child.parentId&&!item.deletedAt);if(!parent?.active)throw new CmsError('location-parent','Een actief velddeel vereist een actieve bovenliggende locatie.',409);}
  if(!candidate.active||action==='trash'){
   const affected=locations.filter(item=>locationsOverlap(locations,item.id,id)).map(item=>item.id);
   const reservations=affected.length?await tx`select activity_id from cms_activity_reservations where location_id in ${tx(affected)} and ends_at>now() limit 1`:[];
   if(reservations.length)throw new CmsError('location-in-use','Deze locatie of een velddeel heeft toekomstige reserveringen. Verplaats of annuleer die activiteiten eerst.',409);
  }
  const normalized=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('nl').replace(/\s+/g,' ');
  if(candidate.active&&action!=='trash')for(const other of next.filter(item=>item.id!==id&&item.active&&!item.deletedAt)){if(candidate.sportlinkFieldCode&&normalized(candidate.sportlinkFieldCode)===normalized(other.sportlinkFieldCode||'')||candidate.sportlinkFieldName&&normalized(candidate.sportlinkFieldName)===normalized(other.sportlinkFieldName||''))throw new CmsError('field-mapping','Deze Sportlink-veldcode of veldnaam is al aan een andere actieve locatie gekoppeld.',409);}
  const bookings=await tx`select activity_id,location_id,starts_at,ends_at from cms_activity_reservations where ends_at>now() order by starts_at`;
  for(let i=0;i<bookings.length;i++)for(let j=i+1;j<bookings.length;j++){const a=bookings[i],b=bookings[j];if(b.starts_at>=a.ends_at)break;if(a.activity_id!==b.activity_id&&a.starts_at<b.ends_at&&a.ends_at>b.starts_at&&locationsOverlap(next,a.location_id,b.location_id))throw new CmsError('location-hierarchy-conflict','Deze hiërarchiewijziging veroorzaakt overlappende reserveringen. Pas de activiteiten eerst aan.',409);}
  return;
 }
 if(module==='committees'){
  for(const member of candidate.members)if(!(await tx`select id from cms_records where id=${member.personId} and module='people' and deleted_at is null`).length)throw new CmsError('committee-person','Een commissielid bestaat niet meer. Verwijder of vervang de verwijzing.',422);
  if(!candidate.active||action==='trash'){const rows=await tx`select id from cms_records where module='activities' and deleted_at is null and draft->>'status'='planned' and draft->>'date'>=${today()} and draft->'committeeIds' ? ${id} limit 1`;if(rows.length)throw new CmsError('committee-in-use','Verwijder de commissie eerst uit de toekomstige activiteiten.',409);}
  return;
 }
 if(module!=='activities')return;
 const authorizationAction=['publish','unpublish'].includes(action)?'publish':action==='trash'?'delete':old?'update':'create';activityAuthorization(p,authorizationAction,candidate);if(old)activityAuthorization(p,authorizationAction,old.draft);
 if(integration){authorize(p,'settings','manage');if(p.teamScoped)throw new CmsError('forbidden','Een bronintegratie vereist clubbrede rechten.',403);}
 if((candidate.source==='sportlink'&&!old||old?.draft.source==='sportlink'||candidate.source!==old?.draft.source&&old)&&!integration){
  if(!old||candidate.source!==old.draft.source||candidate.sourceId!==old.draft.sourceId||!equalContent(candidate.sourceData,old.draft.sourceData)||['date','startTime','endTime','type','title','status'].some(key=>candidate[key]!==old.draft[key]))throw new CmsError('source-locked','Datum, tijd, type en brongegevens van deze wedstrijd worden door Sportlink beheerd.',409);
  const locked:string[]=old.draft.sourceData?.locationIds||[];if(locked.some(locationId=>!candidate.locationIds.includes(locationId)))throw new CmsError('source-locked','De bronbeheerde veld- of kleedkamerindeling kan alleen via Sportlink wijzigen.',409);
 }
 if(action==='trash')return;
 const locations=await planningLocations(tx),personRows=candidate.personIds.length?await tx`select id from cms_records where id in ${tx(candidate.personIds)} and module='people' and deleted_at is null`:[],committeeRows=candidate.committeeIds.length?await tx`select id from cms_records where id in ${tx(candidate.committeeIds)} and module='committees' and deleted_at is null and (${candidate.status==='cancelled'} or (draft->>'active')::boolean=true)`:[],teams=candidate.teamIds.length?await tx`select id from cms_teams where id in ${tx(candidate.teamIds)}`:[];
 if(personRows.length!==candidate.personIds.length||committeeRows.length!==candidate.committeeIds.length||teams.length!==candidate.teamIds.length)throw new CmsError('activity-reference','Een gekoppelde persoon, commissie of team ontbreekt.',422);
 for(const locationId of candidate.locationIds){const location=locations.find(item=>item.id===locationId&&!item.deletedAt);if(!location||!location.active&&candidate.status!=='cancelled')throw new CmsError('activity-location','Een gekoppelde locatie ontbreekt of is niet actief.',422);}
 for(let i=0;i<candidate.locationIds.length;i++)for(let j=i+1;j<candidate.locationIds.length;j++)if(locationsOverlap(locations,candidate.locationIds[i],candidate.locationIds[j]))throw new CmsError('activity-location','Selecteer het hele veld of een velddeel; deze locaties overlappen elkaar.',422);
 if(candidate.status==='cancelled')return;
 const start=planningInstant(candidate.date+'T'+candidate.startTime,candidate.occurrence||'reject'),end=planningInstant(candidate.date+'T'+candidate.endTime,candidate.occurrence||'reject');
 const overlaps=await tx`select r.activity_id,r.location_id,a.draft->>'title' as title,a.draft from cms_activity_reservations r join cms_records a on a.id=r.activity_id where r.activity_id<>${id} and r.starts_at<${end}::timestamptz and r.ends_at>${start}::timestamptz order by r.location_id for update of r`;
 const conflict=overlaps.find((booking:any)=>candidate.locationIds.some((locationId:string)=>locationsOverlap(locations,locationId,booking.location_id)));
 if(conflict){let readable=true;try{activityAuthorization(p,'read',conflict.draft);}catch{readable=false;}throw new CmsError('reservation-conflict',readable?`De gekozen locatie is bezet door “${conflict.title}”. Kies een ander tijdstip of een andere locatie.`:'Deze locatie is bezet. Kies een ander tijdstip of een andere locatie.',409,readable?{activityId:conflict.activity_id,locationId:conflict.location_id}:{locationId:conflict.location_id});}
}
export async function syncPlanningIndexes(tx:any,module:string,id:string,candidate:any,deleted:boolean){
 if(module==='activities'){
  await tx`delete from cms_activity_reservations where activity_id=${id}`;
  if(!deleted&&candidate.status==='planned')for(const locationId of candidate.locationIds)await tx`insert into cms_activity_reservations(activity_id,location_id,starts_at,ends_at) values (${id},${locationId},${planningInstant(candidate.date+'T'+candidate.startTime,candidate.occurrence||'reject')},${planningInstant(candidate.date+'T'+candidate.endTime,candidate.occurrence||'reject')})`;
 }
 if(module==='people'){await tx`delete from cms_person_accounts where person_id=${id}`;if(!deleted&&candidate.backofficeUserId)await tx`insert into cms_person_accounts(person_id,user_id) values (${id},${candidate.backofficeUserId})`;}
}
export function publicActivity(value:any,locations:any[]){return {id:value.id,title:value.title,type:value.type,date:value.date,startTime:value.startTime,endTime:value.endTime,description:value.description,...(value.occurrence?{occurrence:value.occurrence}:{}),location:value.sourceData?.side==='away'?value.sourceData.venue||'':(value.locationIds||[]).map((id:string)=>locations.find(location=>location.id===id)?.name).filter(Boolean).join(', ')||value.sourceData?.venue||''};}
export function planningMigrationReport(rows:any[],people:any[]){
 const agenda=rows.find(row=>row.id==='site-agenda'),training=rows.find(row=>row.id==='site-training');
 return {agenda:{version:agenda?.version||0,items:(agenda?.draft?.items||[]).map((item:any)=>({...item,legacyId:item.id,needs:['endTime','locations'],published:!!agenda.live?.items?.some((live:any)=>live.id===item.id) }))},training:{version:training?.version||0,items:(training?.draft?.items||[]).flatMap((team:any,index:number)=>team.sessions.map((session:any,offset:number)=>({...session,teamLabel:team.teamLabel,legacyId:index+':'+offset,needs:['period','team','location']})))},committeeProposals:[...new Set(people.map(person=>person.group).filter(Boolean))].map(group=>({group,members:people.filter(person=>person.group===group).map(person=>({personId:person.id,role:person.role})),requiresReview:true}))};
}
export function planningPreview(state:CmsState,activity:CmsActivity,until?:string,weekdays?:number[],p?:Principal){let activities:CmsActivity[];try{activities=until?expandWeeklyTraining(activity,{until,weekdays}):[activity];}catch(error){throw new CmsError('training-period',error instanceof Error?error.message:'Controleer de trainingsperiode.',422);}const conflicts:string[]=activities.length?[]:['Er valt geen trainingsmoment binnen deze periode en de gekozen weekdagen.'];const working=structuredClone(state),hidden=p?working.planning.activities.filter(row=>{try{activityAuthorization(p,'read',row);return false;}catch{return true;}}).map(row=>row.id):[];for(const row of activities){conflicts.push(...validateActivity(working,row,[],hidden));working.planning.activities.push(row);}return {count:activities.length,activities,conflicts:[...new Set(conflicts)]};}
export const migrationActivityId=(source:string,id:string)=>'legacy-'+createHash('sha256').update(source+':'+id).digest('hex').slice(0,32);

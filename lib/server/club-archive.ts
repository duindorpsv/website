import {z} from 'zod';
import {sqlClient} from '../../db';
import {authorize,type Principal} from './permissions';
import {CmsError} from './errors';
import {archiveMomentSchema,archiveObjectSchema,archiveCollectionSchema,archiveSettingsSchema,archiveContributionSchema,cleanArchiveInput,ARCHIVE_POLICY} from '../club-archive-schema';
import {archiveCompareDate,archiveId,type ArchiveState,type ArchiveContribution} from '../club-archive-types';
import {publishArchiveContribution,withdrawArchiveContribution} from '../club-archive-moderation';
const empty=():ArchiveState=>({version:1,moments:[],objects:[],collections:[],contributions:[],widgetEnabled:false,featuredMomentId:'',featuredObjectId:''});
export const archiveMediaPath=(id:string)=>'/api/archive/media/'+encodeURIComponent(id);
export function requireArchive(p:Principal,write=false){if(p.teamScoped)throw new CmsError('forbidden','Het clubarchief vereist clubbrede rechten.',403);authorize(p,'pages','read');if(write){authorize(p,'pages','update');authorize(p,'pages','publish');}}
export async function archiveLock(tx:any){await tx`select pg_advisory_xact_lock(84209531)`;}
export async function readArchive(tx:any=sqlClient(),admin=false){
 const state=empty(),catalog=await tx`select * from cms_archive_catalog order by kind,id`,relations=await tx`select * from cms_archive_relations`,media=await tx`select m.id,m.kind,m.name,m.bytes,m.state,m.error from cms_archive_media m left join cms_archive_batches b on b.id=m.batch_id where m.batch_id is null or b.submitted_id is not null`,mediaMap=new Map(media.map((m:any)=>[m.id,m]));
 const available=(items:any[],privatePreview=false)=>items.filter(m=>mediaMap.has(m.id)&&(mediaMap.get(m.id) as any).state==='ready'&&(privatePreview||m.approved===true)).map(m=>({id:m.id,kind:(mediaMap.get(m.id) as any).kind,name:m.name,caption:m.caption,credit:m.credit,approved:m.approved,bytes:Number((mediaMap.get(m.id) as any).bytes),src:archiveMediaPath(m.id)}));
 for(const r of catalog){const raw=r.live||(admin?r.draft:null);if(!raw)continue;const d:any=(r.kind==='moment'?archiveMomentSchema:r.kind==='object'?archiveObjectSchema:r.kind==='collection'?archiveCollectionSchema:archiveSettingsSchema).parse(cleanArchiveInput(raw));if(r.kind==='settings'){Object.assign(state,d,{settingsVersion:r.version});continue;}
  d.id=r.id;d.published=!!r.live;if(admin){d.version=r.version;d.live=!!r.live;}d.media=available(d.media||[],admin&&!r.live);
  if(r.kind==='collection'){state.collections!.push(d);continue;}
  d.cover=d.media.some((m:any)=>m.src===d.cover&&m.kind==='image')?d.cover:'';
  if(d.comparison&&(d.comparison.published===false||![d.comparison.before,d.comparison.after].every(src=>d.media.some((m:any)=>m.kind==='image'&&m.src===src))))delete d.comparison;
  if(r.kind==='moment'){d.objectIds=relations.filter((l:any)=>l.moment_id===r.id).map((l:any)=>l.object_id);state.moments.push(d);}else state.objects.push({...d,momentIds:relations.filter((l:any)=>l.object_id===r.id).map((l:any)=>l.moment_id)});
 }
 const contributions=admin?await tx`select id,draft,status,note,version,created_at from cms_archive_contributions order by created_at desc,id`:await tx`select id,live,status,created_at from cms_archive_contributions where status='published' and live is not null order by created_at,id`;
 for(const row of contributions){const d=admin?{...row.draft,id:row.id,status:row.status,note:row.note,createdAt:new Date(row.created_at).toISOString(),version:row.version}:row.live;if(!d)continue;d.media=admin?d.media.map((m:any)=>({...m,src:archiveMediaPath(m.id)})):available(d.media);if(admin)state.contributions.push(d);else{
   const target=d.targetType==='object'?state.objects:state.moments;if(!target.some(m=>m.id===d.targetId&&m.published))continue;
   const {id,kind,targetId,targetType,title,description,date,category,media,name,anonymous,source,people,createdAt,publishedId}=d;state.contributions.push({id,kind,targetId,targetType,title,description,date,category,media,name:anonymous?'':name,anonymous,source,people,createdAt,publishedId,status:'published'} as ArchiveContribution);
  }}
 // Resolve real registers at read time; unpublished linked records never make public cards.
 const people=await tx`select id,jsonb_build_object('name',live->>'name') as live from cms_records where module='people' and live is not null and deleted_at is null`,articles=await tx`select id,jsonb_build_object('title',live->>'title','slug',live->>'slug','contentType',live->>'contentType') as live from cms_records where module='articles' and live is not null and deleted_at is null`,teams=await tx`select id,name from cms_teams`;
 for(const item of [...state.moments,...state.objects]){const links:any[]=[];for(const id of item.personIds||[]){const p=people.find((p:any)=>p.id===id);if(p){const name=p.live.name;item.people=[...new Set([...item.people,name])];links.push({id,name,href:'/clubmuur/club/tijdlijn?zoek='+encodeURIComponent(name)});}}for(const id of item.teamIds||[]){const t=teams.find((t:any)=>t.id===id);if(t)links.push({id,name:t.name,href:`/clubmuur/teams/${encodeURIComponent(id)}`});}for(const id of item.articleIds||[]){const a=articles.find((a:any)=>a.id===id);if(a)links.push({id,name:a.live.title,href:'/clubmuur/'+(a.live.contentType==='story'?'verhalen/':'nieuws/')+a.live.slug});}item.links=links;}
 if(!admin){for(const o of state.objects){o.collectionIds=(o.collectionIds||[]).filter(id=>state.collections!.some(c=>c.id===id&&c.published));const collection=state.collections!.find(c=>c.id===o.collectionIds?.[0]);if(collection)o.collection=collection.title;}state.moments=state.moments.filter(m=>m.published);state.objects=state.objects.filter(m=>m.published);for(const m of state.moments){m.objectIds=m.objectIds.filter(id=>state.objects.some(o=>o.id===id));m.relatedMomentIds=m.relatedMomentIds.filter(id=>state.moments.some(o=>o.id===id));}for(const o of state.objects)o.momentIds=o.momentIds.filter(id=>state.moments.some(m=>m.id===id));}
 if(!state.moments.some(m=>m.published&&m.id===state.featuredMomentId))state.featuredMomentId='';if(!state.objects.some(o=>o.published&&o.id===state.featuredObjectId))state.featuredObjectId='';state.objects.sort(archiveCompareDate);return {state,catalog,media:media.filter((m:any)=>m.state==='ready'),people:people.map((p:any)=>({id:p.id,name:p.live.name})),articles:articles.map((a:any)=>({id:a.id,name:a.live.title})),teams};
}
export async function archiveWorkspace(p:Principal){requireArchive(p,true);const sql=sqlClient(),result=await readArchive(sql,true),revisions=await sql`select id,kind,record_id,version,action,reason,created_at from cms_archive_revisions order by created_at desc limit 300`;const originals=await sql`select id,proposed,consent_version,consent_at from cms_archive_contributions order by created_at desc`;return {...result,originals,revisions,canEdit:!p.teamScoped&&p.grants.some(g=>(g.module==='pages'||g.module==='*')&&(g.action==='publish'||g.action==='*'))};}
async function revision(tx:any,p:Principal,kind:string,id:string,version:number,data:any,action:string,reason=''){
 await tx`insert into cms_archive_revisions(id,kind,record_id,version,snapshot,action,reason,actor_id) values (${crypto.randomUUID()},${kind},${id},${version},${tx.json(data)},${action},${reason},${p.id})`;
}
export async function archiveCatalogWrite(tx:any,p:Principal,kind:string,input:any,expected:number,action:string,reason=''){
 const parser=kind==='moment'?archiveMomentSchema:kind==='object'?archiveObjectSchema:kind==='collection'?archiveCollectionSchema:archiveSettingsSchema;
 if(!input||!['moment','object','collection','settings'].includes(kind))throw new CmsError('validation','Kies een geldige archiefsoort en vul de inhoud in.',422);
 const data:any=parser.parse(cleanArchiveInput(input)),id=kind==='settings'?'settings':data.id;
 const [old]=await tx`select * from cms_archive_catalog where kind=${kind} and id=${id} for update`;
 if((old?.version||0)!==expected)throw new CmsError('conflict','Deze versie is ondertussen gewijzigd. Je invoer blijft open; laad de actuele versie.',409);
 if(data.slug){const [taken]=await tx`select id from cms_archive_catalog where kind=${kind} and id<>${id} and (draft->>'slug'=${data.slug} or live->>'slug'=${data.slug} or aliases ? ${data.slug})`;if(taken)throw new CmsError('slug','Dit adres hoort al bij een ander archiefrecord.',409);}
 const publish=action==='publish',withdraw=action==='withdraw';
 if(publish&&kind!=='settings'&&kind!=='collection'&&!data.sourceLabel.trim())throw new CmsError('source','Leg een bronlabel vast voordat je publiceert.',422);
 if(publish&&old?.live&&kind!=='settings'&&!reason.trim())throw new CmsError('reason','Noteer de redactionele reden voor het bijwerken van een publicatie.',422);
 if(publish){await validateArchiveMedia(tx,data);await validateArchiveReferences(tx,data,kind);}
 if(kind==='settings'){for(const [key,k] of [['featuredMomentId','moment'],['featuredObjectId','object']])if(data[key]&&!(await tx`select id from cms_archive_catalog where kind=${k} and id=${data[key]} and live is not null`).length)throw new CmsError('reference','Kies een gepubliceerd record voor de homepage.',422);}
 const live=kind==='settings'?data:publish?{...data,published:true}:withdraw?null:old?.live;
 const aliases=[...new Set([...(old?.aliases||[]),...(publish&&old?.live?.slug?[old.live.slug]:[])])];
 await tx`insert into cms_archive_catalog(kind,id,draft,live,aliases,version) values (${kind},${id},${tx.json(data)},${live?tx.json(live):null},${tx.json(aliases)},1) on conflict(kind,id) do update set draft=excluded.draft,live=excluded.live,aliases=excluded.aliases,version=cms_archive_catalog.version+1,updated_at=now()`;
 if(publish&&['moment','object'].includes(kind)){
  const moment=kind==='moment',before=await tx`select moment_id,object_id from cms_archive_relations where ${moment?tx`moment_id=${id}`:tx`object_id=${id}`}`;
  const previous=before.map((r:any)=>moment?r.object_id:r.moment_id),next:string[]=moment?data.objectIds:data.momentIds;
  await tx`delete from cms_archive_relations where ${moment?tx`moment_id=${id}`:tx`object_id=${id}`}`;
  for(const target of next)await tx`insert into cms_archive_relations(moment_id,object_id) values (${moment?id:target},${moment?target:id}) on conflict do nothing`;
  const changed=[...new Set([...previous,...next])].filter(target=>previous.includes(target)!==next.includes(target));
  for(const target of changed)await syncInverseArchiveRelations(tx,p,moment?'object':'moment',target,id,`Koppeling bijgewerkt via ${kind==='moment'?'tijdlijnmoment':'museumstuk'} “${data.title}”`);
 }
 await revision(tx,p,kind,id,expected+1,{draft:data,live},action,reason);return {id,version:expected+1};
}
/** Synchronize inverse published references and fence editors that opened an older version.
 * Preserve an explicitly different saved draft relation set, plus all draft text/media edits. */
async function syncInverseArchiveRelations(tx:any,p:Principal,kind:string,id:string,sourceId:string,reason:string){
 const [row]=await tx`select * from cms_archive_catalog where kind=${kind} and id=${id} for update`;if(!row)return;
 const moment=kind==='moment',key=moment?'objectIds':'momentIds',refs=await tx`select moment_id,object_id from cms_archive_relations where ${moment?tx`moment_id=${id}`:tx`object_id=${id}`}`;
 const ids=refs.map((r:any)=>moment?r.object_id:r.moment_id).sort(),same=(a:string[]=[],b:string[]=[])=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
 const draft={...row.draft},live=row.live?{...row.live,[key]:ids}:null;
 const previous=ids.includes(sourceId)?ids.filter((value:string)=>value!==sourceId):[...ids,sourceId];
 if(same(row.draft[key],previous))draft[key]=ids;
 await tx`update cms_archive_catalog set draft=${tx.json(draft)},live=${live?tx.json(live):null},version=version+1,updated_at=now() where kind=${kind} and id=${id}`;
 await revision(tx,p,kind,id,row.version+1,{draft,live},'relations',reason);
}
async function validateArchiveReferences(tx:any,data:any,kind:string){
 for(const [ids,module] of [[data.personIds||[],'people'],[data.articleIds||[],'articles']])for(const id of ids)if(!(await tx`select id from cms_records where id=${id} and module=${module} and live is not null and deleted_at is null`).length)throw new CmsError('reference','Een gekoppelde persoon of verhaal is niet gepubliceerd.',422);
 for(const id of data.collectionIds||[])if(!(await tx`select id from cms_archive_catalog where kind='collection' and id=${id} and live is not null`).length)throw new CmsError('reference','Een gekozen collectie is niet gepubliceerd.',422);
 for(const id of data.teamIds||[])if(!(await tx`select id from cms_teams where id=${id}`).length)throw new CmsError('reference','Een gekoppeld team ontbreekt.',422);
 for(const [values,k] of [[data.objectIds||[],'object'],[[...(data.momentIds||[]),...(data.relatedMomentIds||[])],'moment']] as [string[],string][]){for(const id of values)if(!(await tx`select id from cms_archive_catalog where kind=${k} and id=${id} and live is not null`).length)throw new CmsError('reference','Een gekoppeld archiefrecord is niet gepubliceerd.',422);}
}
export async function validateArchiveMedia(tx:any,data:any){
 const media=data.media||[];if(new Set(media.map((m:any)=>m.id)).size!==media.length)throw new CmsError('media','Een bestand staat dubbel in deze publicatie.',422);
 for(const m of media){if(!m.approved)continue;const [known]=await tx`select m.id,m.kind from cms_archive_media m left join cms_archive_batches b on b.id=m.batch_id where m.id=${m.id} and m.state='ready' and (m.batch_id is null or b.submitted_id is not null)`;if(!known||known.kind!==m.kind||m.src!==archiveMediaPath(m.id))throw new CmsError('media','Een gekozen bestand is niet beschikbaar of niet verwerkt.',422);}
 for(const src of [data.cover,...(data.comparison?.published===false?[]:[data.comparison?.before,data.comparison?.after])].filter(Boolean))if(src!=='/assets/logo.png'&&!media.some((m:any)=>m.approved&&m.kind==='image'&&m.src===src))throw new CmsError('media','Kies goedgekeurde afbeeldingen voor omslag en vergelijking.',422);
}
const mutation=z.object({operationId:z.string().uuid(),action:z.enum(['save','publish','withdraw','settings','moderate','approve','retract','restore']),kind:z.enum(['moment','object','collection','settings','contribution']).optional(),id:z.string().max(180).optional(),expectedVersion:z.number().int().min(0),data:z.any().optional(),status:z.enum(['pending','info','rejected']).optional(),reason:z.string().max(3000).default(''),revisionId:z.string().optional()}).strict();
export async function mutateArchive(p:Principal,value:unknown){requireArchive(p,true);const q=mutation.parse(value),sql=sqlClient();return sql.begin(async tx=>{
 await archiveLock(tx);const [prior]=await tx`select response,actor_id from cms_operations where id=${q.operationId}`;if(prior){if(prior.actor_id!==p.id)throw new CmsError('forbidden','Deze actie is niet beschikbaar.',403);return prior.response;}
 let result:any;
 if(['moderate','approve','retract'].includes(q.action)){
  const [old]=await tx`select * from cms_archive_contributions where id=${q.id!} for update`;if(!old)throw new CmsError('missing','Inzending niet gevonden.',404);if(old.version!==q.expectedVersion)throw new CmsError('conflict','Een andere beoordelaar heeft deze inzending gewijzigd. Je invoer blijft open.',409);
  if(old.status==='published'&&q.action!=='retract')throw new CmsError('locked','Trek de publicatie eerst in om opnieuw te beoordelen.',409);
  const {state}=await readArchive(tx,true),current=state.contributions.find(c=>c.id===old.id)!;
  if(q.action==='retract'){withdrawArchiveContribution(state,current.id);if(['moment','object'].includes(current.kind)&&current.publishedId){const k=current.kind;const [row]=await tx`select * from cms_archive_catalog where kind=${k} and id=${current.publishedId}`;if(row)await archiveCatalogWrite(tx,p,k,row.draft,row.version,'withdraw','Inzending ingetrokken');}result={id:old.id};}
  else{
   const input=archiveContributionSchema.parse(cleanContribution(q.data)),next:any={...current,...input,id:old.id,status:q.status||old.status,note:q.reason||'',publishedId:current.publishedId};
   const received=new Set(old.proposed.media.map((m:any)=>m.id));if(next.media.some((m:any)=>!received.has(m.id)))throw new CmsError('media','Bestand hoort niet bij deze inzending.',422);
   if(current.publishedId&&next.kind!==current.kind)throw new CmsError('kind','De soort van een eerder gepubliceerd record blijft gelijk. Maak zo nodig een nieuwe inzending.',422);
   next.media=next.media.map((m:any)=>({...m,src:archiveMediaPath(m.id)}));
   if(q.action==='approve'){
    await validateArchiveMedia(tx,next);await validateArchiveReferences(tx,next,'contribution');try{publishArchiveContribution(state,next);}catch(e){throw new CmsError('publication',e instanceof Error?e.message:'Controleer de bijdrage en het doel.',422);}const published=state.contributions.find(c=>c.id===old.id)!;
    if(['moment','object'].includes(published.kind)){const k=published.kind,target=(k==='moment'?state.moments:state.objects).find(m=>m.id===published.publishedId)!;const [prior]=await tx`select version from cms_archive_catalog where kind=${k} and id=${target.id}`;Object.assign(target,{personIds:next.personIds,teamIds:next.teamIds,articleIds:next.articleIds});await archiveCatalogWrite(tx,p,k,target,prior?.version||0,'publish','Goedgekeurde inzending');}
   }else{if(next.status==='rejected'&&!next.note.trim())throw new CmsError('reason','Noteer de reden van afwijzen.',422);state.contributions[state.contributions.findIndex(c=>c.id===old.id)]=next;}
   result={id:old.id};
  }
  const updated=state.contributions.find(c=>c.id===old.id)!;const {version,...stored}=updated;
  await tx`update cms_archive_contributions set draft=${tx.json(stored)},live=${updated.status==='published'?tx.json(stored):null},status=${updated.status},note=${updated.note},version=version+1,updated_at=now() where id=${old.id}`;
  await revision(tx,p,'contribution',old.id,old.version+1,stored,q.action,q.reason);result.version=old.version+1;
 }else{
  let data=q.data;if(q.action==='restore'){const [r]=await tx`select snapshot from cms_archive_revisions where id=${q.revisionId!} and kind=${q.kind!} and record_id=${q.id!}`;if(!r||!q.reason.trim())throw new CmsError('revision','Kies een revisie en noteer de reden.',422);data=r.snapshot.draft;}
  result=await archiveCatalogWrite(tx,p,q.action==='settings'?'settings':q.kind!,data,q.expectedVersion,q.action==='settings'?'publish':q.action==='restore'?'save':q.action,q.reason);
 }
 await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${p.id},${'archive-'+q.action},${result.id},${q.operationId},${tx.json({version:result.version,reason:q.reason})})`;
 await tx`insert into cms_operations(id,actor_id,response) values (${q.operationId},${p.id},${tx.json(result)})`;return result;
});}
function cleanContribution(value:any){if(!value||typeof value!=='object'||Array.isArray(value))throw new CmsError('validation','De te beoordelen gegevens ontbreken.',422);const {status,note,createdAt,publishedId,version,live,links,...data}=value;return data;}
export async function archiveResolve(kind:string,slug:string){const [row]=await sqlClient()`select live from cms_archive_catalog where kind=${kind} and live is not null and (live->>'slug'=${slug} or aliases ? ${slug})`;return row?.live||null;}

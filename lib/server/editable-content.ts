import {createCmsSeed} from '../cms/seed';
import {pageContent,docText} from '../cms/model';
import {equalContent} from '../cms/compare';
import {migrateLayout,referencesIn} from '../cms/layout/document';
import {clubTrainingSchedule} from '../clubmuur-training';

const release='editable-club-content-v1';
function emptyBody(body:any){
 if(docText(body||{}).trim())return false;
 const meaningful=(node:any):boolean=>['cmsWidget','image','table','cmsLegacyRichText'].includes(node.type)||(node.content||[]).some(meaningful);
 return !meaningful(body||{});
}

/** Upgrade each snapshot independently, retaining editorial drafts and old publications. */
export async function applyEditableContent(tx:any,releaseId=release){
 await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;await tx`select pg_advisory_xact_lock(736402)`;
 if((await tx`select id from cms_audit where action=${releaseId} and record_id is null`).length)return;
 const seed=createCmsSeed(),changed:string[]=[];
 async function write(id:string,module:string,old:any,draft:any,live:any){
  if(old&&equalContent(old.draft,draft)&&equalContent(old.live,live))return;
  const version=(old?.version||0)+1;
  if(old)await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${id},${old.version},${tx.json(old.draft)},'Voor bewerkbare clubinhoud') on conflict(record_id,version) do nothing`;
  await tx`insert into cms_records(id,module,title,slug,parent_id,status,version,draft,live) values (${id},${module},${draft.title||draft.name||''},${draft.slug||null},${draft.parentId||null},${old?.status||(live?'published':'draft')},${version},${tx.json(draft)},${live?tx.json(live):null}) on conflict(id) do update set version=excluded.version,draft=excluded.draft,live=excluded.live,updated_at=now()`;
  if(live){const pub=crypto.randomUUID();await tx`insert into cms_publications(id,record_id,record_version,snapshot) values (${pub},${id},${version},${tx.json(live)})`;await tx`update cms_records set live_id=${pub} where id=${id}`;}
  for(const [snapshot,data] of [['draft',draft],['live',live]] as const){
   await tx`delete from cms_references where record_id=${id} and snapshot=${snapshot}`;
   for(const ref of referencesIn(data))if((await tx`select id from cms_records where id=${ref}`).length)await tx`insert into cms_references(record_id,target_id,snapshot) values (${id},${ref},${snapshot}) on conflict do nothing`;
  }
  if(module==='pages')for(const [data,kind] of [[draft,'draft'],[live,'live']] as const)if(data?.slug)await tx`insert into cms_paths(path,record_id,kind) values (${'/clubmuur/'+data.slug},${id},${kind}) on conflict(path) do update set kind=excluded.kind where cms_paths.record_id=excluded.record_id`;
  changed.push(id);
 }
 // Central commission profiles are created only when missing. Names and biographies
 // already edited by the club are never replaced by the release.
 for(const person of seed.people.filter(person=>person.group==='Commissies')){
  const [old]=await tx`select * from cms_records where id=${person.id} for update`;
  if(!old)await write(person.id,'people',null,person,person);
 }
 for(const page of seed.pages){
  const [old]=await tx`select * from cms_records where id=${page.id} for update`;
  if(old&&(old.module!=='pages'||old.deleted_at))continue;
  if(!old){const [collision]=await tx`select record_id from cms_paths where path=${'/clubmuur/'+page.slug}`;if(collision)continue;await write(page.id,'pages',null,pageContent(page),pageContent(page));continue;}
  function upgrade(source:any){
   if(!source)return null;
   const body=emptyBody(source.body)?page.body:source.body;
   return {...source,...(source.coverSrc===undefined&&source.coverId===undefined&&page.coverSrc?{coverSrc:page.coverSrc}:{}),intro:source.intro||page.intro,body:migrateLayout(body,page.id),bodyFormat:'page-layout-v2',useBuilder:true};
  }
  await write(old.id,'pages',old,upgrade(old.draft),upgrade(old.live));
 }
 const [training]=await tx`select id from cms_records where id='site-training'`;
 if(!training)await write('site-training','training',null,{items:clubTrainingSchedule},{items:clubTrainingSchedule,published:true});
 await tx`insert into cms_audit(id,action,request_id,metadata) values (${crypto.randomUUID()},${releaseId},${crypto.randomUUID()},${tx.json({changed})})`;
 return {changed};
}
export async function upgradeEditableContent(sql:any){const report=await sql.begin((tx:any)=>applyEditableContent(tx));if(report)console.log(JSON.stringify({upgrade:release,...report}));}

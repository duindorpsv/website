import {authorize,type Principal} from './permissions';
import {CmsError} from './errors';

export async function syncHomepage(tx:any,id:string,before:any,live:any,actorId:string) {
  const [home]=await tx`select * from cms_records where id='settings' for update`;if(!home)return;
  const previous=JSON.stringify([home.draft,home.live]);
  for(const part of ['draft','live']){
    const settings=home[part];if(!settings)continue;
    const selected=(settings.homepageArticleIds||[]).includes(id)||(settings.homepageStoryIds||[]).includes(id);
    settings.homepageArticleIds=(settings.homepageArticleIds||[]).filter((v:string)=>v!==id);
    settings.homepageStoryIds=(settings.homepageStoryIds||[]).filter((v:string)=>v!==id);
    if(live&&(live.featured||(selected&&before?.featured===live.featured)))settings[live.contentType==='story'?'homepageStoryIds':'homepageArticleIds'].push(id);
  }
  if(previous===JSON.stringify([home.draft,home.live]))return;
  const version=home.version+1;
  await tx`update cms_records set draft=${tx.json(home.draft)},live=${home.live?tx.json(home.live):null},version=${version},updated_at=now() where id='settings'`;
  await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},'settings',${version},${tx.json(home.draft)},'publication-selection',${actorId})`;
  if(home.live){const pub=crypto.randomUUID();await tx`insert into cms_publications(id,record_id,record_version,snapshot,actor_id) values (${pub},'settings',${version},${tx.json(home.live)},${actorId})`;await tx`update cms_records set live_id=${pub} where id='settings'`;}
}

export async function moveChildPaths(tx:any,parentId:string,before:any,live:any,p:Principal) {
  if(!before||before.slug===live.slug)return;
  const children=await tx`with recursive descendants as (select id,draft,live,version,status,team_id from cms_records where module='pages' and (draft->>'parentId'=${parentId} or live->>'parentId'=${parentId}) and deleted_at is null union select r.id,r.draft,r.live,r.version,r.status,r.team_id from cms_records r join descendants d on r.draft->>'parentId'=d.id or r.live->>'parentId'=d.id where r.module='pages' and r.deleted_at is null) select * from descendants`;
  const routes:Record<string,string>={[`/clubmuur/${before.slug}`]:`/clubmuur/${live.slug}`};
  for(const child of children){
    const replace=(slug:string)=>slug?.startsWith(before.slug+'/')?live.slug+slug.slice(before.slug.length):slug;
    const newDraft={...child.draft,slug:replace(child.draft.slug)},newLive=child.live?{...child.live,slug:replace(child.live.slug)}:null;
    if(newDraft.slug===child.draft.slug&&newLive?.slug===child.live?.slug)continue;
    authorize(p,'pages',newLive?'publish':'update',{teamId:child.team_id||''});
    if(child.status==='scheduled')throw new CmsError('planned-child','Annuleer eerst de planning van een onderliggende pagina voordat je het bovenliggende pad wijzigt.',409,{id:child.id});
    const version=child.version+1;
    await tx`delete from cms_paths where record_id=${child.id}`;
    for(const slug of new Set([newDraft.slug,newLive?.slug].filter(Boolean))){const path=`/clubmuur/${slug}`;const [used]=await tx`select record_id from cms_paths where path=${path}`;if(used&&used.record_id!==child.id)throw new CmsError('path-conflict','Een nieuw onderliggend pad is al bezet.',409,{path});await tx`insert into cms_paths(path,record_id,kind) values (${path},${child.id},${slug===newLive?.slug?'live':'draft'})`;}
    await tx`update cms_records set slug=${newDraft.slug},draft=${tx.json(newDraft)},live=${newLive?tx.json(newLive):null},version=${version},updated_at=now() where id=${child.id}`;
    await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},${child.id},${version},${tx.json(newDraft)},'parent-path-change',${p.id})`;
    if(newLive){const pub=crypto.randomUUID(),oldPath=`/clubmuur/${child.live.slug}`,newPath=`/clubmuur/${newLive.slug}`;await tx`insert into cms_publications(id,record_id,record_version,snapshot,actor_id) values (${pub},${child.id},${version},${tx.json(newLive)},${p.id})`;await tx`update cms_records set live_id=${pub} where id=${child.id}`;if(oldPath!==newPath){routes[oldPath]=newPath;await tx`delete from cms_redirects where from_path=${newPath}`;await tx`update cms_redirects set to_path=${newPath} where record_id=${child.id}`;await tx`insert into cms_redirects(from_path,to_path,record_id) values (${oldPath},${newPath},${child.id}) on conflict(from_path) do update set to_path=excluded.to_path,record_id=excluded.record_id`;}}
    await tx`insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},'parent-path-change',${child.id},${crypto.randomUUID()})`;
  }
  function rewrite(value:any):any{if(Array.isArray(value))return value.map(rewrite);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='href'&&typeof v==='string'?Object.entries(routes).reduce((href,[old,to])=>href===old||href.startsWith(old+'#')?to+href.slice(old.length):href,v):rewrite(v)]));}
  const menus=await tx`select * from cms_records where module='navigation' for update`;
  for(const menu of menus){const draft=rewrite(menu.draft),published=rewrite(menu.live);if(JSON.stringify([draft,published])===JSON.stringify([menu.draft,menu.live]))continue;const version=menu.version+1;await tx`update cms_records set draft=${tx.json(draft)},live=${published?tx.json(published):null},version=${version},updated_at=now() where id=${menu.id}`;await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},${menu.id},${version},${tx.json(draft)},'parent-path-change',${p.id})`;if(published){const pub=crypto.randomUUID();await tx`insert into cms_publications(id,record_id,record_version,snapshot,actor_id) values (${pub},${menu.id},${version},${tx.json(published)},${p.id})`;await tx`update cms_records set live_id=${pub} where id=${menu.id}`;}}
}

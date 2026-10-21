import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {sqlClient} from '../../db';
import {archiveLock,archiveMediaPath} from './club-archive';
import {prepareArchiveFile} from './archive-uploads';
import {putObject} from './storage';
const root=()=>join(process.cwd(),'data/club-archive');
/** Existing installations skip the first-install CMS seed. Complete this feature once before worker readiness. */
export async function ensureClubArchive(){
 const [installed]=await sqlClient()`select id from cms_archive_catalog where kind='settings' and id='settings'`;
 if(installed)return false;
 await seedClubArchive();return true;
}
export async function seedClubArchive(){
 const raw=await readFile(join(root(),'seed.json'),'utf8'),seed=JSON.parse(raw),manifest=JSON.parse(await readFile(join(root(),'media-manifest.json'),'utf8')),checksum=createHash('sha256').update(raw).digest('hex'),sql=sqlClient();
 await sql.begin(async tx=>{await archiveLock(tx);
  const files=await readdir(join(root(),'images'));for(const name of files){const id='seed-'+name.replace(/\.webp$/,''),[old]=await tx`select id from cms_archive_media where id=${id}`;if(old)continue;
   const bytes=await readFile(join(root(),'images',name)),sourceHash=createHash('sha256').update(bytes).digest('hex'),provenance=manifest.find((m:any)=>m.asset_path.endsWith('/'+name));if(!provenance||sourceHash!==provenance.sha256)throw new Error('De historische broncontrole is mislukt: '+name);const prepared=await prepareArchiveFile(bytes,'image/webp'),originalKey=`archive/${id}/original`,safeKey=`archive/${id}/safe.webp`;await putObject(originalKey,bytes,'application/octet-stream');await putObject(safeKey,prepared.safe,'image/webp');
   await tx`insert into cms_archive_media(id,operation_id,original_key,safe_key,name,kind,mime,bytes,checksum,state,metadata) values (${id},${'archive-seed:'+id},${originalKey},${safeKey},${name},'image','image/webp',${bytes.length},${createHash('sha256').update(bytes).digest('hex')},'ready',${tx.json({...prepared.metadata,sourceCommit:'50b3944b78aebfe82845c0bd4d7b99288f03abc7',sourceVersion:58,sourceSha256:sourceHash,provenance:provenance.uses,usage:'Door de eigenaar aangeleverde historische bron; bronvermelding is geen bewijs van eigendom van het fysieke origineel.'})})`;
  }
  const url=(src:string)=>src?.startsWith('/assets/club-archive/')?archiveMediaPath('seed-'+src.split('/').pop()!.replace(/\.webp$/,'')):src;
  for(const [kind,items] of [['moment',seed.moments],['object',seed.objects]] as const){for(const original of items){const data=structuredClone(original);data.cover=url(data.cover);if(kind==='object')data.collectionIds=[String(data.collection).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-')];data.media=data.media.map((m:any)=>({...m,id:'seed-'+m.src.split('/').pop().replace(/\.webp$/,''),src:url(m.src),approved:true}));
    if(data.comparison){for(const key of ['before','after']){data.comparison[key]=url(data.comparison[key]);if(!data.media.some((m:any)=>m.src===data.comparison[key]))data.media.push({id:decodeURIComponent(data.comparison[key].split('/').pop()),kind:'image',src:data.comparison[key],name:data.comparison[key+'Label'],caption:data.comparison.caption,credit:data.sourceLabel,approved:true});}}
    await tx`insert into cms_archive_catalog(kind,id,draft,live,seed_hash) values (${kind},${data.id},${tx.json(data)},${tx.json(data)},${checksum}) on conflict do nothing`;
   }}
  for(const name of [...new Set(seed.objects.map((o:any)=>o.collection))]){const id=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-'),data={id,title:String(name),description:'Digitale archiefcollectie van Duindorp SV.',cover:'',published:true};await tx`insert into cms_archive_catalog(kind,id,draft,live,seed_hash) values ('collection',${id},${tx.json(data)},${tx.json(data)},${checksum}) on conflict do nothing`;}
  // Only create seed relations once. Re-running the seed must preserve editorial moves.
  const [configured]=await tx`select id from cms_archive_catalog where kind='settings' and id='settings'`;
  if(!configured){await attachArchiveNavigation(tx);for(const o of seed.objects)for(const id of o.momentIds)await tx`insert into cms_archive_relations(moment_id,object_id) values (${id},${o.id}) on conflict do nothing`;const settings={widgetEnabled:seed.widgetEnabled,featuredMomentId:seed.featuredMomentId,featuredObjectId:seed.featuredObjectId};await tx`insert into cms_archive_catalog(kind,id,draft,live,seed_hash) values ('settings','settings',${tx.json(settings)},${tx.json(settings)},${checksum})`;}
 });
 return {moments:seed.moments.length,objects:seed.objects.length,sourceVersion:58,checksum};
}

/** One-time extension of existing menus; later editorial removals remain respected. */
export async function attachArchiveNavigation(tx:any){
 await tx`select pg_advisory_xact_lock(736402)`;
 const rows=await tx`select id,draft,live,version from cms_records where module='navigation' and deleted_at is null order by id for update`;
 for(const row of rows){
  const extend=(value:any)=>{if(!value?.items)return value;const next=structuredClone(value),all=next.items.flatMap((g:any)=>[g,...(g.children||[])]),group=next.items.find((g:any)=>g.id==='club'||g.href==='/clubmuur/club');if(!group)return next;group.children||=[];
   for(const [suffix,label,path] of [['tijdlijn','Clubarchief · tijdlijn','tijdlijn'],['museum','Digitaal clubmuseum','museum']]){const href=`/clubmuur/club/${path}`;if(all.some((x:any)=>x.href===href)||group.children.length>=50)continue;let id='club-archief-'+suffix,index=2;while(all.some((x:any)=>x.id===id))id='club-archief-'+suffix+'-'+index++;const link={id,label,href,enabled:true};group.children.push(link);all.push(link);}
   return next;
  };
  const draft=extend(row.draft),live=extend(row.live);if(JSON.stringify(draft)===JSON.stringify(row.draft)&&JSON.stringify(live)===JSON.stringify(row.live))continue;
  const version=row.version+1,publicationId=crypto.randomUUID();await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${row.id},${row.version},${tx.json(row.draft)},'Voor clubarchiefintegratie') on conflict(record_id,version) do nothing`;
  await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${row.id},${version},${tx.json(draft)},'Clubarchief toegevoegd')`;
  if(live)await tx`insert into cms_publications(id,record_id,record_version,snapshot) values (${publicationId},${row.id},${version},${tx.json(live)})`;
  await tx`update cms_records set draft=${tx.json(draft)},live=${live?tx.json(live):null},version=${version},live_id=${live?publicationId:null},updated_at=now() where id=${row.id}`;
 }
}

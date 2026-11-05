import {referencesIn} from '../cms/layout/document';
const release='selected-club-album-photos-v1';
const originals=['photo-supporters','photo-youth','photo-canteen','photo-walking'];
/** Complete the owner's explicitly requested eleven-photo album update without publishing private text or media. */
export async function applySelectedAlbumRepair(tx:any,releaseId=release){
 await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;await tx`select pg_advisory_xact_lock(736402)`;
 if((await tx`select id from cms_audit where action=${releaseId} and record_id is null`).length)return;
 const [home]=await tx`select live from cms_records where id='settings' and deleted_at is null`;
 const [album]=await tx`select * from cms_records where id='album-clubleven' and module='albums' for update`;
 const ids=album?.draft?.mediaIds;
 let result='not-an-eligible-legacy-album';
 if(home?.live?.homepageAlbumIds?.includes('album-clubleven')&&album?.live&&!album.deleted_at&&album.live.mediaIds?.length===4&&originals.every(id=>album.live.mediaIds.includes(id))&&Array.isArray(ids)&&ids.length===11&&new Set(ids).size===11&&!ids.some(id=>originals.includes(id))){
  const media=await tx`select id,live,deleted_at from cms_records where id in ${tx(ids)} and module='media' for share`;
  if(media.length===ids.length&&media.every((photo:any)=>photo.live?.published&&photo.live.src&&!photo.deleted_at)){
   const live={...album.live,mediaIds:ids,coverId:ids.includes(album.draft.coverId)?album.draft.coverId:ids[0]};
   if(live.description==='Op het veld, langs de lijn en aan de bar. Vier sfeerbeelden van het clubgevoel.')live.description='Op het veld, langs de lijn en aan de bar. Het clubgevoel in beeld.';
   const draft={...album.draft};if(draft.description==='Op het veld, langs de lijn en aan de bar. Vier sfeerbeelden van het clubgevoel.')draft.description=live.description;
   const version=album.version+1,pub=crypto.randomUUID();
   await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${album.id},${album.version},${tx.json(album.draft)},'Voor herstel gekozen albumfoto’s') on conflict(record_id,version) do nothing`;
   await tx`insert into cms_publications(id,record_id,record_version,snapshot) values (${pub},${album.id},${version},${tx.json(live)})`;
   await tx`update cms_records set draft=${tx.json(draft)},live=${tx.json(live)},live_id=${pub},version=${version},status='published',updated_at=now() where id=${album.id}`;
   await tx`delete from cms_references where record_id=${album.id} and snapshot='live'`;
   for(const id of referencesIn(live))await tx`insert into cms_references(record_id,target_id,snapshot) values (${album.id},${id},'live') on conflict do nothing`;
   result='published-eleven-selected-photos';
  }else result='selected-photos-not-all-public';
 }
 const report={result,draftPhotoCount:Array.isArray(ids)?ids.length:0,livePhotoCount:album?.live?.mediaIds?.length||0,selectedOnHomepage:!!home?.live?.homepageAlbumIds?.includes('album-clubleven')};await tx`insert into cms_audit(id,action,request_id,metadata) values (${crypto.randomUUID()},${releaseId},${crypto.randomUUID()},${tx.json(report)})`;return report;
}
export async function upgradeSelectedAlbum(sql:any){const report=await sql.begin((tx:any)=>applySelectedAlbumRepair(tx));if(report)console.log(JSON.stringify({upgrade:release,...report}));}

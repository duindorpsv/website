import {createCmsSeed} from '../cms/seed';

const release = 'homepage-club-photos-v1';

function publishedPhoto(photo:any,fallbackAlt:string) {
  // Archived originals did not receive the earlier cleanup of retired labels.
  const sourceAlt = photo.alt || fallbackAlt;
  const alt = /^gegenereerd sfeerbeeld/i.test(sourceAlt) ? sourceAlt.replace(/^gegenereerd sfeerbeeld[: ]*(?:van )?/i,'').replace(/^./,(first:string)=>first.toUpperCase()) : sourceAlt;
  const credit = /^gegenereerd sfeerbeeld|^voorbeeldbeeld$/i.test(photo.credit || '') ? '' : photo.credit || '';
  return {...photo,published:true,alt,credit};
}

/** One-time repair of the original club photos still selected in both public areas. */
export async function applyHomepagePhotoRepair(tx:any,releaseId=release) {
  await tx`set local lock_timeout='5s'`;
  await tx`set local statement_timeout='30s'`;
  await tx`select pg_advisory_xact_lock(736402)`;
  if ((await tx`select id from cms_audit where action=${releaseId} and record_id is null`).length) return;
  const [home] = await tx`select live from cms_records where id='settings' and deleted_at is null for share`;
  const albums = await tx`select id,live from cms_records where module='albums' and live is not null and deleted_at is null for share`;
  const homePhotos = new Set<string>(home?.live?.homepagePhotoIds || []);
  const homeAlbums = new Set<string>(home?.live?.homepageAlbumIds || []);
  const albumPhotos = new Set<string>(albums.filter((row:any) => homeAlbums.has(row.id)).flatMap((row:any) => row.live.mediaIds || []));
  const originals = createCmsSeed().media.filter(photo => photo.id.startsWith('photo-') && homePhotos.has(photo.id) && albumPhotos.has(photo.id));
  const repaired:string[] = [], inspected:{id:string;state:string}[] = [];
  for (const original of originals) {
    const [old] = await tx`select * from cms_records where id=${original.id} and module='media' for update`;
    if (!old || old.draft.src !== original.src) {
      inspected.push({id:original.id,state:'missing-or-replaced'});
      continue;
    }
    if (old.live?.published && !old.deleted_at) {
      inspected.push({id:old.id,state:'already-public'});
      continue;
    }
    inspected.push({id:old.id,state:old.deleted_at?'archived':old.live?'publication-flag-missing':'unpublished'});
    const draft = publishedPhoto(old.draft,original.alt);
    const live = old.live ? publishedPhoto(old.live,original.alt) : structuredClone(draft);
    const version = old.version + 1, publication = crypto.randomUUID();
    await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${old.id},${old.version},${tx.json(old.draft)},'Voor herstel gekozen homepagefoto') on conflict(record_id,version) do nothing`;
    await tx`insert into cms_publications(id,record_id,record_version,snapshot) values (${publication},${old.id},${version},${tx.json(live)})`;
    await tx`update cms_records set draft=${tx.json(draft)},live=${tx.json(live)},live_id=${publication},status='published',deleted_at=null,version=${version},updated_at=now() where id=${old.id}`;
    repaired.push(old.id);
  }
  const report = {inspected,repaired};
  await tx`insert into cms_audit(id,action,request_id,metadata) values (${crypto.randomUUID()},${releaseId},${crypto.randomUUID()},${tx.json(report)})`;
  return report;
}

export async function upgradeHomepagePhotos(sql:any) {
  const report = await sql.begin((tx:any) => applyHomepagePhotoRepair(tx));
  if (report) console.log(JSON.stringify({upgrade:release,...report}));
}

import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {createCmsSeed} from '../../lib/cms/seed';
import {applyHomepagePhotoRepair} from '../../lib/server/homepage-photos';
import {loadState} from '../../lib/server/records';

assertLocalSupabaseTests();
const sql=sqlClient(),seed=createCmsSeed(),photos=seed.media.filter(photo=>photo.id.startsWith('photo-'));
const release='homepage-club-photos-v1';

async function fixture(run:(tx:any)=>Promise<void>){
  const rollback=new Error('Rollback isolated homepage fixtures');
  try{
    await sql.begin(async tx=>{
      await tx`delete from cms_audit where action=${release}`;
      await tx`update cms_records set live=${tx.json(seed.settings)} where id='settings'`;
      const album=seed.albums[0];
      await tx`insert into cms_records(id,module,draft,live) values (${album.id},'albums',${tx.json(album)},${tx.json(album)}) on conflict(id) do update set live=excluded.live,deleted_at=null`;
      for(const photo of photos)await tx`insert into cms_records(id,module,draft,version) values (${photo.id},'media',${tx.json({...photo,published:false})},10) on conflict(id) do update set draft=excluded.draft,live=null,live_id=null,deleted_at=null,status='draft',version=10`;
      await run(tx);
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
}

test('homepage photo repair restores the four selected album photos, preserves history and runs only once',async()=>fixture(async tx=>{
  const photo=photos[0],revision=crypto.randomUUID();
  const [before]=await tx`select draft from cms_records where id=${photo.id}`;
  await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${revision},${photo.id},10,${tx.json(before.draft)},'Bestaande redactierevisie')`;
  await tx`update cms_records set deleted_at=now(),status='archived' where id=${photos[3].id}`;
  const report=await applyHomepagePhotoRepair(tx);
  assert.deepEqual(report?.repaired,photos.map(photo=>photo.id));
  const {state}=await loadState(true,undefined,tx);
  assert.equal(state.media.filter(media=>photos.some(photo=>photo.id===media.id)&&media.published).length,4);
  assert.deepEqual(state.settings.homepagePhotoIds,seed.settings.homepagePhotoIds);
  assert.deepEqual(state.albums.find(album=>album.id==='album-clubleven')?.mediaIds,photos.map(photo=>photo.id));
  for(const photo of photos){
    const [row]=await tx`select r.*,p.snapshot from cms_records r join cms_publications p on p.id=r.live_id where r.id=${photo.id}`;
    assert.equal(row.status,'published');assert.equal(row.deleted_at,null);assert.equal(row.version,11);
    assert.equal(row.live.src,photo.src);assert.deepEqual(row.snapshot,row.live);
  }
  assert.deepEqual((await tx`select snapshot from cms_revisions where id=${revision}`)[0].snapshot,before.draft);
  assert.equal(await applyHomepagePhotoRepair(tx),undefined);
  assert.ok((await tx`select version from cms_records where id in ${tx(photos.map(photo=>photo.id))}`).every((row:any)=>row.version===11));
}));

test('homepage photo repair leaves other private media, changed files and existing live/draft content intact',async()=>fixture(async tx=>{
  const privateId='private-homepage-'+crypto.randomUUID();
  const privatePhoto={...photos[0],id:privateId,published:false};
  await tx`insert into cms_records(id,module,draft) values (${privateId},'media',${tx.json(privatePhoto)})`;
  const home={...seed.settings,homepagePhotoIds:[photos[0].id,photos[1].id,photos[2].id,privateId]};
  await tx`update cms_records set live=${tx.json(home)} where id='settings'`;
  const album={...seed.albums[0],mediaIds:[photos[0].id,photos[1].id,photos[3].id,privateId]};
  await tx`update cms_records set live=${tx.json(album)} where id=${album.id}`;
  const live={...photos[0],caption:'Gepubliceerd bijschrift'},draft={...live,caption:'Nog niet gepubliceerd'};
  await tx`update cms_records set live=${tx.json(live)},draft=${tx.json(draft)} where id=${photos[0].id}`;
  await tx`update cms_records set draft=jsonb_set(draft,'{src}',to_jsonb('/api/media/private-replacement'::text)) where id=${photos[1].id}`;
  const report=await applyHomepagePhotoRepair(tx);
  assert.deepEqual(report?.repaired,[]);
  const [unchanged]=await tx`select live,draft,version from cms_records where id=${photos[0].id}`;
  assert.deepEqual(unchanged.live,live);assert.deepEqual(unchanged.draft,draft);assert.equal(unchanged.version,10);
  assert.ok((await tx`select live from cms_records where id in ${tx([privateId,...photos.slice(1).map(photo=>photo.id)])}`).every((row:any)=>row.live===null));
}));

after(closeDb);

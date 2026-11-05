import {sqlClient,closeDb} from '../db';
import {assertLocalSupabaseTests} from '../tests/helpers/supabase-auth';
import {defaultClubNavigation} from '../lib/clubmuur-navigation';

// Reproduce an edited, already deployed CMS, not a fresh first-install seed.
assertLocalSupabaseTests();const sql=sqlClient();
try{await sql.begin(async tx=>{
 await tx`select pg_advisory_xact_lock(736402)`;
 let rows=await tx`select id,draft,live,version from cms_records where module='navigation' and deleted_at is null order by id for update`;
 // The seed uses an implicit default until the first CMS menu save. Materialize
 // that menu so CI exercises the already-edited production installation.
 if(!rows.length){const data={items:defaultClubNavigation};await tx`insert into cms_records(id,module,draft,live) values ('site-navigation','navigation',${tx.json(data)},${tx.json(data)})`;rows=await tx`select id,draft,live,version from cms_records where id='site-navigation' for update`;}
 const strip=(value:any)=>{if(!value?.items)return value;const copy=structuredClone(value);for(const group of copy.items)if(group.children)group.children=group.children.filter((item:any)=>!['/clubmuur/club/tijdlijn','/clubmuur/club/museum'].includes(item.href));return copy;};
 for(const row of rows){
  const draft=strip(row.draft),live=strip(row.live),version=row.version+1,pub=crypto.randomUUID();
  await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${row.id},${version},${tx.json(draft)},'Existing editorial navigation before archive upgrade')`;
  if(live)await tx`insert into cms_publications(id,record_id,record_version,snapshot) values (${pub},${row.id},${version},${tx.json(live)})`;
  await tx`update cms_records set draft=${tx.json(draft)},live=${live?tx.json(live):null},version=${version},live_id=${live?pub:null} where id=${row.id}`;
 }
 await tx`delete from cms_archive_relations`;
 await tx`delete from cms_archive_catalog where seed_hash is not null`;
 await tx`delete from cms_archive_media where id like ${'seed-%'}`;
});console.log('Isolated existing-installation fixture: empty archive and navigation with current-version editorial history.');}
finally{await closeDb();}

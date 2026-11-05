import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {databaseOptions} from '../../lib/server/database-config';
import {createCmsSeed} from '../../lib/cms/seed';
import {publicRecordColumns} from '../../lib/server/public-record-columns';
import {loadPublicState,loadPublicArchive,publicReadStats} from '../../lib/server/public-content';
assertLocalSupabaseTests();

test('public database egress: private draft bytes stay in PostgreSQL, repeat visits reuse content, independent writes invalidate immediately',async()=>{
 const sql=sqlClient(),writer=postgres(process.env.DATABASE_URL!,databaseOptions(1));
 const collectionId='egress-collection-'+crypto.randomUUID();
 const id='egress-'+crypto.randomUUID(),privateText='PRIVATE-DRAFT-'+id+' '+'.'.repeat(300000),source=structuredClone(createCmsSeed().articles.find(a=>a.live)!.live!);
 const live={...source,id,slug:id,title:'Publieke meting',intro:'Fictieve controletekst'},draft={...live,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:privateText}]}]}};
 try{
  await sql`insert into cms_records(id,module,draft,live,status) values (${id},'articles',${sql.json(draft)},${sql.json(live)},'published')`;
  const old=await sql`select * from cms_records where id=${id}`,projected=await sql`select ${publicRecordColumns(sql)} from cms_records where id=${id}`;
  const fullBytes=Buffer.byteLength(JSON.stringify(old)),publicBytes=Buffer.byteLength(JSON.stringify(projected));
  assert.ok(JSON.stringify(old).includes(privateText));assert.ok(!JSON.stringify(projected).includes(privateText));assert.ok(publicBytes<fullBytes/10);
  const before=publicReadStats().website;
  const first=await loadPublicState();assert.equal(first.state.articles.find(a=>a.id===id)?.title,'Publieke meting');assert.ok(!JSON.stringify(first).includes(privateText));
  const visits=await Promise.all(Array.from({length:10},()=>loadPublicState()));
  const cached=publicReadStats().website;assert.equal(cached.loads-before.loads,1);assert.equal(cached.hits-before.hits,10);
  first.state.articles.find(a=>a.id===id)!.title='Mutatie van een caller';assert.equal(visits[0].state.articles.find(a=>a.id===id)?.title,'Publieke meting');
  await writer`update cms_records set live=jsonb_set(live,'{title}',to_jsonb(${'Gewijzigd door andere verbinding'}::text)),version=version+1,updated_at=now() where id=${id}`;
  assert.equal((await loadPublicState()).state.articles.find(a=>a.id===id)?.title,'Gewijzigd door andere verbinding');
  await writer`update cms_records set live=null,version=version+1,updated_at=now() where id=${id}`;
  assert.ok(!(await loadPublicState()).state.articles.some(a=>a.id===id));
  const collection={id:collectionId,title:'Fictieve cachecollectie',description:'Testcollectie',cover:'',published:true};
  await writer`insert into cms_archive_catalog(kind,id,draft,live) values ('collection',${collectionId},${writer.json(collection)},${writer.json(collection)})`;
  const archiveBefore=publicReadStats().archive;assert.ok((await loadPublicArchive()).collections!.some(c=>c.id===collectionId));await loadPublicArchive();assert.equal(publicReadStats().archive.loads-archiveBefore.loads,1);assert.equal(publicReadStats().archive.hits-archiveBefore.hits,1);
  await writer`update cms_archive_catalog set live=null,version=version+1,updated_at=now() where kind='collection' and id=${collectionId}`;
  assert.ok(!(await loadPublicArchive()).collections!.some(c=>c.id===collectionId));
  const dependencies=['cms_departments','cms_redirects','cms_planning_legacy','cms_archive_catalog','cms_archive_relations','cms_archive_media','cms_archive_batches','cms_archive_contributions','cms_teams'];
  const triggers=await sql`select c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='domain_revision_changed' and c.relname in ${sql(dependencies)}`;
  assert.equal(triggers.length,dependencies.length);
  await mkdir('.runtime',{recursive:true});await writeFile('.runtime/egress-proof.json',JSON.stringify({source:'isolated real PostgreSQL',fullRecordBytes:fullBytes,publicRecordBytes:publicBytes,repeatVisits:10,heavyLoadsForElevenReads:cached.loads-before.loads,independentUpdateVisible:true,withdrawalVisible:true,privateDraftTransferred:false,archiveReuseAndWithdrawal:true},null,2)+'\n');
 }finally{await sql`delete from cms_archive_catalog where kind='collection' and id=${collectionId}`;await sql`delete from cms_records where id=${id}`;await writer.end({timeout:2});await closeDb();}
});

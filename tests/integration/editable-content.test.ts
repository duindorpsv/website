import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {databaseOptions} from '../../lib/server/database-config';
import {createCmsSeed} from '../../lib/cms/seed';
import {textDoc,docText} from '../../lib/cms/model';
import {applyEditableContent} from '../../lib/server/editable-content';
import {loadState} from '../../lib/server/records';

assertLocalSupabaseTests();
const url=new URL(process.env.MIGRATION_DATABASE_URL||'postgres://invalid/invalid');
if(!['127.0.0.1','localhost'].includes(url.hostname)||!['/postgres','/duindorp_test'].includes(url.pathname))throw Error('Isolated migration connection required.');
const sql=postgres(url.href,databaseOptions(1));
test('editable-content upgrade fills native pages without overwriting drafts, unpublished states, history or user training',async()=>{
 const rollback=Error('Rollback isolated content fixtures');
 try{await sql.begin(async tx=>{
  const seed=createCmsSeed(),contact=seed.pages.find(page=>page.slug==='club/contact')!,board=seed.pages.find(page=>page.slug==='club/bestuur')!,hidden=seed.pages.find(page=>page.slug==='media/club-tv')!;
  const working={...contact,body:textDoc(['Niet gepubliceerde tekst van de club']),useBuilder:false};delete working.live;delete working.bodyFormat;
  const live={...contact.live,body:textDoc([]),useBuilder:false};
  await tx`update cms_records set draft=${tx.json(working)},live=${tx.json(live)},version=30,deleted_at=null where id=${contact.id}`;
  await tx`update cms_records set live=null,live_id=null,status='draft' where id=${board.id}`;
  await tx`update cms_records set deleted_at=now(),status='archived',live=null,live_id=null where id=${hidden.id}`;
  const training={items:[{teamLabel:'Eigen team',sessions:[]}]};
  await tx`insert into cms_records(id,module,draft,live,version) values ('site-training','training',${tx.json(training)},${tx.json(training)},20) on conflict(id) do update set draft=excluded.draft,live=excluded.live,version=20`;
  const release='test-editable-content-'+crypto.randomUUID(),report=await applyEditableContent(tx,release);
  assert.ok(report?.changed.includes(contact.id));
  const [saved]=await tx`select * from cms_records where id=${contact.id}`;
  assert.equal(saved.version,31);assert.equal(docText(saved.draft.body),'Niet gepubliceerde tekst van de club');assert.equal(saved.live.useBuilder,true);
  assert.match(JSON.stringify(saved.live.body),/"refId":"contact"/);
  const [history]=await tx`select snapshot from cms_revisions where record_id=${contact.id} and version=30`;assert.deepEqual(history.snapshot,working);
  const [publication]=await tx`select snapshot from cms_publications where id=${saved.live_id}`;assert.deepEqual(publication.snapshot,saved.live);
  assert.equal((await tx`select live from cms_records where id=${board.id}`)[0].live,null);
  assert.ok((await tx`select deleted_at from cms_records where id=${hidden.id}`)[0].deleted_at);
  assert.deepEqual((await tx`select draft from cms_records where id='site-training'`)[0].draft,training);
  const state=(await loadState(true,undefined,tx)).state;assert.ok(state.pages.find(page=>page.id===contact.id)?.live?.useBuilder);
  assert.equal(await applyEditableContent(tx,release),undefined);
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
});
after(()=>sql.end({timeout:2}));

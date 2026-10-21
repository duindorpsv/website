import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {sql as query} from 'drizzle-orm';

// Two independent bundles reproduce Next's separate page/route module graphs.
const a=await import(pathToFileURL(process.env.TEST_POOL_BUNDLE_A!).href);
const b=await import(pathToFileURL(process.env.TEST_POOL_BUNDLE_B!).href);
try {
  const payload={title:'Pool verification',nested:{enabled:true}};
  const results=await Promise.all(Array.from({length:64},async(_,i)=>{
    const module=i%2?a:b;
    const rows=i%4<2
      ?await module.getDb().execute(query`select pg_backend_pid() as pid,pg_sleep(0.04)`)
      :await module.sqlClient()`select pg_backend_pid() as pid,pg_sleep(0.04)`;
    return Number(rows[0].pid);
  }));
  assert.equal(a.sqlClient(),b.sqlClient(),'Route bundles must share the raw pool');
  assert.equal(a.getDb(),b.getDb(),'Route bundles must share the ORM pool');
  const raw=a.sqlClient();
  const [row]=await raw`select ${raw.json(payload)}::jsonb as value,timestamptz '2026-10-21T00:00:00Z' as at`;
  assert.deepEqual(row.value,payload,'ORM initialization must not replace raw JSON serializers');
  assert.ok(row.at instanceof Date,'ORM initialization must not replace raw date parsers');
  console.log(JSON.stringify({pids:[...new Set(results)],samePools:true,jsonAndDateRoundtrip:true}));
} finally {await Promise.all([a.closeDb(),b.closeDb()]);}

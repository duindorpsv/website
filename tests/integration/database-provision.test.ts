import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {databaseOptions} from '../../lib/server/database-config';
import {provisionDatabase} from '../../lib/server/database-provision';
import {inspectDatabase,resetStalledConnections,safeDatabaseCode} from '../../lib/server/database-diagnostics';
import journal from '../../db/migrations/meta/_journal.json';

assertLocalSupabaseTests();
const url=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL||'';
const admin=postgres(url,databaseOptions(1));
const blocker=postgres(url,{...databaseOptions(1),connection:{application_name:'private-client@example.invalid'}});
const password=process.env.APP_DATABASE_PASSWORD||'synthetic-local-provision-password';
const table='cms_provision_'+crypto.randomUUID().replaceAll('-','');
const name=admin('public.'+table);
async function policy(){return (await admin`select p.oid,p.polroles=array[(select oid from pg_roles where rolname='duindorp_app')] as runtime_only from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname=${table} and p.polname='duindorp_backend'`)[0];}

test('provisioning under a concurrent reader keeps valid policies and repairs missing or changed security',async()=>{
  await admin`create table ${name}(id text)`;
  await provisionDatabase(admin,password);
  const before=await policy();assert.ok(before);assert.equal(before.runtime_only,true);
  await blocker.begin(async held=>{
    await held`select * from ${held('public.'+table)}`;
    // Reproduce the former deployment failure even with RLS already enabled.
    await assert.rejects(admin.begin(async tx=>{
      await tx`set local lock_timeout='100ms'`;
      await tx`alter table ${tx('public.'+table)} enable row level security`;
    }),(error:any)=>error.code==='55P03');
    await provisionDatabase(admin,password);
    assert.equal((await policy()).oid,before.oid);
  });
  await admin`alter policy duindorp_backend on ${name} to anon`;
  await admin`grant select on ${name} to anon`;
  await provisionDatabase(admin,password);
  assert.equal((await policy()).runtime_only,true);
  const [access]=await admin`select has_table_privilege('anon',${'public.'+table},'select') as anon_read`;
  assert.equal(access.anon_read,false);
  await admin`drop policy duindorp_backend on ${name}`;
  await admin`alter table ${name} disable row level security`;
  await provisionDatabase(admin,password);
  assert.equal((await policy()).runtime_only,true);
  assert.equal((await admin`select relrowsecurity from pg_class where relname=${table}`)[0].relrowsecurity,true);
});

test('database inspection exposes operational metadata without SQL text, client names or payloads',async()=>{
  const id=crypto.randomUUID(),secret='private-payload@example.invalid';
  await admin`insert into cms_jobs(id,kind,payload,operation_id) values (${id},'cache',${admin.json({email:secret})},${id})`;
  const key='sportlink-sync-v1:teams',[previous]=await admin`select * from sportlink_cache where cache_key=${key}`;
  await admin`insert into sportlink_cache(cache_key,payload_json) values (${key},${JSON.stringify({status:'partial',lastAttemptAt:'2026-10-21T12:00:00Z',lastSuccessAt:secret,message:secret,email:secret,counts:{teams:2,selected:3,failed:1,private:secret}})}) on conflict(cache_key) do update set payload_json=excluded.payload_json`;
  try {
    await blocker.begin(async held=>{
      await held.unsafe("select 'private-query@example.invalid'");
      const result=await inspectDatabase(admin),serialized=JSON.stringify(result);
      assert.equal(result.health.migrations,journal.entries.length);
      assert.equal(result.health.runtime_auth_schema_access,false);
      assert.ok(result.connections.some((row:any)=>row.state==='idle in transaction'));
      for(const value of [secret,'private-query@example.invalid','private-client@example.invalid',url])assert.ok(!serialized.includes(value));
      assert.ok(!serialized.includes('"query":'));
      assert.equal(result.security.tables,result.security.rls_enabled);
      assert.deepEqual(result.sportlink.find((row:any)=>row.dataset==='teams'),{dataset:'teams',status:'partial',lastAttemptAt:'2026-10-21T12:00:00.000Z',lastSuccessAt:null,nextRunAt:null,counts:{selected:3,teams:2,failed:1}});
    });
  } finally {await admin`delete from cms_jobs where id=${id}`;if(previous)await admin`update sportlink_cache set payload_json=${previous.payload_json} where cache_key=${key}`;else await admin`delete from sportlink_cache where cache_key=${key}`;}
  assert.equal(safeDatabaseCode({code:'55P03',message:url}),'55P03');
  assert.equal(safeDatabaseCode({code:url,message:url}),'unavailable');
});

test('connection repair ignores recent queries and other roles, and rolls back only the explicit stalled application session',{timeout:10000},async()=>{
  const runtimeUrl=new URL(url);runtimeUrl.username='duindorp_app';runtimeUrl.password=password;
  let disconnected!:()=>void;
  const closed=new Promise<void>(resolve=>{disconnected=resolve;});
  const runtime=postgres(runtimeUrl.href,{...databaseOptions(1),onnotice:()=>{},onclose:()=>disconnected()});
  // Hold an explicit transaction on its dedicated connection. A begin(callback)
  // scope would try to COMMIT when released after the deliberate termination,
  // racing the driver's socket-close handler instead of testing recovery.
  const connection=await runtime.reserve();
  try {
    await connection.unsafe('begin');
    await connection`insert into ${connection('public.'+table)}(id) values ('uncommitted')`;
    const [session]=await admin`select pid from pg_stat_activity where usename='duindorp_app' and state='idle in transaction' and pid in (select pid from pg_locks where relation=${'public.'+table}::regclass)`;
    assert.ok(session);
    assert.equal((await resetStalledConnections(admin,[session.pid])).length,0);
    const [own]=await admin`select pg_backend_pid() as pid`;
    assert.equal((await resetStalledConnections(admin,[own.pid],0)).length,0);
    const stopped=await resetStalledConnections(admin,[session.pid],0);
    assert.deepEqual(stopped.map((row:any)=>({pid:row.pid,terminated:row.terminated})),[{pid:session.pid,terminated:true}]);
    await closed;
    assert.equal((await admin`select pid from pg_stat_activity where pid=${session.pid}`).length,0);
    assert.equal((await admin`select id from ${name} where id='uncommitted'`).length,0);
  } finally {await runtime.end({timeout:2});}
});

after(async()=>{try{await admin`drop table if exists ${name}`;}finally{await Promise.all([admin.end({timeout:2}),blocker.end({timeout:2})]);}});

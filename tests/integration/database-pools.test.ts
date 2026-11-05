import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {databaseOptions} from '../../lib/server/database-config';

test('independent web/worker bundles queue concurrent queries within a 15-session budget',{timeout:30000},async()=>{
  assertLocalSupabaseTests();
  const url=new URL(process.env.MIGRATION_DATABASE_URL!);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const admin=postgres(url.href,databaseOptions(1));
  // All identifiers/password characters are locally generated, never user input.
  const role='pool_test_'+randomBytes(12).toString('hex'),password=randomBytes(24).toString('hex');
  await mkdir('.runtime',{recursive:true});
  const dir=await mkdtemp(resolve('.runtime/database-pools-'));
  let created=false;
  try {
    await admin.unsafe(`create role "${role}" login password '${password}' connection limit 15`);created=true;
    const bundleA=join(dir,'route-a.mjs'),bundleB=join(dir,'route-b.mjs');
    for(const outfile of [bundleA,bundleB])await build({entryPoints:['db/index.ts'],outfile,bundle:true,format:'esm',platform:'node',packages:'external',target:'node24',logLevel:'silent'});
    url.username=role;url.password=password;
    const run=()=>promisify(execFile)(process.execPath,['--import','tsx','tests/helpers/database-pool-probe.ts'],{
      env:{...process.env,DATABASE_URL:url.href,TEST_POOL_BUNDLE_A:bundleA,TEST_POOL_BUNDLE_B:bundleB},timeout:20000,maxBuffer:16000
    });
    const processes=await Promise.allSettled([run(),run()]);
    for(const result of processes){if(result.status==='rejected')throw result.reason;}
    const pids=new Set<number>();
    for(const result of processes){if(result.status!=='fulfilled')continue;const proof=JSON.parse(result.value.stdout.trim());
      assert.equal(proof.samePools,true);assert.equal(proof.jsonAndDateRoundtrip,true);
      assert.ok(proof.pids.length<=4,'Each process may use at most three raw sessions and one ORM session');
      for(const pid of proof.pids)pids.add(pid);
    }
    assert.ok(pids.size<=8,'Web and worker together must leave room below the production limit of 15');
    assert.equal((await admin`select pid from pg_stat_activity where usename=${role}`).length,0,'Shutdown must release every shared pool');
  } finally {
    try {if(created)await admin.unsafe(`drop role "${role}"`);}finally{await admin.end({timeout:2});await rm(dir,{recursive:true,force:true});}
  }
});

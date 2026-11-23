import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {sqlClient,closeDb} from '../../db';
import {renewJobLease} from '../../lib/server/worker';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';

assertLocalSupabaseTests();
const sql=sqlClient();

test('worker progress is confirmed only by the current processing job owner',async()=>{
 const id=crypto.randomUUID(),owner=crypto.randomUUID(),other=crypto.randomUUID();
 await sql`insert into cms_jobs(id,operation_id,kind,payload,status,lease_owner,lease_until) values (${id},${id},'cache','{}','processing',${owner},now()-interval '1 second')`;
 const heartbeat=async()=>String((await sql`select at from cms_heartbeats where id='worker'`)[0]?.at);
 try{
  const before=await heartbeat();
  assert.equal((await renewJobLease(id,other)).length,0);
  assert.equal(await heartbeat(),before);
  assert.equal((await sql`select lease_until<now() as expired from cms_jobs where id=${id}`)[0].expired,true);
  assert.equal((await renewJobLease(id,owner)).length,1);
  assert.equal((await sql`select lease_until>now() as renewed from cms_jobs where id=${id}`)[0].renewed,true);
  await sql`update cms_jobs set status='done',lease_owner=null,lease_until=null where id=${id}`;
  const completed=await heartbeat();
  assert.equal((await renewJobLease(id,owner)).length,0);
  assert.equal(await heartbeat(),completed);
 }finally{await sql`delete from cms_jobs where id=${id}`;}
});

after(closeDb);

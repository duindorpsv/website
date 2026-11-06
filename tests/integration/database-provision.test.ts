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

test('mail diagnostics distinguish OTP/provider failures and old backlog without exposing task identities or untrusted errors',async()=>{
  const secret='private-mail-diagnostic@example.invalid',nonce='private-otp-nonce-'+crypto.randomUUID(),owner='private-worker-'+crypto.randomUUID();
  const before=await inspectDatabase(admin),ids:string[]=[],signingIds:string[]=[];
  const count=(report:any,kind:string,status:string,error:string)=>report.mail.groups.find((row:any)=>row.kind===kind&&row.status===status&&row.error_code===error)?.count||0;
  async function task(kind:string,status:string,error:string|null,createdHoursAgo=0,attempts=1){
    const id=crypto.randomUUID();ids.push(id);
    await admin`insert into cms_jobs(id,operation_id,kind,status,last_error,payload,created_at,run_at,attempts,max_attempts,lease_until,lease_owner)
      values (${id},${id},${kind},${status},${error},${admin.json({email:secret,code:'87654321',nonceHash:nonce})},
      now()-${createdHoursAgo}*interval '1 hour','2200-01-01',${attempts},6,
      ${status==='processing'?'2200-01-02':null},${owner})`;
  }
  try{
    await task('auth-code-mail','failed','auth-otp-configuration');
    await task('auth-code-mail','failed','auth-otp-configuration');
    await task('auth-code-mail','failed','auth-identity');
    await task('auth-code-mail','failed','42501');
    await task('mail','failed','mail-rejected');
    await task('auth-code-mail','pending','mail-unavailable',96);
    await task('auth-code-mail','failed','mail-invalid',96); // Outside the recent window.
    await task('sponsor-document-mail','failed',secret);
    await task(secret,secret,secret);
    await task('sportlink-sync','processing',secret,120,3);
    // Reuse a local document FK without changing its immutable snapshot. A
    // fresh empty database may not have one yet; no business fixture is seeded.
    const signingCases=[{party:'sponsor',status:'revoked',mail:'failed'},{party:'club',status:'consumed',mail:'accepted'}];
    for(const row of signingCases){
      const id=crypto.randomUUID(),created=await admin`insert into cms_sponsor_signing_challenges(id,agreement_id,sponsor_id,user_id,party,email,document_hash,code_hash,status,expires_at,mail_status,issued_at)
        select ${id},d.agreement_id,d.sponsor_id,u.id,${row.party},${secret},d.document_hash,${'dc'.repeat(32)},${row.status},now()+interval '10 minutes',${row.mail},${row.mail==='accepted'?new Date():null}
        from cms_sponsor_documents d cross join lateral(select id from auth_user order by id limit 1) u order by d.agreement_id limit 1 returning id`;
      if(created.length)signingIds.push(id);
    }
    const report=await inspectDatabase(admin),serialized=JSON.stringify(report);
    assert.equal(report.mail.window_hours,24);
    assert.equal(report.mail.processing_limit,25);
    for(const [kind,status,error,added] of [
      ['auth-code-mail','failed','auth-otp-configuration',2],
      ['auth-code-mail','failed','auth-identity',1],
      ['auth-code-mail','failed','42501',1],
      ['mail','failed','mail-rejected',1],
      ['auth-code-mail','pending','mail-unavailable',1],
      ['sponsor-document-mail','failed','other',1],
      ['auth-code-mail','failed','mail-invalid',0],
    ] as const)assert.equal(count(report,kind,status,error),count(before,kind,status,error)+added);
    const backlog=report.mail.groups.find((row:any)=>row.kind==='auth-code-mail'&&row.status==='pending'&&row.error_code==='mail-unavailable');
    assert.ok(Date.now()-new Date(backlog.oldest_created_at).getTime()>=95*3600_000);
    assert.ok(backlog.oldest_age_seconds>=95*3600);
    assert.ok(backlog.newest_created_at&&backlog.oldest_run_at&&backlog.newest_run_at);
    const processing=report.mail.processing.find((row:any)=>row.kind==='sportlink-sync'&&row.attempts===3&&row.created_age_seconds>=119*3600);
    assert.ok(processing);assert.equal(processing.max_attempts,6);assert.equal(processing.error_code,'other');
    assert.equal(processing.lease_expired,false);assert.ok(processing.lease_seconds_remaining>0);
    assert.ok(processing.created_at&&processing.run_at&&processing.lease_until);
    assert.ok(report.jobs.some((row:any)=>row.kind==='unknown'&&row.status==='unknown'));
    assert.ok(Array.isArray(report.mail.signing_challenges));
    for(const row of report.mail.signing_challenges){
      assert.deepEqual(Object.keys(row).sort(),['party','status','mail_status','count','oldest_created_at','newest_created_at','oldest_issued_at','newest_issued_at'].sort());
      assert.ok(['sponsor','club','unknown'].includes(row.party));assert.ok(['pending','consumed','revoked','unknown'].includes(row.status));assert.ok(['prepared','accepted','failed','unknown'].includes(row.mail_status));
    }
    if(signingIds.length)for(const row of signingCases){
      const find=(data:any)=>data.mail.signing_challenges.find((entry:any)=>entry.party===row.party&&entry.status===row.status&&entry.mail_status===row.mail);
      const group=find(report);assert.equal(group.count,(find(before)?.count||0)+1);assert.ok(group.oldest_created_at&&group.newest_created_at);
      if(row.mail==='accepted')assert.ok(group.oldest_issued_at&&group.newest_issued_at);
    }
    for(const value of [secret,nonce,owner,'87654321','dc'.repeat(32),...ids,...signingIds,url])assert.ok(!serialized.includes(value));
    for(const key of ['payload','last_error','lease_owner','operation_id','"id":','"email":','code_hash','document_hash'])assert.ok(!serialized.includes(key));
  }finally{if(signingIds.length)await admin`delete from cms_sponsor_signing_challenges where id in ${admin(signingIds)}`;await admin`delete from cms_jobs where id in ${admin(ids)}`;}
});

test('identity diagnostics expose only current mapping aggregates and isolate denied auth-schema access',async()=>{
  const before=await inspectDatabase(admin),tag=crypto.randomUUID(),appIds:string[]=[],providerIds:string[]=[],jobIds:string[]=[],addresses:string[]=[],nonces:string[]=[];
  const cases=[
    {state:'provider_matches',provider:'match'},
    {state:'provider_email_mismatch',provider:'mismatch'},
    {state:'provider_email_missing',provider:'null'},
    {state:'mapping_missing',provider:'unmapped'},
    {state:'current_profile_ambiguous',provider:'ambiguous'},
    {state:'profile_inactive',provider:'unmapped',inactive:true},
    {state:'profile_inactive',provider:'unmapped',banned:true},
    {state:'current_profile_missing',provider:'none'},
  ];
  const grouped=(report:any,state:string,present:boolean)=>report.auth_identity.failed_login_jobs.find((row:any)=>row.current_state===state&&row.challenge_present===present)?.count||0;
  const runtime=postgres(process.env.DATABASE_URL!,databaseOptions(1));
  try{
    for(const [index,row] of cases.entries()){
      const email=`identity-${tag}-${index}@example.invalid`,nonce=crypto.randomUUID().replaceAll('-','').repeat(2),id=crypto.randomUUID();addresses.push(email);nonces.push(nonce);
      if(row.provider!=='none'){
        appIds.push(id);const providerId=['unmapped','ambiguous'].includes(row.provider)?null:crypto.randomUUID();
        if(providerId){
          providerIds.push(providerId);const providerEmail=row.provider==='null'?null:row.provider==='mismatch'?`provider-${tag}@example.invalid`:email.toUpperCase();
          if(providerEmail)addresses.push(providerEmail);
          await admin`insert into auth.users(id,email) values (${providerId}::uuid,${providerEmail})`;
        }
        await admin`insert into auth_user(id,name,email,supabase_user_id,banned) values (${id},'Private diagnostic fixture',${email},${providerId}::uuid,${!!row.banned})`;
        await admin`insert into cms_memberships(user_id,role_id,active) values (${id},'editor',${!row.inactive})`;
        if(row.provider==='ambiguous'){
          const duplicateId=crypto.randomUUID();appIds.push(duplicateId);addresses.push(email.toUpperCase());
          await admin`insert into auth_user(id,name,email) values (${duplicateId},'Private diagnostic fixture',${email.toUpperCase()})`;
          await admin`insert into cms_memberships(user_id,role_id) values (${duplicateId},'editor')`;
        }
        if(index===0)await admin`insert into cms_auth_login_challenges(user_id,nonce_hash,code_hash,expires_at) values (${id},${nonce},${'ea'.repeat(32)},now()+interval '10 minutes')`;
      }
      const jobId=crypto.randomUUID();jobIds.push(jobId);
      await admin`insert into cms_jobs(id,operation_id,kind,status,last_error,payload,max_attempts,attempts)
        values (${jobId},${jobId},'auth-code-mail','failed','auth-identity',${admin.json({email,nonceHash:nonce,code:'84371822'})},1,1)`;
    }
    const report=await inspectDatabase(admin),identity=report.auth_identity,serialized=JSON.stringify(report);
    assert.equal(identity.state_basis,'current_mapping');assert.equal(identity.window_hours,24);
    // A validated mapping FK prevents an orphan provider ID; never disable it
    // merely to manufacture an otherwise impossible diagnostic state.
    for(const [key,added] of Object.entries({total:6,mapped:3,unmapped:3,provider_found:3,provider_missing:0,provider_email_missing:1,provider_email_matches:1,provider_email_mismatch:1}))assert.equal(identity.active_accounts[key],before.auth_identity.active_accounts[key]+added);
    const additions=new Map<string,number>();
    for(const [index,row] of cases.entries()){const key=row.state+':'+(index===0);additions.set(key,(additions.get(key)||0)+1);}
    for(const [key,added] of additions){const [state,present]=key.split(':');assert.equal(grouped(report,state,present==='true'),grouped(before,state,present==='true')+added);}
    for(const row of identity.failed_login_jobs){
      assert.deepEqual(Object.keys(row).sort(),['current_state','challenge_present','count','oldest_created_at','newest_created_at'].sort());
      assert.ok(['current_profile_missing','current_profile_ambiguous','profile_inactive','mapping_missing','provider_missing','provider_email_missing','provider_matches','provider_email_mismatch'].includes(row.current_state));
      assert.ok(row.oldest_created_at&&row.newest_created_at);
    }
    for(const value of [...addresses,...nonces,...appIds,...providerIds,...jobIds,'84371822','ea'.repeat(32),'Private diagnostic fixture',url])assert.ok(!serialized.includes(value));
    for(const key of ['"email":','"id":','payload','nonce_hash','code_hash','supabase_user_id'])assert.ok(!serialized.includes(key));
    const restricted=await inspectDatabase(runtime);assert.equal(restricted.auth_identity.error_code,'42501');
    assert.ok(Array.isArray(restricted.mail.groups),'Denied auth-schema access does not hide queue diagnostics');
  }finally{
    if(jobIds.length)await admin`delete from cms_jobs where id in ${admin(jobIds)}`;
    if(appIds.length){await admin`delete from cms_auth_login_challenges where user_id in ${admin(appIds)}`;await admin`delete from cms_memberships where user_id in ${admin(appIds)}`;await admin`delete from auth_user where id in ${admin(appIds)}`;}
    if(providerIds.length)await admin`delete from auth.users where id in ${admin(providerIds)}`;
    await runtime.end({timeout:2});
  }
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

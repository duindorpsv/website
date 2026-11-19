import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {databaseOptions} from '../../lib/server/database-config';
import {closeDb} from '../../db';
import {resolveMollieCredential} from '../../lib/server/mollie-provider';
import {processMollieWebhook,createInvoicePayment} from '../../lib/server/mollie-payments';
import {getAuth} from '../../lib/server/auth';
import {loginEmail,authCookies} from '../helpers/supabase-auth';
import {createMollieSettings} from '../../lib/cms/mollie';
import {mollieCreateBody,type MollieAttemptSnapshot} from '../../lib/server/mollie-payment-core';
import {calculateSponsorTotals} from '../../lib/cms/sponsorship';
import {donorInvoiceSchema} from '../../lib/cms/sponsorship-schema';
import {GET as paymentStatus,POST as paymentAction} from '../../app/api/sponsorship/payments/route';
import {POST as paymentWebhook} from '../../app/api/sponsorship/payments/webhook/route';
import {workspaceLocks} from '../../lib/server/sponsor-access';
assertLocalSupabaseTests();
const sql=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL!,databaseOptions(1));after(async()=>{await sql.end();await closeDb();});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
test('Mollie durable attempts: immutable snapshots, verified webhook settlement and duplicate delivery',{timeout:30000},async t=>{
 const secretNames=['MOLLIE_TEST_TOKEN','MOLLIE_TEST_BINDING','MOLLIE_LIVE_TOKEN','MOLLIE_LIVE_BINDING'] as const,previousSecrets=Object.fromEntries(secretNames.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch;
 const sourceIds:string[]=[];
 t.after(async()=>{if(sourceIds.length)await sql`update cms_jobs set status='cancelled',lease_until=null,lease_owner=null where kind='mollie-payment-verify' and status in ('pending','processing') and payload->>'providerId' in (select provider_id from cms_mollie_payment_attempts where source_id in ${sql(sourceIds)})`;});
 for(const mode of ['test','live'] as const){process.env[`MOLLIE_${mode.toUpperCase()}_TOKEN`]=`${mode}_synthetic_fixture_never_sent`;process.env[`MOLLIE_${mode.toUpperCase()}_BINDING`]=JSON.stringify({clubId:'duindorpsv',organizationId:'org_fixture',mode,authMode:'advanced-token',credentialKind:'oauth',currentProfileId:'',scopes:['payments.read','payments.write'],testmodeParameter:true});}
 t.after(()=>{globalThis.fetch=originalFetch;for(const name of secretNames){if(previousSecrets[name]===undefined)delete process.env[name];else process.env[name]=previousSecrets[name];}});
 const savedConfiguration=await sql`select * from cms_records where id='site-mollie'`,workspaceSettings=createMollieSettings();workspaceSettings.mode='live';
 await sql`insert into cms_records(id,module,title,draft) values ('site-mollie','mollieSettings','Fictieve betaalinrichting',${sql.json(workspaceSettings as any)}) on conflict(id) do update set draft=excluded.draft`;
 t.after(async()=>{await sql`delete from cms_records where id='site-mollie'`;if(savedConfiguration[0])await sql`insert into cms_records ${sql(savedConfiguration[0])}`;});
 const {user:actor}=await getAuth().api.createUser({body:{email:'mollie-webhook-'+randomUUID()+'@example.invalid',name:'Fictieve webhookbeheerder',password:randomUUID()+randomUUID()}});
 await sql`insert into cms_memberships(user_id,role_id) values (${actor.id},'admin')`;
 const fixture=async(withAttempt=true,mode:'test'|'live'='live')=>{
  const id=randomUUID(),sourceId=randomUUID(),operationId=randomUUID(),now=new Date().toISOString();
  sourceIds.push(sourceId);
  const lines=[{id:randomUUID(),itemId:'',name:'Fictieve webhookbijdrage',description:'',quantity:1,unitPriceCents:1001,taxRate:'0' as const,startDate:'2026-11-06',endDate:''}];
  const invoice=donorInvoiceSchema.parse({id:sourceId,donorId:randomUUID(),contributionId:randomUUID(),number:'WEBHOOK-'+sourceId,issueDate:'2026-11-06',dueDate:'2026-12-06',status:'open',issuer:{legalName:'Fictieve testclub',address:'Teststraat 1',companyNumber:'',email:'club@example.invalid'},recipient:{id:randomUUID(),name:'Fictieve testdonor',kind:'person',email:'donor@example.invalid',phone:'',address:'Teststraat 2',postalCode:'1234 AB',city:'Teststad',notes:'',active:true,createdAt:now,updatedAt:now},lines,totals:calculateSponsorTotals(lines),totalCents:1001,paidAt:'',paymentMethod:'none',createdAt:now});
  await sql`insert into cms_sponsor_records(id,kind,data) values (${sourceId},'donorInvoices',${sql.json(invoice as any)})`;
  const credential=resolveMollieCredential(mode),base:Omit<MollieAttemptSnapshot,'request'>={id,source:{kind:'donors',id:sourceId,number:invoice.number,amountCents:invoice.totalCents},clubId:'duindorpsv',organizationId:'org_fixture',mode,streamCode:'donations',profileId:'pfl_fixture',expectedBalanceId:'bal_fixture',linkVerification:'manual',linkVerifiedAt:now,catalogFetchedAt:now,configVersion:7,configHash:'frozen-config',credentialBindingId:credential.binding.id,idempotencyKey:'duindorp-'+id,reference:'DON · '+invoice.number,createdAt:now};
  const snapshot={...base,request:mollieCreateBody(base,credential,process.env.APP_BASE_URL!)};
  const bytes=JSON.stringify(snapshot),providerId='tr_'+id.replaceAll('-','');
  if(withAttempt)await sql`insert into cms_mollie_payment_attempts(id,operation_id,actor_id,source_kind,source_id,snapshot_bytes,snapshot_hash,status,provider_id) values (${id},${operationId}::uuid,${actor.id},'donors',${sourceId},${bytes},${hash(bytes)},'open',${providerId})`;
  return {id,sourceId,snapshot,providerId};
 };
 const a=await fixture();
 await t.test('database rejects financial snapshot/provider identity overwrite and duplicate active source',async()=>{
  await assert.rejects(sql`update cms_mollie_payment_attempts set snapshot_bytes='{}' where id=${a.id}`);
  await assert.rejects(sql`update cms_mollie_payment_attempts set provider_id='tr_other' where id=${a.id}`);
  await assert.rejects(sql`delete from cms_mollie_payment_attempts where id=${a.id}`);
  await assert.rejects(sql`insert into cms_mollie_payment_attempts(id,operation_id,actor_id,source_kind,source_id,snapshot_bytes,snapshot_hash) values (${randomUUID()},${randomUUID()}::uuid,${actor.id},'donors',${a.sourceId},${JSON.stringify(a.snapshot)},${hash(JSON.stringify(a.snapshot))})`);
 });
 const provider=(record:typeof a,change:Record<string,unknown>={})=>({id:record.providerId,profileId:record.snapshot.profileId,mode:record.snapshot.mode,amount:{currency:'EUR',value:'10.01'},metadata:record.snapshot.request.metadata,status:'paid',_embedded:{refunds:[],chargebacks:[]},...change});
 let current=provider(a),fetches=0;
 globalThis.fetch=async(url,init)=>{fetches++;assert.match(String(url),/^https:\/\/api.mollie.com\/v2\/payments\/tr_/);assert.match(String(url),/embed=refunds,chargebacks$/);assert.equal(init?.method,undefined);return Response.json(current);};
 await t.test('unknown payload ID has no provider call; duplicate verified fetch settles and audits once',async()=>{
  await processMollieWebhook('tr_unknown');assert.equal(fetches,0);
  await processMollieWebhook(a.providerId);await processMollieWebhook(a.providerId);
  const [invoice]=await sql`select data from cms_sponsor_records where id=${a.sourceId}`;assert.equal(invoice.data.status,'paid');assert.equal(invoice.data.paymentMethod,'mollie');
  assert.equal((await sql`select id from cms_audit where action='mollie-payment-verified' and metadata->>'attemptId'=${a.id}`).length,1);
 });
 await t.test('public callbacks queue known payments without provider calls or workspace locks, coalesce and preserve in-flight hints',async()=>{
  const queued=await fixture(),operationId='mollie-payment-verify-'+queued.id;let external=0;
  globalThis.fetch=async()=>{external++;throw Error('Public callbacks must not contact an external service');};
  const callback=(id:string,headers:Record<string,string>={})=>paymentWebhook(new Request(new URL('/api/sponsorship/payments/webhook',process.env.APP_BASE_URL!),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({id}).toString()}));
  const unknown='tr_unknown'+randomUUID().replaceAll('-','');assert.equal((await callback(unknown)).status,200);
  assert.equal((await sql`select id from cms_jobs where kind='mollie-payment-verify' and payload->>'providerId'=${unknown}`).length,0);
  await sql.begin(async tx=>{await workspaceLocks(tx);assert.equal((await callback(queued.providerId)).status,200,'A callback remains available while financial writes hold the workspace locks');});
  assert.equal((await callback(queued.providerId)).status,200);
  let jobs=await sql`select * from cms_jobs where operation_id=${operationId}`;assert.equal(jobs.length,1);assert.equal(jobs[0].status,'pending');
  const jobId=jobs[0].id,owner='callback-test-worker';await sql`update cms_jobs set status='processing',lease_owner=${owner},lease_until=now()+interval '60 seconds',attempts=3 where id=${jobId}`;
  assert.equal((await callback(queued.providerId)).status,200);
  jobs=await sql`select * from cms_jobs where id=${jobId}`;assert.equal(jobs[0].status,'pending');assert.equal(jobs[0].lease_owner,null);assert.equal(jobs[0].lease_until,null);assert.equal(jobs[0].attempts,0);
  assert.equal((await sql`update cms_jobs set status='done' where id=${jobId} and status='processing' and lease_owner=${owner} returning id`).length,0,'The old worker cannot discard a later callback');
  await sql`update cms_jobs set status='done' where id=${jobId}`;assert.equal((await callback(queued.providerId)).status,200);assert.equal((await sql`select status from cms_jobs where id=${jobId}`)[0].status,'pending','A later state change reopens the same task');
  const spam='tr_rate'+randomUUID().replaceAll('-','');for(let i=0;i<20;i++)assert.equal((await callback(spam,{'x-real-ip':'198.51.100.'+(i+1),'user-agent':'spoof-'+i})).status,200);
  assert.equal((await callback(spam,{'user-agent':'another-agent'})).status,429,'Per-provider throttling applies even to unknown identities');
  const {createHash}=await import('node:crypto'),ip=createHash('sha256').update('untrusted').digest('hex');
  const previousProxy=process.env.TRUST_PROXY_IP;process.env.TRUST_PROXY_IP='false';
  try{await sql`update cms_rate_limits set count=120,expires_at=now()+interval '60 seconds' where key=${'mollie:webhook-ip:'+ip}`;assert.equal((await callback('tr_ip'+randomUUID().replaceAll('-',''),{'x-real-ip':'203.0.113.7','user-agent':'changed-agent'})).status,429,'Untrusted headers cannot bypass the shared IP bucket');}
  finally{if(previousProxy===undefined)delete process.env.TRUST_PROXY_IP;else process.env.TRUST_PROXY_IP=previousProxy;await sql`delete from cms_rate_limits where key=${'mollie:webhook-ip:'+ip}`;}
  assert.equal(external,0);globalThis.fetch=async()=>Response.json(current);
 });
 await t.test('payment status is private and source-scoped; explicit verification fetches without creating or duplicating settlement',async()=>{
  globalThis.fetch=originalFetch;const cookie=authCookies(await loginEmail(actor.email));
  const statusRequest=(cookieValue:string,kind='donors',id=a.sourceId)=>new Request(new URL('/api/sponsorship/payments?'+new URLSearchParams({sourceKind:kind,sourceId:id}),process.env.APP_BASE_URL!),{headers:{cookie:cookieValue}});
  assert.equal((await paymentStatus(statusRequest(''))).status,401);
  const response=await paymentStatus(statusRequest(cookie));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json();assert.equal(body.mode,'live');assert.equal(body.enabled,false);assert.equal(body.attempt.id,a.id);assert.equal(body.attempt.status,'paid');assert.equal(body.attempt.mode,'live');
  assert.deepEqual(Object.keys(body.attempt).sort(),['checkoutUrl','errorCode','id','mode','providerId','status']);
  assert.ok(!JSON.stringify(body).includes('synthetic_fixture'));assert.ok(!JSON.stringify(body).includes('snapshot_bytes'));
  assert.equal((await paymentStatus(statusRequest(cookie,'sponsors'))).status,409);
  const {user:portal}=await getAuth().api.createUser({body:{email:'mollie-private-'+randomUUID()+'@example.invalid',name:'Fictieve portaalgebruiker',password:randomUUID()+randomUUID()}});await sql`insert into cms_memberships(user_id,role_id) values (${portal.id},'sponsor')`;
  assert.equal((await paymentStatus(statusRequest(authCookies(await loginEmail(portal.email))))).status,403);
  let calls=0;globalThis.fetch=async(url,init)=>{if(!String(url).startsWith('https://api.mollie.com/'))return originalFetch(url,init);calls++;assert.match(String(url),/\/v2\/payments\//);assert.equal(init?.method,undefined);return Response.json(provider(a));};
  const verifyBody={action:'verify',sourceKind:'donors',sourceId:a.sourceId},verifyRequest=(origin:string)=>new Request(new URL('/api/sponsorship/payments',process.env.APP_BASE_URL!),{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(verifyBody)});
  assert.equal((await paymentAction(verifyRequest('https://example.invalid'))).status,403);assert.equal(calls,0);
  const verified=await paymentAction(verifyRequest(new URL(process.env.APP_BASE_URL!).origin));assert.equal(verified.status,200);assert.equal((await verified.json()).attempt.status,'paid');assert.equal(calls,1);
  assert.equal((await sql`select id from cms_audit where action='mollie-payment-verified' and metadata->>'attemptId'=${a.id}`).length,1);
  const sponsorId=randomUUID(),invoiceId=randomUUID(),attemptId=randomUUID(),operationId=randomUUID(),number='DELETED-'+invoiceId;
  sourceIds.push(invoiceId);
  await sql`insert into cms_sponsor_companies(id,data) values (${sponsorId},${sql.json({id:sponsorId,name:'Fictieve verwijderde relatie',deletedAt:new Date().toISOString(),publicEnabled:false})})`;
  await sql`insert into cms_sponsor_records(id,kind,sponsor_id,data) values (${invoiceId},'invoices',${sponsorId},${sql.json({id:invoiceId,sponsorId,status:'open',number,totalCents:1001,paymentMethod:'none',paidAt:''})})`;
  const credential=resolveMollieCredential('live'),base={...a.snapshot,id:attemptId,source:{kind:'sponsors' as const,id:invoiceId,number,amountCents:1001},streamCode:'sponsors' as const,idempotencyKey:'duindorp-'+attemptId},bytes=JSON.stringify({...base,request:mollieCreateBody(base,credential,process.env.APP_BASE_URL!)});
  await sql`insert into cms_mollie_payment_attempts(id,operation_id,actor_id,source_kind,source_id,snapshot_bytes,snapshot_hash,status,provider_id) values (${attemptId},${operationId}::uuid,${actor.id},'sponsors',${invoiceId},${bytes},${hash(bytes)},'open',${'tr_deleted'+attemptId.replaceAll('-','')})`;
  assert.equal((await paymentStatus(statusRequest(cookie,'sponsors',invoiceId))).status,404);
  for(const id of [operationId,randomUUID()]){const stale=new Request(new URL('/api/sponsorship/payments',process.env.APP_BASE_URL!),{method:'POST',headers:{cookie,origin:new URL(process.env.APP_BASE_URL!).origin,'content-type':'application/json'},body:JSON.stringify({operationId:id,sourceKind:'sponsors',sourceId:invoiceId})});assert.equal((await paymentAction(stale)).status,404,'Neither a new request nor a replayed operation exposes a deleted sponsor payment');}
  assert.equal(calls,1,'Deleted relationships cannot trigger a provider call');
  globalThis.fetch=async()=>Response.json(current);
 });
 await t.test('a verified test payment records its outcome while the actual invoice remains open and a live attempt stays possible',async()=>{
  const simulated=await fixture(true,'test');
  globalThis.fetch=async(url)=>{assert.match(String(url),/embed=refunds,chargebacks&testmode=true$/);return Response.json(provider(simulated));};
  await processMollieWebhook(simulated.providerId);await processMollieWebhook(simulated.providerId);
  const [invoice]=await sql`select data from cms_sponsor_records where id=${simulated.sourceId}`;assert.equal(invoice.data.status,'open');assert.equal(invoice.data.paymentMethod,'none');assert.equal(invoice.data.paidAt,'');
  const [attempt]=await sql`select status,settled_at from cms_mollie_payment_attempts where id=${simulated.id}`;assert.equal(attempt.status,'paid');assert.equal(attempt.settled_at,null);
  assert.equal((await sql`select id from cms_audit where action='mollie-payment-verified' and metadata->>'attemptId'=${simulated.id}`).length,0);
  const credential=resolveMollieCredential('live'),id=randomUUID(),base={...simulated.snapshot,id,mode:'live' as const,credentialBindingId:credential.binding.id,idempotencyKey:'duindorp-'+id};
  const bytes=JSON.stringify({...base,request:mollieCreateBody(base,credential,process.env.APP_BASE_URL!)});
  await sql`insert into cms_mollie_payment_attempts(id,operation_id,actor_id,source_kind,source_id,snapshot_bytes,snapshot_hash,status) values (${id},${randomUUID()}::uuid,${actor.id},'donors',${simulated.sourceId},${bytes},${hash(bytes)},'prepared')`;
  assert.equal((await sql`select id from cms_mollie_payment_attempts where source_id=${simulated.sourceId}`).length,2,'A paid test attempt does not reserve the actual live payment');
  globalThis.fetch=async()=>Response.json(current);
 });
 await t.test('authenticated create commits before provider call, survives timeout and queues early-callback recovery exactly once',async()=>{
  globalThis.fetch=originalFetch;
  const record=await fixture(false),{user}=await getAuth().api.createUser({body:{email:'mollie-attempt-'+randomUUID()+'@example.invalid',name:'Fictieve betaalbeheerder',password:randomUUID()+randomUUID()}});
  await sql`insert into cms_memberships(user_id,role_id) values (${user.id},'admin')`;
  const cookie=authCookies(await loginEmail(user.email)),request=new Request(new URL('/api/sponsorship/payments',process.env.APP_BASE_URL!),{method:'POST',headers:{cookie}}),body={operationId:randomUUID(),sourceKind:'donors',sourceId:record.sourceId};
  const settings=createMollieSettings();settings.mode='live';(settings.environments.live as any).paymentsEnabled=true;
  const credential=resolveMollieCredential('live'),now=new Date().toISOString(),resolved:any={settings,version:8,configHash:'controlled-adapter-fixture',credential,route:{mode:'live',available:true,profile:{id:'pfl_fixture'},balance:{id:'bal_fixture'},link:{verifiedBy:'manual',verifiedAt:now},stream:{referencePrefix:'DON'}}};
  let calls=0;const sent:string[]=[],transport:typeof fetch=async(url,init)=>{
   assert.equal(url,'https://api.mollie.com/v2/payments');const rows=await sql`select * from cms_mollie_payment_attempts where source_id=${record.sourceId}`;assert.equal(rows.length,1,'Attempt is visible on an independent connection before create');sent.push(String(init!.body));
   if(++calls===1)throw Error('Synthetic time-out after provider received create');
   return Response.json({id:'tr_controlled'+record.id.replaceAll('-',''),_links:{checkout:{href:'https://www.mollie.com/checkout/fixture'}}});
  };
  const runtime={resolveRoute:async()=>resolved,readConfiguration:async()=>resolved,transport};
  await assert.rejects(createInvoicePayment(request,{...body,expectedMode:'test'},runtime),(error:any)=>error.code==='payment-mode-changed');assert.equal(calls,0);assert.equal((await sql`select id from cms_mollie_payment_attempts where source_id=${record.sourceId}`).length,0);
  await assert.rejects(createInvoicePayment(request,body,runtime),(error:any)=>error.code==='payment-uncertain');
  const retried=await createInvoicePayment(request,body,runtime);assert.equal(retried.status,'open');assert.equal(sent[0],sent[1]);
  assert.equal((await sql`select id from cms_mollie_payment_attempts where source_id=${record.sourceId}`).length,1);
  assert.equal((await sql`select id from cms_jobs where kind='mollie-payment-verify' and payload->>'providerId'=${retried.providerId}`).length,1);
  assert.deepEqual(await createInvoicePayment(request,body,runtime),retried);assert.equal(calls,2);
  // The production dependencies still reject an unconfigured saved route.
  const other=await fixture(false);await assert.rejects(createInvoicePayment(request,{...body,operationId:randomUUID(),sourceId:other.sourceId}));
  assert.equal((await sql`select id from cms_mollie_payment_attempts where source_id=${other.sourceId}`).length,0);
 });
 await t.test('verification fetches serialize and a settled attempt cannot regress on a later open status',async()=>{
  const c=await fixture();let concurrent=0,maximum=0,n=0;
  globalThis.fetch=async()=>{maximum=Math.max(maximum,++concurrent);await new Promise(resolve=>setTimeout(resolve,20));concurrent--;return Response.json(provider(c,{status:++n===1?'open':'paid'}));};
  await Promise.all([processMollieWebhook(c.providerId),processMollieWebhook(c.providerId)]);assert.equal(maximum,1);
  assert.equal((await sql`select status from cms_mollie_payment_attempts where id=${c.id}`)[0].status,'paid');
  globalThis.fetch=async()=>Response.json(provider(c,{status:'open'}));await processMollieWebhook(c.providerId);
  assert.equal((await sql`select status from cms_mollie_payment_attempts where id=${c.id}`)[0].status,'paid');
  globalThis.fetch=async()=>Response.json(current);
 });
 await t.test('wrong amount, credential rotation and refund evidence never settle another invoice',async()=>{
  const b=await fixture();current=provider(b,{amount:{currency:'EUR',value:'10.02'}});
  await assert.rejects(processMollieWebhook(b.providerId),(error:any)=>error.code==='payment-mismatch');
  let [invoice]=await sql`select data from cms_sponsor_records where id=${b.sourceId}`;assert.equal(invoice.data.status,'open');
  current=provider(b,{_embedded:{refunds:[{id:'re_fixture'}],chargebacks:[]}});await processMollieWebhook(b.providerId);
  assert.equal((await sql`select status from cms_mollie_payment_attempts where id=${b.id}`)[0].status,'review');
  process.env.MOLLIE_LIVE_TOKEN='live_rotated_fixture_never_sent';const before=fetches;
  await assert.rejects(processMollieWebhook(b.providerId),(error:any)=>error.code==='mollie-binding-changed');assert.equal(fetches,before);
  [invoice]=await sql`select data from cms_sponsor_records where id=${b.sourceId}`;assert.equal(invoice.data.status,'open');
 });
});

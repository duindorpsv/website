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
assertLocalSupabaseTests();
const sql=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL!,databaseOptions(1));after(async()=>{await sql.end();await closeDb();});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
test('Mollie durable attempts: immutable snapshots, verified webhook settlement and duplicate delivery',{timeout:30000},async t=>{
 const previousToken=process.env.MOLLIE_TEST_TOKEN,previousBinding=process.env.MOLLIE_TEST_BINDING,originalFetch=globalThis.fetch;
 process.env.MOLLIE_TEST_TOKEN='test_synthetic_fixture_never_sent';
 process.env.MOLLIE_TEST_BINDING=JSON.stringify({clubId:'duindorpsv',organizationId:'org_fixture',mode:'test',authMode:'advanced-token',credentialKind:'oauth',currentProfileId:'',scopes:['payments.read','payments.write'],testmodeParameter:true});
 t.after(()=>{globalThis.fetch=originalFetch;if(previousToken===undefined)delete process.env.MOLLIE_TEST_TOKEN;else process.env.MOLLIE_TEST_TOKEN=previousToken;if(previousBinding===undefined)delete process.env.MOLLIE_TEST_BINDING;else process.env.MOLLIE_TEST_BINDING=previousBinding;});
 const {user:actor}=await getAuth().api.createUser({body:{email:'mollie-webhook-'+randomUUID()+'@example.invalid',name:'Fictieve webhookbeheerder',password:randomUUID()+randomUUID()}});
 await sql`insert into cms_memberships(user_id,role_id) values (${actor.id},'admin')`;
 const fixture=async(withAttempt=true)=>{
  const id=randomUUID(),sourceId=randomUUID(),operationId=randomUUID(),now=new Date().toISOString();
  const lines=[{id:randomUUID(),itemId:'',name:'Fictieve webhookbijdrage',description:'',quantity:1,unitPriceCents:1001,taxRate:'0' as const,startDate:'2026-11-06',endDate:''}];
  const invoice=donorInvoiceSchema.parse({id:sourceId,donorId:randomUUID(),contributionId:randomUUID(),number:'WEBHOOK-'+sourceId,issueDate:'2026-11-06',dueDate:'2026-12-06',status:'open',issuer:{legalName:'Fictieve testclub',address:'Teststraat 1',companyNumber:'',email:'club@example.invalid'},recipient:{id:randomUUID(),name:'Fictieve testdonor',kind:'person',email:'donor@example.invalid',phone:'',address:'Teststraat 2',postalCode:'1234 AB',city:'Teststad',notes:'',active:true,createdAt:now,updatedAt:now},lines,totals:calculateSponsorTotals(lines),totalCents:1001,paidAt:'',createdAt:now});
  await sql`insert into cms_sponsor_records(id,kind,data) values (${sourceId},'donorInvoices',${sql.json(invoice as any)})`;
  const credential=resolveMollieCredential('test'),base:Omit<MollieAttemptSnapshot,'request'>={id,source:{kind:'donors',id:sourceId,number:invoice.number,amountCents:invoice.totalCents},clubId:'duindorpsv',organizationId:'org_fixture',mode:'test',streamCode:'donations',profileId:'pfl_fixture',expectedBalanceId:'bal_fixture',linkVerification:'manual',linkVerifiedAt:now,catalogFetchedAt:now,configVersion:7,configHash:'frozen-config',credentialBindingId:credential.binding.id,idempotencyKey:'duindorp-'+id,reference:'DON · '+invoice.number,createdAt:now};
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
 const provider=(record:typeof a,change:Record<string,unknown>={})=>({id:record.providerId,profileId:record.snapshot.profileId,mode:'test',amount:{currency:'EUR',value:'10.01'},metadata:record.snapshot.request.metadata,status:'paid',_embedded:{refunds:[],chargebacks:[]},...change});
 let current=provider(a),fetches=0;
 globalThis.fetch=async(url,init)=>{fetches++;assert.match(String(url),/^https:\/\/api.mollie.com\/v2\/payments\/tr_/);assert.match(String(url),/embed=refunds,chargebacks&testmode=true$/);assert.equal(init?.method,undefined);return Response.json(current);};
 await t.test('unknown payload ID has no provider call; duplicate verified fetch settles and audits once',async()=>{
  await processMollieWebhook('tr_unknown');assert.equal(fetches,0);
  await processMollieWebhook(a.providerId);await processMollieWebhook(a.providerId);
  const [invoice]=await sql`select data from cms_sponsor_records where id=${a.sourceId}`;assert.equal(invoice.data.status,'paid');assert.equal(invoice.data.paymentMethod,'mollie');
  assert.equal((await sql`select id from cms_audit where action='mollie-payment-verified' and metadata->>'attemptId'=${a.id}`).length,1);
 });
 await t.test('authenticated create commits before provider call, survives timeout and queues early-callback recovery exactly once',async()=>{
  globalThis.fetch=originalFetch;
  const record=await fixture(false),{user}=await getAuth().api.createUser({body:{email:'mollie-attempt-'+randomUUID()+'@example.invalid',name:'Fictieve betaalbeheerder',password:randomUUID()+randomUUID()}});
  await sql`insert into cms_memberships(user_id,role_id) values (${user.id},'admin')`;
  const cookie=authCookies(await loginEmail(user.email)),request=new Request(new URL('/api/sponsorship/payments',process.env.APP_BASE_URL!),{method:'POST',headers:{cookie}}),body={operationId:randomUUID(),sourceKind:'donors',sourceId:record.sourceId};
  const settings=createMollieSettings();(settings.environments.test as any).paymentsEnabled=true;
  const credential=resolveMollieCredential('test'),now=new Date().toISOString(),resolved:any={settings,version:8,configHash:'controlled-adapter-fixture',credential,route:{mode:'test',available:true,profile:{id:'pfl_fixture'},balance:{id:'bal_fixture'},link:{verifiedBy:'manual',verifiedAt:now},stream:{referencePrefix:'DON'}}};
  let calls=0;const sent:string[]=[],transport:typeof fetch=async(url,init)=>{
   assert.equal(url,'https://api.mollie.com/v2/payments');const rows=await sql`select * from cms_mollie_payment_attempts where source_id=${record.sourceId}`;assert.equal(rows.length,1,'Attempt is visible on an independent connection before create');sent.push(String(init!.body));
   if(++calls===1)throw Error('Synthetic time-out after provider received create');
   return Response.json({id:'tr_controlled'+record.id.replaceAll('-',''),_links:{checkout:{href:'https://www.mollie.com/checkout/fixture'}}});
  };
  const runtime={resolveRoute:async()=>resolved,readConfiguration:async()=>resolved,transport};
  await assert.rejects(createInvoicePayment(request,body,runtime),(error:any)=>error.code==='payment-uncertain');
  const retried=await createInvoicePayment(request,body,runtime);assert.equal(retried.status,'open');assert.equal(sent[0],sent[1]);
  assert.equal((await sql`select id from cms_mollie_payment_attempts where source_id=${record.sourceId}`).length,1);
  assert.equal((await sql`select id from cms_jobs where kind='mollie-payment-verify' and payload->>'providerId'=${retried.providerId}`).length,1);
  assert.deepEqual(await createInvoicePayment(request,body,runtime),retried);assert.equal(calls,2);
  // The production dependencies still use literal-disabled saved configuration.
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
  process.env.MOLLIE_TEST_TOKEN='test_rotated_fixture_never_sent';const before=fetches;
  await assert.rejects(processMollieWebhook(b.providerId),(error:any)=>error.code==='mollie-binding-changed');assert.equal(fetches,before);
  [invoice]=await sql`select data from cms_sponsor_records where id=${b.sourceId}`;assert.equal(invoice.data.status,'open');
 });
});

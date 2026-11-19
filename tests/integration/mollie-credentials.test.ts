import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {databaseOptions} from '../../lib/server/database-config';
import {sqlClient,closeDb} from '../../db';
import {getAuth} from '../../lib/server/auth';
import {assertLocalSupabaseTests,loginEmail,authCookies} from '../helpers/supabase-auth';
import {GET,POST} from '../../app/api/cms/mollie/route';
import {readMollieCredential} from '../../lib/server/mollie-provider';
import {resolveMollieServerRoute} from '../../lib/server/mollie-settings';

assertLocalSupabaseTests();
const sql=sqlClient(),fixture=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL!,databaseOptions(1)),base=process.env.APP_BASE_URL!;
after(async()=>{await closeDb();await fixture.end();});
const request=(cookie:string,body?:unknown)=>new Request(base+'/api/cms/mollie',{method:body?'POST':'GET',headers:{cookie,origin:new URL(base).origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function read(cookie:string){const response=await GET(request(cookie));return {status:response.status,body:await response.json()};}
async function command(cookie:string,body:unknown){const response=await POST(request(cookie,body));return {status:response.status,body:await response.json()};}
async function user(module:string){
 const role='credential-test-'+crypto.randomUUID();await fixture`insert into cms_roles(id,name) values (${role},'Fictieve sleutelbeheerder')`;await fixture`insert into cms_grants(role_id,module,action) values (${role},${module},'manage')`;
 const {user}=await getAuth().api.createUser({body:{email:'mollie-key-'+crypto.randomUUID()+'@example.invalid',name:'Fictieve sleutelbeheerder',password:crypto.randomUUID()+crypto.randomUUID()}});await fixture`insert into cms_memberships(user_id,role_id) values (${user.id},${role})`;
 return {...user,cookie:authCookies(await loginEmail(user.email))};
}
test('backoffice API keys: verified encrypted private storage, explicit activation, rotation and historical reconciliation',{timeout:90000},async t=>{
 const saved=await fixture`select * from cms_records where id='site-mollie'`,stored=await fixture`select * from cms_mollie_credentials`,originalFetch=globalThis.fetch,originalToken=process.env.MOLLIE_TEST_TOKEN,originalBinding=process.env.MOLLIE_TEST_BINDING;
 delete process.env.MOLLIE_TEST_TOKEN;delete process.env.MOLLIE_TEST_BINDING;
 await fixture`delete from cms_records where id='site-mollie'`;await fixture`delete from cms_mollie_credentials`;
 t.after(async()=>{
  globalThis.fetch=originalFetch;if(originalToken===undefined)delete process.env.MOLLIE_TEST_TOKEN;else process.env.MOLLIE_TEST_TOKEN=originalToken;if(originalBinding===undefined)delete process.env.MOLLIE_TEST_BINDING;else process.env.MOLLIE_TEST_BINDING=originalBinding;
  await fixture`delete from cms_mollie_credentials`;for(const row of stored)await fixture`insert into cms_mollie_credentials ${fixture(row)}`;
  await fixture`delete from cms_records where id='site-mollie'`;if(saved[0])await fixture`insert into cms_records ${fixture(saved[0])}`;
 });
 const manager=await user('settings'),sponsor=await user('sponsors'),apiKey='test_abcdefghijklmnopqrstuvwxyz123456',rotated='test_abcdefghijklmnopqrstuvwxyz654321';let failProvider=false,providerCalls=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.hostname!=='api.mollie.com')return originalFetch(input,init);
  providerCalls++;assert.equal(init?.method,'GET','Credential configuration must never create a provider payment');assert.equal(url.searchParams.has('profileId'),false);assert.equal(url.searchParams.has('testmode'),false);
  if(failProvider)return new Response('',{status:401});
  if(url.pathname==='/v2/profiles/me')return Response.json({resource:'profile',id:'pfl_credentials',name:'Fictieve club',website:'https://example.invalid',status:'verified',mode:'test'});
  assert.equal(url.pathname,'/v2/methods');return Response.json({_embedded:{methods:[{id:'ideal'}]}});
 };
 await t.test('only central settings can configure keys, and mode mismatch never contacts the provider',async()=>{
  assert.equal((await command(sponsor.cookie,{action:'api-key',expectedVersion:0,mode:'test',apiKey})).status,403);assert.equal(providerCalls,0);
  assert.equal((await command(manager.cookie,{action:'api-key',expectedVersion:0,mode:'live',apiKey})).status,422);assert.equal(providerCalls,0);
  const [access]=await fixture`select c.relrowsecurity,has_table_privilege('anon','cms_mollie_credentials','select') as anon,has_table_privilege('authenticated','cms_mollie_credentials','select') as authenticated,has_table_privilege('service_role','cms_mollie_credentials','select') as service from pg_class c where c.oid='cms_mollie_credentials'::regclass`;
  assert.equal(access.relrowsecurity,true);assert.equal(access.anon,false);assert.equal(access.authenticated,false);assert.equal(access.service,false);
 });
 let state:any,firstBinding='';
 await t.test('saving a verified key returns masked metadata, defaults payments off and writes no plaintext into content or audit',async()=>{
  const result=await command(manager.cookie,{action:'api-key',expectedVersion:0,mode:'test',apiKey});assert.equal(result.status,200,result.body.message);state=result.body;
  assert.equal(state.connections.test.source,'stored-api-key');assert.equal(state.connections.test.keyPreview,'test_••••3456');assert.equal(state.connections.test.configured,true);assert.equal(state.settings.environments.test.paymentsEnabled,false);assert.equal(state.settings.environments.live.catalog.source,'none');
  assert.equal(state.settings.environments.test.currentProfileId,'pfl_credentials');assert.deepEqual(state.settings.environments.test.catalog.balances,[]);assert.equal(state.settings.environments.test.catalog.organizationId,'');assert.ok(!JSON.stringify(state).includes(apiKey));
  const [row]=await fixture`select * from cms_mollie_credentials where active=true`;firstBinding=row.binding_id;assert.ok(row.ciphertext);assert.ok(!JSON.stringify(row).includes(apiKey));assert.equal((await readMollieCredential('test')).token,apiKey);
  const [content]=await sql`select draft from cms_records where id='site-mollie'`;assert.ok(!JSON.stringify(content).includes(apiKey));const audit=await sql`select metadata from cms_audit where actor_id=${manager.id}`;assert.ok(!JSON.stringify(audit).includes(apiKey));
  const reread=await read(manager.cookie);assert.equal(reread.status,200);assert.equal(reread.body.connections.test.keyPreview,'test_••••3456');assert.ok(!JSON.stringify(reread.body).includes(apiKey));
 });
 await t.test('activation requires a saved usable stream and verifies the actual profile again',async()=>{
  let result=await command(manager.cookie,{action:'activation',expectedVersion:state.version,mode:'test',enabled:true});assert.equal(result.status,422);assert.equal((await read(manager.cookie)).body.settings.environments.test.paymentsEnabled,false);
  const streams=state.settings.environments.test.streams.map((row:any)=>({...row,enabled:row.code==='sponsors'}));result=await command(manager.cookie,{action:'streams',expectedVersion:state.version,mode:'test',streams});assert.equal(result.status,200,result.body.message);state=result.body;
  const route=await resolveMollieServerRoute('sponsors','test');assert.equal(route.route.available,true);assert.equal(route.route.profile?.id,'pfl_credentials');assert.equal(route.route.balance,undefined);
  result=await command(manager.cookie,{action:'activation',expectedVersion:state.version,mode:'test',enabled:true});assert.equal(result.status,200,result.body.message);state=result.body;assert.equal(state.settings.environments.test.paymentsEnabled,true);assert.equal(state.settings.environments.live.paymentsEnabled,false);
 });
 await t.test('failed verification is atomic; rotation disables execution and retains encrypted historical keys',async()=>{
  const before=structuredClone(state);failProvider=true;let result=await command(manager.cookie,{action:'api-key',expectedVersion:state.version,mode:'test',apiKey:rotated});assert.equal(result.status,502);failProvider=false;
  assert.deepEqual((await read(manager.cookie)).body.settings,before.settings);assert.equal((await readMollieCredential('test')).binding.id,firstBinding);
  // The rejected live-mode key used its own mode; reset only this synthetic actor's
  // local limiter before checking a second key, without bypassing application checks.
  await fixture`delete from cms_rate_limits where key=${'mollie-sync:'+manager.id}`;
  result=await command(manager.cookie,{action:'api-key',expectedVersion:state.version,mode:'test',apiKey:rotated});assert.equal(result.status,200,result.body.message);state=result.body;
  assert.equal(state.settings.environments.test.paymentsEnabled,false);assert.ok(state.settings.environments.test.streams.every((row:any)=>!row.enabled));assert.notEqual(state.connections.test.bindingId,firstBinding);
  assert.equal((await readMollieCredential('test')).token,rotated);assert.equal((await readMollieCredential('test',firstBinding)).token,apiKey);
  assert.equal((await fixture`select binding_id from cms_mollie_credentials where mode='test'`).length,2);
  result=await command(manager.cookie,{action:'remove-api-key',expectedVersion:state.version,mode:'test'});assert.equal(result.status,200,result.body.message);assert.equal(result.body.settings.environments.test.paymentsEnabled,false);assert.equal(result.body.connections.test.configured,false);assert.equal((await readMollieCredential('test',firstBinding)).token,apiKey);
 });
});

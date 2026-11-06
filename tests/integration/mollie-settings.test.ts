import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {databaseOptions} from '../../lib/server/database-config';
import {sqlClient,closeDb} from '../../db';
import {getAuth} from '../../lib/server/auth';
import {assertLocalSupabaseTests,loginEmail,authCookies} from '../helpers/supabase-auth';
import {GET,POST} from '../../app/api/cms/mollie/route';
import {GET as cmsGet} from '../../app/api/cms/[...path]/route';
import {readMollieConfiguration,resolveMollieServerRoute} from '../../lib/server/mollie-settings';
import {mutate,loadState} from '../../lib/server/records';
import {principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),fixture=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL!,databaseOptions(1)),base=process.env.APP_BASE_URL!;
after(async()=>{await closeDb();await fixture.end();});
const request=(cookie:string,body?:unknown,query='')=>new Request(base+'/api/cms/mollie'+query,{method:body?'POST':'GET',headers:{cookie,origin:new URL(base).origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function read(cookie:string,query=''){const response=await GET(request(cookie,undefined,query));return {status:response.status,body:await response.json()};}
async function command(cookie:string,body:unknown){const response=await POST(request(cookie,body));return {status:response.status,body:await response.json()};}
async function user(grants:{module:string;action:string}[],teamScoped=false){const role='mollie-fixture-'+crypto.randomUUID();await fixture`insert into cms_roles(id,name,description,team_scoped) values (${role},'Fictieve Mollie-rol','Geïsoleerde test',${teamScoped})`;for(const grant of grants)await fixture`insert into cms_grants(role_id,module,action) values (${role},${grant.module},${grant.action})`;const {user}=await getAuth().api.createUser({body:{email:'mollie-'+crypto.randomUUID()+'@example.invalid',name:'Fictieve Mollie-beheerder',password:crypto.randomUUID()+crypto.randomUUID()}});await fixture`insert into cms_memberships(user_id,role_id) values (${user.id},${role})`;return {...user,role,cookie:authCookies(await loginEmail(user.email))};}
const syntheticToken='test-integration-token-only-no-provider-secret';
const safeBinding={clubId:'duindorpsv',organizationId:'org_fixture',mode:'test',authMode:'advanced-token',credentialKind:'advanced-access-token',currentProfileId:'',scopes:['organizations.read','profiles.read','balances.read','payments.read','payments.write'],testmodeParameter:true};

test('Mollie: real authenticated settings, safe projections, atomic catalog, current permissions and independent club saves',{timeout:120000},async t=>{
 const manager=await user([{module:'settings',action:'update'},{module:'settings',action:'read'},{module:'settings',action:'publish'}]),donor=await user([{module:'donors',action:'read'},{module:'donors',action:'settings'}]),donorSettingsOnly=await user([{module:'donors',action:'settings'}]),sponsor=await user([{module:'sponsors',action:'*'}]),team=await user([{module:'settings',action:'*'}],true);
 const saved=await fixture`select * from cms_records where id='site-mollie'`,previousToken=process.env.MOLLIE_TEST_TOKEN,previousBinding=process.env.MOLLIE_TEST_BINDING,originalFetch=globalThis.fetch;
 let failBalances=false,wrongOrganization=false,revokeDuringSync=false,providerCalls=0;
 t.after(async()=>{globalThis.fetch=originalFetch;if(previousToken===undefined)delete process.env.MOLLIE_TEST_TOKEN;else process.env.MOLLIE_TEST_TOKEN=previousToken;if(previousBinding===undefined)delete process.env.MOLLIE_TEST_BINDING;else process.env.MOLLIE_TEST_BINDING=previousBinding;await fixture`delete from cms_records where id='site-mollie'`;if(saved[0])await fixture`insert into cms_records ${fixture(saved[0])}`;});
 await fixture`delete from cms_records where id='site-mollie'`;
 process.env.MOLLIE_TEST_TOKEN=syntheticToken;process.env.MOLLIE_TEST_BINDING=JSON.stringify(safeBinding);
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.hostname!=='api.mollie.com')return originalFetch(input,init);
  providerCalls++;assert.equal(init?.method,'GET','Configuration/sync never creates a payment');
  if(url.pathname==='/v2/organizations/me'){assert.equal(url.search,'');return Response.json({resource:'organization',id:wrongOrganization?'org_other':'org_fixture'});}
  if(url.pathname==='/v2/profiles'){
   if(revokeDuringSync){revokeDuringSync=false;await fixture`delete from cms_grants where role_id=${manager.role} and module='settings'`;}
   return Response.json({_embedded:{profiles:[{resource:'profile',id:'pfl_fixture',name:'Fictief clubprofiel',website:'https://example.invalid',status:'verified',mode:'test'}]},_links:{next:null}});
  }
  if(url.pathname==='/v2/balances')return failBalances?new Response('',{status:403}):Response.json({_embedded:{balances:[{resource:'balance',id:'bal_fixture',description:'Fictieve EUR-balans',currency:'EUR',status:'active',mode:'test'}]},_links:{next:null}});
  if(url.pathname==='/v2/profiles/pfl_fixture')return Response.json({resource:'profile',id:'pfl_fixture',name:'Fictief clubprofiel',website:'https://example.invalid',status:'verified',mode:'test'});
  if(url.pathname==='/v2/methods')return Response.json({_embedded:{methods:[{id:'ideal',status:'activated'}]}});
  throw Error('Unexpected fixture provider request');
 };
 let state=(await read(manager.cookie)).body;
 await t.test('direct full reads/writes require club settings; summaries require their own financial source read right',async()=>{
  for(const actor of [donor,donorSettingsOnly,sponsor,team]){assert.equal((await read(actor.cookie)).status,403);assert.equal((await command(actor.cookie,{action:'mode',expectedVersion:0,mode:'live'})).status,403);}
  assert.equal((await read(donor.cookie,'?stream=donations')).status,200);assert.equal((await read(donorSettingsOnly.cookie,'?stream=donations')).status,403);assert.equal((await read(donor.cookie,'?stream=sponsors')).status,403);assert.equal((await read(sponsor.cookie,'?stream=sponsors')).status,200);
  assert.equal((await GET(new Request(base+'/api/cms/mollie'))).status,401);
  const wrongOrigin=new Request(base+'/api/cms/mollie',{method:'POST',headers:{cookie:manager.cookie,origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify({action:'mode',mode:'live',expectedVersion:0})});assert.equal((await POST(wrongOrigin)).status,403);
 });
 await t.test('stored connection and catalog survive reload without secrets, demo data or cross-mode exposure',async()=>{
  let result=await command(manager.cookie,{action:'connection',expectedVersion:state.version,mode:'test',authMode:'advanced-token',credentialReference:'MOLLIE_TEST_TOKEN',currentProfileId:''});assert.equal(result.status,200,result.body.message);state=result.body;
  const bad=await command(manager.cookie,{action:'connection',expectedVersion:state.version,mode:'test',authMode:'advanced-token',credentialReference:'SUPABASE_SECRET_KEY',currentProfileId:''});assert.equal(bad.status,422);
  result=await command(manager.cookie,{action:'sync',expectedVersion:state.version,mode:'test'});assert.equal(result.status,200,result.body.message);state=result.body;assert.equal(state.settings.environments.test.catalog.profiles.length,1);assert.equal(state.settings.environments.test.catalog.links.length,0);assert.equal(state.settings.environments.live.catalog.source,'none');assert.equal(state.paymentsEnabled,false);assert.equal(state.executionAllowed,false);assert.ok(!JSON.stringify(state).includes(syntheticToken));
  const reread=await read(manager.cookie);assert.deepEqual(reread.body.settings,state.settings);const [row]=await sql`select live from cms_records where id='site-mollie'`;assert.equal(row.live,null);
 });
 await t.test('a failed page or revoked grant cannot publish a partial/successful catalog',async()=>{
  const before=await readMollieConfiguration();wrongOrganization=true;const mismatch=await command(manager.cookie,{action:'sync',expectedVersion:state.version,mode:'test'});assert.equal(mismatch.status,409);assert.equal(mismatch.body.code,'mollie-organization-mismatch');assert.deepEqual(await readMollieConfiguration(),before);wrongOrganization=false;failBalances=true;const failed=await command(manager.cookie,{action:'sync',expectedVersion:state.version,mode:'test'});assert.equal(failed.status,502);assert.equal(failed.body.code,'mollie-scope');assert.deepEqual(await readMollieConfiguration(),before);failBalances=false;
  revokeDuringSync=true;const revoked=await command(manager.cookie,{action:'sync',expectedVersion:state.version,mode:'test'});assert.equal(revoked.status,403);assert.deepEqual(await readMollieConfiguration(),before);assert.equal((await read(manager.cookie)).status,403);
  for(const action of ['read','update','publish'])await fixture`insert into cms_grants(role_id,module,action) values (${manager.role},'settings',${action})`;
 });
 await t.test('manual profile/balance evidence enables configuration only; snapshot and amount request preserve routing rules',async()=>{
  let result=await command(manager.cookie,{action:'confirm-link',expectedVersion:state.version,mode:'test',profileId:'pfl_fixture',balanceId:'bal_fixture',confirmed:true,evidence:'Fictieve controle van de gekoppelde balans in het Mollie-portaal'});assert.equal(result.status,200,result.body.message);state=result.body;
  const streams=structuredClone(state.settings.environments.test.streams);streams[0]={...streams[0],enabled:true,profileId:'pfl_fixture'};
  result=await command(manager.cookie,{action:'streams',expectedVersion:state.version,mode:'test',streams});assert.equal(result.status,200,result.body.message);state=result.body;
  const route=await resolveMollieServerRoute('sponsors','test');assert.equal(route.route.balance!.id,'bal_fixture');assert.equal(route.credential.binding.organizationId,'org_fixture');assert.equal(route.route.link!.verifiedBy,'manual');
  result=await command(manager.cookie,{action:'preview',expectedVersion:state.version,mode:'test',streamCode:'sponsors',reference:'SP-2026-001',amountCents:1001});assert.equal(result.status,200,result.body.message);assert.equal(result.body.preview.body.amount.value,'10.01');assert.equal(result.body.preview.body.profileId,'pfl_fixture');assert.equal(result.body.preview.body.testmode,true);assert.equal('balanceId' in result.body.preview.body,false);assert.equal(result.body.preview.executionAllowed,false);
  const summary=await read(sponsor.cookie,'?stream=sponsors');assert.equal(summary.status,200);assert.equal(summary.body.available,true);assert.equal('settings' in summary.body,false);assert.equal('catalog' in summary.body,false);assert.equal('bindingId' in summary.body,false);assert.equal(summary.body.paymentsEnabled,false);
  assert.equal((await command(manager.cookie,{action:'remove-stream',expectedVersion:state.version,mode:'test',id:'stream-sponsors'})).status,422);
  assert.equal((await command(manager.cookie,{action:'mode',expectedVersion:0,mode:'live'})).status,409);
 });
 await t.test('ordinary club settings and private bootstrap/generic routes cannot replace or expose the configuration',async()=>{
  const before=await readMollieConfiguration(),p=await principal(new Headers({cookie:manager.cookie})),[club]=await sql`select draft,version from cms_records where id='settings'`;
  await mutate(p,[{id:'settings',module:'settings',expectedVersion:club.version,action:'publish',data:club.draft}],crypto.randomUUID(),crypto.randomUUID());assert.deepEqual(await readMollieConfiguration(),before);
  const donorPrincipal=await principal(new Headers({cookie:donor.cookie})),bootstrap=await loadState(false,donorPrincipal);assert.ok(!JSON.stringify(bootstrap.state).includes('Fictief clubprofiel'));
  const generic=await cmsGet(new Request(base+'/api/cms/mollieSettings/site-mollie',{headers:{cookie:donor.cookie}}),{params:Promise.resolve({path:['mollieSettings','site-mollie']})});assert.equal(generic.status,404);
 });
 await t.test('rotating the trusted credential invalidates catalog, mappings and routes without silently selecting a fallback',async()=>{
  process.env.MOLLIE_TEST_TOKEN='test-rotated-fixture-key-only-no-provider-secret';const current=await read(manager.cookie);assert.equal(current.status,200);assert.equal(current.body.settings.environments.test.catalog.source,'none');assert.equal(current.body.settings.environments.test.streams[0].enabled,false);await assert.rejects(resolveMollieServerRoute('sponsors','test'));assert.ok(providerCalls>0);
 });
});

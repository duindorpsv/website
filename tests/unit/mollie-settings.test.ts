import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMollieSettings,getMollieStreamRoute,mollieCatalogFresh,buildMolliePaymentPreview} from '../../lib/cms/mollie';
import {mollieSettingsSchema} from '../../lib/cms/mollie-schema';
import {fetchMollieCatalog,resolveMollieCredential,requireMollieScopes,type MollieCredential} from '../../lib/server/mollie-provider';
import {canManageMollieServer} from '../../lib/server/mollie-settings';
import type {Principal} from '../../lib/server/permissions';

const stamp=()=>new Date().toISOString();
const credential=(extra:Partial<MollieCredential['binding']>={}):MollieCredential=>({token:'test-unit-secret-never-a-real-key',binding:{id:'binding-unit',clubId:'duindorpsv',organizationId:'org_unit',mode:'test',authMode:'advanced-token',credentialKind:'advanced-access-token',currentProfileId:'',scopes:['profiles.read','balances.read','payments.read'],testmodeParameter:true,...extra}});
function profile(n:number){return {resource:'profile',id:`pfl_${n}`,name:`Profiel ${n}`,website:'https://example.invalid',status:'verified',mode:'test'};}
function balance(n:number){return {resource:'balance',id:`bal_${n}`,description:`Saldo ${n}`,currency:'EUR',status:'active',mode:'test'};}
function page(kind:string,rows:unknown[],next:string|null=null){return Response.json({_embedded:{[kind]:rows},_links:{next:next?{href:next}:null}});}
function settings(){const data=createMollieSettings(),env=data.environments.test;env.credentialReference='MOLLIE_TEST_TOKEN';env.catalog={source:'provider',organizationId:'org_unit',bindingId:'binding-unit',fetchedAt:stamp(),profiles:[{id:'pfl_1',name:'Club',website:'',status:'verified',mode:'test',canReceivePayments:true,readinessCheckedAt:stamp()}],balances:[{id:'bal_1',description:'Clubkas',currency:'EUR',status:'active',mode:'test'}],links:[{profileId:'pfl_1',balanceId:'bal_1',verifiedBy:'manual',verifiedAt:stamp(),evidence:'Gecontroleerd in Mollie-portaal'}]};env.streams[0]={...env.streams[0],enabled:true,profileId:'pfl_1'};return data;}

test('Mollie starts disconnected with no fixtures, independent modes and permanently disabled execution',()=>{
 const value=createMollieSettings();assert.deepEqual(value.environments.test.catalog.profiles,[]);assert.equal(value.environments.live.paymentsEnabled,false);value.environments.test.streams[0].referencePrefix='ONLYTEST';assert.equal(value.environments.live.streams[0].referencePrefix,'SP');assert.equal(mollieSettingsSchema.safeParse(value).success,true);
 const demo=structuredClone(value) as any;demo.environments.test.catalog.source='demo';assert.equal(mollieSettingsSchema.safeParse(demo).success,false);value.environments.live.paymentsEnabled=true as never;assert.equal(mollieSettingsSchema.safeParse(value).success,false);
});
test('routing fails closed for stale/future catalog, wrong mode/currency/status and missing mappings without fallback',()=>{
 assert.equal(getMollieStreamRoute(settings(),'sponsors').available,true);
 for(const change of [(v:ReturnType<typeof settings>)=>{v.environments.test.catalog.fetchedAt=new Date(Date.now()-86460000).toISOString()},(v:ReturnType<typeof settings>)=>{v.environments.test.catalog.fetchedAt=new Date(Date.now()+600000).toISOString()},(v:ReturnType<typeof settings>)=>{v.environments.test.catalog.balances[0].currency='USD'},(v:ReturnType<typeof settings>)=>{v.environments.test.catalog.profiles[0].canReceivePayments=false},(v:ReturnType<typeof settings>)=>{v.environments.test.catalog.links=[]},(v:ReturnType<typeof settings>)=>{v.environments.test.catalog.profiles[0].mode='live'}]){const data=settings();change(data);assert.equal(getMollieStreamRoute(data,'sponsors').available,false);}
 assert.equal(getMollieStreamRoute(settings(),'missing').available,false);assert.equal(getMollieStreamRoute(settings(),'donations').available,false);assert.equal(mollieCatalogFresh({...settings().environments.test.catalog,fetchedAt:'invalid'}),false);
 const preview=buildMolliePaymentPreview(settings(),'sponsors',{reference:'SP-2026-001',amountCents:1001});assert.equal(preview.body.amount.value,'10.01');assert.equal(preview.executionAllowed,false);assert.equal('balanceId' in preview.body,false);assert.equal('profileId' in preview.body,false);assert.equal('testmode' in preview.body,false);
});
test('one account/profile or shared balance gives administrative separation; two different balances keep manual evidence',()=>{
 const data=settings(),env=data.environments.test;env.streams[1]={...env.streams[1],enabled:true,profileId:'pfl_1'};assert.equal(getMollieStreamRoute(data,'sponsors').classification,'administrative');
 env.catalog.profiles.push({...env.catalog.profiles[0],id:'pfl_2'});env.streams[1].profileId='pfl_2';env.catalog.links.push({...env.catalog.links[0],profileId:'pfl_2'});assert.equal(getMollieStreamRoute(data,'sponsors').classification,'administrative');env.catalog.balances.push({...env.catalog.balances[0],id:'bal_2'});env.catalog.links[1].balanceId='bal_2';assert.equal(getMollieStreamRoute(data,'sponsors').classification,'separate-balances');assert.match(getMollieStreamRoute(data,'sponsors').classificationLabel,/registratie/);
});
test('catalog follows all profile and balance pages beyond the prototype limit; readiness is separately checked',async()=>{
 let calls=0;const fetcher=async(input:URL|RequestInfo,init?:RequestInit)=>{calls++;const url=new URL(String(input));assert.equal(init?.redirect,'error');assert.equal(url.origin,'https://api.mollie.com');if(url.pathname==='/v2/profiles'){assert.equal(url.searchParams.has('testmode'),false);return url.searchParams.has('from')?page('profiles',[profile(251)]):page('profiles',Array.from({length:250},(_,i)=>profile(i+1)),'https://api.mollie.com/v2/profiles?from=pfl_251&limit=250');}if(url.pathname==='/v2/balances')return url.searchParams.has('from')?page('balances',[balance(2)]):page('balances',[balance(1)],'https://api.mollie.com/v2/balances?from=bal_2&limit=250&testmode=true');if(url.pathname.startsWith('/v2/profiles/'))return Response.json(profile(Number(url.pathname.split('/').at(-1)!.slice(4))));if(url.pathname==='/v2/methods')return page('methods',[{id:'ideal',status:url.searchParams.get('profileId')==='pfl_251'?'pending-review':'activated'}]);throw Error('Unexpected fixture request');};
 const result=await fetchMollieCatalog(credential(),fetcher as typeof fetch);assert.equal(result.profiles.length,251);assert.equal(result.balances.length,2);assert.equal(result.links.length,0);assert.equal(result.source,'provider');assert.equal(result.bindingId,'binding-unit');assert.equal(result.profiles[250].canReceivePayments,false);assert.equal(calls,506);
});
test('partial pages, duplicate ids, mode drift, pagination token exfiltration and scope errors reject the entire catalog',async()=>{
 for(const next of ['https://evil.example/v2/profiles?from=pfl_2','https://api.mollie.com/v2/balances?from=bal_2','https://api.mollie.com/v2/profiles?from=pfl_2&unexpected=true']){let calls=0;await assert.rejects(fetchMollieCatalog(credential(),(async()=>{calls++;return page('profiles',[profile(1)],next)}) as typeof fetch));assert.equal(calls,1);}
 await assert.rejects(fetchMollieCatalog(credential(),(async(input:URL|RequestInfo)=>{const url=new URL(String(input));return url.pathname==='/v2/profiles'?page('profiles',[profile(1)]):new Response('',{status:403})}) as typeof fetch),(error:any)=>error.code==='mollie-scope');
 await assert.rejects(fetchMollieCatalog(credential(),(async()=>page('profiles',[profile(1),profile(1)])) as typeof fetch));
 assert.throws(()=>requireMollieScopes(credential({scopes:['profiles.read']}),['balances.read']));assert.throws(()=>requireMollieScopes(credential({credentialKind:'profile-api-key',scopes:[]}),['payments.read']));
});
test('profile API keys read only their current profile, never send profileId/testmode and never invent balances',async()=>{
 const c=credential({authMode:'profile-api-key',credentialKind:'profile-api-key',currentProfileId:'pfl_1',testmodeParameter:false});const requests:string[]=[];
 const result=await fetchMollieCatalog(c,(async(input:URL|RequestInfo)=>{const url=new URL(String(input));requests.push(url.pathname);assert.equal(url.searchParams.has('testmode'),false);assert.equal(url.searchParams.has('profileId'),false);return url.pathname==='/v2/profiles/me'?Response.json(profile(1)):page('methods',[{id:'ideal',status:'activated'}]);}) as typeof fetch);
 assert.deepEqual(requests,['/v2/profiles/me','/v2/methods']);assert.equal(result.profiles.length,1);assert.deepEqual(result.balances,[]);assert.deepEqual(result.links,[]);
});
test('credential allowlist, club/account/mode binding and rotation cannot be chosen by the browser',()=>{
 const originalToken=process.env.MOLLIE_TEST_TOKEN,originalBinding=process.env.MOLLIE_TEST_BINDING;
 try{delete process.env.MOLLIE_TEST_TOKEN;delete process.env.MOLLIE_TEST_BINDING;assert.throws(()=>resolveMollieCredential('test'));
  process.env.MOLLIE_TEST_TOKEN='test-unit-secret-never-a-real-key';const {id,...safe}=credential().binding;void id;process.env.MOLLIE_TEST_BINDING=JSON.stringify(safe);const one=resolveMollieCredential('test');assert.equal(one.binding.organizationId,'org_unit');assert.doesNotMatch(JSON.stringify(one.binding),/secret-never/);process.env.MOLLIE_TEST_TOKEN='test-another-unit-secret-not-real';assert.throws(()=>resolveMollieCredential('test',one.binding.id));process.env.MOLLIE_TEST_BINDING=JSON.stringify({...safe,mode:'live'});assert.throws(()=>resolveMollieCredential('test'));
 }finally{if(originalToken===undefined)delete process.env.MOLLIE_TEST_TOKEN;else process.env.MOLLIE_TEST_TOKEN=originalToken;if(originalBinding===undefined)delete process.env.MOLLIE_TEST_BINDING;else process.env.MOLLIE_TEST_BINDING=originalBinding;}
});
test('donor or sponsor administration never grants central payment settings; team settings remain restricted',()=>{
 const p=(module:string,action:string,teamScoped=false):Principal=>({id:'fixture',name:'Fixture',email:'fixture@example.invalid',roleId:'fixture',teamScoped,teams:[],departments:[],grants:[{module,action}],mfa:false});
 assert.equal(canManageMollieServer(p('settings','update')),true);assert.equal(canManageMollieServer(p('settings','read')),false);assert.equal(canManageMollieServer(p('donors','settings')),false);assert.equal(canManageMollieServer(p('sponsors','manage')),false);assert.equal(canManageMollieServer(p('settings','manage',true)),false);
});

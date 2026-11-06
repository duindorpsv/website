import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mollieAmount,sourceStream,mollieCreateBody,performMollieCreate,verifyMolliePayment,type MollieAttemptSnapshot} from '../../lib/server/mollie-payment-core';
import type {MollieCredential} from '../../lib/server/mollie-provider';
const credential:MollieCredential={token:'test-fixture-credential-never-used',binding:{id:'binding-test',clubId:'duindorpsv',organizationId:'org_fixture',mode:'test',authMode:'advanced-token',credentialKind:'oauth',currentProfileId:'',scopes:['payments.read','payments.write'],testmodeParameter:true}};
const frozen:Omit<MollieAttemptSnapshot,'request'>={id:'attempt-fixture',source:{kind:'donors',id:'invoice-fixture',number:'D-2026-001',amountCents:1001},clubId:'duindorpsv',organizationId:'org_fixture',mode:'test',streamCode:'donations',profileId:'pfl_fixture',expectedBalanceId:'bal_fixture',linkVerification:'manual',linkVerifiedAt:'2026-11-06T00:00:00Z',catalogFetchedAt:'2026-11-06T00:00:00Z',configVersion:3,configHash:'config-fixture',credentialBindingId:'binding-test',idempotencyKey:'duindorp-fixture',reference:'DON · D-2026-001',createdAt:new Date().toISOString()};
const attempt=():MollieAttemptSnapshot=>({...structuredClone(frozen),request:mollieCreateBody(frozen,credential,'https://example.invalid')});
const payment=()=>({id:'tr_fixture',profileId:'pfl_fixture',mode:'test',amount:{currency:'EUR',value:'10.01'},metadata:attempt().request.metadata as Record<string,string>,status:'paid',_embedded:{refunds:[],chargebacks:[]}});
test('payment amounts use exact integer decimal conversion and streams follow the financial source',()=>{
 assert.equal(mollieAmount(1),'0.01');assert.equal(mollieAmount(1001),'10.01');assert.equal(mollieAmount(Number.MAX_SAFE_INTEGER),'90071992547409.91');
 for(const value of [0,-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>mollieAmount(value));
 assert.equal(sourceStream('donors'),'donations');assert.equal(sourceStream('sponsors'),'sponsors');
});
test('ordinary payment create uses profile routing, never a balance destination',()=>{
 const body=attempt().request;assert.equal(body.profileId,'pfl_fixture');assert.equal(body.testmode,true);assert.equal('balanceId' in body,false);assert.equal(JSON.stringify(body).includes('bal_fixture'),false);
 const bound={token:'test_profile_fixture',binding:{...credential.binding,authMode:'profile-api-key' as const,credentialKind:'profile-api-key' as const,currentProfileId:'pfl_fixture',testmodeParameter:false}};
 const profileBody=mollieCreateBody(frozen,bound,'https://example.invalid');assert.equal('profileId' in profileBody,false);assert.equal('testmode' in profileBody,false);
 const modeBound={...credential,binding:{...credential.binding,testmodeParameter:false}};assert.equal('testmode' in mollieCreateBody(frozen,modeBound,'https://example.invalid'),false);
 assert.throws(()=>mollieCreateBody(frozen,{...bound,binding:{...bound.binding,currentProfileId:'pfl_other'}},'https://example.invalid'));
});
test('a timed-out create retries exactly the same body and provider idempotency key',async()=>{
 const calls:RequestInit[]=[],snapshot=attempt();let call=0;
 const transport:typeof fetch=async(url,init)=>{assert.equal(url,'https://api.mollie.com/v2/payments');calls.push(init!);if(++call===1)throw Error('synthetic timeout');return Response.json({id:'tr_fixture'});};
 await assert.rejects(performMollieCreate(snapshot,credential,transport),(error:any)=>error.code==='payment-uncertain');
 assert.equal((await performMollieCreate(snapshot,credential,transport)).id,'tr_fixture');assert.equal(calls[0].body,calls[1].body);assert.deepEqual(calls[0].headers,calls[1].headers);assert.equal((calls[0].headers as any)['Idempotency-Key'],snapshot.idempotencyKey);
 assert.equal(snapshot.credentialBindingId,'binding-test');assert.equal(snapshot.expectedBalanceId,'bal_fixture');
});
test('credential rotation and all provider identity mismatches fail closed',()=>{
 const original=payment();for(const change of [{id:'tr_other'},{mode:'live'},{profileId:'pfl_other'},{amount:{currency:'USD',value:'10.01'}},{amount:{currency:'EUR',value:'10.02'}},{metadata:{...original.metadata,sourceId:'other'}},{metadata:{...original.metadata,streamCode:'sponsors'}},{metadata:{...original.metadata,reference:'other'}},{metadata:{...original.metadata,mode:'live'}},{metadata:{...original.metadata,attemptId:'other'}}])assert.throws(()=>verifyMolliePayment(attempt(),credential,{...original,...change},'tr_fixture'));
 for(const change of [{id:'rotated'},{organizationId:'org_other'},{clubId:'other'},{mode:'live'}])assert.throws(()=>verifyMolliePayment(attempt(),{...credential,binding:{...credential.binding,...change} as any},original,'tr_fixture'));
});
test('only verified full payments settle; refunds, chargebacks and missing evidence require review',()=>{
 assert.deepEqual(verifyMolliePayment(attempt(),credential,payment(),'tr_fixture'),{status:'paid',settle:true,review:false});
 for(const change of [{amountRefunded:{currency:'EUR',value:'0.01'}},{amountChargedBack:{currency:'EUR',value:'1.00'}},{_embedded:undefined},{_embedded:{refunds:[{id:'re_fixture'}],chargebacks:[]}},{_embedded:{refunds:[],chargebacks:[{id:'chb_fixture'}]}}])assert.equal(verifyMolliePayment(attempt(),credential,{...payment(),...change},'tr_fixture').review,true);
 for(const status of ['open','pending','authorized','failed','canceled','expired'])assert.equal(verifyMolliePayment(attempt(),credential,{...payment(),status},'tr_fixture').settle,false);
});

test('expired provider idempotency window requires reconciliation without another create',async()=>{
 let called=false;const old={...attempt(),createdAt:new Date(Date.now()-56*60_000).toISOString()};
 await assert.rejects(performMollieCreate(old,credential,async()=>{called=true;return Response.json({id:'tr_duplicate'});}),(error:any)=>error.code==='payment-reconciliation');assert.equal(called,false);
});

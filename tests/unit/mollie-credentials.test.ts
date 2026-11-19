import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealMollieCredential,unsealMollieCredential} from '../../lib/server/mollie-credentials';
import {verifyMollieProfileKey,readMollieCredential} from '../../lib/server/mollie-provider';

const apiKey='test_abcdefghijklmnopqrstuvwxyz123456';
const fetcher:typeof fetch=async(input,init)=>{
 const url=new URL(String(input));assert.equal(url.origin,'https://api.mollie.com');assert.equal(init?.method,'GET');assert.equal(url.searchParams.has('profileId'),false);assert.equal(url.searchParams.has('testmode'),false);
 if(url.pathname==='/v2/profiles/me')return Response.json({resource:'profile',id:'pfl_fixture',name:'Fictieve club',website:'https://example.invalid',status:'verified',mode:'test'});
 assert.equal(url.pathname,'/v2/methods');return Response.json({_embedded:{methods:[{id:'ideal'}]}});
};
test('profile API keys are verified without a payment, and unknown mode or mismatched profile mode fails closed',async()=>{
 const {credential,catalog}=await verifyMollieProfileKey('test',apiKey,fetcher);
 assert.equal(credential.binding.currentProfileId,'pfl_fixture');assert.equal(catalog.organizationId,'');assert.equal(catalog.profiles[0].canReceivePayments,true);assert.deepEqual(catalog.balances,[]);
 assert.ok(!JSON.stringify(credential.binding).includes(apiKey));
 await assert.rejects(verifyMollieProfileKey('live',apiKey,fetcher),(error:any)=>error.code==='mollie-key');
 await assert.rejects(verifyMollieProfileKey('test',apiKey,async()=>Response.json({resource:'profile',id:'pfl_fixture',name:'Club',status:'verified',mode:'live'})),(error:any)=>error.code==='mollie-response');
});
test('stored credentials use randomized authenticated encryption bound to mode, profile and masked metadata',async t=>{
 const previous=process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SECRET_KEY='synthetic-server-encryption-key';t.after(()=>{if(previous===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=previous;});
 const {credential}=await verifyMollieProfileKey('test',apiKey,fetcher),one=sealMollieCredential(credential),two=sealMollieCredential(credential);
 assert.notEqual(one.iv,two.iv);assert.notEqual(one.ciphertext,two.ciphertext);assert.ok(!JSON.stringify(one).includes(apiKey));assert.equal(one.keyPreview,'test_••••3456');
 const row={mode:'test',binding_id:credential.binding.id,binding:one.binding,key_preview:one.keyPreview,ciphertext:one.ciphertext,iv:one.iv,auth_tag:one.authTag};
 assert.equal(unsealMollieCredential(row).token,apiKey);
 const database:any=async()=>[row];assert.equal((await readMollieCredential('test',credential.binding.id,database)).token,apiKey);
 for(const patch of [{mode:'live'},{binding_id:'0'.repeat(64)},{binding:{...one.binding,currentProfileId:'pfl_other'}},{key_preview:'test_••••0000'},{auth_tag:Buffer.alloc(16).toString('base64')},{ciphertext:Buffer.from('tampered').toString('base64')}])assert.throws(()=>unsealMollieCredential({...row,...patch}),(error:any)=>error.code==='mollie-credential-unavailable'&&!error.message.includes(apiKey));
 process.env.SUPABASE_SECRET_KEY='synthetic-rotated-encryption-key';assert.throws(()=>unsealMollieCredential(row),(error:any)=>error.code==='mollie-credential-unavailable');
});

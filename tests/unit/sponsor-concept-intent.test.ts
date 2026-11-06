import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSponsorConceptIntent,confirmSponsorConceptIntent,refreshSponsorConceptIntent,type SponsorConceptIntent} from '../../lib/cms/sponsor-concept-intent';
test('POST queue receipt blocks another create after subsequent GET fails until the recorded version loads',async()=>{
 let intent:SponsorConceptIntent|undefined,posts=0,allocated=0;const payload={action:'create',recipient:'sponsor@example.invalid',expectedHash:'same-snapshot'};
 async function send(refresh:()=>Promise<string[]>){intent=prepareSponsorConceptIntent(intent,payload,()=>`operation-${++allocated}`);posts++;intent=confirmSponsorConceptIntent(intent,'recorded-version');intent=refreshSponsorConceptIntent(intent,await refresh());}
 await assert.rejects(send(async()=>{throw new Error('GET unavailable')}),/GET unavailable/);assert.equal(intent?.deliveryId,'recorded-version');
 await assert.rejects(send(async()=>['recorded-version']),/al in de verzendwachtrij/);assert.equal(posts,1);assert.equal(allocated,1);
 intent=refreshSponsorConceptIntent(intent,[]);assert.ok(intent,'A stale refresh without the receipt must retain the send guard');
 intent=refreshSponsorConceptIntent(intent,['recorded-version']);assert.equal(intent,undefined);
 // Only the explicit new-composition action can now allocate a second operation.
 const next=prepareSponsorConceptIntent(intent,payload,()=>`operation-${++allocated}`);assert.equal(next.id,'operation-2');
});
test('uncertain POST response retries retain the same operation identity for the same payload',()=>{const payload={action:'create',message:'Please discuss'};const intent=prepareSponsorConceptIntent(undefined,payload,()=> 'stable-operation');assert.equal(prepareSponsorConceptIntent(intent,payload,()=>{throw Error('must not allocate another operation')}),intent);});

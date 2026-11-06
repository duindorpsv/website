import test from 'node:test';
import assert from 'node:assert/strict';
import {sponsorV72Fixture,committee,signer} from '../helpers/sponsor-v72-fixture';
import * as model from '../../lib/cms/sponsorship';

function reverseKeys<T>(value:T):T{return (Array.isArray(value)?value.map(reverseKeys):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,entry])=>[key,reverseKeys(entry)])):value) as T;}

test('sent and accepted proposals recheck active items before conversion and preserve valid frozen values and key order',()=>{
 for(const status of ['sent','accepted'] as const){
  const state=sponsorV72Fixture(),data=state.sponsorship!,proposal=model.createSponsorProposal(state,committee,'sponsor-dg','package-clubvriend');
  proposal.lines[0].unitPriceCents=12345;proposal.lines[0].addition='Een vastgelegde maatwerkafspraak';
  model.sendSponsorProposal(state,committee,proposal.id);
  if(status==='accepted')model.acceptSponsorProposal(state,signer,proposal.id);
  proposal.snapshot=reverseKeys(proposal.snapshot!);
  const bytes=JSON.stringify(proposal.snapshot),hash=model.sponsorDocumentHash(bytes),oldBody=proposal.snapshot.contract!.body;
  data.items[0].priceCents=99999;data.items[0].name='Nieuwe catalogusnaam';data.items[0].active=false;
  data.contractTemplates=[{...model.createDefaultSponsorContractTemplate(),body:'Nieuwe voorwaarden voor toekomstige concepten.'}];
  const before=JSON.stringify(state);
  assert.throws(()=>model.getSponsorAgreementDraftSource(state,committee,proposal.id),/niet actief/,status);
  assert.throws(()=>model.createSponsorAgreementFromDraft(state,committee,proposal.id,hash),/niet actief/,status);
  assert.equal(JSON.stringify(state),before,'Failed confirmation must not mutate a frozen proposal or allocate a document');
  data.items[0].active=true;
  const source=model.getSponsorAgreementDraftSource(state,committee,proposal.id);
  assert.equal(JSON.stringify(source.snapshot),bytes);assert.equal(source.documentHash,hash);
  const agreement=model.createSponsorAgreementFromDraft(state,committee,proposal.id,hash);
  assert.equal(model.sponsorSnapshotBytes(agreement),bytes);assert.equal(agreement.documentHash,hash);
  assert.equal(agreement.snapshot.lines[0].unitPriceCents,12345);assert.equal(agreement.snapshot.contract!.body,oldBody);
  assert.equal(JSON.stringify(proposal.snapshot),bytes);assert.equal(data.agreements.length,1);
 }
});

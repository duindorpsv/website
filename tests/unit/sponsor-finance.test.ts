import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateSponsorTotals,createSponsorInvoicePlan,createSponsorshipSeed,sponsorDocumentHash,sponsorSnapshotBytes} from '../../lib/cms/sponsorship';
import {createDefaultSponsorContractTemplate,renderSponsorContractTemplate,SPONSOR_CONTRACT_SHORTCODES,validateSponsorContractTemplate} from '../../lib/cms/sponsor-contracts';
import {sponsorshipSchema} from '../../lib/cms/sponsorship-schema';
import {emptyState} from '../../lib/server/records';
import type {SponsorAgreement,SponsorLine} from '../../lib/cms/sponsorship-types';
const lines:SponsorLine[]=['21','9','0','exempt'].map((rate,i)=>({id:'line-'+i,itemId:'item-'+i,name:'Test '+rate,description:'',quantity:i+1,unitPriceCents:1001+i,taxRate:rate as SponsorLine['taxRate']}));
test('whole-cent discounts, separate zero/exempt groups and monthly instalments conserve net, VAT and total exactly',()=>{
 const state=emptyState();state.sponsorship=createSponsorshipSeed();state.roles=[{id:'committee',name:'Commissie',description:'',teamScoped:false,permissions:['sponsors']}];state.members=[{id:'actor',name:'Test',email:'fictief@example.invalid',active:true,roleId:'committee',teamIds:[]}];
 const snapshot={name:'Test',sponsorName:'Fictief',sponsorAddress:'Test',sponsorEmail:'fictief@example.invalid',season:'2026',startDate:'2026-01-01',endDate:'2030-01-01',paymentTerms:'',terms:'',lines,discountCents:127,capturedAt:new Date().toISOString()};
 const agreement:SponsorAgreement={id:'agreement',sponsorId:'company',proposalId:'proposal',number:'DSV-test',version:1,status:'signed',signingMode:'dual-email-otp',snapshot,documentHash:sponsorDocumentHash(JSON.stringify(snapshot)),signatures:['sponsor','club'].map((party,i)=>({id:'signature-'+i,userId:'account-'+i,name:'Fictief',function:'Test',at:new Date().toISOString(),ipAddress:'',party:party as 'sponsor'|'club',verification:'email-otp',documentHash:sponsorDocumentHash(JSON.stringify(snapshot)),consent:true,demo:false})),createdAt:new Date().toISOString(),signedAt:new Date().toISOString()};
 state.sponsorship.agreements=[agreement];const total=calculateSponsorTotals(lines,127);
 assert.equal(total.subtotalCents,10030);assert.equal(total.netCents,9903);assert.equal(total.taxGroups.length,4);assert.deepEqual(total.taxGroups.map(g=>g.taxRate),['21','9','0','exempt']);
 for(const count of [1,2,3,4,6,12] as const){state.sponsorship.invoices=[];const invoices=createSponsorInvoicePlan(state,'actor',agreement.id,{firstDueDate:'2030-01-31',count});
  assert.equal(invoices.reduce((n,i)=>n+i.totalCents,0),total.totalCents);assert.equal(invoices.reduce((n,i)=>n+i.totals!.netCents,0),total.netCents);assert.equal(invoices.reduce((n,i)=>n+i.totals!.taxCents,0),total.taxCents);
  for(const group of total.taxGroups)assert.equal(invoices.reduce((n,i)=>n+i.totals!.taxGroups.find(g=>g.taxRate===group.taxRate)!.taxCents,0),group.taxCents);
 }
 assert.throws(()=>calculateSponsorTotals([{...lines[0],quantity:Number.MAX_SAFE_INTEGER}],0),/te groot/);
});
test('template shortcodes are bounded, text-only and single-pass even when the company name contains HTML or another shortcode',()=>{
 const template={...createDefaultSponsorContractTemplate(),title:'{{bedrijf.naam}}',body:'{{bedrijf.naam}} — {{club.naam}}'};
 assert.equal(SPONSOR_CONTRACT_SHORTCODES.length,22);
 const rendered=renderSponsorContractTemplate(template,{'bedrijf.naam':'<script>{{club.naam}}</script>','club.naam':'Duindorp SV'});
 assert.equal(rendered.title,'<script>{{club.naam}}</script>');assert.equal(rendered.body,'<script>{{club.naam}}</script> — Duindorp SV');
 assert.throws(()=>validateSponsorContractTemplate({...template,body:'{{onbekend}}'}),/Onbekende/);assert.throws(()=>validateSponsorContractTemplate({...template,body:'{{bedrijf.naam}'}),/gesloten/);
});
test('original UTF-8 document bytes survive JSONB key reordering, schema parsing and repeated export; semantic edits fail',()=>{
 const state=createSponsorshipSeed(),snapshot={name:'Overeenkomst ééntje',sponsorName:'Fictief BV',sponsorAddress:'Test',sponsorEmail:'fictief@example.invalid',season:'2026',startDate:'2026-01-01',endDate:'2026-12-31',paymentTerms:'30 dagen',terms:'Één afspraak',lines:[],discountCents:0,capturedAt:'2026-10-22T09:00:00.000Z'},bytes=JSON.stringify(snapshot);
 const agreement:SponsorAgreement={id:'legacy',sponsorId:'company',proposalId:'proposal',number:'DSV-HIST',version:1,status:'awaiting-signature',snapshot:Object.fromEntries(Object.entries(snapshot).reverse()) as typeof snapshot,snapshotBytes:bytes,hashFormat:'json-utf8-v1',documentHash:sponsorDocumentHash(bytes),signatures:[],createdAt:'2026-10-22T09:00:00.000Z',signedAt:''};
 assert.equal(sponsorSnapshotBytes(agreement),bytes);
 const parsed=sponsorshipSchema.innerType().shape.agreements.parse([agreement])[0];assert.equal(sponsorSnapshotBytes(parsed),bytes);assert.equal(sponsorSnapshotBytes(JSON.parse(JSON.stringify(parsed))),bytes);
 assert.throws(()=>sponsorSnapshotBytes({...agreement,snapshot:{...agreement.snapshot,terms:'Gewijzigd'}}),/overeen/);
 assert.equal(state.sponsors.length,0);assert.equal(state.memberships.length,0);assert.equal(state.agreements.length,0);
});

test('public sponsor periods reject rollover, year zero and datetime inputs before PostgreSQL date filters',()=>{
 const sponsor={id:'calendar-proof',name:'Fictieve datumcontrole',companyNumber:'',vatNumber:'',address:'',postalCode:'',city:'',email:'',phone:'',website:'',description:'',logoUrl:'',ownerId:'actor',stage:'lead',notes:'',publicProfile:{name:'Fictief',description:'',website:'',logoUrl:''},publicEnabled:true,publicFrom:'',publicUntil:'',createdAt:'2026-10-22T09:00:00Z',updatedAt:'2026-10-22T09:00:00Z',demo:false};
 const schema=sponsorshipSchema.innerType().shape.sponsors;
 for(const date of ['2026-02-31','2025-02-29','0000-01-01','2026-10-22T10:00:00Z'])assert.equal(schema.safeParse([{...sponsor,publicFrom:date}]).success,false);
 for(const date of ['', '2028-02-29', '2026-10-22'])assert.equal(schema.safeParse([{...sponsor,publicFrom:date}]).success,true);
});

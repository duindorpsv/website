import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../../lib/server/records';
import {createSponsorshipSeed,createSponsorInvoice,createSponsorInvoicePlan,calculateSponsorTotals,sponsorDocumentHash} from '../../lib/cms/sponsorship';
import {getInvoiceNumbering,getNextInvoiceSequence,nextInvoiceNumber,reserveInvoiceNumbers,saveInvoiceNumberingSettings,canManageInvoiceSeries} from '../../lib/cms/invoice-numbering';
import type {InvoiceNumberingSettings} from '../../lib/cms/invoice-numbering';
import type {SponsorAgreement,SponsorInvoice,DonorInvoice,SponsorLine} from '../../lib/cms/sponsorship-types';
import {captureDomainCommands} from '../../lib/cms/domain-commands';
const actor='numbering-actor';
function state(){const s=emptyState();s.sponsorship=createSponsorshipSeed();s.roles=[{id:'numbering',name:'Fictief',description:'',teamScoped:false,permissions:['sponsors','donors','donors-settings']}];s.members=[{id:actor,name:'Fictief',email:'test@example.invalid',roleId:'numbering',teamIds:[],active:true}];return s;}
function history(s:ReturnType<typeof state>,source:'sponsors'|'donors',number:string){if(source==='sponsors')s.sponsorship!.invoices.push({id:'historical-'+number,number,status:'cancelled'} as SponsorInvoice);else (s.sponsorship!.donors??={people:[],contributions:[],invoices:[]}).invoices.push({id:'historical-'+number,number,status:'cancelled'} as DonorInvoice);}

test('independent series use invoice years and all historical sources including cancelled and case variations',()=>{
 const s=state(),d=s.sponsorship!;history(s,'sponsors','DSV-F-2026-001');history(s,'sponsors','DSV-F-2026-002');history(s,'donors','dsv-f-2026-0009');history(s,'sponsors','dsv-d-2026-005');assert.equal(nextInvoiceNumber(d,'sponsors','2026-12-31'),'DSV-F-2026-010');assert.equal(nextInvoiceNumber(d,'donors','2026-01-01'),'DSV-D-2026-006');assert.equal(nextInvoiceNumber(d,'donors','2027-01-01'),'DSV-D-2027-001');assert.equal(nextInvoiceNumber(d,'donors','2025-01-01'),'DSV-D-2025-001');assert.equal(d.settings.invoiceNumbering,undefined);
 assert.deepEqual(reserveInvoiceNumbers(d,'sponsors','2026-12-31',3),['DSV-F-2026-010','DSV-F-2026-011','DSV-F-2026-012']);assert.equal(getNextInvoiceSequence(d,'sponsors','2026'),13);assert.equal(getNextInvoiceSequence(d,'donors','2026'),6);
});

test('custom prefix and width survive persistence without changing older numbers or the other series',()=>{
 const s=state(),d=s.sponsorship!;history(s,'donors','DSV-D-2026-001');const older=JSON.stringify(d.donors!.invoices),sponsorSeries=getInvoiceNumbering(d).sponsors;
 saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'DON',digits:4,nextByYear:{2026:25}}});assert.equal(nextInvoiceNumber(d,'donors','2026-11-06'),'DON-2026-0025');reserveInvoiceNumbers(d,'donors','2026-11-06');const copy=JSON.parse(JSON.stringify(d));assert.equal(nextInvoiceNumber(copy,'donors','2026-11-07'),'DON-2026-0026');assert.deepEqual(getInvoiceNumbering(d).sponsors,sponsorSeries);assert.equal(JSON.stringify(d.donors!.invoices),older);
 history(s,'sponsors','don-2026-0099');assert.equal(nextInvoiceNumber(d,'donors','2026-11-08'),'DON-2026-0100');
});

test('invalid series, date, year and batch fail atomically and the last permitted sequence is usable once',()=>{
 const s=state(),d=s.sponsorship!;
 for(const change of [{prefix:''},{prefix:'-BAD'},{prefix:'BAD-'},{prefix:'x'.repeat(31)},{prefix:'DSV-F'},{prefix:'dSv-F'},{digits:0},{digits:9},{digits:1.1},{nextByYear:{2026:0}},{nextByYear:{2026:1.1}},{nextByYear:{2026:1_000_000_000}},{nextByYear:{'0000':1}},{nextByYear:{'202':1}}]){const input={...getInvoiceNumbering(d).donors,...change};assert.throws(()=>saveInvoiceNumberingSettings(s,actor,{donors:input} as Partial<InvoiceNumberingSettings>));assert.equal(d.settings.invoiceNumbering,undefined);}
 for(const date of ['2026','0000-01-01','1899-12-31','2026-02-29','10000-01-01'])assert.throws(()=>reserveInvoiceNumbers(d,'donors',date));assert.equal(d.settings.invoiceNumbering,undefined);
 saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'LAST',digits:3,nextByYear:{2026:999_999_999}}});const before=JSON.stringify(d.settings.invoiceNumbering);assert.throws(()=>reserveInvoiceNumbers(d,'donors','2026-11-06',2));assert.equal(JSON.stringify(d.settings.invoiceNumbering),before);const [last]=reserveInvoiceNumbers(d,'donors','2026-11-06');assert.equal(last,'LAST-2026-999999999');assert.throws(()=>reserveInvoiceNumbers(d,'donors','2026-11-06'));history(s,'donors',last);assert.throws(()=>reserveInvoiceNumbers(d,'donors','2026-11-06'));assert.equal(d.settings.invoiceNumbering!.donors.nextByYear['2026'],999_999_999);assert.throws(()=>saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'LAST',digits:3,nextByYear:{2026:999_999_999},exhaustedYears:[]}}),/uitgeput/);saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'OTHER',digits:4,nextByYear:{2026:999_999_999}}});assert.deepEqual(getInvoiceNumbering(d).donors.exhaustedYears,['2026']);assert.throws(()=>nextInvoiceNumber(d,'donors','2026-11-06'),/uitgeput/);assert.equal(nextInvoiceNumber(d,'donors','2027-01-01'),'OTHER-2027-0001');
});

test('a reserved year cannot be removed or reduced, and partial settings never authorize a foreign series',()=>{
 const s=state(),d=s.sponsorship!;saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'DON',digits:3,nextByYear:{2026:25,2027:1}}});const before=JSON.stringify(d.settings.invoiceNumbering);
 for(const nextByYear of [{2026:24,2027:1},{2026:25},{2027:1}] as Record<string,number>[])assert.throws(()=>saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'DON',digits:3,nextByYear}}));assert.equal(JSON.stringify(d.settings.invoiceNumbering),before);
 s.roles[0].permissions=['donors','donors-settings'];assert.equal(canManageInvoiceSeries(s,actor,'donors'),true);assert.equal(canManageInvoiceSeries(s,actor,'sponsors'),false);assert.throws(()=>saveInvoiceNumberingSettings(s,actor,{sponsors:getInvoiceNumbering(d).sponsors}),/rechten/);saveInvoiceNumberingSettings(s,actor,{donors:{prefix:'GIFT',digits:4,nextByYear:{2026:26,2027:1}}});assert.equal(getInvoiceNumbering(d).sponsors.prefix,'DSV-F');
 s.members[0].active=false;assert.throws(()=>saveInvoiceNumberingSettings(s,actor,{donors:getInvoiceNumbering(d).donors}),/rechten/);
});

function signedAgreement(s:ReturnType<typeof state>){const lines:SponsorLine[]=[{id:'21',itemId:'board',name:'Bord',description:'',quantity:1,unitPriceCents:30001,taxRate:'21',setupCostCents:1000},{id:'9',itemId:'other',name:'Overig',description:'',quantity:1,unitPriceCents:10001,taxRate:'9'}],snapshot={name:'Fictieve overeenkomst',sponsorName:'Fictief',sponsorAddress:'',sponsorEmail:'test@example.invalid',season:'2026',startDate:'2026-01-01',endDate:'2030-12-31',paymentTerms:'',terms:'',lines,discountCents:101,capturedAt:'2026-11-06T00:00:00.000Z'},documentHash=sponsorDocumentHash(JSON.stringify(snapshot));const a:SponsorAgreement={id:'agreement-test',sponsorId:'company-test',proposalId:'',number:'AG-1',version:1,status:'signed',signingMode:'dual-email-otp',snapshot,documentHash,signatures:['sponsor','club'].map((party,i)=>({id:'sign-'+i,userId:'account-'+i,name:'Fictief',function:'Test',at:'2026-11-06T00:00:00.000Z',ipAddress:'',party:party as 'sponsor'|'club',verification:'email-otp',documentHash,consent:true,demo:false})),createdAt:'2026-11-06T00:00:00.000Z',signedAt:'2026-11-06T00:00:00.000Z'};s.sponsorship!.agreements=[a];return a;}

test('real sponsor invoice mutations use configured sequences and validate a complete installment batch first',()=>{
 const s=state(),d=s.sponsorship!,a=signedAgreement(s),year=new Date().toISOString().slice(0,4);saveInvoiceNumberingSettings(s,actor,{sponsors:{prefix:'SPON',digits:4,nextByYear:{[year]:25}}});const previous=JSON.stringify(d.settings.invoiceNumbering);
 assert.throws(()=>createSponsorInvoice(s,actor,a.id,'2030'));assert.equal(JSON.stringify(d.settings.invoiceNumbering),previous);assert.throws(()=>createSponsorInvoicePlan(s,actor,a.id,{count:12,firstDueDate:'9999-12-31'}));assert.equal(JSON.stringify(d.settings.invoiceNumbering),previous);
 const invoices=createSponsorInvoicePlan(s,actor,a.id,{count:3,firstDueDate:'2030-01-31'});assert.deepEqual(invoices.map(row=>row.number),[25,26,27].map(n=>`SPON-${year}-${String(n).padStart(4,'0')}`));assert.equal(invoices.reduce((sum,row)=>sum+row.totalCents,0),calculateSponsorTotals(a.snapshot.lines,a.snapshot.discountCents).totalCents);assert.equal(getNextInvoiceSequence(d,'sponsors',year),28);
 const separate=state(),b=signedAgreement(separate);saveInvoiceNumberingSettings(separate,actor,{sponsors:{prefix:'ONE',digits:5,nextByYear:{[year]:8}}});assert.equal(createSponsorInvoice(separate,actor,b.id,'2030-01-31').number,`ONE-${year}-00008`);
 const captured=captureDomainCommands('number-settings-operation',()=>saveInvoiceNumberingSettings(separate,actor,{donors:{prefix:'GIFT',digits:4,nextByYear:{2026:1}}}));assert.deepEqual(captured.commands.map(row=>row.name),['saveInvoiceNumberingSettings']);
});

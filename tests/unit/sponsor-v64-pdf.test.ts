import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildSponsorAgreementPdf,buildSponsorInvoicePdf,sponsorAgreementPdfSource,sponsorPdfPricingRows} from '../../lib/cms/sponsor-pdf';
import {calculateSponsorProposalTotals,sponsorDocumentHash} from '../../lib/cms/sponsorship';
import {sponsorPdfFixture} from '../helpers/sponsor-pdf-fixture';

async function assets(){
 const [logoPng,bodyFont,boldFont,headingFont,brushFont]=await Promise.all(['assets/logo.png','fonts/club-font-4.ttf','fonts/club-font-7.ttf','fonts/club-font-3.ttf','fonts/club-font-9.ttf'].map(path=>readFile('public/'+path)));
 return {logoPng,bodyFont,boldFont,headingFont,brushFont};
}

test('PDF authorizes the active company and verifies original payload bytes before rendering',async()=>{
 const state=sponsorPdfFixture();
 assert.throws(()=>sponsorAgreementPdfSource(state,'unrelated-user','pdf-example-agreement'),/niet beschikbaar/);
 state.members.find(row=>row.id==='sponsor-user-dg')!.active=false;
 assert.throws(()=>sponsorAgreementPdfSource(state,'sponsor-user-dg','pdf-example-agreement'),/niet beschikbaar/);
 state.sponsorship!.agreements[0].snapshot.sponsorName='Changed after capture';
 await assert.rejects(()=>buildSponsorAgreementPdf(state,'sponsor-committee-user','pdf-example-agreement'),/gewijzigd|inhoud|payload/);
});

test('PDF source preserves captured identity, independent copies and historical bytes after JSONB key reordering',()=>{
 const state=sponsorPdfFixture(),agreement=state.sponsorship!.agreements[0],bytes=agreement.snapshotBytes;
 agreement.snapshot=Object.fromEntries(Object.entries(agreement.snapshot).reverse()) as typeof agreement.snapshot;
 const source=sponsorAgreementPdfSource(state,'sponsor-user-dg',agreement.id);
 state.sponsorship!.contractTemplates![0].body='Changed current template';
 source.snapshot.contract!.body='Only the returned copy';
 assert.notEqual(agreement.snapshot.contract!.body,source.snapshot.contract!.body);
 assert.equal(source.snapshot.contract!.company.legalName,'Duindorpse Bouwpartners B.V.');
 assert.equal(agreement.snapshotBytes,bytes);
});

test('PDF pricing keeps the four incentive categories separate and retains visible unit prices',()=>{
 const state=sponsorPdfFixture(),snapshot=state.sponsorship!.agreements[0].snapshot;
 snapshot.lines=[{id:'season-1',itemId:'board',name:'Bord seizoen 1',description:'Fictief',quantity:1,unitPriceCents:30000,taxRate:'21',setupCostCents:20000},{id:'season-2',itemId:'board',name:'Bord seizoen 2',description:'Fictief',quantity:1,unitPriceCents:30000,taxRate:'21',lineDiscountCents:6000,lineDiscountLabel:'20% seizoen 2'}];
 snapshot.packageDiscountCents=2500;snapshot.discountCents=1000;snapshot.contract!.totals=calculateSponsorProposalTotals(snapshot);
 const before=JSON.stringify(snapshot),rows=sponsorPdfPricingRows(snapshot),amount=(label:string)=>rows.find(row=>row.label===label)?.amountCents;
 assert.equal(amount('Tegenprestaties'),60000);assert.equal(amount('Eenmalige opmaakkosten'),20000);assert.equal(amount('Itemkortingen'),-6000);assert.equal(amount('Pakketkorting'),-2500);assert.equal(amount('Aanvullende voorstelkorting'),-1000);assert.equal(amount('Sponsorbijdrage exclusief btw'),70500);
 assert.equal(snapshot.contract!.totals.taxCents,14805);assert.equal(snapshot.contract!.totals.totalCents,85305);
 assert.equal(JSON.stringify(snapshot),before);
});

test('agreement and fixed invoice render actual multipage PDFs with embedded local fonts',async()=>{
 const state=sponsorPdfFixture(true),agreement=state.sponsorship!.agreements[0],pdfAssets=await assets();
 const bytes=await buildSponsorAgreementPdf(state,'sponsor-committee-user',agreement.id,{assets:pdfAssets}),source=new TextDecoder('latin1').decode(bytes);
 assert.ok(source.startsWith('%PDF-'));assert.ok(source.includes('/FontFile2'));assert.ok((source.match(/\/Type \/Page\b/g)?.length||0)>5);assert.ok(bytes.length>50000);
 const lines=[{id:'fixed',itemId:'board',name:'Een vaste termijn',description:'Fictief café Noël €',quantity:1,unitPriceCents:12345,taxRate:'21' as const,setupCostCents:1000,lineDiscountCents:100}],totals=calculateSponsorProposalTotals({lines,discountCents:500,packageDiscountCents:300});
 const invoice={id:'invoice',sponsorId:agreement.sponsorId,agreementId:agreement.id,number:'F-TEST-1',issueDate:'2026-11-05',dueDate:'2026-12-05',status:'open' as const,lines,discountCents:500,packageDiscountCents:300,totalCents:totals.totalCents,totals,paidAt:'',paymentMethod:'none' as const,createdAt:'2026-11-05T12:00:00Z',installment:{index:1,count:3 as const}};
 const invoiceBytes=await buildSponsorInvoicePdf(invoice,agreement,{assets:pdfAssets});assert.equal(new TextDecoder().decode(invoiceBytes.slice(0,5)),'%PDF-');
 await assert.rejects(()=>buildSponsorInvoicePdf({...invoice,totalCents:invoice.totalCents+1},agreement,{assets:pdfAssets}),/factuurbedragen/);
 agreement.snapshotBytes=JSON.stringify(agreement.snapshot);assert.equal(sponsorDocumentHash(agreement.snapshotBytes),agreement.documentHash);
});

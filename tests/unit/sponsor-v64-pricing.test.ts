import assert from 'node:assert/strict';
import test from 'node:test';
import type {CmsState} from '../../lib/cms/types';
import type {SponsorLine,SponsorAgreement} from '../../lib/cms/sponsorship-types';
import * as model from '../../lib/cms/sponsorship';
import * as contracts from '../../lib/cms/sponsor-contracts';
import {captureDomainCommands} from '../../lib/cms/domain-commands';
import {emptyState} from '../../lib/server/records';
import {sponsorshipSchema} from '../../lib/cms/sponsorship-schema';

const committee='sponsor-committee-user',signer='sponsor-user-dg';
// Explicit fictitious fixtures stay in tests; the production seed remains empty.
function state():CmsState{
 const s=emptyState();s.settings.clubName='Duindorp SV';s.settings.season='2026/2027';
 s.roles=[{id:'committee',name:'Sponsorcommissie',description:'',permissions:['sponsors'],teamScoped:false},{id:'sponsor',name:'Sponsor',description:'',permissions:[],teamScoped:false}];
 s.members=[{id:committee,name:'Sam Voorbeeld',email:'commissie@example.invalid',roleId:'committee',active:true,teamIds:[]},{id:signer,name:'Robin Voorbeeld',email:'sponsor@example.invalid',roleId:'sponsor',active:true,teamIds:[]}];
 const data=model.createSponsorshipSeed();s.sponsorship=data;
 data.sponsors=[{id:'sponsor-dg',name:'Fictieve sponsor',companyNumber:'12345678',vatNumber:'',address:'Teststraat 1',postalCode:'1234 AB',city:'Teststad',email:'sponsor@example.invalid',phone:'',website:'',description:'',logoUrl:'',ownerId:committee,stage:'lead',notes:'',publicProfile:{name:'Fictief publiek',description:'',website:'',logoUrl:''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:'2026-11-05T12:00:00.000Z',updatedAt:'2026-11-05T12:00:00.000Z',demo:false}];
 data.memberships=[{id:'test-membership',sponsorId:'sponsor-dg',userId:signer,roles:['signer','billing','marketing']}];
 data.items=[{id:'item-board-1',name:'Reclamebord hoofdveld',description:'Langs het hoofdveld',kind:'board',priceCents:30000,taxRate:'21',capacity:10,period:'season',active:true},{id:'item-website',name:'Website',description:'Sponsorvermelding',kind:'website',priceCents:5000,taxRate:'21',capacity:0,period:'season',active:true}];
 data.packages=[{id:'package-clubvriend',name:'Clubvriend',description:'Fictief pakket',itemIds:['item-board-1','item-website'],priceCents:32500,taxRate:'21',active:true}];
 model.saveSponsorBusinessDetails(s,committee,'sponsor-dg',{...model.getSponsorBusinessDetails(data.sponsors[0]),contactName:'Robin Voorbeeld',contactFunction:'Directeur'},true);
 return s;
}
function line(id='line',taxRate:SponsorLine['taxRate']='21',price=30000):SponsorLine{return {id,itemId:'item-board-1',name:'Reclamebord hoofdveld',description:'Langs het hoofdveld',quantity:1,unitPriceCents:price,taxRate};}
function emptyReservations(s:CmsState){const data=model.ensureSponsorship(s);data.agreements=[];data.proposals=[];data.invoices=[];return data;}
function proposal(s:CmsState,lines:SponsorLine[],start='2098-07-01',end='2100-06-30'){const p=model.createSponsorProposal(s,committee,'sponsor-dg');p.startDate=start;p.endDate=end;p.lines=lines;return p;}
// The server OTP verifier is tested separately; this fixture supplies only consumed,
// document-bound proof to the production domain transition, without sending mail.
function signed(s:CmsState,a:SponsorAgreement){
 for(const [userId,party] of [[signer,'sponsor'],[committee,'club']] as const){
  const challenge=model.requestSponsorSigningCode(s,userId,a.id,party),data=model.ensureSponsorship(s),saved=data.signingChallenges!.find(row=>row.id===challenge.id)!;
  saved.status='consumed';saved.consumedAt=new Date().toISOString();
  model.appendVerifiedSponsorSignature(s,userId,a.id,party,{function:'Fictieve functie',consent:true},{challengeId:challenge.id,email:challenge.email,verifiedAt:saved.consumedAt,ipAddress:''});
 }
 return a;
}

test('package proposals preserve catalog unit prices and capture a separate package discount',()=>{const s=state(),data=model.ensureSponsorship(s),pack=data.packages.find(row=>row.id==='package-clubvriend')!,p=model.createSponsorProposal(s,committee,'sponsor-dg',pack.id);const gross=pack.itemIds.reduce((sum,id)=>sum+data.items.find(item=>item.id===id)!.priceCents,0);assert.equal(p.packageDiscountCents,gross-pack.priceCents);for(const row of p.lines)assert.equal(row.unitPriceCents,data.items.find(item=>item.id===row.itemId)!.priceCents);assert.equal(model.calculateSponsorProposalTotals(p).netCents,pack.priceCents);const captured=structuredClone(p);pack.priceCents=1;data.items[0].priceCents=1;assert.deepEqual(p,captured);});

test('a package above catalog value remains an explicit surcharge instead of hidden rewritten prices',()=>{const s=state(),data=model.ensureSponsorship(s),pack=data.packages[0];pack.priceCents=pack.itemIds.reduce((sum,id)=>sum+data.items.find(row=>row.id===id)!.priceCents,0)+1234;const p=model.createSponsorProposal(s,committee,'sponsor-dg',pack.id);assert.equal(p.packageDiscountCents,0);assert.equal(p.packageSurchargeCents,1234);assert.equal(model.calculateSponsorProposalTotals(p).netCents,pack.priceCents);});

test('line, package and proposal discounts are explicit and never discount one-time setup',()=>{const row={...line(),quantity:2,setupCostCents:20000,lineDiscountCents:10000,lineDiscountLabel:'Tweede bord naast het eerste'};const total=model.calculateSponsorTotals([row],2500,5000);assert.deepEqual(model.getSponsorLinePricing(row),{grossCents:60000,setupCostCents:20000,lineDiscountCents:10000,netCents:70000});assert.equal(total.subtotalCents,80000);assert.equal(total.discountCents,17500);assert.equal(total.itemDiscountCents,10000);assert.equal(total.packageDiscountCents,5000);assert.equal(total.proposalDiscountCents,2500);assert.equal(total.setupCostCents,20000);assert.equal(total.netCents,62500);assert.throws(()=>model.calculateSponsorTotals([{...line(),setupCostCents:20000}],0,30001),/korting/);assert.throws(()=>model.getSponsorLinePricing({...line(),lineDiscountCents:30001}),/itemkorting/);});

test('mixed VAT setup and layered discounts preserve exact cents including exempt groups',()=>{const rows=[{...line('a','21',10001),setupCostCents:101,lineDiscountCents:1234},{...line('b','9',9999),setupCostCents:99},line('c','0',12345),line('d','exempt',5432)];const total=model.calculateSponsorTotals(rows,987,4567,321);assert.equal(total.netCents,total.subtotalCents-total.discountCents);assert.equal(total.taxGroups.reduce((sum,row)=>sum+row.netCents,0),total.netCents);assert.equal(total.taxGroups.reduce((sum,row)=>sum+row.taxCents,0),total.taxCents);assert.equal(total.taxGroups.length,4);assert.equal(total.taxGroups.find(row=>row.taxRate==='exempt')!.taxCents,0);assert.equal(total.setupCostCents,200);});

test('legacy price inputs retain the exact totals DTO shape and seeded agreement hashes roundtrip',()=>{const total=model.calculateSponsorTotals([line()],1000);assert.deepEqual(Object.keys(total),['subtotalCents','discountCents','netCents','taxCents','totalCents','taxGroups']);const data=model.createSponsorshipSeed(),hashes=data.agreements.map(row=>row.documentHash),parsed=sponsorshipSchema.parse(JSON.parse(JSON.stringify(data)));assert.deepEqual(parsed.agreements.map(row=>row.documentHash),hashes);for(const agreement of parsed.agreements)assert.equal(model.sponsorDocumentHash(JSON.stringify(agreement.snapshot)),agreement.documentHash);});

test('proposal-specific names, additions and season incentives never alter the catalog and survive snapshot backup',()=>{const s=state(),data=emptyReservations(s),catalog=structuredClone(data.items),p=proposal(s,[{...line(),addition:'Formaat 300 × 75 cm, achter het doel',name:'Onze plek langs de lijn',periodLabel:'Seizoen 2',startDate:'2099-07-01',endDate:'2100-06-30',lineDiscountLabel:'20% korting tweede seizoen',lineDiscountCents:6000,setupCostCents:0}]);p.packageDiscountCents=1500;model.saveSponsorProposal(s,committee,p);model.sendSponsorProposal(s,committee,p.id);const a=model.createSponsorAgreement(s,committee,p.id),before=JSON.stringify(a.snapshot),parsed=sponsorshipSchema.parse(JSON.parse(JSON.stringify(data)));assert.deepEqual(data.items,catalog);assert.equal(JSON.stringify(parsed.agreements[0].snapshot),before);assert.equal(a.snapshot.lines[0].addition,'Formaat 300 × 75 cm, achter het doel');assert.equal(a.snapshot.contract!.totals.packageDiscountCents,1500);assert.equal(a.documentHash,model.sponsorDocumentHash(JSON.stringify(parsed.agreements[0].snapshot)));p.lines[0].addition='Changed after capture';assert.equal(JSON.stringify(a.snapshot),before);});

test('dated proposal lines must use real calendar dates inside the agreed contract period',()=>{const s=state(),p=proposal(s,[{...line(),startDate:'2099-07-01',endDate:'2100-06-30'}]);assert.doesNotThrow(()=>model.saveSponsorProposal(s,committee,p));assert.throws(()=>model.saveSponsorProposal(s,committee,{...p,lines:[{...p.lines[0],endDate:'2101-06-30'}]}),/regelperiode/);assert.throws(()=>model.saveSponsorProposal(s,committee,{...p,lines:[{...p.lines[0],startDate:'2099-02-31'}]}),/regelperiode/);assert.throws(()=>model.saveSponsorProposal(s,committee,{...p,lines:[{...p.lines[0],endDate:undefined}]}),/regelperiode/);});

test('consecutive seasons reserve one physical board instead of two simultaneously',()=>{const s=state(),data=emptyReservations(s);data.items.find(row=>row.id==='item-board-1')!.capacity=1;const p=proposal(s,[{...line('season-one'),startDate:'2098-07-01',endDate:'2099-06-30',setupCostCents:10000},{...line('season-two'),startDate:'2099-07-01',endDate:'2100-06-30',lineDiscountCents:6000}]);model.sendSponsorProposal(s,committee,p.id);assert.equal(model.sponsorItemAvailability(s,'item-board-1',p.startDate,p.endDate).reserved,1);assert.equal(model.sponsorItemAvailability(s,'item-board-1','2100-07-01','2101-06-30').reserved,0);model.createSponsorAgreement(s,committee,p.id);assert.equal(model.sponsorItemAvailability(s,'item-board-1',p.startDate,p.endDate).reserved,1);});

test('peak capacity catches an overlap inside the outer period and capacity reductions use inner line boundaries',()=>{const s=state(),data=emptyReservations(s),item=data.items.find(row=>row.id==='item-board-1')!;item.capacity=2;const p=proposal(s,[{...line('a'),startDate:'2099-01-01',endDate:'2099-05-31'},{...line('b'),startDate:'2099-03-01',endDate:'2099-09-30'}]);model.sendSponsorProposal(s,committee,p.id);assert.equal(model.sponsorItemAvailability(s,item.id,'2098-07-01','2100-06-30').reserved,2);assert.throws(()=>model.saveSponsorItem(s,committee,{...item,capacity:1}),/bestaande reserveringen/);item.capacity=2;const second=proposal(s,[{...line('third'),startDate:'2099-04-01',endDate:'2099-04-30'}]);assert.throws(()=>model.sendSponsorProposal(s,committee,second.id),/beschikbaar/);});

test('setup is charged on the first installment only while discounted recurring values and VAT sum exactly',()=>{const s=state(),data=emptyReservations(s),p=proposal(s,[{...line('a','21',30001),setupCostCents:10000,lineDiscountCents:1001},{...line('b','9',10002),setupCostCents:3000}], '2098-07-01','2099-06-30');p.packageDiscountCents=2345;p.discountCents=1001;model.sendSponsorProposal(s,committee,p.id);const a=signed(s,model.createSponsorAgreement(s,committee,p.id)),total=model.calculateSponsorProposalTotals(a.snapshot),plan=model.createSponsorInvoicePlan(s,committee,a.id,{firstDueDate:'2099-01-31',count:3});assert.equal(plan[0].lines.reduce((sum,row)=>sum+(row.setupCostCents??0),0),13000);assert.equal(plan[1].lines.some(row=>!!row.setupCostCents),false);assert.equal(plan[2].lines.some(row=>!!row.setupCostCents),false);assert.equal(plan[0].totals!.setupCostCents,13000);assert.equal(plan.reduce((sum,row)=>sum+row.totalCents,0),total.totalCents);for(const group of total.taxGroups){assert.equal(plan.reduce((sum,row)=>sum+row.totals!.taxGroups.find(g=>g.taxRate===group.taxRate)!.netCents,0),group.netCents);assert.equal(plan.reduce((sum,row)=>sum+row.totals!.taxGroups.find(g=>g.taxRate===group.taxRate)!.taxCents,0),group.taxCents);}assert.equal(sponsorshipSchema.safeParse(data).success,true);});

test('a single invoice retains the separate package reduction and every captured line incentive',()=>{const s=state(),data=emptyReservations(s),p=proposal(s,[{...line(),lineDiscountCents:1000,setupCostCents:2000}]);p.packageDiscountCents=3000;p.discountCents=1000;model.sendSponsorProposal(s,committee,p.id);const a=signed(s,model.createSponsorAgreement(s,committee,p.id)),invoice=model.createSponsorInvoice(s,committee,a.id,'2099-06-30');assert.equal(invoice.packageDiscountCents,3000);assert.equal(invoice.lines[0].lineDiscountCents,1000);assert.equal(model.getSponsorInvoiceTotals(invoice).totalCents,model.calculateSponsorProposalTotals(a.snapshot).totalCents);assert.equal(sponsorshipSchema.safeParse(data).success,true);invoice.packageDiscountCents++;assert.equal(sponsorshipSchema.safeParse(data).success,false);});

test('renewal uses the last season and never repeats setup costs or previous temporary discounts',()=>{const s=state();emptyReservations(s);const p=proposal(s,[{...line('year-one'),startDate:'2098-07-01',endDate:'2099-06-30',setupCostCents:10000},{...line('year-two'),startDate:'2099-07-01',endDate:'2100-06-30',lineDiscountCents:6000,lineDiscountLabel:'Tweede-seizoensvoordeel'}]);model.sendSponsorProposal(s,committee,p.id);const a=signed(s,model.createSponsorAgreement(s,committee,p.id)),renewal=model.renewSponsorAgreement(s,committee,a.id);assert.equal(renewal.lines.length,1);assert.equal(renewal.lines[0].setupCostCents,undefined);assert.equal(renewal.lines[0].lineDiscountCents,undefined);assert.equal(renewal.lines[0].lineDiscountLabel,undefined);assert.equal(renewal.lines[0].startDate,undefined);assert.equal(renewal.startDate,'2100-08-01');assert.equal(renewal.endDate,'2101-07-31');});

test('2026 reference template keeps all ten articles and explicit agreed renewal, materials and remedy rules',()=>{
 const template=contracts.createDefaultSponsorContractTemplate();
 assert.equal(template.id,'template-onzetrots-2026');
 assert.equal(template.version,1);
 assert.deepEqual([...template.body.matchAll(/^(\d+)\. ([^\n]+)/gm)].map(match=>match[2]),['Partijen','Doel en looptijd','Sponsorbijdrage en betaling','Tegenprestaties en pakket','Aanlevering en gebruik van materiaal','Afstemming en wijzigingen','Tekortkomingen en beëindiging','Overmacht','Persoonsgegevens','Versies, recht en ondertekening']);
 assert.match(template.body,/wordt niet automatisch verlengd/);
 assert.match(template.body,/bij verlenging wordt die niet opnieuw verschuldigd/);
 assert.match(template.body,/vooraf schriftelijk overeenkomen/);
 assert.match(template.body,/niet eenzijdig/);
 assert.match(template.body,/redelijke termijn voor herstel/);
 assert.match(template.body,/geen automatische recht|niet automatisch recht|niet automatisch|niet-geleverde prestaties/);
 assert.match(template.body,/indien betrouwbaar beschikbaar/);
 assert.match(template.body,/afzonderlijk met een e-mailcode/);
 assert.match(template.body,/oorspronkelijke ondertekende versie.*blijven behouden/);
 assert.match(template.body,/pakketkorting staat afzonderlijk onder het overzicht/);
 assert.doesNotMatch(template.body,/pakketprijs is over de onderdelen verdeeld/);
 contracts.validateSponsorContractTemplate(template);
});

test('reference shortcodes render separate seasonal incentives, setup costs and package discount without reducing displayed item tariffs',()=>{
 const s=state(),p=model.createSponsorProposal(s,committee,'sponsor-dg'),company=model.getSponsorBusinessDetails(model.ensureSponsorship(s).sponsors[0]);
 p.lines=[{id:'first-season',itemId:'item-board',name:'Reclamebord hoofdveld',description:'Formaat 300 x 75 cm, langs de lange zijde.',quantity:1,unitPriceCents:30000,taxRate:'21',addition:'Naast het clubhuis',periodLabel:'Seizoen 1: 2026/2027',startDate:'2026-07-01',endDate:'2027-06-30',setupCostCents:20000},{id:'second-season',itemId:'item-board',name:'Reclamebord hoofdveld',description:'Dezelfde vaste bordpositie.',quantity:1,unitPriceCents:30000,taxRate:'21',periodLabel:'Seizoen 2: 2027/2028',startDate:'2027-07-01',endDate:'2028-06-30',lineDiscountCents:6000,lineDiscountLabel:'20% korting in seizoen 2'}];
 p.startDate='2026-07-01';p.endDate='2028-06-30';p.packageDiscountCents=5000;p.discountCents=1000;
 const snapshot={...p,sponsorName:company.legalName,sponsorAddress:company.address,sponsorEmail:company.contactEmail,capturedAt:'2026-11-05T10:00:00.000Z'},totals=model.calculateSponsorProposalTotals(p),variables=contracts.getSponsorContractVariables(snapshot,company,'Meerjarenpartner',totals),rendered=contracts.renderSponsorContractTemplate(contracts.createDefaultSponsorContractTemplate(),variables);
 assert.equal(variables['kosten.tegenprestaties'],model.money(60000));
 assert.equal(variables['kosten.opmaak'],model.money(20000));
 assert.equal(variables['kosten.itemkorting'],model.money(6000));
 assert.equal(variables['kosten.pakketkorting'],model.money(5000));
 assert.equal(variables['kosten.voorstelkorting'],model.money(1000));
 assert.equal(variables['kosten.totaal'],model.money(82280));
 assert.ok(variables['sponsoring.items'].includes('Tarief per stuk: '+model.money(30000)));
 assert.match(variables['sponsoring.items'],/Naast het clubhuis/);
 assert.match(variables['sponsoring.items'],/Seizoen 2: 2027\/2028/);
 assert.match(variables['sponsoring.incentives'],/20% korting in seizoen 2/);
 assert.match(variables['sponsoring.incentives'],/01-07-2027 t\/m 30-06-2028/);
 const specification=variables['kosten.prijsspecificatie'];assert.ok(specification.indexOf('Pakketkorting')>specification.indexOf('Subtotaal'));
 assert.match(rendered.body,/Houtrustlaan 1, 2566 ZW Den Haag/);assert.match(rendered.body,/27092652/);assert.match(rendered.body,/Danny Goldenbelt \(Voorzitter\)/);assert.match(rendered.body,/secretariaat@duindorpsv.nl/);
 assert.doesNotMatch(rendered.body,/\{\{/);
 assert.equal(p.lines[0].unitPriceCents,30000);
});

test('registration-exempt sponsors receive a readable clause and literal replacement values are never treated as more shortcodes',()=>{
 const s=state(),p=model.createSponsorProposal(s,committee,'sponsor-dg','package-clubvriend'),company={...model.getSponsorBusinessDetails(model.ensureSponsorship(s).sponsors[0]),registrationExempt:true,companyNumber:'',registrationExemptionReason:'Particuliere ondersteuning',legalName:'Voorbeeld {{club.kvk}}'},snapshot={...p,sponsorName:company.legalName,sponsorAddress:company.address,sponsorEmail:company.contactEmail,capturedAt:'2026-11-05T10:00:00.000Z'},variables=contracts.getSponsorContractVariables(snapshot,company,'Maatwerk',model.calculateSponsorProposalTotals(p)),rendered=contracts.renderSponsorContractTemplate(contracts.createDefaultSponsorContractTemplate(),variables);
 assert.equal(variables['bedrijf.inschrijving'],'zonder inschrijving (Particuliere ondersteuning)');
 assert.ok(rendered.body.includes('Voorbeeld {{club.kvk}}'));
 assert.doesNotMatch(rendered.body,/KvK-nummer Niet ingeschreven/);
 const previous={...contracts.createDefaultSponsorContractTemplate(),id:'template-onzetrots',name:'Eigen historische template',body:'Mijn eigen clausule {{bedrijf.naam}}'};const before=JSON.stringify(previous);contracts.createDefaultSponsorContractTemplate();assert.equal(JSON.stringify(previous),before);
});


test('the new standard is additive, existing drafts and stored custom clauses retain their selected template',()=>{
 const s=state(),data=model.ensureSponsorship(s),old={...contracts.createDefaultSponsorContractTemplate(),id:'template-onzetrots',name:'Bestaande eigen template',body:'Eigen afspraak met {{bedrijf.naam}}'},before=JSON.stringify(old);
 data.contractTemplates=[old];const existing=proposal(s,[line()]);existing.templateId=old.id;
 const projected=model.readSponsorContractTemplates(s);assert.equal(projected[0].id,'template-onzetrots-2026');assert.equal(JSON.stringify(data.contractTemplates[0]),before);assert.equal(existing.templateId,old.id);
 model.sendSponsorProposal(s,committee,existing.id);assert.equal(existing.snapshot!.contract!.templateId,old.id);assert.match(existing.snapshot!.contract!.body,/Eigen afspraak/);
 const fresh=model.createSponsorProposal(s,committee,'sponsor-dg');assert.equal(fresh.templateId,'template-onzetrots-2026');
 model.saveSponsorContractTemplate(s,committee,{...projected[0],body:'Mijn beheerde 2026-variant {{bedrijf.naam}}'});assert.equal(model.readSponsorContractTemplates(s)[0].body,'Mijn beheerde 2026-variant {{bedrijf.naam}}');assert.equal(model.readSponsorContractTemplates(s).find(row=>row.id===old.id)!.body,old.body);
});

test('authorized club contract settings freeze into documents and later settings cannot rewrite them',()=>{
 const s=state(),data=model.ensureSponsorship(s);assert.throws(()=>model.saveSponsorSettings(s,signer,{...data.settings,contractClubDetails:{representative:'Onbevoegd'}}),/beheerrechten/);
 model.saveSponsorSettings(s,committee,{...data.settings,contractClubDetails:{legalName:'Fictieve vereniging',address:'Testweg 1',companyNumber:'87654321',representative:'Andere vertegenwoordiger',representativeFunction:'Penningmeester',email:'club@example.invalid'}});
 const p=proposal(s,[line()]);model.sendSponsorProposal(s,committee,p.id);const a=model.createSponsorAgreement(s,committee,p.id),bytes=model.sponsorSnapshotBytes(a);
 assert.equal(a.snapshot.contract!.variables['club.vertegenwoordiger'],'Andere vertegenwoordiger');assert.match(a.snapshot.contract!.body,/Fictieve vereniging/);
 model.saveSponsorSettings(s,committee,{...data.settings,contractClubDetails:{representative:'Latere vertegenwoordiger'}});assert.equal(model.sponsorSnapshotBytes(a),bytes);
 assert.throws(()=>model.saveSponsorSettings(s,committee,{...data.settings,contractClubDetails:{email:'ongeldig'}}),/verenigingsadres/);
});

test('stale business change requests and changed canonical companies cannot replace captured identity',()=>{
 const s=state(),data=model.ensureSponsorship(s),company=data.sponsors[0],details=model.getSponsorBusinessDetails(company),p=proposal(s,[line()]);model.sendSponsorProposal(s,committee,p.id);const frozen=JSON.stringify(p.snapshot);
 const request=model.requestSponsorBusinessChange(s,signer,company.id,{...details,address:'Ouder verzoek 2'});
 model.saveSponsorBusinessDetails(s,committee,company.id,{...details,address:'Actuele gegevens 3'},true);
 assert.throws(()=>model.reviewSponsorBusinessChange(s,committee,request.id,true),/inmiddels gewijzigd/);assert.equal(company.address,'Actuele gegevens 3');
 assert.throws(()=>model.createSponsorAgreement(s,committee,p.id),/gewijzigd sinds/);assert.equal(JSON.stringify(p.snapshot),frozen);
 delete request.baseIdentity;assert.throws(()=>model.reviewSponsorBusinessChange(s,committee,request.id,true),/inmiddels gewijzigd/);
});

test('accepted capacity remains reserved after the proposal reservation date expires',()=>{
 const s=state(),data=model.ensureSponsorship(s);data.items[0].capacity=1;
 const p=proposal(s,[line()]);model.sendSponsorProposal(s,committee,p.id);model.acceptSponsorProposal(s,signer,p.id);p.reservedUntil='2000-01-01T00:00:00.000Z';
 assert.equal(model.sponsorItemAvailability(s,'item-board-1',p.startDate,p.endDate).reserved,1);
 const next=proposal(s,[line()]);assert.throws(()=>model.sendSponsorProposal(s,committee,next.id),/beschikbaar/);
});



test('money boundaries match persisted cent fields before a document is captured',()=>{
 assert.throws(()=>model.calculateSponsorTotals([line('large','21',1_000_000_000)]),/te groot/);
 assert.throws(()=>model.calculateSponsorTotals([{...line('large','0',1_000_000_000),quantity:2}]),/te groot/);
 assert.throws(()=>model.calculateSponsorTotals([{...line(),setupCostCents:1_000_000_001}]),/eenmalige/);
 assert.throws(()=>model.calculateSponsorTotals([line()],0,-1),/centen/);
 assert.equal(model.calculateSponsorTotals([line('max','exempt',1_000_000_000)]).totalCents,1_000_000_000);
});

test('single invoices reject partial, impossible and rollover calendar dates before persistence',()=>{
 const s=state(),data=model.ensureSponsorship(s),p=proposal(s,[line()]);model.sendSponsorProposal(s,committee,p.id);const a=signed(s,model.createSponsorAgreement(s,committee,p.id));
 for(const dueDate of ['2030','2030-02-31','2030-01-01T12:00:00Z','0000-01-01'])assert.throws(()=>model.createSponsorInvoice(s,committee,a.id,dueDate),/vervaldatum/);
 assert.equal(data.invoices.length,0);
});

test('backup invoice totals must match fixed line amounts and the complete plan conserves each VAT group',()=>{
 const s=state(),data=model.ensureSponsorship(s),p=proposal(s,[{...line('taxed','21',10001),setupCostCents:1234,lineDiscountCents:321},line('lower','9',9999),line('zero','0',101),line('exempt','exempt',207)]);p.packageDiscountCents=101;p.discountCents=203;p.packageSurchargeCents=97;model.sendSponsorProposal(s,committee,p.id);const a=signed(s,model.createSponsorAgreement(s,committee,p.id));model.createSponsorInvoicePlan(s,committee,a.id,{count:3,firstDueDate:'2099-01-31'});assert.equal(sponsorshipSchema.safeParse(data).success,true);
 const badLine=structuredClone(data);badLine.invoices[0].lines[0].unitPriceCents++;assert.equal(sponsorshipSchema.safeParse(badLine).success,false);
 const badSetup=structuredClone(data);badSetup.invoices.find(row=>row.installment?.index===1)!.totals!.setupCostCents!++;assert.equal(sponsorshipSchema.safeParse(badSetup).success,false);
 const badTax=structuredClone(data),invoice=badTax.invoices[0];invoice.totals!.taxGroups[0].taxCents+=7;invoice.totals!.taxCents+=7;invoice.totals!.totalCents+=7;invoice.totalCents+=7;assert.equal(sponsorshipSchema.safeParse(badTax).success,false);
 const duplicateSingle=structuredClone(data);for(const row of duplicateSingle.invoices)delete row.installment;assert.equal(sponsorshipSchema.safeParse(duplicateSingle).success,false);
});

test('malformed nested shortcode delimiters cannot become a second template syntax',()=>{
 const template=contracts.createDefaultSponsorContractTemplate();for(const body of ['{{{bedrijf.naam}}}','{{bedrijf.naam}}}','{{bedrijf.naam','bedrijf.naam}}'])assert.throws(()=>contracts.validateSponsorContractTemplate({...template,body}),/gesloten/);
});


test('portal acceptance queues intent with a hidden catalog while the server still enforces signer rights and capacity',()=>{
 const s=state(),data=model.ensureSponsorship(s);data.items[0].capacity=1;const sent=proposal(s,[line()]);model.sendSponsorProposal(s,committee,sent.id);
 const portal=structuredClone(s);portal.sponsorship!.items=[];portal.sponsorship!.packages=[];const before=JSON.stringify(portal);
 const captured=captureDomainCommands('portal-acceptance',()=>model.acceptSponsorProposal(portal,signer,sent.id));
 assert.deepEqual(captured.commands,[{name:'acceptSponsorProposal',args:[sent.id],offset:0}]);assert.equal(captured.value.status,'sent','The preview must not claim acceptance before the server response');assert.equal(JSON.stringify(portal),before,'Hidden catalog data is neither needed nor added to the client state');
 const membership=data.memberships.find(row=>row.userId===signer)!;membership.roles=['marketing'];assert.throws(()=>model.acceptSponsorProposal(s,signer,sent.id),/tekenbevoegd/);assert.equal(sent.status,'sent');membership.roles=['signer'];
 sent.reservedUntil='2000-01-01T00:00:00.000Z';const competing=proposal(s,[line('last-available-place')]);model.sendSponsorProposal(s,committee,competing.id);
 assert.throws(()=>model.acceptSponsorProposal(s,signer,sent.id),/beschikbaar/);assert.equal(sent.status,'sent','The server rejects an expired offer after its last place was reserved elsewhere');
});

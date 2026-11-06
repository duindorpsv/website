import type {CmsState} from './types';
import type {SponsorAgreement,SponsorAgreementDelivery,SponsorProposalSnapshot} from './sponsorship-types';
import {documentHeadingCss} from './document-typography';
import {domainUid} from './domain-commands';
import {canManageSponsorship,calculateSponsorProposalTotals,createSponsorAgreementFromDraft,ensureSponsorship,getSponsorAgreementDraftSource,getSponsorLinePricing,money,readSponsorship,sponsorSnapshotBytes} from './sponsorship';
import {sponsorProposalSnapshotSchema} from './sponsorship-schema';
export type {SponsorAgreementDelivery} from './sponsorship-types';
export type SponsorAgreementDeliveryTarget={proposalId?:string;agreementId?:string;deliveryId?:string};
export type SponsorAgreementDeliverySource={proposalId:string;sponsorId:string;agreementId?:string;agreementNumber:string;version:number;snapshot:SponsorProposalSnapshot;documentHash:string;snapshotBytes?:string};
export type SponsorAgreementDeliveryInput={recipient:string;subject:string;message:string;expectedHash:string};
const clone=<T,>(value:T):T=>structuredClone(value);
function ensure(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
function requireManager(state:CmsState,actorId:string){ensure(canManageSponsorship(state,actorId),'Je hebt sponsorbeheerrechten nodig om overeenkomsten te versturen.');}
/** Delivery metadata is independent of the mutable source; return detached DTOs. */
export function readSponsorAgreementDeliveries(state:Pick<CmsState,'sponsorship'>,target:Pick<SponsorAgreementDeliveryTarget,'proposalId'|'agreementId'>={}):SponsorAgreementDelivery[]{
 return clone((readSponsorship(state).agreementDeliveries||[]).filter(row=>(!target.proposalId||row.proposalId===target.proposalId)&&(!target.agreementId||row.agreementId===target.agreementId)));
}
export function assertSponsorAgreementDeliverySource(source:SponsorAgreementDeliverySource){
 ensure(Number.isInteger(source.version)&&source.version>0&&source.agreementNumber.length>0,'De vastgelegde documentversie is ongeldig.');
 sponsorProposalSnapshotSchema.parse(source.snapshot);sponsorSnapshotBytes(source);
 calculateSponsorProposalTotals(source.snapshot);
}
/** Pure preview/history: never allocates a number, reservation, contract or mail job. */
export function getSponsorAgreementDeliverySource(state:CmsState,actorId:string,target:SponsorAgreementDeliveryTarget):SponsorAgreementDeliverySource{
 requireManager(state,actorId);const data=readSponsorship(state);
 if(target.deliveryId){
  const row=data.agreementDeliveries?.find(value=>value.id===target.deliveryId&&(!target.proposalId||value.proposalId===target.proposalId)&&(!target.agreementId||value.agreementId===target.agreementId));
  ensure(row,'Overeenkomstverzending niet gevonden.');const agreement=data.agreements.find(value=>value.id===row.agreementId);
  ensure(agreement&&agreement.sponsorId===row.sponsorId&&agreement.proposalId===row.proposalId&&agreement.number===row.agreementNumber&&agreement.version===row.version&&agreement.documentHash===row.documentHash,'De vastgelegde overeenkomstinhoud is gewijzigd.');
  sponsorSnapshotBytes(agreement);
  const source={proposalId:row.proposalId,sponsorId:row.sponsorId,agreementId:row.agreementId,agreementNumber:row.agreementNumber,version:row.version,snapshot:clone(row.snapshot),documentHash:row.documentHash,...(row.snapshotBytes!==undefined?{snapshotBytes:row.snapshotBytes}:{})};
  assertSponsorAgreementDeliverySource(source);return clone(source);
 }
 if(target.agreementId){
  const agreement=data.agreements.find(row=>row.id===target.agreementId&&(!target.proposalId||row.proposalId===target.proposalId));
  ensure(agreement&&agreement.status==='awaiting-signature'&&!agreement.signatures.length,'Kies een overeenkomst die op de sponsorondertekening wacht.');
  const bytes=sponsorSnapshotBytes(agreement),source={proposalId:agreement.proposalId,sponsorId:agreement.sponsorId,agreementId:agreement.id,agreementNumber:agreement.number,version:agreement.version,snapshot:clone(agreement.snapshot),documentHash:agreement.documentHash,snapshotBytes:bytes};
  assertSponsorAgreementDeliverySource(source);return source;
 }
 ensure(target.proposalId,'Kies een conceptovereenkomst om te versturen.');
 const draft=getSponsorAgreementDraftSource(state,actorId,target.proposalId),source={...draft,agreementNumber:'Nog toe te kennen',snapshotBytes:JSON.stringify(draft.snapshot)};
 assertSponsorAgreementDeliverySource(source);return source;
}
export function validateSponsorAgreementDeliveryInput(input:SponsorAgreementDeliveryInput){
 ensure(typeof input.recipient==='string'&&!/[\r\n]/.test(input.recipient),'Vul een geldig e-mailadres voor de ontvanger in.');
 const recipient=input.recipient.trim().toLowerCase();ensure(recipient.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient),'Vul een geldig e-mailadres voor de ontvanger in.');
 ensure(typeof input.subject==='string'&&input.subject.trim().length>0&&input.subject.length<=180&&!/[\r\n]/.test(input.subject),'Vul een onderwerp in van maximaal 180 tekens.');
 ensure(typeof input.message==='string'&&input.message.length<=5000,'Gebruik maximaal 5.000 tekens voor het bericht.');
 ensure(typeof input.expectedHash==='string'&&/^[a-f0-9]{64}$/.test(input.expectedHash),'Bekijk eerst de actuele documentversie.');
 return {recipient,subject:input.subject,message:input.message,expectedHash:input.expectedHash};
}
/** Pure server recipe; the caller must persist this and the outbox atomically.
 * A queued record never claims provider acceptance. Retries use the stored record,
 * whereas calling this for an intentional resend records a separate event. */
export function recordSponsorAgreementDelivery(state:CmsState,actorId:string,target:SponsorAgreementDeliveryTarget,input:SponsorAgreementDeliveryInput):SponsorAgreementDelivery{
 ensure(!target.deliveryId,'Een historische verzending kan niet worden gewijzigd. Kies de huidige overeenkomst.');
 const source=getSponsorAgreementDeliverySource(state,actorId,target),message=validateSponsorAgreementDeliveryInput(input);
 ensure(source.documentHash===message.expectedHash,'Het document is gewijzigd. Bekijk eerst de nieuwste versie.');
 const agreement=source.agreementId?readSponsorship(state).agreements.find(row=>row.id===source.agreementId)!:createSponsorAgreementFromDraft(state,actorId,source.proposalId,source.documentHash);
 const at=new Date().toISOString(),delivery:SponsorAgreementDelivery={id:domainUid('sp-agreement-delivery'),agreementId:agreement.id,proposalId:agreement.proposalId,sponsorId:agreement.sponsorId,agreementNumber:agreement.number,version:agreement.version,recipient:message.recipient,subject:message.subject,message:message.message,createdAt:at,createdBy:actorId,status:'queued',snapshot:clone(agreement.snapshot),documentHash:agreement.documentHash,snapshotBytes:sponsorSnapshotBytes(agreement)};
 const data=ensureSponsorship(state);(data.agreementDeliveries??=[]).unshift(clone(delivery));
 data.activities.unshift({id:domainUid('sp-log'),sponsorId:agreement.sponsorId,at,actorId,kind:'agreement',title:'Sponsorovereenkomst voor verzending vastgelegd',detail:`${agreement.number} · versie ${agreement.version} · ${delivery.recipient}`,internal:true});return clone(delivery);
}
/** Reference compatibility only: all synthetic renderer data stays in this clone. */
export function getSponsorAgreementDeliveryPdfContext(state:CmsState,actorId:string,target:SponsorAgreementDeliveryTarget):{state:CmsState;agreementId:string}{
 const source=getSponsorAgreementDeliverySource(state,actorId,target),copy=clone(state),id='agreement-delivery-preview';
 const agreement:SponsorAgreement={id,sponsorId:source.sponsorId,proposalId:source.proposalId,number:source.agreementId?source.agreementNumber:'VOORBEELD',version:source.version,status:'awaiting-signature',signingMode:'dual-email-otp',snapshot:clone(source.snapshot),documentHash:source.documentHash,snapshotBytes:source.snapshotBytes||JSON.stringify(source.snapshot),hashFormat:'json-utf8-v1',signatures:[],createdAt:source.snapshot.capturedAt,signedAt:''};
 const data=ensureSponsorship(copy);data.agreements=[agreement,...data.agreements.filter(row=>row.id!==id)];return {state:copy,agreementId:id};
}

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderSponsorAgreementDeliveryHtml(source:SponsorAgreementDeliverySource,fontUrl?:string){
 assertSponsorAgreementDeliverySource(source);const s=source.snapshot,t=calculateSponsorProposalTotals(s),body=s.contract?.body||s.terms;
 return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Sponsorovereenkomst - ${escape(s.name)}</title><style>${documentHeadingCss(fontUrl)}body{font:14px/1.6 Arial,sans-serif;color:#142f4f;margin:0;padding:30px;background:white}header{border-bottom:5px solid #03438a;padding-bottom:18px}h1{color:#03438a;font-size:clamp(19px,4.8vw,30px);margin:10px 0}h2{font-size:20px;margin-top:25px}table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed}td,th{padding:10px 7px;border-bottom:1px solid #d6e1ed;text-align:left;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:45%}tr:nth-child(even){background:#f2f6fb}.note{padding:12px;background:#eef4fc;border-left:3px solid #03438a}small{color:#5b6f86}pre{font:inherit;white-space:pre-wrap;overflow-wrap:break-word}.hash{font-size:10px;overflow-wrap:anywhere}footer{margin-top:30px;font-size:11px;color:#5b6f86}@media print{body{padding:0}}</style></head><body><header><b>DUINDORP SV · ONZE CLUB. ONZE TROTS.</b><h1>SPONSOROVEREENKOMST</h1><strong>${escape(s.name)}</strong> · versie ${source.version}<br><small>Nummer: ${escape(source.agreementNumber)}</small></header><p class="note">${source.agreementId?'Vastgelegde overeenkomst voor ondertekening door de sponsor en daarna de club.':'Voorvertoning vóór verzending. Bij versturen wordt deze versie vastgelegd voor ondertekening door de sponsor en daarna de club.'}</p><h2>${escape(s.sponsorName)}</h2><p>${escape(s.sponsorAddress)}<br>${escape(s.sponsorEmail)}</p><p>Seizoen ${escape(s.season)}<br>Looptijd: ${escape(s.startDate)} t/m ${escape(s.endDate)}</p><table><thead><tr><th>Onderdeel</th><th>Aantal</th><th>Tarief excl. btw</th><th>Regeltotaal excl. btw</th></tr></thead><tbody>${s.lines.map(line=>{const p=getSponsorLinePricing(line);return `<tr><td><strong>${escape(line.name)}</strong><br><small>${escape([line.description,line.addition,line.periodLabel,line.startDate&&line.endDate?line.startDate+' t/m '+line.endDate:'',p.lineDiscountCents?(line.lineDiscountLabel||'Itemkorting')+': -'+money(p.lineDiscountCents):'',p.setupCostCents?'Eenmalige opmaak: '+money(p.setupCostCents):''].filter(Boolean).join(' · '))}</small></td><td>${line.quantity}</td><td>${money(line.unitPriceCents)}</td><td>${money(p.netCents)}</td></tr>`}).join('')}</tbody></table><p>${t.packageDiscountCents?'Pakketkorting: -'+money(t.packageDiscountCents)+'<br>':''}${t.packageSurchargeCents?'Pakketmeerprijs: '+money(t.packageSurchargeCents)+'<br>':''}${s.discountCents?'Aanvullende voorstelkorting: -'+money(s.discountCents)+'<br>':''}Totaal exclusief btw: <strong>${money(t.netCents)}</strong><br>${t.taxGroups.map(group=>`${group.taxRate==='exempt'?'Vrijgesteld van btw':'Btw '+group.taxRate+'%'}: ${money(group.taxCents)}`).join('<br>')}<br><strong>Totaal inclusief btw: ${money(t.totalCents)}</strong></p><h2>${escape(s.contract?.title||'Afspraken')}</h2><pre>${escape(s.contract?.body||s.terms)}</pre>${s.paymentTerms.trim()&&!body.includes(s.paymentTerms.trim())?`<h2>Betaalafspraken</h2><pre>${escape(s.paymentTerms)}</pre>`:''}${s.terms.trim()&&!body.includes(s.terms.trim())?`<h2>Voorwaarden</h2><pre>${escape(s.terms)}</pre>`:''}<h2>Ondertekening</h2><p>Namens de sponsor: wacht op ondertekening.<br>Namens Duindorp SV: ondertekent nadat de sponsor heeft getekend.</p><p class="hash">Documentcontrole (SHA-256): ${escape(source.documentHash)}</p><footer>Dit document wordt door de sponsor en daarna door de club met afzonderlijke accounts ondertekend.</footer></body></html>`;
}

export function getSponsorAgreementDeliveryHtml(state:CmsState,actorId:string,target:SponsorAgreementDeliveryTarget,fontUrl?:string){return renderSponsorAgreementDeliveryHtml(getSponsorAgreementDeliverySource(state,actorId,target),fontUrl);}

import {domainMutation,domainUid} from './domain-commands';
import type {CmsState} from './types';
import type {Donor,DonorContribution,DonorEntry,DonorInvoice,DonorState,SponsorLine} from './sponsorship-types';
import {calculateSponsorTotals,ensureSponsorship,money,readSponsorship} from './sponsorship';
import {reserveInvoiceNumbers} from './invoice-numbering';
export type {Donor,DonorContribution,DonorEntry,DonorInvoice,DonorState} from './sponsorship-types';
export type DonorAction='view'|'manage'|'invoice'|'settings';
const clone=<T,>(value:T):T=>structuredClone(value);
const stamp=()=>new Date().toISOString();
const uid=domainUid;
function ensure(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function validDate(value:string){return !value.startsWith('0000')&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
const emailValid=(value:string)=>!value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function canDonors(state:CmsState,userId:string,action:DonorAction='view'){
 const user=state.members.find(row=>row.id===userId&&row.active),role=state.roles.find(row=>row.id===user?.roleId);
 if(!role||role.teamScoped)return false;
 const permissions=role.permissions as readonly string[];
 return permissions.includes('donors')&&(action==='view'||permissions.includes(`donors-${action}`));
}
function requireDonors(state:CmsState,actorId:string,action:DonorAction){ensure(canDonors(state,actorId,action),action==='invoice'?'Je hebt rechten voor donateursfacturen nodig.':action==='settings'?'Je hebt rechten voor donateursinstellingen nodig.':'Je hebt rechten voor donateursbeheer nodig.');}
export function createDonorSeed():DonorState{return {people:[],contributions:[],invoices:[]};}
export function readDonors(state:Pick<CmsState,'sponsorship'>):DonorState{return state.sponsorship?.donors||createDonorSeed();}
export function ensureDonors(state:Pick<CmsState,'sponsorship'>):DonorState{const data=ensureSponsorship(state);return data.donors||(data.donors=createDonorSeed());}
function record<T extends {id:string}>(rows:T[],value:T){const index=rows.findIndex(row=>row.id===value.id);if(index===-1)rows.push(clone(value));else rows[index]=clone(value);}
function clean(value:string,max:number,label:string){ensure(typeof value==='string'&&value.length<=max,`Controleer ${label} (maximaal ${max} tekens).`);return value.trim();}
function _saveDonor(state:CmsState,actorId:string,value:Donor):Donor{
 requireDonors(state,actorId,'manage');
 const next:Donor={...clone(value),id:clean(value.id,150,'de donateurreferentie'),name:clean(value.name,150,'de naam'),email:clean(value.email,254,'het e-mailadres').toLowerCase(),phone:clean(value.phone,60,'het telefoonnummer'),address:clean(value.address,250,'het adres'),postalCode:clean(value.postalCode,30,'de postcode'),city:clean(value.city,150,'de plaats'),notes:clean(value.notes,5000,'de notities')};
 ensure(next.id&&next.name,'Vul een naam in.');ensure(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(next.id),'Kies een geldige donateurreferentie.');ensure(['person','company'].includes(next.kind)&&typeof next.active==='boolean','Kies een persoon of bedrijf en een geldige status.');ensure(emailValid(next.email),'Vul een geldig e-mailadres in.');
 const data=ensureDonors(state),previous=data.people.find(row=>row.id===next.id);next.createdAt=previous?.createdAt||stamp();next.updatedAt=stamp();record(data.people,next);return clone(next);
}
function contributionLine(contribution:DonorContribution,name:string):SponsorLine{return {id:contribution.id,itemId:contribution.itemId,name,description:contribution.description,quantity:contribution.quantity,unitPriceCents:contribution.unitPriceCents,taxRate:contribution.taxRate,startDate:contribution.startDate,endDate:contribution.endDate};}
function contributionFinancialIdentity(value:DonorContribution){return JSON.stringify([value.donorId,value.itemId,value.description,value.quantity,value.unitPriceCents,value.taxRate,value.startDate,value.endDate]);}
function _saveDonorContribution(state:CmsState,actorId:string,value:DonorContribution):DonorContribution{
 requireDonors(state,actorId,'manage');
 const data=ensureDonors(state),previous=data.contributions.find(row=>row.id===value.id),donor=data.people.find(row=>row.id===value.donorId),item=ensureSponsorship(state).items.find(row=>row.id===value.itemId);
 ensure(value.id&&typeof value.id==='string'&&value.id.length<=150&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value.id),'De bijdrage heeft geen geldige referentie.');ensure(donor,'Kies een bestaande donateur.');ensure(donor.active||!!previous,'Deze donateur is niet actief.');
 ensure(validDate(value.startDate)&&(value.endDate===''||validDate(value.endDate)&&value.startDate<=value.endDate),'Kies een geldige begin- en einddatum.');ensure(['active','ended'].includes(value.status),'Kies een geldige bijdrstatus.');
 const next={...clone(value),description:clean(value.description,1000,'de omschrijving'),createdAt:previous?.createdAt||stamp(),updatedAt:stamp()},sameFinancial=!!previous&&contributionFinancialIdentity(previous)===contributionFinancialIdentity(next);
 // Ending an existing commitment remains possible after the catalogue marker
 // changes. This exception never permits a new or financially altered source.
 ensure(next.itemId===''||item&&(item.isDonorItem&&(item.active||previous?.itemId===item.id)||sameFinancial),'Kies een actief donateuritem uit de sponsorcatalogus.');
 ensure(next.itemId!==''||next.description,'Vul een omschrijving voor de vrije bijdrage in.');
 calculateSponsorTotals([contributionLine(next,item?.name||next.description||'Vrije bijdrage')]);
 if(previous&&data.invoices.some(row=>row.contributionId===previous.id&&row.status!=='cancelled'))ensure(sameFinancial,'Deze bijdrage is al gefactureerd. Maak voor een nieuwe periode of ander bedrag een nieuwe bijdrage aan.');
 record(data.contributions,next);return clone(next);
}
function _issueDonorInvoice(state:CmsState,actorId:string,contributionId:string,input:{issueDate:string;dueDate:string}):DonorInvoice{
 requireDonors(state,actorId,'invoice');
 const data=ensureDonors(state),contribution=data.contributions.find(row=>row.id===contributionId);
 ensure(contribution,'De donateurbijdrage bestaat niet.');
 const existing=data.invoices.find(row=>row.contributionId===contribution.id&&row.status!=='cancelled');if(existing)return clone(existing);
 const donor=data.people.find(row=>row.id===contribution.donorId),item=ensureSponsorship(state).items.find(row=>row.id===contribution.itemId);
 ensure(donor?.active,'De donateur is niet actief.');ensure(contribution.status==='active','Deze bijdrage is beëindigd.');ensure(validDate(contribution.startDate)&&(contribution.endDate===''||validDate(contribution.endDate)&&contribution.startDate<=contribution.endDate),'Kies een geldige begin- en einddatum.');ensure(contribution.itemId===''||item?.isDonorItem,'Dit item is niet meer als donateuritem gemarkeerd.');ensure(contribution.itemId!==''||contribution.description.trim(),'Vul een omschrijving voor de vrije bijdrage in.');
 ensure(validDate(input.issueDate)&&validDate(input.dueDate)&&input.dueDate>=input.issueDate,'De vervaldatum moet op of na de factuurdatum liggen.');
 const lines=[contributionLine(contribution,item?.name||contribution.description||'Vrije bijdrage')],totals=calculateSponsorTotals(lines);ensure(totals.totalCents>0,'Een factuur moet een positief bedrag bevatten.');
 const sponsorship=ensureSponsorship(state),club=sponsorship.settings.contractClubDetails,issuer={legalName:club?.legalName||'Duindorp SV',address:club?.address||'',companyNumber:club?.companyNumber||'',email:club?.email||sponsorship.settings.committeeEmail};
 const [number]=reserveInvoiceNumbers(sponsorship,'donors',input.issueDate),invoice:DonorInvoice={id:uid('donor-invoice'),donorId:donor.id,contributionId:contribution.id,number,issueDate:input.issueDate,dueDate:input.dueDate,status:'open',issuer,recipient:clone(donor),lines:clone(lines),totals:clone(totals),totalCents:totals.totalCents,paidAt:'',createdAt:stamp()};
 data.invoices.unshift(invoice);return clone(invoice);
}
function _markDonorInvoicePaid(state:CmsState,actorId:string,invoiceId:string,reference:string):DonorInvoice{
 requireDonors(state,actorId,'invoice');ensure(typeof reference==='string'&&reference.trim().length>0&&reference.length<=500,'Vul een bank- of boekingsreferentie in.');const invoice=ensureDonors(state).invoices.find(row=>row.id===invoiceId);ensure(invoice,'Factuur niet gevonden.');ensure(invoice.status!=='cancelled','Een geannuleerde factuur kan niet betaald worden gemarkeerd.');if(invoice.status==='open'){invoice.status='paid';invoice.paidAt=stamp();invoice.paymentMethod='manual';invoice.paymentReference=reference.trim();}return clone(invoice);
}
/** Sponsor rows are projections of source lines, never separate payable contributions. */
export function getDonorEntries(state:Pick<CmsState,'sponsorship'> & {donorEntries?:DonorEntry[]}):DonorEntry[]{
 if(state.donorEntries!==undefined)return clone(state.donorEntries);
 const data=readSponsorship(state),donors=readDonors(state),items=new Map(data.items.filter(row=>row.isDonorItem).map(row=>[row.id,row])),entries:DonorEntry[]=[];
 for(const contribution of donors.contributions){const donor=donors.people.find(row=>row.id===contribution.donorId);if(!donor)continue;const invoices=donors.invoices.filter(row=>row.contributionId===contribution.id&&row.status!=='cancelled'),item=data.items.find(row=>row.id===contribution.itemId),name=item?.name||contribution.description||'Donateurbijdrage';entries.push({id:`direct:${contribution.id}`,source:'direct',donorId:donor.id,name:donor.name,email:donor.email,itemId:contribution.itemId,itemName:name,description:contribution.description,quantity:contribution.quantity,unitPriceCents:contribution.unitPriceCents,taxRate:contribution.taxRate,startDate:contribution.startDate,endDate:contribution.endDate,status:!donor.active||contribution.status==='ended'?'ended':'active',sourceId:contribution.id,sourceType:'contribution',sourceLabel:'Rechtstreekse donateurbijdrage',packageName:'',invoiceIds:invoices.map(row=>row.id),billing:invoices.length?'donor-invoice':'unbilled',amountCents:calculateSponsorTotals([contributionLine(contribution,name)]).totalCents});}
 const sourceAgreementIds=new Set(data.agreements.map(row=>row.proposalId).filter(Boolean));
 const addLines=(source:{id:string;sponsorId:string;lines:SponsorLine[];startDate:string;endDate:string;name:string;status:DonorEntry['status'];type:'proposal'|'agreement';packageName:string})=>{
  const sponsor=data.sponsors.find(row=>row.id===source.sponsorId);if(!sponsor)return;const invoices=source.type==='agreement'?data.invoices.filter(row=>row.agreementId===source.id&&row.status!=='cancelled'):[];
  for(const line of source.lines){if(!items.has(line.itemId))continue;entries.push({id:`sponsor:${source.type}:${source.id}:${line.id}`,source:'sponsor',sponsorId:sponsor.id,name:sponsor.name,email:sponsor.email,itemId:line.itemId,itemName:line.name,description:line.description,quantity:line.quantity,unitPriceCents:line.unitPriceCents,taxRate:line.taxRate,startDate:line.startDate||source.startDate,endDate:line.endDate||source.endDate,status:source.status,sourceId:source.id,sourceType:source.type,sourceLabel:source.type==='agreement'?`Via sponsorovereenkomst · ${source.name}`:`Via sponsorvoorstel · ${source.name}`,packageName:source.packageName,invoiceIds:invoices.map(row=>row.id),billing:invoices.length?'sponsor-invoice':'sponsor-agreement',amountCents:calculateSponsorTotals([line]).totalCents});}
 };
 for(const agreement of data.agreements){if(agreement.status==='cancelled')continue;const proposal=data.proposals.find(row=>row.id===agreement.proposalId),packageName=agreement.snapshot.contract?.packageName||data.packages.find(row=>row.id===proposal?.packageId)?.name||'';addLines({id:agreement.id,sponsorId:agreement.sponsorId,lines:agreement.snapshot.lines,startDate:agreement.snapshot.startDate,endDate:agreement.snapshot.endDate,name:agreement.number,status:agreement.status==='signed'?'active':'pending',type:'agreement',packageName});}
 for(const proposal of data.proposals){if(proposal.status==='declined'||proposal.status==='converted'||sourceAgreementIds.has(proposal.id))continue;const captured=proposal.snapshot||proposal;addLines({id:proposal.id,sponsorId:proposal.sponsorId,lines:captured.lines,startDate:captured.startDate,endDate:captured.endDate,name:proposal.name,status:proposal.status==='draft'?'draft':'pending',type:'proposal',packageName:proposal.snapshot?.contract?.packageName||data.packages.find(row=>row.id===proposal.packageId)?.name||''});}
 return entries.sort((a,b)=>a.name.localeCompare(b.name,'nl')||a.itemName.localeCompare(b.itemName,'nl'));
}
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function getDonorInvoiceHtml(state:CmsState,actorId:string,invoiceId:string):string{
 requireDonors(state,actorId,'view');const invoice=readDonors(state).invoices.find(row=>row.id===invoiceId);ensure(invoice,'Factuur niet gevonden.');const club=invoice.issuer??{legalName:'Duindorp SV',address:'',companyNumber:'',email:''},recipient=invoice.recipient;
 return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Donateursfactuur ${escape(invoice.number)}</title><style>*{box-sizing:border-box}body{margin:0;background:#e9edf3;color:#172a48;font:15px/1.6 Arial,sans-serif}article{max-width:820px;margin:32px auto;padding:56px;background:white;border-top:14px solid #1455c0}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1455c0;padding-bottom:24px}header img{width:70px}h1{font-size:28px;color:#1455c0;margin:0}h2{font-size:20px}small,.muted{color:#61718a}table{width:100%;border-collapse:collapse;margin:28px 0}th,td{text-align:left;border-bottom:1px solid #dce3ee;padding:12px 8px}th{background:#edf3fd}.amount{text-align:right;white-space:nowrap}.total{font-size:20px;color:#1455c0;font-weight:bold}.meta{display:flex;justify-content:space-between;gap:20px;margin-top:28px}footer{border-top:1px solid #dce3ee;margin-top:45px;padding-top:18px;font-size:12px}@media print{body{background:white}article{margin:0;padding:25px;border-top-width:10px}.print{display:none}}@media(max-width:600px){article{margin:0;padding:22px}.meta{display:block}header{gap:12px}h1{font-size:23px}}</style></head><body><article><header><img src="/assets/logo.png" alt="Duindorp SV"><div><h1>DONATEURSFACTUUR</h1><strong>${escape(invoice.number)}</strong></div></header><div class="meta"><div><small>FACTUUR AAN</small><h2>${escape(recipient.name)}</h2>${[recipient.address,[recipient.postalCode,recipient.city].filter(Boolean).join(' '),recipient.email].filter(Boolean).map(row=>`${escape(row)}<br>`).join('')}</div><div>Factuurdatum: ${escape(invoice.issueDate)}<br>Vervaldatum: ${escape(invoice.dueDate)}<br>Status: ${invoice.status==='paid'?'Betaald':invoice.status==='cancelled'?'Geannuleerd':'Openstaand'}</div></div><table><thead><tr><th>Omschrijving</th><th>Aantal</th><th class="amount">Excl. btw</th><th>Btw</th></tr></thead><tbody>${invoice.lines.map(line=>`<tr><td><strong>${escape(line.name)}</strong><br><small>${escape(line.description)}<br>${line.endDate?`${escape(line.startDate||'')} t/m ${escape(line.endDate)}`:`Vanaf ${escape(line.startDate||'')} · eenmalig / zonder einddatum`}</small></td><td>${line.quantity}</td><td class="amount">${money(line.unitPriceCents*line.quantity)}</td><td>${line.taxRate==='exempt'?'Vrijgesteld':escape(line.taxRate)+'%'}</td></tr>`).join('')}</tbody></table><table><tbody><tr><td>Totaal exclusief btw</td><td class="amount">${money(invoice.totals.netCents)}</td></tr>${invoice.totals.taxGroups.map(group=>`<tr><td>${group.taxRate==='exempt'?'Vrijgesteld van btw':`Btw ${group.taxRate}%`}</td><td class="amount">${money(group.taxCents)}</td></tr>`).join('')}<tr class="total"><td>Totaal</td><td class="amount">${money(invoice.totalCents)}</td></tr></tbody></table><p>Vermeld ${escape(invoice.number)} bij de betaling.</p><footer><strong>${escape(club.legalName)}</strong><br>${escape(club?.address||'')}<br>${club?.companyNumber?`KvK ${escape(club.companyNumber)} · `:''}${escape(club.email)}<strong>ONZE CLUB. ONZE TROTS.</strong></footer></article></body></html>`;
}

function _cancelDonorInvoice(state:CmsState,actorId:string,invoiceId:string,reason:string):DonorInvoice{
 requireDonors(state,actorId,'invoice');ensure(typeof reason==='string'&&reason.trim().length>0&&reason.length<=1000,'Vul een reden voor annuleren in.');
 const invoice=ensureDonors(state).invoices.find(row=>row.id===invoiceId);ensure(invoice,'Factuur niet gevonden.');if(invoice.status==='cancelled')return clone(invoice);ensure(invoice.status==='open','Alleen een openstaande factuur kan worden geannuleerd. Gebruik voor een betaalde factuur de formele correctieroute.');invoice.status='cancelled';invoice.cancelledAt=stamp();invoice.cancellationReason=reason.trim();return clone(invoice);
}
/** Records a server command; only provider acceptance may update delivery metadata. */
function _sendDonorInvoice(state:CmsState,actorId:string,invoiceId:string):DonorInvoice{
 requireDonors(state,actorId,'invoice');const invoice=readDonors(state).invoices.find(row=>row.id===invoiceId);ensure(invoice,'Factuur niet gevonden.');ensure(invoice.status!=='cancelled','Een geannuleerde factuur kan niet worden verzonden.');ensure(!!invoice.recipient.email&&emailValid(invoice.recipient.email),'Vul voor uitgifte een geldig factuuradres in.');return clone(invoice);
}
export const saveDonor=(...args:Parameters<typeof _saveDonor>):ReturnType<typeof _saveDonor>=>domainMutation('saveDonor',args,()=>_saveDonor(...args));
export const saveDonorContribution=(...args:Parameters<typeof _saveDonorContribution>):ReturnType<typeof _saveDonorContribution>=>domainMutation('saveDonorContribution',args,()=>_saveDonorContribution(...args));
export const issueDonorInvoice=(...args:Parameters<typeof _issueDonorInvoice>):ReturnType<typeof _issueDonorInvoice>=>domainMutation('issueDonorInvoice',args,()=>_issueDonorInvoice(...args));
export const markDonorInvoicePaid=(...args:Parameters<typeof _markDonorInvoicePaid>):ReturnType<typeof _markDonorInvoicePaid>=>domainMutation('markDonorInvoicePaid',args,()=>_markDonorInvoicePaid(...args));
export const cancelDonorInvoice=(...args:Parameters<typeof _cancelDonorInvoice>):ReturnType<typeof _cancelDonorInvoice>=>domainMutation('cancelDonorInvoice',args,()=>_cancelDonorInvoice(...args));
export const sendDonorInvoice=(...args:Parameters<typeof _sendDonorInvoice>):ReturnType<typeof _sendDonorInvoice>=>domainMutation('sendDonorInvoice',args,()=>_sendDonorInvoice(...args));

import type {Sponsor,SponsorBusinessDetails,SponsorContractTemplate,SponsorProposalSnapshot,SponsorTotals} from './sponsorship-types';

export function canonicalSponsorBusinessDetails(value:SponsorBusinessDetails):SponsorBusinessDetails{return {legalName:value.legalName,companyNumber:value.companyNumber,registrationExempt:value.registrationExempt,registrationExemptionReason:value.registrationExemptionReason,vatNumber:value.vatNumber,vatStatus:value.vatStatus,address:value.address,postalCode:value.postalCode,city:value.city,country:value.country,contactName:value.contactName,contactFunction:value.contactFunction,contactEmail:value.contactEmail,invoiceEmail:value.invoiceEmail,phone:value.phone,confirmedAt:value.confirmedAt,confirmedBy:value.confirmedBy,updatedAt:value.updatedAt};}
export function getSponsorBusinessDetails(sponsor:Sponsor):SponsorBusinessDetails{return canonicalSponsorBusinessDetails(sponsor.businessDetails||{legalName:sponsor.name,companyNumber:sponsor.companyNumber,registrationExempt:false,registrationExemptionReason:'',vatNumber:sponsor.vatNumber,vatStatus:'not-applicable',address:sponsor.address,postalCode:sponsor.postalCode,city:sponsor.city,country:'NL',contactName:'',contactFunction:'',contactEmail:sponsor.email,invoiceEmail:sponsor.email,phone:sponsor.phone,confirmedAt:'',confirmedBy:'',updatedAt:''});}
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function getSponsorBusinessReadiness(input:Sponsor|SponsorBusinessDetails){const details='legalName'in input?input:getSponsorBusinessDetails(input),missing:string[]=[];const required:[keyof SponsorBusinessDetails,string][]=[['legalName','Statutaire bedrijfsnaam'],['address','Straat en huisnummer'],['postalCode','Postcode'],['city','Plaats'],['country','Land'],['contactName','Contactpersoon'],['contactFunction','Functie contactpersoon']];for(const [key,label] of required)if(!String(details[key]).trim())missing.push(label);if(details.registrationExempt){if(!details.registrationExemptionReason.trim())missing.push('Toelichting bij ontbreken inschrijving');}else if(!details.companyNumber.trim()||(details.country.toUpperCase()==='NL'&&!/^\d{8}$/.test(details.companyNumber.trim())))missing.push(details.country.toUpperCase()==='NL'?'Geldig KVK-nummer (8 cijfers)':'Registratienummer');if(details.country.toUpperCase()==='NL'&&details.postalCode&&!/^\d{4}\s?[A-Za-z]{2}$/.test(details.postalCode.trim()))missing.push('Geldige Nederlandse postcode');if(!validEmail(details.contactEmail))missing.push('Geldig contact-e-mailadres');if(!validEmail(details.invoiceEmail))missing.push('Geldig factuur-e-mailadres');if(!['registered','exempt','not-applicable'].includes(details.vatStatus))missing.push('Btw-status');if(details.vatStatus==='registered'&&!details.vatNumber.trim())missing.push('Btw-identificatienummer');return {complete:missing.length===0,confirmed:missing.length===0&&!!details.confirmedAt&&!!details.confirmedBy,missing};}

export const SPONSOR_CONTRACT_SHORTCODES=[
 {key:'club.naam',label:'Naam vereniging',group:'Club'},
 {key:'bedrijf.naam',label:'Statutaire bedrijfsnaam',group:'Bedrijf'},
 {key:'bedrijf.kvk',label:'KVK / registratienummer',group:'Bedrijf'},
 {key:'bedrijf.btw',label:'Btw-identificatienummer',group:'Bedrijf'},
 {key:'bedrijf.adres',label:'Volledig bedrijfsadres',group:'Bedrijf'},
 {key:'bedrijf.contactpersoon',label:'Naam contactpersoon',group:'Bedrijf'},
 {key:'bedrijf.functie',label:'Functie contactpersoon',group:'Bedrijf'},
 {key:'bedrijf.email',label:'Contact-e-mailadres',group:'Bedrijf'},
 {key:'bedrijf.factuuremail',label:'Factuur-e-mailadres',group:'Bedrijf'},
 {key:'overeenkomst.naam',label:'Naam overeenkomst',group:'Overeenkomst'},
 {key:'overeenkomst.seizoen',label:'Seizoen',group:'Overeenkomst'},
 {key:'overeenkomst.startdatum',label:'Begindatum',group:'Overeenkomst'},
 {key:'overeenkomst.einddatum',label:'Einddatum',group:'Overeenkomst'},
 {key:'overeenkomst.voorwaarden',label:'Bijzondere afspraken',group:'Overeenkomst'},
 {key:'sponsoring.pakket',label:'Pakketnaam of maatwerk',group:'Sponsoring'},
 {key:'sponsoring.items',label:'Sponsoritems met aantallen en bedragen',group:'Sponsoring'},
 {key:'kosten.subtotaal',label:'Subtotaal exclusief btw',group:'Kosten'},
 {key:'kosten.korting',label:'Korting exclusief btw',group:'Kosten'},
 {key:'kosten.netto',label:'Totaal exclusief btw',group:'Kosten'},
 {key:'kosten.btw',label:'Btw per tarief',group:'Kosten'},
 {key:'kosten.totaal',label:'Totaal inclusief btw',group:'Kosten'},
 {key:'betaling.afspraken',label:'Betaalafspraken',group:'Betaling'},
] as const;

export function createDefaultSponsorContractTemplate():SponsorContractTemplate{return {id:'template-onzetrots',name:'OnzeTrots - sponsorovereenkomst',description:'Een complete voorbeeldbasis met bedrijfsgegevens, sponsorprestaties en kosten. Pas de afspraken aan de samenwerking aan.',title:'Sponsorovereenkomst - {{bedrijf.naam}}',active:true,version:1,updatedAt:'2026-10-22T00:00:00.000Z',body:`1. Samen verbonden met de club

{{club.naam}} en {{bedrijf.naam}}, gevestigd aan {{bedrijf.adres}}, ingeschreven onder nummer {{bedrijf.kvk}}, vertegenwoordigd door {{bedrijf.contactpersoon}} ({{bedrijf.functie}}), spreken het volgende af.

2. Looptijd en zichtbaarheid

Deze samenwerking betreft {{overeenkomst.naam}} voor seizoen {{overeenkomst.seizoen}}. De looptijd begint op {{overeenkomst.startdatum}} en eindigt op {{overeenkomst.einddatum}}. Het gekozen pakket is {{sponsoring.pakket}}.

3. Sponsoritems en prestaties

{{sponsoring.items}}

De uitvoering en plaatsing stemmen de partijen vooraf af. De sponsor levert geschikt beeldmateriaal aan en bevestigt dat dit voor de afgesproken uitingen mag worden gebruikt.

4. Sponsorbijdrage en betaling

Subtotaal exclusief btw: {{kosten.subtotaal}}
Korting exclusief btw: {{kosten.korting}}
Bijdrage exclusief btw: {{kosten.netto}}
Btw: {{kosten.btw}}
Totaal inclusief btw: {{kosten.totaal}}

{{betaling.afspraken}} Facturen worden gericht aan {{bedrijf.factuuremail}}.

5. Aanvullende afspraken

{{overeenkomst.voorwaarden}}

Wijzigingen of verlenging worden afzonderlijk schriftelijk vastgelegd. Bij vragen over de uitvoering overleggen de partijen via hun contactpersonen. Contact voor de sponsor: {{bedrijf.contactpersoon}}, {{bedrijf.email}}.

6. Akkoord en ondertekening

De sponsor bevestigt bij ondertekening kennis te hebben genomen van de vastgelegde bedrijfsgegevens, prestaties, looptijd en bijdrage en bevoegd te zijn om namens de sponsor akkoord te geven. De sponsor ondertekent eerst met het ingelogde sponsoraccount en een afzonderlijke e-mail-OTP-verificatie. Daarna tekent een bevoegd commissielid namens Duindorp SV vanuit het eigen ingelogde account, met een eigen e-mail-OTP-verificatie. De overeenkomst is pas volledig ondertekend nadat beide partijen akkoord hebben gegeven. Het ondertekenverslag wordt aan deze vaste documentversie toegevoegd.

`};}

export function validateSponsorContractTemplate(template:Pick<SponsorContractTemplate,'name'|'title'|'body'>){if(!template.name.trim()||!template.title.trim()||!template.body.trim())throw new Error('Vul een templatenaam, documenttitel en inhoud in.');if(template.title.length>500||template.body.length>40000||template.name.length>180)throw new Error('De template is te lang. Houd de titel kort en de inhoud onder 40.000 tekens.');const allowed=new Set<string>(SPONSOR_CONTRACT_SHORTCODES.map(code=>code.key));const text=template.title+'\n'+template.body;const unknown=[...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map(match=>match[1].trim()).filter(key=>!allowed.has(key));if(unknown.length)throw new Error(`Onbekende shortcode: ${[...new Set(unknown)].join(', ')}.`);if(text.replace(/\{\{\s*[^{}]*?\s*\}\}/g,'').includes('{{')||text.replace(/\{\{\s*[^{}]*?\s*\}\}/g,'').includes('}}'))throw new Error('Een shortcode is niet correct gesloten. Gebruik {{bedrijf.naam}}.');}
export function renderSponsorContractTemplate(template:Pick<SponsorContractTemplate,'name'|'title'|'body'>,variables:Record<string,string>){validateSponsorContractTemplate(template);const replace=(value:string)=>value.replace(/\{\{\s*([^{}]*?)\s*\}\}/g,(_,key:string)=>variables[key.trim()]??'');return {title:replace(template.title),body:replace(template.body)};}
const money=(cents:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(cents/100);
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):value;
export function getSponsorContractVariables(snapshot:SponsorProposalSnapshot,company:SponsorBusinessDetails,packageName:string,totals:SponsorTotals,clubName='Duindorp SV'):Record<string,string>{return {'club.naam':clubName,'bedrijf.naam':company.legalName,'bedrijf.kvk':company.registrationExempt?`Niet ingeschreven: ${company.registrationExemptionReason}`:company.companyNumber,'bedrijf.btw':company.vatNumber||'Niet van toepassing','bedrijf.adres':[company.address,`${company.postalCode} ${company.city}`.trim(),company.country].filter(Boolean).join(', '),'bedrijf.contactpersoon':company.contactName,'bedrijf.functie':company.contactFunction,'bedrijf.email':company.contactEmail,'bedrijf.factuuremail':company.invoiceEmail,'overeenkomst.naam':snapshot.name,'overeenkomst.seizoen':snapshot.season,'overeenkomst.startdatum':date(snapshot.startDate),'overeenkomst.einddatum':date(snapshot.endDate),'overeenkomst.voorwaarden':snapshot.terms,'sponsoring.pakket':packageName,'sponsoring.items':snapshot.lines.map(line=>`${line.quantity} x ${line.name} - ${money(line.quantity*line.unitPriceCents)} excl. btw (${line.taxRate==='exempt'?'vrijgesteld':line.taxRate+'% btw'})${line.description?'\n'+line.description:''}`).join('\n\n'),'kosten.subtotaal':money(totals.subtotalCents),'kosten.korting':money(totals.discountCents),'kosten.netto':money(totals.netCents),'kosten.btw':totals.taxGroups.map(group=>`${group.taxRate==='exempt'?'Vrijgesteld':group.taxRate+'%'}: ${money(group.taxCents)}`).join('; '),'kosten.totaal':money(totals.totalCents),'betaling.afspraken':snapshot.paymentTerms};}
/** Stable identity check excludes confirmation timestamps, never uses public marketing data. */
export function sponsorBusinessIdentity(details:SponsorBusinessDetails){const {confirmedAt:_a,confirmedBy:_b,updatedAt:_c,...identity}=details;return JSON.stringify(Object.fromEntries(Object.entries(identity).sort(([a],[b])=>a.localeCompare(b))));}

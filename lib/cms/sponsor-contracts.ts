import type {Sponsor,SponsorBusinessDetails,SponsorContractTemplate,SponsorProposalSnapshot,SponsorTotals,SponsorContractClubDetails} from './sponsorship-types';

/** Particular agreements belong to a proposal; the full conditions live in its chosen template. */
export const DEFAULT_SPONSOR_PROPOSAL_TERMS='Geen aanvullende afspraken vastgelegd.';

export function canonicalSponsorBusinessDetails(value:SponsorBusinessDetails):SponsorBusinessDetails{return {legalName:value.legalName,companyNumber:value.companyNumber,registrationExempt:value.registrationExempt,registrationExemptionReason:value.registrationExemptionReason,vatNumber:value.vatNumber,vatStatus:value.vatStatus,address:value.address,postalCode:value.postalCode,city:value.city,country:value.country,contactName:value.contactName,contactFunction:value.contactFunction,contactEmail:value.contactEmail,invoiceEmail:value.invoiceEmail,phone:value.phone,confirmedAt:value.confirmedAt,confirmedBy:value.confirmedBy,updatedAt:value.updatedAt};}
export function getSponsorBusinessDetails(sponsor:Sponsor):SponsorBusinessDetails{return canonicalSponsorBusinessDetails(sponsor.businessDetails||{legalName:sponsor.name,companyNumber:sponsor.companyNumber,registrationExempt:false,registrationExemptionReason:'',vatNumber:sponsor.vatNumber,vatStatus:'not-applicable',address:sponsor.address,postalCode:sponsor.postalCode,city:sponsor.city,country:'NL',contactName:'',contactFunction:'',contactEmail:sponsor.email,invoiceEmail:sponsor.email,phone:sponsor.phone,confirmedAt:'',confirmedBy:'',updatedAt:''});}
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function getSponsorBusinessReadiness(input:Sponsor|SponsorBusinessDetails){const details='legalName'in input?input:getSponsorBusinessDetails(input),missing:string[]=[];const required:[keyof SponsorBusinessDetails,string][]=[['legalName','Statutaire bedrijfsnaam'],['address','Straat en huisnummer'],['postalCode','Postcode'],['city','Plaats'],['country','Land'],['contactName','Contactpersoon'],['contactFunction','Functie contactpersoon']];for(const [key,label] of required)if(!String(details[key]).trim())missing.push(label);if(details.registrationExempt){if(!details.registrationExemptionReason.trim())missing.push('Toelichting bij ontbreken inschrijving');}else if(!details.companyNumber.trim()||(details.country.toUpperCase()==='NL'&&!/^\d{8}$/.test(details.companyNumber.trim())))missing.push(details.country.toUpperCase()==='NL'?'Geldig KVK-nummer (8 cijfers)':'Registratienummer');if(details.country.toUpperCase()==='NL'&&details.postalCode&&!/^\d{4}\s?[A-Za-z]{2}$/.test(details.postalCode.trim()))missing.push('Geldige Nederlandse postcode');if(!validEmail(details.contactEmail))missing.push('Geldig contact-e-mailadres');if(!validEmail(details.invoiceEmail))missing.push('Geldig factuur-e-mailadres');if(!['registered','exempt','not-applicable'].includes(details.vatStatus))missing.push('Btw-status');if(details.vatStatus==='registered'&&!details.vatNumber.trim())missing.push('Btw-identificatienummer');return {complete:missing.length===0,confirmed:missing.length===0&&!!details.confirmedAt&&!!details.confirmedBy,missing};}

export const SPONSOR_CONTRACT_SHORTCODES=[
 {key:'club.naam',label:'Naam vereniging',group:'Club'},
 {key:'club.statutaire_naam',label:'Statutaire naam vereniging',group:'Club'},
 {key:'club.adres',label:'Volledig verenigingsadres',group:'Club'},
 {key:'club.kvk',label:'KVK-nummer vereniging',group:'Club'},
 {key:'club.vertegenwoordiger',label:'Vertegenwoordiger vereniging',group:'Club'},
 {key:'club.functie',label:'Functie vertegenwoordiger',group:'Club'},
 {key:'club.email',label:'Contact-e-mailadres vereniging',group:'Club'},
 {key:'bedrijf.naam',label:'Statutaire bedrijfsnaam',group:'Bedrijf'},
 {key:'bedrijf.kvk',label:'KVK / registratienummer',group:'Bedrijf'},
 {key:'bedrijf.inschrijving',label:'Inschrijvingsclausule of gemotiveerde vrijstelling',group:'Bedrijf'},
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
 {key:'sponsoring.incentives',label:'Itemkortingen en incentiveafspraken',group:'Sponsoring'},
 {key:'kosten.tegenprestaties',label:'Tegenprestaties vóór kortingen',group:'Kosten'},
 {key:'kosten.opmaak',label:'Eenmalige opmaakkosten',group:'Kosten'},
 {key:'kosten.itemkorting',label:'Totaal itemkortingen',group:'Kosten'},
 {key:'kosten.pakketkorting',label:'Afzonderlijke pakketkorting',group:'Kosten'},
 {key:'kosten.voorstelkorting',label:'Aanvullende voorstelkorting',group:'Kosten'},
 {key:'kosten.pakkettoeslag',label:'Afzonderlijke pakkettoeslag',group:'Kosten'},
 {key:'kosten.prijsspecificatie',label:'Volledige prijsopbouw met losse kortingen',group:'Kosten'},
 {key:'kosten.subtotaal',label:'Subtotaal exclusief btw',group:'Kosten'},
 {key:'kosten.korting',label:'Korting exclusief btw',group:'Kosten'},
 {key:'kosten.netto',label:'Totaal exclusief btw',group:'Kosten'},
 {key:'kosten.btw',label:'Btw per tarief',group:'Kosten'},
 {key:'kosten.totaal',label:'Totaal inclusief btw',group:'Kosten'},
 {key:'betaling.afspraken',label:'Betaalafspraken',group:'Betaling'},
] as const;

export function createDefaultSponsorContractTemplate():SponsorContractTemplate{return {id:'template-onzetrots-2026',name:'OnzeTrots - sponsorovereenkomst 2026',description:'Voorbeeldvoorwaarden naar de aangeleverde overeenkomst: tien artikelen, afzonderlijke pakketkorting en afspraken per seizoen.',title:'Sponsorovereenkomst - {{bedrijf.naam}}',active:true,version:1,updatedAt:'2026-11-05T00:00:00.000Z',body:`1. Partijen

{{club.statutaire_naam}}, gevestigd aan {{club.adres}}, ingeschreven onder KvK-nummer {{club.kvk}}, vertegenwoordigd door {{club.vertegenwoordiger}} ({{club.functie}}), hierna: de vereniging.

En {{bedrijf.naam}}, gevestigd aan {{bedrijf.adres}}, {{bedrijf.inschrijving}}, vertegenwoordigd door {{bedrijf.contactpersoon}} ({{bedrijf.functie}}), hierna: de sponsor.

Partijen leggen met deze overeenkomst hun afspraken over sponsoring en de daarbij behorende tegenprestaties vast.

2. Doel en looptijd

De sponsor ondersteunt de vereniging in ruil voor de afgesproken tegenprestaties. De eerste overeengekomen periode loopt van {{overeenkomst.startdatum}} tot en met {{overeenkomst.einddatum}}.
Deze overeenkomst eindigt na de overeengekomen periode en wordt niet automatisch verlengd. Een verlenging leggen partijen schriftelijk vast.

Een schriftelijke opzegging of bevestiging kan per e-mail aan de contactadressen in artikel 6 plaatsvinden. De ontvangende partij bevestigt de ontvangst.

3. Sponsorbijdrage en betaling

De totale overeengekomen bijdrage bedraagt {{kosten.totaal}} inclusief btw. De volledige prijsspecificatie per tegenprestatie staat in artikel 4.
Facturatie en betaling: {{betaling.afspraken}}
Facturen worden gericht aan {{bedrijf.factuuremail}}.

De vereniging verstrekt een factuur met de betaalgegevens. De bijdrage geldt voor de prestaties en duur in het onderstaande overzicht. Een in het overzicht opgenomen eenmalige kostenpost wordt alleen bij de eerste factuur berekend, tenzij schriftelijk een ander betalingsmoment is afgesproken; bij verlenging wordt die niet opnieuw verschuldigd. Kosten voor ontwerp, productie, plaatsing of vervanging van reclamemateriaal komen alleen aanvullend voor rekening van de sponsor wanneer partijen dit vooraf schriftelijk overeenkomen.

4. Tegenprestaties en pakket

De vereniging verzorgt de volgende overeengekomen tegenprestaties voor {{sponsoring.pakket}}:

{{sponsoring.items}}

{{kosten.prijsspecificatie}}

De rijbedragen zijn de overeengekomen tarieven voor de genoemde duur. Een overeengekomen pakketkorting staat afzonderlijk onder het overzicht en wordt niet in de zichtbare itemtarieven verwerkt. Het totaal onder het overzicht en in artikel 3 is leidend. Exclusiviteit geldt uitsluitend als dit uitdrukkelijk in deze overeenkomst is opgenomen.

Voor fysieke sponsoruitingen vermeldt het overzicht het aantal, de locatie, het afgesproken formaat en de plaatsingsduur. Afspraken over eigendom, onderhoud, vervanging en verwijdering worden daarbij vastgelegd voor zover van toepassing.

De vereniging voert de prestaties zorgvuldig uit. Omzet, bezoekersaantallen, media-aandacht en sportieve resultaten worden niet gegarandeerd, tenzij daarover een concrete schriftelijke afspraak is gemaakt.

Aanvullende afspraken bij deze samenwerking:
{{overeenkomst.voorwaarden}}

5. Aanlevering en gebruik van materiaal

De sponsor levert benodigde logo's, teksten en bestanden tijdig en in bruikbare kwaliteit aan. Partijen stemmen de planning en technische eisen onderling af. De sponsor is verantwoordelijk voor de juistheid van aangeleverde teksten, gegevens en bestanden en voor de benodigde gebruiksrechten. Indien een drukproef wordt verstrekt, controleert en bevestigt de sponsor deze vóór productie. De vereniging blijft verantwoordelijk voor een correcte verwerking van het goedgekeurde materiaal.

Iedere partij behoudt haar rechten op naam, logo en overige materiaal. Gebruik door de andere partij is uitsluitend toegestaan voor de afgesproken sponsoractiviteiten tijdens de looptijd. Ander gebruik vereist voorafgaande toestemming. Na afloop worden actieve sponsorvermeldingen binnen een redelijke termijn beëindigd; over fysieke materialen maken partijen praktische afspraken.

6. Afstemming en wijzigingen

Contact verloopt via {{club.email}} en {{bedrijf.email}}. Partijen melden omstandigheden die de uitvoering beïnvloeden zo spoedig mogelijk aan elkaar.

Wijzigingen in inhoud, looptijd, prijs of tegenprestaties vereisen schriftelijke instemming van beide partijen. Als een prestatie niet volgens afspraak kan worden uitgevoerd, bespreken partijen een passend alternatief of een evenredige aanpassing van de bijdrage. De vereniging vervangt een afgesproken prestatie niet eenzijdig.

7. Tekortkomingen en beëindiging

Bij te late betaling stuurt de vereniging een schriftelijke betalingsherinnering met een redelijke aanvullende betalingstermijn. Blijft betaling daarna uit, dan kan de vereniging de afgesproken sponsoruitingen na schriftelijke aankondiging tijdelijk opschorten of afdekken, voor zover dit in verhouding staat tot de betalingsachterstand. Ontbinding en definitieve verwijdering volgen de onderstaande regeling en de toepasselijke wettelijke regels.

Bij niet-nakoming stelt de andere partij de tekortkoming schriftelijk aan de orde en biedt zij, voor zover de wet dit vereist, een redelijke termijn voor herstel. Blijft herstel uit, dan kan de overeenkomst geheel of gedeeltelijk worden ontbonden voor zover de tekortkoming dit rechtvaardigt.

Bij beëindiging rekenen partijen geleverde en niet-geleverde prestaties af volgens hun afspraken en de toepasselijke wettelijke regels. Wettelijke rechten op nakoming, opschorting en schadevergoeding blijven bestaan.

8. Overmacht

Een partij die door overmacht niet kan nakomen, informeert de andere partij zo spoedig mogelijk over de oorzaak en verwachte gevolgen. Partijen overleggen over hervatting, een alternatief of aanpassing van de samenwerking. De wettelijke regels blijven gelden; overmacht geeft niet automatisch recht op behoud van de volledige vergoeding voor niet-geleverde prestaties.

9. Persoonsgegevens

Partijen gebruiken contact- en ondertekengegevens voor uitvoering, administratie en bewijs van deze overeenkomst. Zij beveiligen deze gegevens en bewaren ze niet langer dan noodzakelijk, rekening houdend met wettelijke verplichtingen. De ondertekenregistratie bevat naam, tijdstip, e-mailverificatie en, indien betrouwbaar beschikbaar, het IP-adres.

10. Versies, recht en ondertekening

Op deze overeenkomst is Nederlands recht van toepassing. Partijen proberen een geschil eerst in overleg op te lossen; daarna kan het worden voorgelegd aan de bevoegde rechter.

Beide partijen verklaren deze versie te hebben gelezen, ermee in te stemmen en bevoegd te zijn namens hun organisatie te tekenen, zo nodig op grond van een toereikende volmacht. Wijzigingen na ondertekening worden als afzonderlijke versie of aanvulling vastgelegd en opnieuw door beide partijen bevestigd. Daarbij wordt vermeld welke eerdere afspraken worden vervangen. De oorspronkelijke ondertekende versie en bijbehorende registratie blijven behouden.

De sponsor ondertekent eerst. Daarna tekent een bevoegd vertegenwoordiger namens {{club.naam}} vanuit het eigen account. Beide partijen bevestigen hun ondertekening afzonderlijk met een e-mailcode. De overeenkomst is pas volledig ondertekend nadat beide partijen akkoord hebben gegeven.`};}

export function validateSponsorContractTemplate(template:Pick<SponsorContractTemplate,'name'|'title'|'body'>){if(!template.name.trim()||!template.title.trim()||!template.body.trim())throw new Error('Vul een templatenaam, documenttitel en inhoud in.');if(template.title.length>500||template.body.length>40000||template.name.length>180)throw new Error('De template is te lang. Houd de titel kort en de inhoud onder 40.000 tekens.');const allowed=new Set<string>(SPONSOR_CONTRACT_SHORTCODES.map(code=>code.key));const text=template.title+'\n'+template.body;if(text.includes('{{{')||text.includes('}}}'))throw new Error('Een shortcode is niet correct gesloten. Gebruik {{bedrijf.naam}}.');const unknown=[...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map(match=>match[1].trim()).filter(key=>!allowed.has(key));if(unknown.length)throw new Error(`Onbekende shortcode: ${[...new Set(unknown)].join(', ')}.`);if(text.replace(/\{\{\s*[^{}]*?\s*\}\}/g,'').includes('{{')||text.replace(/\{\{\s*[^{}]*?\s*\}\}/g,'').includes('}}'))throw new Error('Een shortcode is niet correct gesloten. Gebruik {{bedrijf.naam}}.');}
export function renderSponsorContractTemplate(template:Pick<SponsorContractTemplate,'name'|'title'|'body'>,variables:Record<string,string>){validateSponsorContractTemplate(template);const replace=(value:string)=>value.replace(/\{\{\s*([^{}]*?)\s*\}\}/g,(_,key:string)=>variables[key.trim()]??'');return {title:replace(template.title),body:replace(template.body)};}
const money=(cents:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(cents/100);
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):value;
export type {SponsorContractClubDetails} from './sponsorship-types';
export function getSponsorContractVariables(snapshot:SponsorProposalSnapshot,company:SponsorBusinessDetails,packageName:string,totals:SponsorTotals,clubName='Duindorp SV',clubDetails:SponsorContractClubDetails={}):Record<string,string>{
 const gross=snapshot.lines.reduce((sum,line)=>sum+line.quantity*line.unitPriceCents,0),setup=snapshot.lines.reduce((sum,line)=>sum+(line.setupCostCents||0),0),itemDiscount=snapshot.lines.reduce((sum,line)=>sum+(line.lineDiscountCents||0),0),packageDiscount=snapshot.packageDiscountCents||0,proposalDiscount=snapshot.discountCents||0,surcharge=snapshot.packageSurchargeCents||0;
 const period=(line:SponsorProposalSnapshot['lines'][number])=>[line.periodLabel,line.startDate||line.endDate?[line.startDate?date(line.startDate):date(snapshot.startDate),line.endDate?date(line.endDate):date(snapshot.endDate)].join(' t/m '):''].filter(Boolean).join(' - ');
 const incentives=snapshot.lines.filter(line=>line.lineDiscountCents).map(line=>`${line.name}${period(line)?` - ${period(line)}`:''}: ${line.lineDiscountLabel||'Itemkorting'} - ${money(line.lineDiscountCents||0)} excl. btw.`).join('\n');
 const itemRows=snapshot.lines.map(line=>{const base=line.quantity*line.unitPriceCents,opmaak=line.setupCostCents||0,korting=line.lineDiscountCents||0;return [`${line.quantity} x ${line.name}${line.addition?' - '+line.addition:''}`,line.description,period(line)?`Periode: ${period(line)}`:'',`Tarief per stuk: ${money(line.unitPriceCents)} excl. btw. Tegenprestatie: ${money(base)}.`,opmaak?`Eenmalige opmaakkosten: ${money(opmaak)} excl. btw.`:'',korting?`${line.lineDiscountLabel||'Itemkorting'}: - ${money(korting)} excl. btw.`:'',`Regelbijdrage: ${money(base+opmaak-korting)} excl. btw (${line.taxRate==='exempt'?'vrijgesteld':line.taxRate+'% btw'}).`].filter(Boolean).join('\n');}).join('\n\n');
 const priceRows=[`Tegenprestaties: ${money(gross)}`,setup?`Eenmalige opmaakkosten: ${money(setup)}`:'',surcharge?`Pakkettoeslag: ${money(surcharge)}`:'',`Subtotaal exclusief btw: ${money(totals.subtotalCents)}`,itemDiscount?`Itemkortingen: - ${money(itemDiscount)}`:'',packageDiscount?`Pakketkorting: - ${money(packageDiscount)}`:'',proposalDiscount?`Aanvullende voorstelkorting: - ${money(proposalDiscount)}`:'',`Sponsorbijdrage exclusief btw: ${money(totals.netCents)}`,...totals.taxGroups.map(group=>`${group.taxRate==='exempt'?'Vrijgesteld van btw':'Btw '+group.taxRate+'%'}: ${money(group.taxCents)}`),`Totaal inclusief btw: ${money(totals.totalCents)}`].filter(Boolean).join('\n');
 return {'club.naam':clubName,'club.statutaire_naam':clubDetails.legalName||'Duindorp Sportvereniging','club.adres':clubDetails.address||'Houtrustlaan 1, 2566 ZW Den Haag','club.kvk':clubDetails.companyNumber||'27092652','club.vertegenwoordiger':clubDetails.representative||'Danny Goldenbelt','club.functie':clubDetails.representativeFunction||'Voorzitter','club.email':clubDetails.email||'secretariaat@duindorpsv.nl','bedrijf.naam':company.legalName,'bedrijf.kvk':company.registrationExempt?`Niet ingeschreven: ${company.registrationExemptionReason}`:company.companyNumber,'bedrijf.inschrijving':company.registrationExempt?`zonder inschrijving (${company.registrationExemptionReason})`:`ingeschreven onder ${company.country.toUpperCase()==='NL'?'KvK-nummer':'registratienummer'} ${company.companyNumber}`,'bedrijf.btw':company.vatNumber||'Niet van toepassing','bedrijf.adres':[company.address,`${company.postalCode} ${company.city}`.trim(),company.country].filter(Boolean).join(', '),'bedrijf.contactpersoon':company.contactName,'bedrijf.functie':company.contactFunction,'bedrijf.email':company.contactEmail,'bedrijf.factuuremail':company.invoiceEmail,'overeenkomst.naam':snapshot.name,'overeenkomst.seizoen':snapshot.season,'overeenkomst.startdatum':date(snapshot.startDate),'overeenkomst.einddatum':date(snapshot.endDate),'overeenkomst.voorwaarden':snapshot.terms,'sponsoring.pakket':packageName,'sponsoring.items':itemRows,'sponsoring.incentives':incentives||'Geen afzonderlijke itemkortingen afgesproken.','kosten.tegenprestaties':money(gross),'kosten.opmaak':money(setup),'kosten.itemkorting':money(itemDiscount),'kosten.pakketkorting':money(packageDiscount),'kosten.voorstelkorting':money(proposalDiscount),'kosten.pakkettoeslag':money(surcharge),'kosten.prijsspecificatie':priceRows,'kosten.subtotaal':money(totals.subtotalCents),'kosten.korting':money(totals.discountCents),'kosten.netto':money(totals.netCents),'kosten.btw':totals.taxGroups.map(group=>`${group.taxRate==='exempt'?'Vrijgesteld':group.taxRate+'%'}: ${money(group.taxCents)}`).join('; '),'kosten.totaal':money(totals.totalCents),'betaling.afspraken':snapshot.paymentTerms};
}

/** Stable identity check excludes confirmation timestamps, never uses public marketing data. */
export function sponsorBusinessIdentity(details:SponsorBusinessDetails){const {confirmedAt:_a,confirmedBy:_b,updatedAt:_c,...identity}=details;return JSON.stringify(Object.fromEntries(Object.entries(identity).sort(([a],[b])=>a.localeCompare(b))));}

import type {CmsState} from './types';
import type {SponsorAgreement,SponsorTotals} from './sponsorship-types';
import {calculateSponsorTotals,canAccessSponsor,readSponsorship,sponsorDocumentHash,sponsorSnapshotBytes} from './sponsorship';
import type {jsPDF} from 'jspdf';

/** The same renderer is used by the portal, backoffice and the downloadable example. */
export type SponsorPdfAssets={logoPng:Uint8Array;bodyFont:Uint8Array;boldFont:Uint8Array;headingFont:Uint8Array;brushFont:Uint8Array};
export type SponsorPdfOptions={assets?:SponsorPdfAssets};
const BLUE=[22,79,211] as const,INK=[15,27,47] as const,MUTED=[90,105,128] as const,LIGHT=[240,245,253] as const,LINE=[216,226,242] as const,WHITE=[255,255,255] as const;
const MARGIN=17,PAGE_WIDTH=210,PAGE_HEIGHT=297,WIDTH=PAGE_WIDTH-2*MARGIN,CONTENT_END=269;
const currency=(cents:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(cents/100);
const clean=(value:unknown)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\u00a0/g,' ').replace(/\t/g,'  ').trim();
const date=(value:string,withTime=false)=>{const parsed=new Date(value.length===10?`${value}T12:00:00Z`:value);return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'long',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(parsed):clean(value)||'Niet vastgelegd';};
const taxLabel=(rate:string)=>rate==='exempt'?'Vrijgesteld':`${rate}%`;
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
function base64(data:Uint8Array){let value='';for(let i=0;i<data.length;i+=0x8000)value+=String.fromCharCode(...data.subarray(i,i+0x8000));return btoa(value);}
let assetPromise:Promise<SponsorPdfAssets>|undefined;
async function browserAssets(){
 assert(typeof window!=='undefined','Geef de lokale PDF-logo- en lettertypebestanden mee voor het genereren buiten de browser.');
 if(!assetPromise)assetPromise=(async()=>{const paths=['/assets/logo.png','/fonts/club-font-4.ttf','/fonts/club-font-7.ttf','/fonts/club-font-3.ttf','/fonts/club-font-9.ttf'];const results=await Promise.all(paths.map(async path=>{const response=await fetch(path);assert(response.ok,'Het PDF-logo of een documentlettertype kon niet worden geladen. Probeer opnieuw.');return new Uint8Array(await response.arrayBuffer());}));return {logoPng:results[0],bodyFont:results[1],boldFont:results[2],headingFont:results[3],brushFont:results[4]};})().catch(error=>{assetPromise=undefined;throw error;});
 return assetPromise;
}

/** Reject access and tampered snapshots before loading fonts or importing the PDF engine. */
export function sponsorAgreementPdfSource(state:CmsState,actorId:string,id:string):SponsorAgreement{
 const agreement=readSponsorship(state).agreements.find(row=>row.id===id);
 assert(agreement,'Overeenkomst niet gevonden.');
 assert(canAccessSponsor(state,actorId,agreement.sponsorId),'Deze overeenkomst is niet beschikbaar voor jouw account.');
 sponsorSnapshotBytes(agreement);
 return structuredClone(agreement);
}

class AgreementLayout{
 y=0;
 readonly doc:jsPDF;readonly agreement:SponsorAgreement;readonly assets:SponsorPdfAssets;
 constructor(doc:jsPDF,agreement:SponsorAgreement,assets:SponsorPdfAssets){this.doc=doc;this.agreement=agreement;this.assets=assets;}
 get snapshot(){return this.agreement.snapshot;}
 color(color:readonly number[]){this.doc.setTextColor(color[0],color[1],color[2]);}
 fill(color:readonly number[]){this.doc.setFillColor(color[0],color[1],color[2]);}
 font(kind:'body'|'bold'|'heading'|'brush'='body',size=10,color:readonly number[]=INK){this.doc.setFont(kind==='heading'?'ClubHeading':kind==='brush'?'ClubBrush':'ClubBody',kind==='bold'?'bold':'normal');this.doc.setFontSize(size);this.color(color);}
 text(value:unknown,x:number,y:number,options?:Parameters<jsPDF['text']>[3]){this.doc.text(clean(value),x,y,options);}
 wrap(value:unknown,width:number){return this.doc.splitTextToSize(clean(value),Math.max(8,width)) as string[];}
 rule(y:number,x=MARGIN,width=WIDTH){this.doc.setDrawColor(...LINE);this.doc.setLineWidth(.25);this.doc.line(x,y,x+width,y);}
 roughStripe(x:number,y:number,width:number,height:number,color:readonly number[]){this.fill(color);this.doc.lines([[width*.15,-height*.22],[width*.16,height*.1],[width*.2,-height*.12],[width*.21,height*.17],[width*.28,-height*.08],[-width*.015,height*.7],[-width*.24,height*.06],[-width*.23,-height*.02],[-width*.2,height*.17],[-width*.15,-height*.08],[-width*.165,height*.04]],x,y,[1,1],'F',true);}
 cover(){
  this.fill(INK);this.doc.rect(0,0,PAGE_WIDTH,79,'F');this.fill(BLUE);this.doc.triangle(127,0,210,0,210,79,'F');this.doc.rect(190,0,20,79,'F');
  // Restrained, deterministic ink flecks keep the club's brush character off the reading area.
  this.fill([36,58,92]);for(let i=0;i<50;i++){const x=138+(i*37%58),y=27+(i*17%43),size=.25+(i%4)*.19;this.doc.rect(x,y,size*2.2,size,'F');}
  this.font('heading',16,WHITE);this.text('DUINDORP SV',MARGIN,14);this.font('bold',7.2,[166,190,230]);this.text('SAMEN LANGS DE LIJN. SINDS 1950.',MARGIN,20);
  this.font('heading',32,WHITE);this.text('SPONSOR',MARGIN,37);this.text('OVEREENKOMST.',MARGIN,49);
  this.roughStripe(MARGIN,55,88,3,BLUE);this.font('brush',12,WHITE);this.text('Onze club. Onze trots.',MARGIN,66);
  this.fill(WHITE);this.doc.circle(183,17,12,'F');this.doc.addImage(this.assets.logoPng,'PNG',174.5,7,17,20,undefined,'FAST');
  this.font('bold',8,WHITE);this.text(this.agreement.number,193,64,{align:'right'});this.font('body',7.2,[213,227,252]);this.text(`VERSIE ${this.agreement.version}  /  ${this.agreement.status==='signed'?'ONDERTEKEND':this.agreement.status==='cancelled'?'GEANNULEERD':this.agreement.status==='awaiting-club-signature'?'WACHT OP DE CLUB':'TER ONDERTEKENING'}`,193,70,{align:'right'});
  this.y=91;
 }
 nextPage(label='DE AFSPRAKEN'){
  this.doc.addPage();this.fill(INK);this.doc.rect(0,0,PAGE_WIDTH,26,'F');this.fill(BLUE);this.doc.rect(0,25,PAGE_WIDTH,1.8,'F');this.font('heading',15,WHITE);this.text('DUINDORP SV',MARGIN,12);this.font('body',7.2,[191,208,237]);this.text(label,MARGIN,19);this.font('bold',8,WHITE);this.text(this.agreement.number,PAGE_WIDTH-MARGIN,13,{align:'right'});this.font('body',7,[191,208,237]);this.text(`Versie ${this.agreement.version}`,PAGE_WIDTH-MARGIN,19,{align:'right'});this.y=39;
 }
 ensure(height:number,label?:string){if(this.y+height>CONTENT_END)this.nextPage(label);}
 heading(value:string,kicker?:string){this.ensure(kicker?25:18);if(kicker){this.font('bold',7.5,BLUE);this.text(kicker,MARGIN,this.y);this.y+=7;}this.font('heading',22,INK);const lines=this.wrap(value,WIDTH);for(const line of lines){this.ensure(11);this.font('heading',22,INK);this.text(line,MARGIN,this.y);this.y+=9;}this.y+=2;}
 paragraph(value:string,{size=9.3,color=INK,gap=5,bold=false,width=WIDTH,x=MARGIN}:{size?:number;color?:readonly number[];gap?:number;bold?:boolean;width?:number;x?:number}={}){
  this.font(bold?'bold':'body',size,color);const lines=this.wrap(value,width),lineHeight=size*.3528*1.47;
  for(const line of lines){this.ensure(lineHeight+1);this.font(bold?'bold':'body',size,color);this.text(line,x,this.y);this.y+=lineHeight;}
  this.y+=gap;
 }
 parties(){
  this.heading('Samen maken we het mogelijk.','DE PARTIJEN');
  const contract=this.snapshot.contract,company=contract?.company;
  const left=[{label:'DE VERENIGING',value:'Duindorp SV'},{label:'CLUB',value:'Sportpark Houtrust · Den Haag'},{label:'DOCUMENT',value:`Sponsorovereenkomst ${this.agreement.number}`}];
  const right=[{label:'DE SPONSOR',value:company?.legalName||this.snapshot.sponsorName},{label:'VESTIGINGSADRES',value:company?[company.address,`${company.postalCode} ${company.city}`.trim(),company.country].filter(Boolean).join('\n'):this.snapshot.sponsorAddress},{label:'CONTACT',value:company?[company.contactName,company.contactFunction,company.contactEmail].filter(Boolean).join('\n'):this.snapshot.sponsorEmail}];
  const gap=7,col=(WIDTH-gap)/2,x2=MARGIN+col+gap;
  const height=(fields:typeof left)=>fields.reduce((sum,f)=>{this.font(f.label==='DE SPONSOR'||f.label==='DE VERENIGING'?'bold':'body',f.label.startsWith('DE ')?11:8.7);return sum+7+this.wrap(f.value,col-12).length*4.7+5;},0)+4;
  const h=Math.max(height(left),height(right));if(h>135){for(const field of [...left,...right]){this.ensure(18);this.font('bold',7,BLUE);this.text(field.label,MARGIN,this.y);this.y+=6;this.paragraph(field.value,{size:9,gap:6});}this.y+=3;}else{this.ensure(h+6);this.fill(LIGHT);this.doc.rect(MARGIN,this.y-3,col,h,'F');this.doc.rect(x2,this.y-3,col,h,'F');const top=this.y+4;
  const draw=(fields:typeof left,x:number)=>{let y=top;for(const field of fields){this.font('bold',6.8,MUTED);this.text(field.label,x+6,y);y+=5.5;this.font(field.label.startsWith('DE ')?'bold':'body',field.label.startsWith('DE ')?11:8.7);const lines=this.wrap(field.value,col-12);this.doc.text(lines,x+6,y,{lineHeightFactor:1.5});y+=lines.length*4.7+5;}};
  draw(left,MARGIN);draw(right,x2);this.y+=h+7;}
  if(company){const ids=[company.registrationExempt?`Geen KVK: ${company.registrationExemptionReason}`:`KVK ${company.companyNumber}`,company.vatNumber?`Btw ${company.vatNumber}`:company.vatStatus==='exempt'?'Btw-status: vrijgesteld':'Btw-status: niet van toepassing',`Facturatie: ${company.invoiceEmail}`].filter(Boolean).join('  |  ');this.paragraph(ids,{size:7.4,color:MUTED,gap:5});}
 }
 keyFacts(){
  const snapshot=this.snapshot,contract=snapshot.contract;
  const cols=[{label:'SEIZOEN',value:snapshot.season},{label:'LOOPTIJD',value:`${date(snapshot.startDate)}\nt/m ${date(snapshot.endDate)}`},{label:'SAMENWERKING',value:contract?.packageName||snapshot.name}];this.font('bold',8.6,INK);const max=Math.max(...cols.map(field=>this.wrap(field.value,WIDTH/3-6).length*4.5));if(max>40){for(const field of cols){this.ensure(18);this.font('bold',6.8,BLUE);this.text(field.label,MARGIN,this.y);this.y+=6;this.paragraph(field.value,{size:8.6,bold:true,gap:6});}return;}this.ensure(max+21);this.rule(this.y-1);cols.forEach((field,i)=>{const x=MARGIN+i*(WIDTH/3);this.font('bold',6.8,BLUE);this.text(field.label,x,this.y+5);this.font('bold',8.6,INK);const lines=this.wrap(field.value,WIDTH/3-6);this.doc.text(lines,x,this.y+12,{lineHeightFactor:1.45});});this.y+=max+21;
 }
 tableHeader(){this.ensure(14,'SPONSORITEMS');this.fill(INK);this.doc.rect(MARGIN,this.y-4,WIDTH,10,'F');this.font('bold',6.9,WHITE);this.text('SPONSORITEM',MARGIN+4,this.y+2);this.text('AANTAL',119,this.y+2,{align:'right'});this.text('PER STUK',146,this.y+2,{align:'right'});this.text('BTW',163,this.y+2,{align:'right'});this.text('EXCL. BTW',PAGE_WIDTH-MARGIN-4,this.y+2,{align:'right'});this.y+=12;}
 items(){
  this.ensure(65,'SPONSORING IN HET KORT');this.heading('Jouw bijdrage. Onze mogelijkheden.','SPONSORING IN HET KORT');this.tableHeader();
  this.snapshot.lines.forEach((line,index)=>{
   this.font('bold',8.7);const titleLines=this.wrap(line.name,87);this.font('body',7.6,MUTED);const descriptionLines=line.description?this.wrap(line.description,87):[];
   const titleHeight=titleLines.length*4.6,descriptionHeight=descriptionLines.length*3.9,baseHeight=Math.max(15,titleHeight+descriptionHeight+6);
   if(baseHeight<180){if(this.y+baseHeight>CONTENT_END){this.nextPage('SPONSORITEMS - VERVOLG');this.tableHeader();}if(index%2===0){this.fill(LIGHT);this.doc.rect(MARGIN,this.y-5,WIDTH,baseHeight,'F');}this.font('bold',8.7);this.doc.text(titleLines,MARGIN+4,this.y,{lineHeightFactor:1.5});this.font('body',7.6,MUTED);if(descriptionLines.length)this.doc.text(descriptionLines,MARGIN+4,this.y+titleHeight+.6,{lineHeightFactor:1.45});this.font('body',8.4,INK);this.text(String(line.quantity),119,this.y,{align:'right'});this.text(currency(line.unitPriceCents),146,this.y,{align:'right'});this.font('body',line.taxRate==='exempt'?6.4:8.1);this.text(taxLabel(line.taxRate),163,this.y,{align:'right'});this.font('bold',8.4);this.text(currency(line.quantity*line.unitPriceCents),PAGE_WIDTH-MARGIN-4,this.y,{align:'right'});this.y+=baseHeight;}
   else {this.ensure(22);this.font('bold',8.7);this.paragraph(`${line.name} | ${line.quantity} x ${currency(line.unitPriceCents)} | ${taxLabel(line.taxRate)} btw | ${currency(line.quantity*line.unitPriceCents)} excl. btw`,{bold:true,size:8.7,gap:2});this.paragraph(line.description,{size:7.7,color:MUTED,gap:5});this.rule(this.y);this.y+=6;}
  });this.y+=5;
 }
 totals(){
  const totals: SponsorTotals=this.snapshot.contract?.totals||calculateSponsorTotals(this.snapshot.lines,this.snapshot.discountCents);
  const rows=[['Subtotaal exclusief btw',currency(totals.subtotalCents)],...(totals.discountCents?[['Afgesproken korting',`- ${currency(totals.discountCents)}`]]:[]),['Sponsorbijdrage exclusief btw',currency(totals.netCents)],...totals.taxGroups.map(group=>[group.taxRate==='exempt'?'Vrijgesteld van btw':`Btw ${group.taxRate}% over ${currency(group.netCents)}`,currency(group.taxCents)])];
  this.font('body',7.7);const prepared=rows.map(([label,value])=>({label:this.wrap(label,48),value})),h=prepared.reduce((sum,row)=>sum+Math.max(7,row.label.length*4.2),0)+24;this.ensure(h+8,'BEDRAGEN');const x=94,w=99;this.fill(LIGHT);this.doc.rect(x,this.y-4,w,h,'F');let y=this.y+3;
  for(const row of prepared){this.font('body',7.7,MUTED);this.doc.text(row.label,x+5,y,{lineHeightFactor:1.5});let size=8.4;this.font('bold',size,INK);while(this.doc.getTextWidth(row.value)>35&&size>6.2){size-=.3;this.font('bold',size,INK);}this.text(row.value,x+w-5,y,{align:'right'});y+=Math.max(7,row.label.length*4.2);}
  this.fill(BLUE);this.doc.rect(x,y-1,w,14,'F');this.font('bold',8,WHITE);this.text('TOTAAL INCLUSIEF BTW',x+5,y+7);this.font('heading',17,WHITE);this.text(currency(totals.totalCents),x+w-5,y+8,{align:'right'});this.y+=h+7;
  this.paragraph(this.snapshot.paymentTerms,{size:8.3,color:MUTED,gap:2});
 }
 clauses(){
  this.nextPage('DE OVEREENKOMST');const contract=this.snapshot.contract;
  this.heading(contract?.title||'Onze afspraken.','DE OVEREENKOMST');
  if(contract){this.paragraph(`Vastgelegde template: ${contract.templateName} · versie ${contract.templateVersion}. Bedrijfsgegevens en bedragen zijn opgeslagen op ${date(this.snapshot.capturedAt,true)}.`,{size:7.4,color:MUTED,gap:8});}
  const source=contract?.body||this.snapshot.terms;
  for(const paragraph of clean(source).split(/\n\s*\n/)){
   const lines=paragraph.split('\n');const first=lines[0]?.replace(/^#{1,3}\s*/,'')||'';const isHeading=/^#{1,3}\s|^\d+[.)]\s/.test(lines[0]||'')&&first.length<125;
   if(isHeading){this.ensure(20);this.font('heading',15,INK);const titleLines=this.wrap(first,WIDTH);for(const title of titleLines){this.ensure(7);this.text(title,MARGIN,this.y);this.y+=6.5;}if(lines.length>1)this.paragraph(lines.slice(1).join('\n'),{size:9,gap:7});else this.y+=3;}
   else this.paragraph(paragraph,{size:9,gap:7});
  }
  if(!contract){this.heading('Betaling');this.paragraph(this.snapshot.paymentTerms,{size:9,gap:8});}
 }
 signatures(){
  this.ensure(58,'ONDERTEKENING');this.y+=3;this.rule(this.y);this.y+=12;this.heading('Vastgelegd met vertrouwen.','ONDERTEKENING & DOCUMENTCONTROLE');
  if(!this.agreement.signatures.length){this.paragraph(this.agreement.status==='cancelled'?'Deze overeenkomst is geannuleerd. Er is geen ondertekening vastgelegd.':'Deze overeenkomst wacht op ondertekening. Er is nog geen handtekening vastgelegd.',{size:9.2,bold:true,gap:7});}
  const dual=this.agreement.signatures.every(s=>s.verification==='email-otp'&&!s.demo)&&this.agreement.signingMode==='dual-email-otp'&&this.agreement.signatures.length===2&&this.agreement.signatures.some(row=>row.party==='sponsor')&&this.agreement.signatures.some(row=>row.party==='club');
  const columns=dual?(['sponsor','club'] as const).map(party=>{const signature=this.agreement.signatures.find(row=>row.party===party)!;this.font('heading',16);const name=this.wrap(signature.name,76);this.font('body',7.7);const lines=this.wrap([`Functie: ${signature.function}`,`Ondertekend: ${date(signature.at,true)}`,`Verificatieadres: ${signature.email||'Niet vastgelegd'}`,`OTP bevestigd: ${signature.verifiedAt?date(signature.verifiedAt,true):'Niet vastgelegd'}`,`Gebruiker: ${signature.userId}`,`IP: ${signature.ipAddress||'Niet vastgelegd'}`,`Uitdrukkelijke instemming: ${signature.consent?'ja':'niet vastgelegd'}`].join('\n'),76);return {party,name,lines,height:24+name.length*6+lines.length*4.1};}):[];
  const columnHeight=Math.max(0,...columns.map(column=>column.height));
  if(dual&&columnHeight<140){this.ensure(columnHeight+13,'ONDERTEKENING');const y=this.y;columns.forEach((column,i)=>{const x=MARGIN+i*(WIDTH/2+3);this.fill(LIGHT);this.doc.rect(x,y-3,WIDTH/2-3,columnHeight,'F');this.font('bold',7.1,BLUE);this.text(column.party==='sponsor'?'NAMENS DE SPONSOR':'NAMENS DUINDORP SV',x+6,y+5);this.font('heading',16,INK);this.doc.text(column.name,x+6,y+14,{lineHeightFactor:1.05});this.font('body',7.7,INK);this.doc.text(column.lines,x+6,y+21+column.name.length*6,{lineHeightFactor:1.5});});this.y+=columnHeight+6;this.paragraph('Beide partijen hebben afzonderlijk ingestemd met dezelfde documentversie. Beide ondertekeningen zijn bevestigd met een eigen, eenmalige e-mailcode voor dit document.',{size:7.2,color:MUTED,gap:3});}
  else for(const signature of this.agreement.signatures){
   this.ensure(70,'ONDERTEKENING - VERVOLG');this.font('bold',7.1,BLUE);this.text(signature.party==='club'?'NAMENS DUINDORP SV':signature.party==='sponsor'?'NAMENS DE SPONSOR':'EERDER VASTGELEGDE ONDERTEKENING',MARGIN,this.y);this.y+=7;this.font('heading',17,INK);for(const line of this.wrap(signature.name,WIDTH)){this.ensure(8);this.font('heading',17,INK);this.text(line,MARGIN,this.y);this.y+=7;}this.y+=1;
   const detail=[`${signature.name} - ${signature.function}`,`Ondertekend op ${date(signature.at,true)} (Nederlandse tijd)`,...(signature.email?[`Verificatieadres: ${signature.email}`]:[]),...(signature.verifiedAt?[`OTP bevestigd op ${date(signature.verifiedAt,true)}`]:[]),`Gebruikersreferentie: ${signature.userId}`,`IP-adres: ${signature.ipAddress||'Niet vastgelegd'}`,`Uitdrukkelijke instemming: ${signature.consent?'ja':'niet vastgelegd'}`];this.paragraph(detail.join('\n'),{size:8.1,gap:3});
   this.paragraph(signature.verification==='email-otp'?'Bevestigd met een eigen eenmalige e-mailcode voor deze documentversie.':'Historisch ondertekenbewijs; geen volledige tweezijdige e-mailverificatie vastgelegd.',{size:7.5,color:MUTED,gap:8});
  }
  if(this.agreement.signingMode==='dual-email-otp'&&this.agreement.status!=='cancelled')for(const party of ['sponsor','club'] as const)if(!this.agreement.signatures.some(row=>row.party===party)){this.ensure(20);this.paragraph(`${party==='club'?'Namens Duindorp SV':'Namens de sponsor'}: wacht op ondertekening en afzonderlijke OTP-bevestiging.`,{size:8.5,bold:true,color:MUTED,gap:7});}
  this.ensure(23);this.font('bold',7.1,MUTED);this.text('SHA-256 VAN DE VASTGELEGDE DOCUMENTINHOUD',MARGIN,this.y);this.y+=6;this.paragraph(this.agreement.documentHash,{size:7,color:MUTED,gap:3});
  this.paragraph('Bewaar dit document met de afzonderlijke verificatiebewijzen. De documenthash en de bestandshash van de PDF zijn verschillende controles.',{size:7.1,color:MUTED,gap:1});
 }
 footer(){
  const count=this.doc.getNumberOfPages();for(let page=1;page<=count;page++){this.doc.setPage(page);this.rule(277);this.font('bold',7,BLUE);this.text('ONZE CLUB. ONZE TROTS.',MARGIN,284);this.font('body',6.6,MUTED);this.text(`${this.agreement.number}  |  v${this.agreement.version}`,105,284,{align:'center'});this.text(`${page} / ${count}`,PAGE_WIDTH-MARGIN,284,{align:'right'});this.fill(BLUE);this.doc.rect(0,PAGE_HEIGHT-3,PAGE_WIDTH,3,'F');}
 }
}

export async function buildSponsorAgreementPdf(state:CmsState,actorId:string,id:string,options:SponsorPdfOptions={}):Promise<Uint8Array>{
 const agreement=sponsorAgreementPdfSource(state,actorId,id),assets=options.assets||await browserAssets();
 const {jsPDF}=await import('jspdf');const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 const fonts=[['ClubBody','normal','club-body.ttf',assets.bodyFont],['ClubBody','bold','club-bold.ttf',assets.boldFont],['ClubHeading','normal','club-heading.ttf',assets.headingFont],['ClubBrush','normal','club-brush.ttf',assets.brushFont]] as const;
 for(const [name,style,file,bytes] of fonts){doc.addFileToVFS(file,base64(bytes));doc.addFont(file,name,style);}
 doc.setProperties({title:`Sponsorovereenkomst ${agreement.number} - Duindorp SV`,subject:agreement.snapshot.name,author:'Duindorp SV',creator:'Duindorp SV - Onze Trots',keywords:'sponsoring, overeenkomst, Duindorp SV'});
 if(Number.isFinite(Date.parse(agreement.createdAt)))doc.setCreationDate(new Date(agreement.createdAt));
 doc.setFileId(agreement.documentHash.slice(0,32));
 const layout=new AgreementLayout(doc,agreement,assets);layout.cover();layout.parties();layout.keyFacts();layout.items();layout.totals();layout.clauses();layout.signatures();layout.footer();
 return new Uint8Array(doc.output('arraybuffer'));
}

export async function downloadSponsorAgreementPdf(state:CmsState,actorId:string,id:string,options:{shouldDownload?:()=>boolean;signal?:AbortSignal}={}):Promise<void>{
 const agreement=sponsorAgreementPdfSource(state,actorId,id);const response=await fetch('/api/sponsorship/agreements/'+encodeURIComponent(id)+'/pdf',{cache:'no-store',signal:options.signal});if(!response.ok){const error=await response.json();throw new Error(error.message||'Downloaden is mislukt.');}const bytes=new Uint8Array(await response.arrayBuffer());
 if(options.signal?.aborted||options.shouldDownload&&!options.shouldDownload())return;
 assert(typeof document!=='undefined','Download dit document vanuit het sponsorportaal of de backoffice.');
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));const link=document.createElement('a');link.href=url;link.download=`Duindorp-SV-Overeenkomst-${clean(agreement.number).replace(/[^a-zA-Z0-9_-]/g,'-')}-v${agreement.version}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}

export async function buildSponsorInvoicePdf(invoice:import('./sponsorship-types').SponsorInvoice,agreement:SponsorAgreement,options:SponsorPdfOptions={}){
 sponsorSnapshotBytes(agreement);assert(invoice.agreementId===agreement.id,'De factuur hoort niet bij deze overeenkomst.');
 const assets=options.assets||await browserAssets(),{jsPDF}=await import('jspdf'),doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 for(const [name,style,file,bytes] of [['ClubBody','normal','invoice-body.ttf',assets.bodyFont],['ClubBody','bold','invoice-bold.ttf',assets.boldFont],['ClubHeading','normal','invoice-heading.ttf',assets.headingFont]] as const){doc.addFileToVFS(file,base64(bytes));doc.addFont(file,name,style);}
 const total=invoice.totals||calculateSponsorTotals(invoice.lines,invoice.discountCents);assert(total.totalCents===invoice.totalCents,'De vastgelegde factuurbedragen kloppen niet.');
 let y=25;const add=(value:string,size=10,bold=false)=>{doc.setFont('ClubBody',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(clean(value),174) as string[];for(const line of lines){if(y>265){doc.addPage();y=25;}doc.text(line,18,y);y+=size*.5;}y+=3;};
 doc.setFillColor(...BLUE);doc.rect(0,0,210,43,'F');doc.setTextColor(...WHITE);doc.setFont('ClubHeading','normal');doc.setFontSize(25);doc.text('DUINDORP SV',18,20);doc.setFont('ClubBody','bold');doc.setFontSize(9);doc.text('SPONSORFACTUUR',18,31);doc.addImage(assets.logoPng,'PNG',174,7,19,24);doc.setTextColor(...INK);y=56;
 add(invoice.number,21,true);add(`Factuurdatum: ${date(invoice.issueDate)}\nVervaldatum: ${date(invoice.dueDate)}${invoice.installment?'\nTermijn '+invoice.installment.index+' van '+invoice.installment.count:''}`,10);
 const company=agreement.snapshot.contract?.company;add(agreement.snapshot.sponsorName+'\n'+agreement.snapshot.sponsorAddress+'\n'+(company?.invoiceEmail||agreement.snapshot.sponsorEmail),11,true);
 add(`Overeenkomst ${agreement.number} · versie ${agreement.version}`,9);y+=3;
 for(const line of invoice.lines){add(`${line.quantity} × ${line.name} — ${currency(line.quantity*line.unitPriceCents)} excl. btw (${taxLabel(line.taxRate)})`,10,true);if(line.description)add(line.description,9);}
 y+=4;add('Subtotaal exclusief btw: '+currency(total.subtotalCents));if(total.discountCents)add('Korting: '+currency(total.discountCents));add('Netto: '+currency(total.netCents));for(const group of total.taxGroups)add((group.taxRate==='exempt'?'Vrijgesteld':'Btw '+group.taxRate+'%')+': '+currency(group.taxCents));add('Totaal inclusief btw: '+currency(total.totalCents),14,true);
 add('Betaalafspraken',12,true);add(agreement.snapshot.paymentTerms||'Neem voor de betaalgegevens contact op met de sponsorcommissie.');if(invoice.status==='paid')add('Ontvangst geregistreerd op '+date(invoice.paidAt),10,true);
 const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.line(18,279,192,279);doc.setFont('ClubBody','normal');doc.setFontSize(8);doc.setTextColor(...MUTED);doc.text(invoice.number+' · Duindorp SV',18,286);doc.text(i+' / '+count,192,286,{align:'right'});}
 doc.setProperties({title:'Sponsorfactuur '+invoice.number,author:'Duindorp SV',creator:'Duindorp SV'});return new Uint8Array(doc.output('arraybuffer'));
}

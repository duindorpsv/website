import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {DonorInvoice} from '../cms/sponsorship-types';
import {calculateSponsorTotals,money} from '../cms/sponsorship';
import {CmsError} from './errors';
import {sorted} from './sponsor-store';
/** Only the issued financial identity enters the sealed document. */
export function donorInvoiceSnapshot(invoice:DonorInvoice){
 const {id,donorId,contributionId,number,issueDate,dueDate,issuer,recipient,lines,totals,totalCents,createdAt}=invoice;
 return {id,donorId,contributionId,number,issueDate,dueDate,issuer,recipient,lines,totals,totalCents,createdAt};
}
export async function buildDonorInvoicePdf(invoice:DonorInvoice){
 const calculated=calculateSponsorTotals(invoice.lines);
 if(JSON.stringify(sorted(calculated))!==JSON.stringify(sorted(invoice.totals))||calculated.totalCents!==invoice.totalCents||invoice.totalCents<=0||!invoice.issuer)throw new CmsError('invoice-integrity','De vastgelegde factuurbedragen of afzender kloppen niet.',409);
 const [logo,body,bold]=await Promise.all(['assets/logo.png','fonts/club-font-4.ttf','fonts/club-font-7.ttf'].map(file=>readFile(join(process.cwd(),'public',file))));
 const {jsPDF}=await import('jspdf'),doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 for(const [style,file,bytes] of [['normal','donor-body.ttf',body],['bold','donor-bold.ttf',bold]] as const){doc.addFileToVFS(file,bytes.toString('base64'));doc.addFont(file,'ClubBody',style);}
 doc.setCreationDate(new Date(invoice.createdAt));
 const blue=[20,85,192] as const,ink=[23,42,72] as const,muted=[97,113,138] as const,left=14.5,right=195.5,width=right-left;
 const clean=(text:string)=>text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,''),font=(size=10,strong=false)=>{doc.setFont('ClubBody',strong?'bold':'normal');doc.setFontSize(size);};
 const wrap=(text:string,available:number,size=10,strong=false)=>{font(size,strong);return doc.splitTextToSize(clean(text),available) as string[];};
 let y=0;
 const page=()=>{doc.setFillColor(...blue);doc.rect(0,0,210,3.5,'F');doc.setTextColor(...ink);font(10,true);doc.text('DONATEURSFACTUUR',left,18);font(9);doc.text(invoice.number,right,18,{align:'right'});doc.setDrawColor(...blue);doc.line(left,23,right,23);y=33;};
 const room=(height:number)=>{if(y+height>266){doc.addPage();page();}};
 const add=(text:string,size=10,strong=false)=>{const rows=wrap(text,width,size,strong);for(const row of rows){room(size*.5+2);font(size,strong);doc.text(row,left,y);y+=size*.5;}y+=3;};
 doc.setFillColor(...blue);doc.rect(0,0,210,3.5,'F');doc.addImage(logo,'PNG',left,18,18,23);doc.setTextColor(...blue);font(18,true);doc.text('DONATEURSFACTUUR',right,28,{align:'right'});doc.setTextColor(...ink);font(10,true);doc.text(invoice.number,right,36,{align:'right'});doc.setDrawColor(...blue);doc.setLineWidth(.5);doc.line(left,47,right,47);
 y=58;doc.setTextColor(...muted);font(8);doc.text('FACTUUR AAN',left,y);doc.setTextColor(...ink);
 const name=wrap(invoice.recipient.name,112,14,true);let recipientY=y+11;for(const row of name){font(14,true);doc.text(row,left,recipientY);recipientY+=7;}
 recipientY+=2;
 for(const value of [invoice.recipient.address,[invoice.recipient.postalCode,invoice.recipient.city].filter(Boolean).join(' '),invoice.recipient.email].filter(Boolean))for(const row of wrap(value,112)){font(10);doc.text(row,left,recipientY);recipientY+=5.5;}
 let datesY=y;for(const text of ['Factuurdatum: '+invoice.issueDate,'Vervaldatum: '+invoice.dueDate,'Status: Openstaand'])for(const row of wrap(text,58,9.5)){font(9.5);doc.text(row,137,datesY);datesY+=5.5;}
 y=Math.max(recipientY,datesY)+9;
 const headings=()=>{room(14);doc.setFillColor(237,243,253);doc.rect(left,y,width,12,'F');doc.setTextColor(...ink);font(9,true);doc.text('Omschrijving',left+2,y+7.5);doc.text('Aantal',111,y+7.5);doc.text('Excl. btw',161,y+7.5,{align:'right'});doc.text('Btw',165,y+7.5);y+=18;};
 headings();
 for(const line of invoice.lines){
  const nameRows=wrap(line.name,90,10,true),details=wrap([line.description,line.endDate?(line.startDate||'')+' t/m '+line.endDate:'Vanaf '+(line.startDate||'')+' · eenmalig / zonder einddatum'].filter(Boolean).join('\n'),90,8.5),rows=[...nameRows.map(text=>({text,strong:true,size:10})),...details.map(text=>({text,strong:false,size:8.5}))];
  const height=rows.reduce((sum,row)=>sum+row.size*.5,0)+5;
  if(y+Math.min(height,240)>264){doc.addPage();page();headings();}
  const rowY=y;doc.setTextColor(...ink);font(9);doc.text(String(line.quantity),111,rowY);doc.text(money(line.quantity*line.unitPriceCents),161,rowY,{align:'right'});doc.text(line.taxRate==='exempt'?'Vrijgesteld':line.taxRate+'%',165,rowY);
  for(const row of rows){room(row.size*.5+2);font(row.size,row.strong);const color=row.strong?ink:muted;doc.setTextColor(color[0],color[1],color[2]);doc.text(row.text,left+2,y);y+=row.size*.5;}
  y+=4;doc.setDrawColor(220,227,238);doc.setLineWidth(.2);doc.line(left,y,right,y);y+=6;
 }
 y+=5;doc.setTextColor(...ink);
 const total=(label:string,value:number,strong=false)=>{room(12);font(strong?14:10,strong);const color=strong?blue:ink;doc.setTextColor(color[0],color[1],color[2]);doc.text(label,left+2,y);doc.text(money(value),right-2,y,{align:'right'});y+=strong?12:9;};
 total('Totaal exclusief btw',invoice.totals.netCents);for(const group of invoice.totals.taxGroups)total(group.taxRate==='exempt'?'Vrijgesteld van btw':'Btw '+group.taxRate+'%',group.taxCents);total('Totaal',invoice.totalCents,true);
 doc.setTextColor(...ink);add('Vermeld '+invoice.number+' bij de betaling.');y+=12;room(35);doc.setDrawColor(220,227,238);doc.line(left,y,right,y);y+=8;
 add(invoice.issuer.legalName,9,true);add([invoice.issuer.address,invoice.issuer.companyNumber?'KvK '+invoice.issuer.companyNumber:'',invoice.issuer.email].filter(Boolean).join('\n'),8.5);doc.setTextColor(...blue);add('ONZE CLUB. ONZE TROTS.',9,true);
 const count=doc.getNumberOfPages();for(let page=1;page<=count;page++){doc.setPage(page);doc.setDrawColor(215,225,235);doc.line(18,279,192,279);doc.setFont('ClubBody','normal');doc.setFontSize(8);doc.text(invoice.number+' · Duindorp SV',18,286);doc.text(page+' / '+count,192,286,{align:'right'});}
 doc.setProperties({title:'Donateursfactuur '+invoice.number,author:invoice.issuer.legalName,creator:'Duindorp SV'});return new Uint8Array(doc.output('arraybuffer'));
}

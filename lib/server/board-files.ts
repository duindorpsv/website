import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {getBoardExportSource,BoardTransitionError} from '../cms/board-transitions';
import {requestBoardActor,currentBoardContext} from './board-access';
import {readBoardRecord} from './board-store';
import {CmsError} from './errors';

const query=z.object({kind:z.enum(['minutes','alv-package','alv-minutes']),id:z.string().min(1).max(150)}).strict();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let assets:Promise<Buffer[]>|undefined;
function fonts(){return assets??=Promise.all(['fonts/club-font-4.ttf','fonts/club-font-7.ttf','fonts/club-font-9.ttf','assets/logo.png'].map(path=>readFile(join(process.cwd(),'public',path)))).catch(error=>{assets=undefined;throw error;});}
/** Pure rendering consumes only the authorized frozen export source. */
export async function renderBoardPdf(source:ReturnType<typeof getBoardExportSource>){
 const [{jsPDF},[body,bold,heading,logo]]=await Promise.all([import('jspdf'),fonts()]);
 const doc=new jsPDF({unit:'mm',format:'a4'});
 for(const [file,data,name] of [['BoardBody.ttf',body,'BoardBody'],['BoardBold.ttf',bold,'BoardBold'],['BoardHeading.ttf',heading,'BoardHeading']] as const){doc.addFileToVFS(file,data.toString('base64'));doc.addFont(file,name,'normal');}
 doc.setProperties({title:source.title,subject:source.reference,author:'Duindorp SV'});
 let y=44;
 const masthead=()=>{doc.setFillColor('#03438a').rect(0,0,210,29,'F');doc.addImage(new Uint8Array(logo),'PNG',18,5,18,18);doc.setFont('BoardHeading','normal').setFontSize(16).setTextColor('#ffffff');doc.text('Duindorp SV · Bestuur',42,17);};
 const reserve=(height:number)=>{if(y+height>274){doc.addPage();masthead();y=43;}};
 const write=(value:string,size=10,emphasis=false)=>{
  doc.setFont(emphasis?'BoardBold':'BoardBody','normal').setFontSize(size);
  const lines:string[]=doc.splitTextToSize(String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''),174);
  for(const line of lines){reserve(size>13?8:5.4);doc.setFont(emphasis?'BoardBold':'BoardBody','normal').setFontSize(size).setTextColor(emphasis?'#03438a':'#142742');doc.text(line,18,y);y+=size>13?8:5.4;}
 };
 masthead();write(source.title,18,true);write(source.reference,10);y+=6;
 for(const section of source.sections){reserve(18);write(section.heading,12,true);write(section.text,10);y+=5;}
 if(source.snapshotHash){y+=3;write('Documentcontrole SHA-256: '+source.snapshotHash,7);}
 for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setFont('BoardBody','normal').setFontSize(8).setTextColor('#66768b');doc.text('Duindorp SV · '+source.reference,18,286);doc.text(`${page} / ${doc.getNumberOfPages()}`,192,286,{align:'right'});}
 return new Uint8Array(doc.output('arraybuffer'));
}
export async function downloadBoardPdf(request:Request){
 const url=new URL(request.url),input=query.parse({kind:url.searchParams.get('kind'),id:url.searchParams.get('id')}),session=await requestBoardActor(request.headers);
 const read=()=>sqlClient().begin('isolation level repeatable read read only',async tx=>{
  const context=await currentBoardContext(tx,session,true),record=await readBoardRecord(tx,context);
  try{return getBoardExportSource(record.board,context.actor!,input.kind,input.id,context.people);}catch(error){if(error instanceof BoardTransitionError){const problem=error as BoardTransitionError&{status?:number};throw new CmsError(problem.status===403?'forbidden':'board-export',problem.message,problem.status||422);}throw error;}
 });
 const source=await read(),fingerprint=digest(source),bytes=await renderBoardPdf(source);
 if(digest(await read())!==fingerprint)throw new CmsError('board-conflict','De vastgelegde exportversie is ondertussen gewijzigd. Open de actuele versie opnieuw.',409);
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Duindorp-SV-'+source.reference.replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,80)+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}

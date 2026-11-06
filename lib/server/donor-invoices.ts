import {createHash,randomUUID} from 'node:crypto';
import {sqlClient} from '../../db';
import type {DonorInvoice} from '../cms/sponsorship-types';
import {donorInvoiceSchema} from '../cms/sponsorship-schema';
import {buildDonorInvoicePdf,donorInvoiceSnapshot} from './donor-invoice-pdf';
import {workspaceActor,freshActor,requireDonorRight,workspaceLocks,type WorkspaceActor} from './sponsor-access';
import {actorPrincipal} from './permissions';
import {digestText,sorted} from './sponsor-store';
import {getObject,putObject} from './storage';
import {sendMail} from './mail';
import {CmsError} from './errors';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Issuance, permanent number, financial snapshot and metadata commit together. */
export async function archiveDonorInvoice(tx:any,invoice:DonorInvoice,actorId:string,uploaded:string[]){
 const [existing]=await tx`select invoice_id from cms_donor_invoice_documents where invoice_id=${invoice.id}`;if(existing)return;
 const snapshotBytes=JSON.stringify(donorInvoiceSnapshot(invoice)),bytes=await buildDonorInvoicePdf(invoice),key='sponsorship/donor-invoices/'+digestText(invoice.id)+'/'+randomUUID()+'.pdf';
 uploaded.push(key);await putObject(key,bytes,'application/pdf');
 await tx`insert into cms_donor_invoice_documents(invoice_id,snapshot_bytes,document_hash,storage_key,file_hash,bytes,created_by) values (${invoice.id},${snapshotBytes},${digestText(snapshotBytes)},${key},${hash(bytes)},${bytes.length},${actorId})`;
}
async function documentRow(tx:any,id:string){
 const [row]=await tx`select r.data,d.* from cms_sponsor_records r join cms_donor_invoice_documents d on d.invoice_id=r.id where r.id=${id} and r.kind='donorInvoices'`;
 if(!row)throw new CmsError('missing','Factuur niet gevonden.',404);
 const parsed=donorInvoiceSchema.safeParse(row.data);let snapshot:unknown;try{snapshot=JSON.parse(row.snapshot_bytes);}catch{throw new CmsError('invoice-integrity','Het factuurarchief kon niet worden gecontroleerd.',409);}
 if(!parsed.success||digestText(row.snapshot_bytes)!==row.document_hash||JSON.stringify(sorted(snapshot))!==JSON.stringify(sorted(donorInvoiceSnapshot(parsed.data))))throw new CmsError('invoice-integrity','De vastgelegde factuur is gewijzigd.',409);
 return {...row,invoice:parsed.data};
}
async function authorizedDocument(actor:WorkspaceActor,id:string){return sqlClient().begin(async tx=>{const p=await freshActor(tx,actor);requireDonorRight(p);return documentRow(tx,id);});}
export async function donorInvoiceDownload(request:Request,id:string){
 const actor=await workspaceActor(request.headers),file=await authorizedDocument(actor,id),bytes=await getObject(file.storage_key);
 if(hash(bytes)!==file.file_hash||bytes.length!==Number(file.bytes))throw new CmsError('file-integrity','De gearchiveerde PDF kon niet worden gecontroleerd.',409);
 const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new CmsError('forbidden','Je toegang is gewijzigd.',403);await authorizedDocument(current,id);
 const inline=new URL(request.url).searchParams.get('inline')==='1',name='Duindorp-SV-Donateursfactuur-'+file.invoice.number.replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf';
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`${inline?'inline':'attachment'}; filename="${name}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
export async function queueDonorInvoiceMail(tx:any,invoice:DonorInvoice,actorId:string,operationId:string){
 if(invoice.mailStatus==='accepted'||invoice.mailStatus==='queued')return;
 if(invoice.status==='cancelled'||!invoice.recipient.email)throw new CmsError('validation','Deze factuur kan niet worden verzonden. Controleer het vastgelegde e-mailadres.',422);
 invoice.mailStatus='queued';delete invoice.mailError;
 const operation='donor-invoice-mail-'+invoice.id+'-'+operationId;
 await tx`insert into cms_jobs(id,kind,payload,operation_id) values (${randomUUID()},'donor-invoice-mail',${tx.json({invoiceId:invoice.id,actorId})},${operation}) on conflict(operation_id) do nothing`;
}
/** Provider acceptance updates metadata; it never claims inbox delivery. */
export async function deliverDonorInvoice(invoiceId:string,actorId:string,messageId:string){
 const sql=sqlClient();
 try{await sql.begin(async tx=>{
  await workspaceLocks(tx);const p=await actorPrincipal(actorId,tx);requireDonorRight(p,'invoice');
  const file=await documentRow(tx,invoiceId),invoice=file.invoice;
  if(invoice.status==='cancelled'||invoice.mailStatus==='accepted')return;
  const bytes=await getObject(file.storage_key);if(hash(bytes)!==file.file_hash||bytes.length!==Number(file.bytes))throw new CmsError('invoice-integrity','Het factuurarchief kon niet worden gecontroleerd.',409);
  const receipts=await sendMail({to:[invoice.recipient.email],subject:'Duindorp SV — donateursfactuur '+invoice.number,text:'Beste '+invoice.recipient.name+',\n\nBijgevoegd ontvang je donateursfactuur '+invoice.number+'. Vermeld dit factuurnummer bij de betaling.\n\nDuindorp SV',messageId,attachments:[{filename:invoice.number.replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf',content:Buffer.from(bytes).toString('base64')}]});
  invoice.mailStatus='accepted';invoice.mailAcceptedAt=new Date().toISOString();delete invoice.mailError;
  await tx`update cms_sponsor_records set data=${tx.json(invoice)},version=version+1,updated_at=now() where id=${invoiceId} and kind='donorInvoices'`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${randomUUID()},${actorId},'donor-invoice-mail-accepted',null,${messageId},${tx.json({invoiceId,providerAccepted:true,receiptCount:receipts.length,providerMessageIds:receipts})})`;
 });}catch(error){
  await sql.begin(async tx=>{await workspaceLocks(tx);await tx`update cms_sponsor_records set data=(data-'mailAcceptedAt')||${tx.json({mailStatus:'failed',mailError:'De factuurmail is niet bevestigd. Controleer de verzending en probeer opnieuw.'})}::jsonb,version=version+1,updated_at=now() where id=${invoiceId} and kind='donorInvoices' and coalesce(data->>'mailStatus','')<>'accepted'`;});
  throw error;
 }
}

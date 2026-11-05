import {createHash} from 'node:crypto';
import {sqlClient} from '../../db';
import type {SponsorDocumentMail} from '../cms/sponsorship-types';
import {CmsError} from './errors';
import {actorPrincipal} from './permissions';
import {workspaceLocks,requireWrite} from './sponsor-access';
import {sponsorMail} from './sponsor-mail';
import {getObject} from './storage';
import {env} from './env';
export type DocumentMailPhase='proposal'|'agreement'|'signed';
const kinds={proposal:'proposals',agreement:'agreements',signed:'agreements'} as const;
const binaryHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const digestText=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
async function documentContext(tx:any,id:string,phase:DocumentMailPhase){
 const [record]=await tx`select id,sponsor_id,data from cms_sponsor_records where id=${id} and kind=${kinds[phase]}`;
 if(!record)throw new CmsError('missing','Dit sponsordocument bestaat niet.',404);
 const allowed=phase==='proposal'?['sent','accepted'].includes(record.data.status):phase==='agreement'?record.data.status==='awaiting-signature':record.data.status==='signed';
 if(!allowed)throw new CmsError('document-mail-status','Dit document kan in de huidige status niet per e-mail worden aangeboden.',422);
 return record;
}
async function eligibleRecipients(tx:any,sponsorId:string){return tx`select u.id,u.email from cms_sponsor_memberships sm join auth_user u on u.id=sm.user_id join cms_memberships m on m.user_id=u.id where sm.sponsor_id=${sponsorId} and 'signer'=any(sm.roles) and m.active and not coalesce(u.banned,false) and u.supabase_user_id is not null order by u.id`;}
/** Explicit staff intent, never a historical scan or contact-email match. */
export async function queueSponsorDocumentMail(tx:any,id:string,phase:DocumentMailPhase,operationId:string,actorId:string,required=true){
 const record=await documentContext(tx,id,phase),recipients=await eligibleRecipients(tx,record.sponsor_id);
 if(!recipients.length&&!required)return {queued:0,status:'cancelled' as const};
 if(!recipients.length)throw new CmsError('document-mail-recipient','Koppel eerst een actieve tekenbevoegde sponsorcontactpersoon met een persoonlijk account aan dit bedrijf.',422);
 let queued=0;
 for(const account of recipients){
  const deliveryId=digestText('sponsor-document\0'+id+'\0'+phase+'\0'+account.id);
  const rows=await tx`insert into cms_sponsor_deliveries(id,sponsor_id,user_id,reference_id,kind) values (${deliveryId},${record.sponsor_id},${account.id},${id},${'document-'+phase}) on conflict(id) do update set status='queued',delivered_at=null where cms_sponsor_deliveries.status in ('failed','cancelled') returning id`;
  if(rows.length){
   await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'sponsor-document-'+deliveryId+'-'+operationId},'sponsor-document-mail',${tx.json({deliveryId,actorId})}) on conflict(operation_id) do nothing`;
   queued++;
  }
 }
 if(queued){await tx`update cms_domain_revision set version=version+1 where id=true`;await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${actorId},'sponsor-document-mail-queued',null,${operationId},${tx.json({referenceId:id,phase,recipientCount:queued})})`;}
 const summary=(await readSponsorDocumentMails(tx,[record.sponsor_id])).find(row=>row.referenceId===id&&row.phase===phase);
 return {queued,status:summary?.status||'cancelled' as const};
}
/** No addresses, message content, provider credentials or account identifiers. */
export async function readSponsorDocumentMails(tx:any,sponsorIds:string[]):Promise<SponsorDocumentMail[]>{
 if(!sponsorIds.length)return [];
 const rows=await tx`select reference_id,kind,count(*)::int as recipients,count(*) filter(where status='accepted')::int as accepted,count(*) filter(where status='failed')::int as failed,count(*) filter(where status='queued')::int as queued,max(delivered_at) filter(where status='accepted') as accepted_at from cms_sponsor_deliveries where sponsor_id in ${tx(sponsorIds)} and kind in ('document-proposal','document-agreement','document-signed') group by reference_id,kind`;
 return rows.map((r:any)=>({referenceId:r.reference_id,phase:r.kind.slice(9),status:r.failed?'failed':r.queued?'queued':r.accepted===r.recipients?'accepted':r.accepted?'partial':'cancelled',recipients:r.recipients,accepted:r.accepted,failed:r.failed,acceptedAt:r.accepted_at?new Date(r.accepted_at).toISOString():''}));
}
/** Lock prevents membership/document changes while the authorized send is in flight. */
export async function deliverSponsorDocumentMail(deliveryId:string){
 const sql=sqlClient();
 try{await sql.begin(async tx=>{
  await workspaceLocks(tx);
  const [delivery]=await tx`select * from cms_sponsor_deliveries where id=${deliveryId}`;
  if(!delivery||['accepted','cancelled'].includes(delivery.status))return;
  // A deliberate retry may have been requested by a different authorized staff member.
  // Read the latest persisted intent instead of trusting a stale claimed job payload.
  const [intent]=await tx`select payload->>'actorId' as actor_id from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${deliveryId} order by created_at desc,id desc limit 1`;
  try{if(!intent?.actor_id)throw new CmsError('forbidden','De verzendaanvraag ontbreekt.',403);requireWrite(await actorPrincipal(intent.actor_id,tx),'sponsors','update');}catch(error){if(error instanceof CmsError&&[401,403].includes(error.status)){await tx`update cms_sponsor_deliveries set status='cancelled' where id=${deliveryId}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return;}throw error;}
  const phase=delivery.kind.slice(9) as DocumentMailPhase;if(!Object.hasOwn(kinds,phase))throw new CmsError('document-mail-kind','De documentmail is ongeldig.',422);
  let record:any;try{record=await documentContext(tx,delivery.reference_id,phase);}catch(error){if(error instanceof CmsError&&['missing','document-mail-status'].includes(error.code)){await tx`update cms_sponsor_deliveries set status='cancelled' where id=${deliveryId}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return;}throw error;}
  const account=(await eligibleRecipients(tx,record.sponsor_id)).find((row:any)=>row.id===delivery.user_id);
  if(!account){await tx`update cms_sponsor_deliveries set status='cancelled' where id=${deliveryId}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return;}
  let attachments:{filename:string;content:string}[]|undefined;
  if(phase==='signed'){
   const [file]=await tx`select f.* from cms_sponsor_files f join cms_sponsor_documents d on d.agreement_id=f.agreement_id where f.agreement_id=${record.id} and f.kind='agreement-final' and f.document_hash=d.document_hash and d.document_hash=${record.data.documentHash}`;
   if(!file)throw new CmsError('document-pdf-pending','De definitieve PDF wordt nog gearchiveerd.',409);
   const bytes=await getObject(file.storage_key);if(binaryHash(bytes)!==file.file_hash||bytes.length!==Number(file.bytes))throw new CmsError('document-integrity','De definitieve PDF kon niet worden gecontroleerd.',409);
   attachments=[{filename:'Duindorp-SV-Overeenkomst-'+record.data.number.replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf',content:Buffer.from(bytes).toString('base64')}];
  }
  const subject=phase==='proposal'?'Je sponsorvoorstel bij Duindorp SV':phase==='agreement'?'Je sponsorovereenkomst staat klaar voor ondertekening':'Je ondertekende sponsorovereenkomst bij Duindorp SV';
  const text=phase==='proposal'?'Er staat een sponsorvoorstel voor je klaar. Bekijk de vastgelegde afspraken en accepteer het voorstel in je persoonlijke sponsorportaal.':phase==='agreement'?'Je sponsorovereenkomst '+record.data.number+' staat klaar. Bekijk de vastgelegde afspraken en onderteken met je persoonlijke e-mailcode in het sponsorportaal.':'Je sponsorovereenkomst '+record.data.number+' is door beide partijen ondertekend. De definitieve, gearchiveerde PDF vind je in de bijlage en in je persoonlijke sponsorportaal.';
  const receipts=await sponsorMail(account.email,subject,text,'sponsor-document-'+deliveryId,{label:'Sponsorportaal openen',href:env().APP_BASE_URL.replace(/\/$/,'')+'/sponsorportaal'},attachments);
  await tx`update cms_sponsor_deliveries set status='accepted',delivered_at=now() where id=${deliveryId}`;
  await tx`update cms_domain_revision set version=version+1 where id=true`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},null,'sponsor-document-mail-accepted',null,${deliveryId},${tx.json({referenceId:record.id,phase,providerAccepted:true,receiptCount:receipts.length,providerIds:receipts})})`;
 });}catch(error){
  // Archiving has its own higher-priority job. Waiting is not a provider failure.
  if(!(error instanceof CmsError&&error.code==='document-pdf-pending'))await sql.begin(async tx=>{await workspaceLocks(tx);await tx`update cms_sponsor_deliveries set status='failed' where id=${deliveryId} and status not in ('accepted','cancelled')`;await tx`update cms_domain_revision set version=version+1 where id=true`;});
  throw error;
 }
}
/** A permanently exhausted archive/mail job must not remain displayed as queued. */
export async function markSponsorDocumentMailExhausted(deliveryId:string,jobId:string){
 await sqlClient().begin(async tx=>{await workspaceLocks(tx);
  const changed=await tx`update cms_sponsor_deliveries set status='failed' where id=${deliveryId} and status not in ('accepted','cancelled') and not exists(select 1 from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${deliveryId} and id<>${jobId} and status in ('pending','processing')) returning id`;
  if(changed.length)await tx`update cms_domain_revision set version=version+1 where id=true`;
 });
}

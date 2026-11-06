import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {createSponsorAgreementFromDraft} from '../cms/sponsorship';
import {withDomainIds} from '../cms/domain-commands';
import {getSponsorAgreementDeliverySource,getSponsorAgreementDeliveryHtml,type SponsorAgreementDeliveryTarget,type SponsorAgreementDeliverySource} from '../cms/sponsor-agreement-delivery';
import {buildSponsorAgreementDeliveryPdf} from '../cms/sponsor-agreement-delivery-pdf';
import {workspaceActor,freshActor,workspaceLocks,workspaceRate,requireWrite,secureCodeHash} from './sponsor-access';
import {actorPrincipal,verifyOrigin,type Principal} from './permissions';
import {readDomainStore,sponsorStaff,digestText} from './sponsor-store';
import {persistDomainStore,numberNewSponsorAgreements} from './sponsor-persistence';
import {agreementDeliverySourceFromRow} from './sponsor-agreement-delivery-records';
import {sponsorPdfAssets} from './sponsor-concepts';
import {sponsorMail} from './sponsor-mail';
import {getObject,putObject,deleteObject} from './storage';
import {CmsError} from './errors';
import {env} from './env';

const id=z.string().min(1).max(191).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const targetSchema=z.object({proposalId:id.optional(),agreementId:id.optional(),deliveryId:id.optional()}).strict().refine(value=>!!(value.proposalId||value.agreementId||value.deliveryId),'Kies een sponsordocument.');
const currentTarget=z.object({proposalId:id.optional(),agreementId:id.optional()}).strict().refine(value=>Number(!!value.proposalId)+Number(!!value.agreementId)===1,'Kies één concept of overeenkomst.');
const inputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),operationId:z.string().uuid(),target:currentTarget,expectedHash:z.string().regex(/^[a-f0-9]{64}$/),recipient:z.string().trim().toLowerCase().email().max(254),subject:z.string().min(1).max(180).refine(value=>!!value.trim()&&!/[\r\n]/.test(value),'Gebruik een onderwerp zonder regeleinden.'),message:z.string().max(5000)}).strict(),
 z.object({action:z.literal('retry'),operationId:z.string().uuid(),deliveryId:z.string().uuid()}).strict()
]);
const binaryHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function requireRead(p:Principal){if(!sponsorStaff(p))throw new CmsError('forbidden','Deze documenten zijn alleen beschikbaar voor sponsorbeheer.',403);}
function asValidation(error:unknown):never{if(error instanceof CmsError)throw error;throw new CmsError('validation',error instanceof Error?error.message:'Controleer de overeenkomst.',422);}
function queryTarget(request:Request){return targetSchema.parse(Object.fromEntries(new URL(request.url).searchParams));}
async function requireTarget(tx:any,target:SponsorAgreementDeliveryTarget){
 const [row]=target.deliveryId?await tx`select id from cms_sponsor_agreement_deliveries where id=${target.deliveryId}`:await tx`select id from cms_sponsor_records where id=${target.agreementId||target.proposalId!} and kind=${target.agreementId?'agreements':'proposals'}`;
 if(!row)throw new CmsError('missing','Dit sponsordocument bestaat niet.',404);
}
/** Preview reads and PDF rendering deliberately perform no database/storage writes. */
export async function readSponsorAgreementComposer(request:Request){
 const target=queryTarget(request),actor=await workspaceActor(request.headers);
 return sqlClient().begin(async tx=>{
  const p=await freshActor(tx,actor);requireRead(p);await requireTarget(tx,target);
  const {state}=await readDomainStore(tx,p);let source:SponsorAgreementDeliverySource|null=null,html='',error='';
  try{source=getSponsorAgreementDeliverySource(state,p.id,target);html=getSponsorAgreementDeliveryHtml(state,p.id,target,new URL('/fonts/club-font-9.ttf',env().APP_BASE_URL).href);}catch(reason){error=reason instanceof Error?reason.message:'Dit document is niet beschikbaar.';}
  const rows=state.sponsorship!.agreementDeliveries||[],selected=target.deliveryId?rows.find(row=>row.id===target.deliveryId):undefined,agreementId=source?.agreementId||target.agreementId||selected?.agreementId,proposalId=source?.proposalId||target.proposalId;
  const deliveries=rows.filter(row=>agreementId?row.agreementId===agreementId:proposalId?row.proposalId===proposalId:false);
  return {source,html,error,deliveries};
 });
}
/** A matching existing account is eligible only through its actual company membership. */
async function knownSigner(tx:any,sponsorId:string,recipient:string){
 const [account]=await tx`select u.id from cms_sponsor_memberships sm join auth_user u on u.id=sm.user_id join cms_memberships m on m.user_id=u.id where sm.sponsor_id=${sponsorId} and 'signer'=any(sm.roles) and lower(u.email)=${recipient} and u.email_verified and u.supabase_user_id is not null and m.active and not coalesce(u.banned,false)`;
 return account?.id||null;
}
async function currentAgreement(tx:any,row:any){
 const [record]=await tx`select a.data,d.snapshot_bytes,d.document_hash,d.document_version,d.sponsor_id from cms_sponsor_records a join cms_sponsor_documents d on d.agreement_id=a.id where a.id=${row.agreement_id} and a.kind='agreements'`;
 if(!record)throw new CmsError('missing','De vastgelegde overeenkomst ontbreekt.',404);
 agreementDeliverySourceFromRow(row);
 if(record.sponsor_id!==row.sponsor_id||record.snapshot_bytes!==row.snapshot_bytes||record.document_hash!==row.document_hash||record.document_version!==row.document_version||record.data.proposalId!==row.proposal_id||record.data.number!==row.agreement_number||record.data.documentHash!==row.document_hash)throw new CmsError('document-integrity','De vastgelegde overeenkomst kon niet worden gecontroleerd.',409);
 if(record.data.status!=='awaiting-signature'||record.data.signatures?.length)throw new CmsError('agreement-mail-status','Deze overeenkomst wacht niet meer op de eerste sponsorhandtekening.',409);
 return record;
}
const retryWindowExpired=(row:any)=>row.first_attempt_at&&Date.now()-new Date(row.first_attempt_at).getTime()>23*3600000;
const retryWindowError=()=>new CmsError('agreement-mail-manual-check','De veilige herhaaltermijn is voorbij. Controleer de eerdere provideracceptatie voordat je bewust een nieuwe verzending maakt.',409);
export async function requestSponsorAgreementDelivery(request:Request,value:unknown){
 verifyOrigin(request);const input=inputSchema.parse(value),actor=await workspaceActor(request.headers),requestHash=secureCodeHash('agreement-delivery-operation',input.operationId,JSON.stringify(input)),uploaded:string[]=[];
 try{return await sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);requireWrite(p,'sponsors','update');
  const [old]=await tx`select actor_id,request_hash,result from cms_domain_operations where id=${input.operationId}::uuid`;
  if(old){if(old.actor_id!==p.id||old.request_hash!==requestHash)throw new CmsError('operation-conflict','Dit verzoeknummer is al gebruikt.',409);const [current]=await tx`select status from cms_sponsor_agreement_deliveries where id=${old.result.id}`;return {...old.result,...(current?{status:current.status}:{})};}
  await workspaceRate('sponsor:agreement-composer:'+p.id,50,3600,tx);
  let deliveryId:string,agreementId:string;
  if(input.action==='retry'){
   const [row]=await tx`select * from cms_sponsor_agreement_deliveries where id=${input.deliveryId}`;
   if(!row)throw new CmsError('missing','Deze overeenkomstverzending bestaat niet.',404);
   await currentAgreement(tx,row);
   if(row.status!=='failed')throw new CmsError('agreement-mail-retry','Alleen een mislukte verzending kan opnieuw worden aangeboden. Kies voor een nieuw persoonlijk bericht een nieuwe verzending.',409);
   if(retryWindowExpired(row))throw retryWindowError();
   deliveryId=row.id;agreementId=row.agreement_id;
   await tx`update cms_sponsor_agreement_deliveries set status='queued',last_error='',requested_by=${p.id} where id=${deliveryId}`;
  }else{
   const before=await readDomainStore(tx,p),state=structuredClone(before.state);let source:SponsorAgreementDeliverySource;
   try{source=getSponsorAgreementDeliverySource(state,p.id,input.target);}catch(reason){asValidation(reason);}
   if(source.documentHash!==input.expectedHash)throw new CmsError('agreement-preview-conflict','Het concept of de bedrijfs-/clubgegevens zijn gewijzigd. Bekijk eerst de nieuwste overeenkomst.',409);
   if(!source.agreementId){
    try{withDomainIds(input.operationId,0,()=>createSponsorAgreementFromDraft(state,p.id,source.proposalId,input.expectedHash));}catch(reason){asValidation(reason);}
    await numberNewSponsorAgreements(tx,before,state);
    const agreement=state.sponsorship!.agreements.find(row=>row.proposalId===source.proposalId&&!before.records.has(row.id));
    if(!agreement)throw new CmsError('agreement-create','De overeenkomst kon niet worden vastgelegd.',409);
    source=getSponsorAgreementDeliverySource(state,p.id,{agreementId:agreement.id});
   }
   agreementId=source.agreementId!;deliveryId=randomUUID();
   const bytes=await buildSponsorAgreementDeliveryPdf(source,{assets:await sponsorPdfAssets()}),fileId=randomUUID(),key='sponsorship/'+digestText(source.sponsorId)+'/agreement-deliveries/'+deliveryId+'.pdf';
   await persistDomainStore(tx,p,before,state,input.operationId,uploaded);
   uploaded.push(key);await putObject(key,bytes,'application/pdf');
   await tx`insert into cms_sponsor_files(id,sponsor_id,agreement_id,kind,storage_key,file_hash,bytes,mime,name,document_hash,created_by) values (${fileId},${source.sponsorId},${agreementId},'agreement-delivery',${key},${binaryHash(bytes)},${bytes.length},'application/pdf',${'Sponsorovereenkomst-'+source.agreementNumber+'.pdf'},${source.documentHash},${p.id})`;
   const signerId=await knownSigner(tx,source.sponsorId,input.recipient),snapshotBytes=source.snapshotBytes||JSON.stringify(source.snapshot);
   await tx`insert into cms_sponsor_agreement_deliveries(id,agreement_id,proposal_id,sponsor_id,agreement_number,document_version,snapshot_bytes,document_hash,file_id,recipient,subject,message,signer_user_id,created_by,requested_by) values (${deliveryId},${agreementId},${source.proposalId},${source.sponsorId},${source.agreementNumber},${source.version},${snapshotBytes},${source.documentHash},${fileId},${input.recipient},${input.subject},${input.message},${signerId},${p.id},${p.id})`;
  }
  await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${randomUUID()},${'sponsor-agreement-delivery-'+deliveryId+'-'+input.operationId},'sponsor-agreement-delivery-mail',${tx.json({deliveryId})}) on conflict(operation_id) do nothing`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${randomUUID()},${p.id},${input.action==='retry'?'sponsor-agreement-delivery-retry':'sponsor-agreement-delivery-queued'},null,${input.operationId},${tx.json({deliveryId,agreementId})})`;
  await tx`update cms_domain_revision set version=version+1 where id=true`;
  const result={ok:true,id:deliveryId,agreementId,status:'queued'};await tx`insert into cms_domain_operations(id,actor_id,request_hash,result) values (${input.operationId}::uuid,${p.id},${requestHash},${tx.json(result)})`;return result;
 });}catch(error){await Promise.all(uploaded.map(async key=>{try{const [registered]=await sqlClient()`select id from cms_sponsor_files where storage_key=${key}`;if(!registered)await deleteObject(key);}catch{/* Preserve bytes when commit outcome is uncertain. */}}));throw error;}
}
async function authorizeDelivery(tx:any,row:any){
 try{requireWrite(await actorPrincipal(row.requested_by,tx),'sponsors','update');await currentAgreement(tx,row);return true;}catch(error){
  if(error instanceof CmsError&&([401,403,404].includes(error.status)||error.code==='agreement-mail-status')){await tx`update cms_sponsor_agreement_deliveries set status='cancelled',last_error='De verzendaanvraag is niet meer bevoegd of de ondertekening is al begonnen.' where id=${row.id}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return false;}throw error;
 }
}
/** First attempt survives provider/network transaction rollback; retries retain bytes and key. */
export async function deliverSponsorAgreementDelivery(deliveryId:string){
 const sql=sqlClient();try{
  await sql.begin(async tx=>{
   await workspaceLocks(tx);const [row]=await tx`select * from cms_sponsor_agreement_deliveries where id=${deliveryId}`;if(!row||['accepted','cancelled'].includes(row.status))return;
   if(!await authorizeDelivery(tx,row))return;if(retryWindowExpired(row))throw retryWindowError();
   await tx`update cms_sponsor_agreement_deliveries set first_attempt_at=coalesce(first_attempt_at,now()) where id=${deliveryId}`;
  });
  await sql.begin(async tx=>{
   await workspaceLocks(tx);const [row]=await tx`select * from cms_sponsor_agreement_deliveries where id=${deliveryId}`;if(!row||['accepted','cancelled'].includes(row.status))return;
   if(!await authorizeDelivery(tx,row))return;if(retryWindowExpired(row))throw retryWindowError();
   const [file]=await tx`select * from cms_sponsor_files where id=${row.file_id} and sponsor_id=${row.sponsor_id} and agreement_id=${row.agreement_id} and kind='agreement-delivery' and document_hash=${row.document_hash}`;
   if(!file)throw new CmsError('agreement-document','De vaste overeenkomst-PDF ontbreekt.',409);
   const bytes=await getObject(file.storage_key);if(bytes.length!==Number(file.bytes)||binaryHash(bytes)!==file.file_hash)throw new CmsError('document-integrity','De overeenkomst-PDF kon niet worden gecontroleerd.',409);
   const linked=row.signer_user_id&&await knownSigner(tx,row.sponsor_id,row.recipient)===row.signer_user_id;
   const text=row.message.trim()?row.message:'Hierbij ontvang je de sponsorovereenkomst van Duindorp SV als PDF-bijlage.';
   const receipts=await sponsorMail(row.recipient,row.subject,text,'sponsor-agreement-delivery-'+deliveryId,linked?{label:'Persoonlijk bekijken en ondertekenen',href:env().APP_BASE_URL.replace(/\/$/,'')+'/sponsorportaal'}:undefined,[{filename:'Duindorp-SV-Sponsorovereenkomst-'+row.agreement_number.replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf',content:Buffer.from(bytes).toString('base64')}]);
   await tx`update cms_sponsor_agreement_deliveries set status='accepted',accepted_at=now(),provider_id=${receipts[0]}::uuid,last_error='' where id=${deliveryId}`;
   await tx`update cms_domain_revision set version=version+1 where id=true`;
   await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${randomUUID()},null,'sponsor-agreement-delivery-accepted',null,${deliveryId},${tx.json({deliveryId,agreementId:row.agreement_id,providerIds:receipts})})`;
  });
 }catch(error){await sql.begin(async tx=>{await workspaceLocks(tx);await tx`update cms_sponsor_agreement_deliveries set status='failed',last_error='De mailprovider heeft de e-mail niet bevestigd. Een retry gebruikt dezelfde overeenkomst en PDF.' where id=${deliveryId} and status not in ('accepted','cancelled')`;await tx`update cms_domain_revision set version=version+1 where id=true`;});throw error;}
}
export async function markSponsorAgreementDeliveryExhausted(deliveryId:string,jobId:string){await sqlClient().begin(async tx=>{
 await workspaceLocks(tx);const changed=await tx`update cms_sponsor_agreement_deliveries set status='failed',last_error='De verzendtaak kon niet worden afgerond. Probeer dezelfde verzending opnieuw.' where id=${deliveryId} and status not in ('accepted','cancelled') and not exists(select 1 from cms_jobs where kind='sponsor-agreement-delivery-mail' and payload->>'deliveryId'=${deliveryId} and id<>${jobId} and status in ('pending','processing')) returning id`;
 if(changed.length)await tx`update cms_domain_revision set version=version+1 where id=true`;
});}
export async function sponsorAgreementComposerPdf(request:Request){
 const target=queryTarget(request),actor=await workspaceActor(request.headers);
 const result=await sqlClient().begin(async tx=>{
  const p=await freshActor(tx,actor);requireRead(p);await requireTarget(tx,target);
  if(target.deliveryId){
   const [row]=await tx`select * from cms_sponsor_agreement_deliveries where id=${target.deliveryId}`;const source=agreementDeliverySourceFromRow(row);
   // Historical reads also work after signing; only the immutable relationship matters.
   const {state}=await readDomainStore(tx,p);try{getSponsorAgreementDeliverySource(state,p.id,target);}catch(error){asValidation(error);}
   const [file]=await tx`select * from cms_sponsor_files where id=${row.file_id} and sponsor_id=${source.sponsorId} and agreement_id=${row.agreement_id} and kind='agreement-delivery' and document_hash=${source.documentHash}`;
   if(!file)throw new CmsError('missing','Overeenkomst-PDF niet gevonden.',404);const bytes=await getObject(file.storage_key);
   if(bytes.length!==Number(file.bytes)||binaryHash(bytes)!==file.file_hash)throw new CmsError('document-integrity','De vaste overeenkomst-PDF kon niet worden gecontroleerd.',409);return {bytes,number:source.agreementNumber};
  }
  const {state}=await readDomainStore(tx,p);let source;try{source=getSponsorAgreementDeliverySource(state,p.id,target);}catch(error){asValidation(error);}
  return {bytes:await buildSponsorAgreementDeliveryPdf(source,{assets:await sponsorPdfAssets()}),number:source.agreementNumber};
 });
 const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new CmsError('forbidden','Je toegang is gewijzigd.',403);requireRead(current.p);
 return new Response(result.bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Duindorp-SV-Sponsorovereenkomst-'+result.number.replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}

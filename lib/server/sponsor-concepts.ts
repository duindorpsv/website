import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {getSponsorConceptSource,getSponsorConceptHtml,assertSponsorConceptSource,type SponsorConceptSource,type SponsorConceptDelivery} from '../cms/sponsor-concept';
import {buildSponsorConceptPdf} from '../cms/sponsor-concept-pdf';
import {workspaceActor,freshActor,requireWrite,workspaceLocks,workspaceRate,secureCodeHash} from './sponsor-access';
import {readDomainStore,sponsorStaff,digestText} from './sponsor-store';
import {actorPrincipal,verifyOrigin,type Principal} from './permissions';
import {CmsError} from './errors';
import {env} from './env';
import {getObject,putObject,deleteObject} from './storage';
import {sponsorMail} from './sponsor-mail';
import {conceptSourceFromRow as sourceFromRow,conceptDeliveryProjection as projection,sponsorConceptRows} from './sponsor-concept-records';
const binaryHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const inputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),operationId:z.string().uuid(),expectedHash:z.string().regex(/^[a-f0-9]{64}$/),recipient:z.string().trim().toLowerCase().email().max(254),subject:z.string().trim().min(1).max(180).refine(s=>!/[\r\n]/.test(s)),message:z.string().trim().min(1).max(5000)}).strict(),
 z.object({action:z.literal('retry'),operationId:z.string().uuid(),deliveryId:z.string().uuid()}).strict()
]);
export async function sponsorPdfAssets(){const root=join(process.cwd(),'public');const [logoPng,bodyFont,boldFont,headingFont,brushFont]=await Promise.all(['assets/logo.png','fonts/club-font-4.ttf','fonts/club-font-7.ttf','fonts/club-font-3.ttf','fonts/club-font-9.ttf'].map(path=>readFile(join(root,path))));return {logoPng,bodyFont,boldFont,headingFont,brushFont};}
function requireRead(p:Principal){if(!sponsorStaff(p))throw new CmsError('forbidden','Je hebt sponsorbeheerrechten nodig voor conceptvoorstellen.',403);}
async function proposal(tx:any,id:string,history=false){const [row]=await tx`select id,sponsor_id,version,data from cms_sponsor_records where id=${id} and kind='proposals'`;if(!row)throw new CmsError('missing','Het sponsorvoorstel bestaat niet.',404);if(row.data.deletedAt&&!history)throw new CmsError('draft-deleted','Dit concept is verwijderd. De verzendhistorie blijft beschikbaar.',409);return row;}
async function activeConcept(tx:any,row:any){const [record]=await tx`select data from cms_sponsor_records where id=${row.proposal_id} and kind='proposals'`;if(record&&!record.data.deletedAt)return true;await tx`update cms_sponsor_concepts set status='cancelled',last_error='Het bronconcept is verwijderd.' where id=${row.id}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return false;}
export async function readSponsorConcepts(request:Request,proposalId:string){const actor=await workspaceActor(request.headers);return sqlClient().begin(async tx=>{
 const p=await freshActor(tx,actor);requireRead(p);await proposal(tx,proposalId,true);
 const rows=await sponsorConceptRows(tx,tx`c.proposal_id=${proposalId}`);
 let source:SponsorConceptSource|null=null,error='';try{source=getSponsorConceptSource((await readDomainStore(tx,p)).state,p.id,proposalId,(rows[0]?.version||0)+1);}catch(reason){error=reason instanceof Error?reason.message:'Dit concept is niet beschikbaar.';}
 const fontUrl=new URL('/fonts/club-font-9.ttf',env().APP_BASE_URL).href;
 return {source,error,html:source?getSponsorConceptHtml(source,fontUrl):'',deliveries:rows.map(projection)};
});}
/** Intent, immutable document and outbox commit together; source stays a draft. */
export async function requestSponsorConcept(request:Request,proposalId:string,value:unknown){
 verifyOrigin(request);const input=inputSchema.parse(value),actor=await workspaceActor(request.headers),requestHash=secureCodeHash('concept-operation',input.operationId,JSON.stringify({proposalId,input})),uploaded:string[]=[];
 try{return await sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);requireWrite(p,'sponsors','update');const record=await proposal(tx,proposalId);
  const [old]=await tx`select actor_id,request_hash,result from cms_domain_operations where id=${input.operationId}::uuid`;
  if(old){if(old.actor_id!==p.id||old.request_hash!==requestHash)throw new CmsError('operation-conflict','Dit verzoeknummer is al gebruikt.',409);return old.result;}
  await workspaceRate('sponsor:concept:'+p.id,50,3600,tx);
  let id:string;
  if(input.action==='retry'){
   const [delivery]=await tx`select * from cms_sponsor_concepts where id=${input.deliveryId} and proposal_id=${proposalId}`;
   if(!delivery)throw new CmsError('missing','Deze conceptversie bestaat niet.',404);
   if(delivery.status!=='failed')throw new CmsError('concept-retry','Alleen een mislukte verzending kan opnieuw worden aangeboden. Maak voor een bewuste nieuwe verzending een nieuwe conceptversie.',409);
   if(delivery.first_attempt_at&&Date.now()-new Date(delivery.first_attempt_at).getTime()>23*3600000)throw new CmsError('concept-manual-check','De eerdere provideracceptatie is onzeker en de veilige herhaaltermijn is voorbij. Controleer de verzending bij de mailprovider voordat je bewust een nieuwe conceptversie verstuurt.',409);
   id=delivery.id;await tx`update cms_sponsor_concepts set status='queued',last_error='',requested_by=${p.id} where id=${id}`;
  }else{
   const [last]=await tx`select coalesce(max(version),0)::int as version from cms_sponsor_concepts where proposal_id=${proposalId}`;
   let source:SponsorConceptSource;try{source=getSponsorConceptSource((await readDomainStore(tx,p)).state,p.id,proposalId,last.version+1);}catch(error){throw new CmsError('validation',error instanceof Error?error.message:'Controleer het concept.',422);}
   if(source.documentHash!==input.expectedHash)throw new CmsError('concept-conflict','Het voorstel of de clubgegevens zijn gewijzigd. Bekijk eerst de nieuwste conceptversie.',409);
   const bytes=await buildSponsorConceptPdf(source,{assets:await sponsorPdfAssets()});id=randomUUID();const fileId=randomUUID(),key='sponsorship/'+digestText(record.sponsor_id)+'/concepts/'+id+'.pdf';
   uploaded.push(key);await putObject(key,bytes,'application/pdf');
   await tx`insert into cms_sponsor_files(id,sponsor_id,kind,storage_key,file_hash,bytes,mime,name,document_hash,created_by) values (${fileId},${record.sponsor_id},'concept-proposal',${key},${binaryHash(bytes)},${bytes.length},'application/pdf',${'Conceptvoorstel-v'+source.version+'.pdf'},${source.documentHash},${p.id})`;
   await tx`insert into cms_sponsor_concepts(id,proposal_id,sponsor_id,version,snapshot_bytes,document_hash,file_id,recipient,subject,message,created_by,requested_by) values (${id},${proposalId},${source.sponsorId},${source.version},${JSON.stringify(source.snapshot)},${source.documentHash},${fileId},${input.recipient},${input.subject},${input.message},${p.id},${p.id})`;
  }
  await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${randomUUID()},${'sponsor-concept-'+id+'-'+input.operationId},'sponsor-concept-mail',${tx.json({deliveryId:id})}) on conflict(operation_id) do nothing`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${randomUUID()},${p.id},${input.action==='retry'?'sponsor-concept-retry':'sponsor-concept-queued'},null,${input.operationId},${tx.json({proposalId,conceptId:id})})`;
  await tx`update cms_domain_revision set version=version+1 where id=true`;
  const result={ok:true,id,status:'queued'};await tx`insert into cms_domain_operations(id,actor_id,request_hash,result) values (${input.operationId}::uuid,${p.id},${requestHash},${tx.json(result)})`;return result;
 });}catch(error){await Promise.all(uploaded.map(async key=>{try{const [registered]=await sqlClient()`select id from cms_sponsor_files where storage_key=${key}`;if(!registered)await deleteObject(key);}catch{/* An uncertain commit or database outage preserves private bytes for recovery. */}}));throw error;}
}
/** Provider acceptance is distinct from delivery. Retry always uses the same bytes and provider key. */
export async function deliverSponsorConcept(deliveryId:string){
 const sql=sqlClient();try{
 // Commit the provider retry window before any possible send. A process death
 // after provider acceptance must never erase its start via a transaction rollback.
 await sql.begin(async tx=>{
  await workspaceLocks(tx);const [row]=await tx`select * from cms_sponsor_concepts where id=${deliveryId}`;if(!row||['accepted','cancelled'].includes(row.status))return;
  if(!await activeConcept(tx,row))return;
  try{requireWrite(await actorPrincipal(row.requested_by,tx),'sponsors','update');}catch(error){if(error instanceof CmsError&&[401,403].includes(error.status)){await tx`update cms_sponsor_concepts set status='cancelled',last_error='Toegang van de aanvrager ingetrokken' where id=${deliveryId}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return;}throw error;}
  if(row.first_attempt_at&&Date.now()-new Date(row.first_attempt_at).getTime()>23*3600000)throw new CmsError('concept-manual-check','Controleer de eerdere verzending bij de mailprovider.',409);
  sourceFromRow(row);await tx`update cms_sponsor_concepts set first_attempt_at=coalesce(first_attempt_at,now()) where id=${deliveryId}`;
 });
 await sql.begin(async tx=>{
  await workspaceLocks(tx);const [row]=await tx`select * from cms_sponsor_concepts where id=${deliveryId}`;if(!row||['accepted','cancelled'].includes(row.status))return;
  if(!await activeConcept(tx,row))return;
  try{requireWrite(await actorPrincipal(row.requested_by,tx),'sponsors','update');}catch(error){if(error instanceof CmsError&&[401,403].includes(error.status)){await tx`update cms_sponsor_concepts set status='cancelled',last_error='Toegang van de aanvrager ingetrokken' where id=${deliveryId}`;await tx`update cms_domain_revision set version=version+1 where id=true`;return;}throw error;}
  if(row.first_attempt_at&&Date.now()-new Date(row.first_attempt_at).getTime()>23*3600000)throw new CmsError('concept-manual-check','Controleer de eerdere verzending bij de mailprovider.',409);
  sourceFromRow(row);const [file]=await tx`select * from cms_sponsor_files where id=${row.file_id} and kind='concept-proposal' and sponsor_id=${row.sponsor_id} and document_hash=${row.document_hash}`;
  if(!file)throw new CmsError('concept-document','Het gearchiveerde concept ontbreekt.',409);
  const bytes=await getObject(file.storage_key);if(bytes.length!==Number(file.bytes)||binaryHash(bytes)!==file.file_hash)throw new CmsError('document-integrity','De concept-PDF kon niet worden gecontroleerd.',409);
  const receipts=await sponsorMail(row.recipient,row.subject,row.message,'sponsor-concept-'+deliveryId,undefined,[{filename:'Duindorp-SV-CONCEPTVOORSTEL-v'+row.version+'.pdf',content:Buffer.from(bytes).toString('base64')}]);
  await tx`update cms_sponsor_concepts set status='accepted',accepted_at=now(),last_error='' where id=${deliveryId}`;await tx`update cms_domain_revision set version=version+1 where id=true`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${randomUUID()},null,'sponsor-concept-mail-accepted',null,${deliveryId},${tx.json({proposalId:row.proposal_id,conceptId:deliveryId,providerAccepted:true,providerIds:receipts})})`;
 });}catch(error){await sql.begin(async tx=>{await workspaceLocks(tx);await tx`update cms_sponsor_concepts set status='failed',first_attempt_at=coalesce(first_attempt_at,now()),last_error='De e-mail is niet door de mailprovider bevestigd. Opnieuw proberen gebruikt dezelfde conceptversie.' where id=${deliveryId} and status not in ('accepted','cancelled')`;await tx`update cms_domain_revision set version=version+1 where id=true`;});throw error;}
}
export async function markSponsorConceptExhausted(deliveryId:string,jobId:string){await sqlClient().begin(async tx=>{await workspaceLocks(tx);const changed=await tx`update cms_sponsor_concepts set status='failed',last_error='De verzendtaak kon niet worden afgerond. Probeer deze conceptversie opnieuw.' where id=${deliveryId} and status not in ('accepted','cancelled') and not exists(select 1 from cms_jobs where kind='sponsor-concept-mail' and payload->>'deliveryId'=${deliveryId} and id<>${jobId} and status in ('pending','processing')) returning id`;if(changed.length)await tx`update cms_domain_revision set version=version+1 where id=true`;});}
function pdfResponse(bytes:Uint8Array,version:number){return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Duindorp-SV-CONCEPTVOORSTEL-v${version}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}
export async function sponsorConceptPdfDownload(request:Request,id:string,archived=false){const actor=await workspaceActor(request.headers);const result=await sqlClient().begin(async tx=>{
 const p=await freshActor(tx,actor);requireRead(p);
 if(archived){const [row]=await tx`select * from cms_sponsor_concepts where id=${id}`;if(!row)throw new CmsError('missing','Conceptversie niet gevonden.',404);sourceFromRow(row);const [file]=await tx`select * from cms_sponsor_files where id=${row.file_id} and kind='concept-proposal' and document_hash=${row.document_hash}`;if(!file)throw new CmsError('missing','Concept-PDF niet gevonden.',404);const bytes=await getObject(file.storage_key);if(binaryHash(bytes)!==file.file_hash||bytes.length!==Number(file.bytes))throw new CmsError('document-integrity','De concept-PDF kon niet worden gecontroleerd.',409);return {bytes,version:row.version};}
 await proposal(tx,id);const [last]=await tx`select coalesce(max(version),0)::int as version from cms_sponsor_concepts where proposal_id=${id}`;let source;try{source=getSponsorConceptSource((await readDomainStore(tx,p)).state,p.id,id,last.version+1);}catch(error){throw new CmsError('validation',error instanceof Error?error.message:'Controleer het concept.',422);}return {bytes:await buildSponsorConceptPdf(source,{assets:await sponsorPdfAssets()}),version:source.version};
 });const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new CmsError('forbidden','Je toegang is gewijzigd.',403);requireRead(current.p);return pdfResponse(result.bytes,result.version);}

import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {CmsError} from './errors';
import {env} from './env';
import {workspaceActor,freshActor,requireDonorRight,requireWrite,workspaceLocks} from './sponsor-access';
import {resolveMollieCredential} from './mollie-provider';
import {resolveMollieServerRoute,readMollieConfiguration} from './mollie-settings';
import {mollieCreateBody,performMollieCreate,molliePaymentRequest,verifyMolliePayment,sourceStream,type MollieAttemptSnapshot,type MollieFinancialSource} from './mollie-payment-core';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const inputSchema=z.object({operationId:z.string().uuid(),sourceKind:z.enum(['donors','sponsors']),sourceId:z.string().min(1).max(160),previousAttemptId:z.string().min(1).max(160).optional()}).strict();
function right(p:any,kind:MollieFinancialSource['kind']){if(kind==='donors')requireDonorRight(p,'invoice');else requireWrite(p,'sponsors','manage');}
function snapshot(row:any):MollieAttemptSnapshot{if(digest(row.snapshot_bytes)!==row.snapshot_hash)throw new CmsError('payment-integrity','De betaalpoging kon niet worden gecontroleerd.',409);return JSON.parse(row.snapshot_bytes);}
function safe(row:any){return {id:row.id,status:row.status,providerId:row.provider_id,checkoutUrl:row.checkout_url,errorCode:row.error_code};}
async function source(tx:any,kind:MollieFinancialSource['kind'],id:string){
 const [row]=await tx`select data from cms_sponsor_records where id=${id} and kind=${kind==='donors'?'donorInvoices':'invoices'} for update`;
 if(!row||row.data.status!=='open')throw new CmsError('payment-source','Deze factuur staat niet open.',409);
 return {kind,id,number:row.data.number,amountCents:row.data.totalCents} as MollieFinancialSource;
}
/** Execution is deliberately unavailable until a separately reviewed activation is implemented. */
export type MolliePaymentRuntime={resolveRoute:typeof resolveMollieServerRoute;readConfiguration:typeof readMollieConfiguration;transport:typeof fetch};
// The HTTP route uses these fixed production dependencies. Tests supply a local provider adapter.
export async function createInvoicePayment(request:Request,value:unknown,runtime:Partial<MolliePaymentRuntime>={}){
 const services={resolveRoute:resolveMollieServerRoute,readConfiguration:readMollieConfiguration,transport:fetch,...runtime};
 const input=inputSchema.parse(value),actor=await workspaceActor(request.headers),sql=sqlClient();
 const row=await sql.begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);right(p,input.sourceKind);
  const [old]=await tx`select * from cms_mollie_payment_attempts where operation_id=${input.operationId}::uuid`;
  if(old){if(old.source_kind!==input.sourceKind||old.source_id!==input.sourceId||old.actor_id!==p.id)throw new CmsError('operation-conflict','Deze opdracht hoort bij een andere betaalpoging.',409);snapshot(old);return old;}
  const financial=await source(tx,input.sourceKind,input.sourceId);
  const configured=await services.resolveRoute(sourceStream(input.sourceKind),undefined,tx);
  const {route,credential,settings,version,configHash}=configured;
  if(!(settings.environments[route.mode].paymentsEnabled as boolean))throw new CmsError('payments-disabled','Online betalingen zijn nog niet geactiveerd.',409);
  const [active]=await tx`select * from cms_mollie_payment_attempts where source_kind=${input.sourceKind} and source_id=${input.sourceId} and status not in ('failed','canceled','expired')`;
  if(active)return active;
  const [previous]=await tx`select id from cms_mollie_payment_attempts where source_kind=${input.sourceKind} and source_id=${input.sourceId} order by created_at desc limit 1`;
  if(previous&&input.previousAttemptId!==previous.id)throw new CmsError('payment-retry','Bevestig een nieuwe poging na de definitief afgesloten betaling.',409);
  if(!route.profile||!route.balance||!route.link||!route.stream)throw new CmsError('payment-route','Controleer de geregistreerde betaalroute.',409);
  const id=randomUUID(),frozen:Omit<MollieAttemptSnapshot,'request'>={id,source:financial,clubId:credential.binding.clubId,organizationId:credential.binding.organizationId,mode:route.mode,streamCode:sourceStream(input.sourceKind),profileId:route.profile.id,expectedBalanceId:route.balance.id,linkVerification:route.link.verifiedBy,linkVerifiedAt:route.link.verifiedAt,catalogFetchedAt:settings.environments[route.mode].catalog.fetchedAt,configVersion:version,configHash,credentialBindingId:credential.binding.id,idempotencyKey:'duindorp-'+id,reference:[route.stream.referencePrefix,financial.number].filter(Boolean).join(' · '),createdAt:new Date().toISOString()};
  const bytes=JSON.stringify({...frozen,request:mollieCreateBody(frozen,credential,env().APP_BASE_URL)});
  const [created]=await tx`insert into cms_mollie_payment_attempts(id,operation_id,actor_id,source_kind,source_id,snapshot_bytes,snapshot_hash) values (${id},${input.operationId}::uuid,${p.id},${input.sourceKind},${input.sourceId},${bytes},${digest(bytes)}) returning *`;
  await tx`insert into cms_audit(id,actor_id,action,request_id,metadata) values (${randomUUID()},${p.id},'mollie-attempt-prepared',${input.operationId},${tx.json({attemptId:id,sourceId:input.sourceId,mode:route.mode})})`;
  return created;
 });
 if(!['prepared','uncertain'].includes(row.status))return safe(row);
 const frozen=snapshot(row),credential=resolveMollieCredential(frozen.mode,frozen.credentialBindingId);
 // Recheck access after the durable preparation; an opened dialog never retains a revoked grant.
 await sql.begin(async tx=>{await workspaceLocks(tx);right(await freshActor(tx,actor),input.sourceKind);await source(tx,input.sourceKind,input.sourceId);const config=await services.readConfiguration(tx);if(!(config.settings.environments[frozen.mode].paymentsEnabled as boolean))throw new CmsError('payments-disabled','Online betalingen zijn nog niet geactiveerd.',409);});
 try{
  const payment=await performMollieCreate(frozen,credential,services.transport);
  if(!/^tr_[a-zA-Z0-9]+$/.test(payment.id||''))throw new CmsError('payment-uncertain','Mollie heeft geen geldige betaalidentiteit bevestigd.',503);
  const checkout=payment._links?.checkout?.href;
  if(checkout&&(!/^https:\/\/(?:www\.)?mollie\.com\//.test(checkout)))throw new CmsError('payment-uncertain','De betaalretour kon niet worden gecontroleerd.',503);
  // Creation never settles an invoice; the independently fetched payment does that.
  return await sql.begin(async tx=>{
   const [saved]=await tx`update cms_mollie_payment_attempts set provider_id=${payment.id},checkout_url=${checkout||null},status='open',error_code=null,updated_at=now() where id=${row.id} and status in ('prepared','uncertain') returning *`;
   const current=saved||(await tx`select * from cms_mollie_payment_attempts where id=${row.id}`)[0];
   // Provider callbacks can race this commit. Always schedule an independent
   // fetch, including when the early callback could not find its provider ID.
   await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${randomUUID()},${'mollie-payment-verify-'+row.id},'mollie-payment-verify',${tx.json({providerId:payment.id})}) on conflict(operation_id) do nothing`;
   return safe(current);
  });
 }catch(error){
  const code=error instanceof CmsError?error.code:'payment-uncertain';
  // Even validation errors remain recoverable under the same key; a time-out is never definitive failure.
  await sql`update cms_mollie_payment_attempts set status=${code==='payment-reconciliation'?'review':'uncertain'},error_code=${code},updated_at=now() where id=${row.id} and provider_id is null`;
  throw error;
 }
}
export async function processMollieWebhook(providerId:string){
 if(!/^tr_[a-zA-Z0-9]+$/.test(providerId))throw new CmsError('payment-id','Ongeldige betaalmelding.',422);
 const sql=sqlClient(),[initial]=await sql`select id from cms_mollie_payment_attempts where provider_id=${providerId}`;
 if(!initial)return; // Never fetch arbitrary provider IDs supplied by an unauthenticated caller.
 let verificationVersion:string|undefined;
 try{
  await sql.begin(async tx=>{
   // Fetch under the same lock as settlement: an older open/paid response may
   // never overtake a newer paid/refund observation from another callback.
   await workspaceLocks(tx);
   const [current]=await tx`select *,updated_at::text as verification_version from cms_mollie_payment_attempts where id=${initial.id} for update`;
   verificationVersion=current.verification_version;
   const frozen=snapshot(current),credential=resolveMollieCredential(frozen.mode,frozen.credentialBindingId);
   const test=credential.binding.testmodeParameter&&frozen.mode==='test'?'&testmode=true':'';
   const payment=await molliePaymentRequest(credential,`/v2/payments/${providerId}?embed=refunds,chargebacks${test}`);
   const verified=verifyMolliePayment(frozen,credential,payment,providerId);
   const [invoice]=await tx`select data from cms_sponsor_records where id=${frozen.source.id} and kind=${frozen.source.kind==='donors'?'donorInvoices':'invoices'} for update`;
   let review=verified.review||current.status==='review';
   if(verified.settle&&!current.settled_at&&!review){
    if(!invoice||invoice.data.status!=='open'||invoice.data.number!==frozen.source.number||invoice.data.totalCents!==frozen.source.amountCents)review=true;
    else{
     await tx`update cms_sponsor_records set data=data||${tx.json({status:'paid',paidAt:new Date().toISOString(),paymentMethod:'mollie',...(frozen.source.kind==='donors'?{paymentReference:providerId}:{})})}::jsonb,version=version+1,updated_at=now() where id=${frozen.source.id}`;
     await tx`update cms_domain_revision set version=version+1 where id=true`;
     await tx`update cms_mollie_payment_attempts set settled_at=now() where id=${initial.id} and settled_at is null`;
     await tx`insert into cms_audit(id,actor_id,action,request_id,metadata) values (${randomUUID()},null,'mollie-payment-verified',${initial.id},${tx.json({attemptId:initial.id,providerId,sourceId:frozen.source.id,mode:frozen.mode})})`;
    }
   }
   const status=review?'review':current.settled_at?'paid':verified.status;
   await tx`update cms_mollie_payment_attempts set status=${status},error_code=${review?'financial-review-required':null},updated_at=now() where id=${initial.id}`;
  });
 }catch(error){
  // Do not overwrite a newer successful verification while this failure unwinds.
  if(verificationVersion)await sql`update cms_mollie_payment_attempts set error_code=${error instanceof CmsError?error.code:'payment-verification-unavailable'},updated_at=now() where id=${initial.id} and updated_at::text=${verificationVersion}`;
  throw error;
 }
}

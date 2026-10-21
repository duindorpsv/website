import {randomBytes} from 'node:crypto';
import {Webhook} from 'svix';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {actorPrincipal} from './permissions';
import {env} from './env';
import {CmsError} from './errors';
import {sendMail,MailProviderError} from './mail';
import {readNewsletterState,requireNewsletter} from './newsletter-workspace';
import {newsletterLock,newsletterHash,saveNewsletterResource,newsletterEmail} from './newsletter-workspace';
import {resolveRecipients} from '../cms/newsletter';
import {renderNewsletterEmail,renderNewsletterText} from '../cms/newsletter-email';
import type {NewsletterCampaign} from '../cms/newsletter-types';
const terminal=['accepted','delivered','failed','suppressed','unsubscribed','uncertain'];
async function markCampaign(tx:any,id:string){
 const [pending]=await tx`select id from cms_newsletter_deliveries where campaign_id=${id} and test=false and status in ('queued','processing','retry') limit 1`;
 if(!pending){const [row]=await tx`select * from cms_newsletter_resources where id=${id} and kind='campaign' for update`;if(row?.data.status==='queued'){const data={...row.data,status:'processed',processedAt:new Date().toISOString()};await saveNewsletterResource(tx,row.id,'campaign',data,row.version);}}
}
export async function dispatchNewsletter(payload:{campaignId:string;editionId:string;actorId:string},jobId:string,workerId:string){
 const sql=sqlClient();await sql.begin(async tx=>{
  const [row]=await tx`select * from cms_newsletter_resources where id=${payload.campaignId} and kind='campaign' for update`;
  if(!row||row.data.status!=='scheduled'||row.data.snapshot?.editionId!==payload.editionId)return;
  const [job]=await tx`select status,lease_owner from cms_jobs where id=${jobId}`;if(job?.status!=='processing'||job.lease_owner!==workerId)return;
  const actor=await actorPrincipal(payload.actorId,tx);requireNewsletter(actor);requireNewsletter(actor,'publish');
  const state=await readNewsletterState(tx),campaign=row.data as NewsletterCampaign,snapshot=campaign.snapshot!,recipients=resolveRecipients(state,snapshot.audienceIds),settings=snapshot.settings!;
  let queuedCount=0;
  for(const contact of recipients){
   if(env().APP_ENV==='production'&&(contact.source==='demo'||contact.email.endsWith('.invalid')))continue;
   const id=crypto.randomUUID(),token=randomBytes(32).toString('hex'),preferences=new URL('/nieuwsbrief/voorkeuren',settings.siteUrl),leave=new URL('/nieuwsbrief/afmelden',settings.siteUrl),oneClick=new URL('/api/newsletter/one-click',settings.siteUrl);
   for(const url of [preferences,leave,oneClick])url.searchParams.set('token',token);
   await tx`insert into cms_newsletter_tokens(hash,contact_id,purpose,expires_at) values (${newsletterHash(token)},${contact.id},'preferences',now()+interval '2 years')`;
   const subject=snapshot.subject.replace(/\{\{\s*voornaam\s*\}\}/gi,()=>contact.name.trim().split(/\s+/)[0]||'supporter');
   const html=renderNewsletterEmail({...campaign,status:'queued'},settings,{contactName:contact.name,preferencesUrl:preferences.href,unsubscribeUrl:leave.href});
   const text=renderNewsletterText({...campaign,status:'queued'},settings,{contactName:contact.name,preferencesUrl:preferences.href,unsubscribeUrl:leave.href});
   const message={to:[contact.email],subject,text,html,fromName:snapshot.fromName,fromAddress:snapshot.mailFrom,replyTo:snapshot.replyTo,headers:{'List-Unsubscribe':`<${oneClick.href}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
   const inserted=await tx`insert into cms_newsletter_deliveries(id,campaign_id,edition_id,email,contact_id,message) values (${id},${row.id},${snapshot.editionId!},${contact.email},${contact.id},${tx.json(message)}) on conflict(edition_id,email) do nothing returning id`;
   queuedCount+=inserted.length;
   if(inserted.length)await tx`insert into cms_jobs(id,operation_id,kind,payload,max_attempts) values (${crypto.randomUUID()},${'newsletter-delivery:'+id},'newsletter-delivery',${tx.json({deliveryId:id,actorId:payload.actorId})},5) on conflict(operation_id) do nothing`;
  }
  campaign.status=queuedCount?'queued':'processed';campaign.updatedAt=new Date().toISOString();await saveNewsletterResource(tx,row.id,'campaign',campaign,row.version);
 });
}
export async function deliverNewsletter(payload:{deliveryId:string;actorId:string},jobId:string,workerId:string){
 const sql=sqlClient();const [initial]=await sql`select email from cms_newsletter_deliveries where id=${payload.deliveryId}`;if(!initial)return;
 // Commit the first-attempt clock before contacting Resend: never silently replay
 // after its 24-hour idempotency window, even after a process/database crash.
 await sql`update cms_newsletter_deliveries set first_attempt_at=coalesce(first_attempt_at,now()) where id=${payload.deliveryId}`;
 let retry=false;
 await sql.begin(async tx=>{
  await newsletterLock(tx,initial.email);
  const contacts=await tx`select * from cms_newsletter where lower(btrim(email))=${newsletterEmail(initial.email)} for update`;
  const [row]=await tx`select * from cms_newsletter_deliveries where id=${payload.deliveryId} for update`;
  const [job]=await tx`select status,lease_owner,attempts,max_attempts from cms_jobs where id=${jobId}`;
  if(!row||terminal.includes(row.status)||job?.status!=='processing'||job.lease_owner!==workerId)return;
  try{const actor=await actorPrincipal(payload.actorId,tx);requireNewsletter(actor);requireNewsletter(actor,'publish');}catch{await tx`update cms_newsletter_deliveries set status='failed',error_code='permission-revoked' where id=${row.id}`;await markCampaign(tx,row.campaign_id);return;}
  const blocked=contacts.find(c=>['unsubscribed','suppressed'].includes(c.status)),active=contacts.find(c=>['active','confirmed'].includes(c.status)&&c.confirmed_at&&c.consent_at);
  if(!row.test&&(blocked||!active)){await tx`update cms_newsletter_deliveries set status=${blocked?.status==='suppressed'?'suppressed':'unsubscribed'},updated_at=now() where id=${row.id}`;await markCampaign(tx,row.campaign_id);return;}
  if(Date.now()-new Date(row.first_attempt_at).getTime()>23*3600000){await tx`update cms_newsletter_deliveries set status='uncertain',error_code='idempotency-window-expired',updated_at=now() where id=${row.id}`;await markCampaign(tx,row.campaign_id);return;}
  await tx`update cms_newsletter_deliveries set status='processing',attempts=attempts+1,updated_at=now() where id=${row.id}`;
  try{
   const [providerId]=await sendMail({...row.message,newsletterDeliveryId:row.id,messageId:`<newsletter-${row.id}@duindorp.invalid>`});
   await tx`update cms_newsletter_deliveries set status='accepted',provider_id=${providerId},error_code=null,updated_at=now() where id=${row.id}`;
  }catch(error){
   const exhausted=job.attempts>=job.max_attempts,code=error instanceof CmsError?error.code:'mail-unavailable';
   retry=!exhausted&&(error instanceof MailProviderError?error.retryable:!(error instanceof CmsError)||error.status>=500);await tx`update cms_newsletter_deliveries set status=${retry?'retry':error instanceof MailProviderError&&error.uncertain?'uncertain':'failed'},error_code=${code},updated_at=now() where id=${row.id}`;
  }
  await markCampaign(tx,row.campaign_id);
 });
 if(retry)throw new CmsError('newsletter-retry','De nieuwsbriefaflevering wacht op een nieuwe poging.',503);
}
const eventSchema=z.object({type:z.string().max(100),created_at:z.string().datetime(),data:z.object({email_id:z.string().uuid(),tags:z.record(z.string()).optional()}).passthrough()}).passthrough();
export async function newsletterWebhook(raw:string,headers:Headers){
 const sql=sqlClient(),[config]=await sql`select data from cms_newsletter_resources where id='newsletter-provider'`,secret=process.env.RESEND_WEBHOOK_SECRET||config?.data.webhookSecret;
 if(!secret)throw new CmsError('webhook-unconfigured','De webhook is nog niet geconfigureerd.',503);
 let verified:unknown;try{new Webhook(secret).verify(raw,{'svix-id':headers.get('svix-id')||'','svix-timestamp':headers.get('svix-timestamp')||'','svix-signature':headers.get('svix-signature')||''});verified=JSON.parse(raw);}catch{throw new CmsError('webhook-signature','Ongeldige webhookhandtekening.',400);}
 const event=eventSchema.parse(verified),id=z.string().min(1).max(200).parse(headers.get('svix-id'));
 const states:Record<string,string>={'email.delivered':'delivered','email.bounced':'suppressed','email.complained':'suppressed','email.failed':'failed','email.suppressed':'suppressed'};
 if(!states[event.type])return {ok:true};
 await sql.begin(async tx=>{
  const correlation=z.string().uuid().safeParse(event.data.tags?.newsletter_delivery);
  const [initial]=await tx`select id,email from cms_newsletter_deliveries where provider_id=${event.data.email_id} or id=${correlation.success?correlation.data:''}`;if(!initial)return;
  await newsletterLock(tx,initial.email);const contacts=await tx`select id from cms_newsletter where lower(btrim(email))=${newsletterEmail(initial.email)} for update`;
  const [row]=await tx`select * from cms_newsletter_deliveries where id=${initial.id} for update`;if(!row||row.provider_id&&row.provider_id!==event.data.email_id)return;
  const inserted=await tx`insert into cms_newsletter_events(id,provider_id,kind,occurred_at) values (${id},${event.data.email_id},${event.type},${event.created_at}) on conflict(id) do nothing returning id`;if(!inserted.length)return;
  const next=states[event.type],at=new Date(event.created_at).getTime(),previous=row.provider_event_at?new Date(row.provider_event_at).getTime():0;
  // A complaint/bounce is a global prohibition, even if an older delivered event arrives later.
  if(next==='suppressed')for(const contact of contacts)await tx`update cms_newsletter set status='suppressed',unsubscribed_at=coalesce(unsubscribed_at,now()),version=version+1 where id=${contact.id}`;
  if(row.status==='suppressed'||at<previous&&next!=='suppressed')return;
  await tx`update cms_newsletter_deliveries set status=${next},provider_id=${event.data.email_id},provider_event_at=${event.created_at},updated_at=now() where id=${row.id}`;
 });return {ok:true};
}

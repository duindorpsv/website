import {connectNewsletterProvider} from './newsletter-provider';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {authorize,has,type Principal} from './permissions';
import {CmsError} from './errors';
import {env} from './env';
import {createNewsletterSeed,createCampaign,resolveRecipients,validateCampaign,articleToBlock,captureCampaign,validNewsletterLink,newsletterImageUrl,validNewsletterImageUrl} from '../cms/newsletter';
import {newsletterContentSchema,newsletterAudienceSchema,newsletterContactSchema,newsletterSettingsSchema,newsletterSchema,newsletterEmailSchema} from '../cms/newsletter-schema';
import type {NewsletterState,NewsletterCampaign,NewsletterSettings,NewsletterContact} from '../cms/newsletter-types';
import {loadState} from './records';
import {renderNewsletterEmail,renderNewsletterText} from '../cms/newsletter-email';
import {createHash,randomBytes} from 'node:crypto';
export const newsletterHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const newsletterEmail=(value:string)=>value.trim().toLowerCase();
export const newsletterLock=async(tx:any,email:string)=>{await tx`select pg_advisory_xact_lock(hashtextextended(${'newsletter-address:'+newsletterEmail(email)},0))`;};
export function requireNewsletter(p:Principal,action='read'){if(p.teamScoped)throw new CmsError('forbidden','Nieuwsbrieven vereisen clubbrede nieuwsrechten.',403);authorize(p,'news',action);}
export function requireNewsletterManage(p:Principal){if(p.teamScoped)throw new CmsError('forbidden','Contactbeheer vereist clubbrede beheerrechten.',403);authorize(p,'settings','manage');}
const legacyStatus=(status:string)=>status==='active'||status==='confirmed'?'subscribed':status==='pending-confirmation'?'pending':status;
export function subscriberOutput(row:any):NewsletterContact{return {id:row.id,email:newsletterEmail(row.email),name:row.name,status:legacyStatus(row.status) as NewsletterContact['status'],tags:row.topics,consentAt:row.consent_at?new Date(row.consent_at).toISOString():row.confirmed_at?new Date(row.confirmed_at).toISOString():'',source:row.source||'signup',version:row.version};}
export async function readNewsletterState(tx:any=sqlClient()):Promise<NewsletterState>{
 const data=createNewsletterSeed();data.settings.siteUrl=env().APP_BASE_URL;
 const [club]=await tx`select live from cms_records where id='settings'`;if(club?.live?.siteCopy?.footerAddress)data.settings.footer='Duindorp SV\n'+club.live.siteCopy.footerAddress;
 const rows=await tx`select id,kind,data,version from cms_newsletter_resources where kind in ('campaign','audience','settings') and data->>'deletedAt' is null order by updated_at desc,id`;
 for(const row of rows){if(row.kind==='campaign')data.campaigns.push({...row.data,id:row.id,version:row.version});else if(row.kind==='audience')data.audiences.push({...row.data,id:row.id,version:row.version});else data.settings={...row.data,siteUrl:env().APP_BASE_URL};}
 data.contacts=(await tx`select * from cms_newsletter order by created_at desc,id`).map(subscriberOutput);
 return data;
}
export async function newsletterWorkspace(p:Principal){
 requireNewsletter(p);const sql=sqlClient(),data=await readNewsletterState(sql),manage=has(p,'settings','manage'),counts=Object.fromEntries(data.campaigns.map(c=>[c.id,resolveRecipients(data,c.snapshot?.audienceIds||c.audienceIds).length]));
 const audienceCounts=Object.fromEntries(data.audiences.map(a=>[a.id,resolveRecipients(data,[a.id]).length]));
 const stats=await sql`select campaign_id,status,count(*)::int as count from cms_newsletter_deliveries where test=false group by campaign_id,status`;
 for(const c of data.campaigns)c.stats=Object.fromEntries(stats.filter(s=>s.campaign_id===c.id).map(s=>[s.status,s.count]));
 const tests=await sql`select campaign_id,status,count(*)::int as count from cms_newsletter_deliveries where test=true group by campaign_id,status`;
 for(const c of data.campaigns)c.testStats=Object.fromEntries(tests.filter(s=>s.campaign_id===c.id).map(s=>[s.status,s.count]));
 if(data.campaigns.length){const logs=await sql`select id,record_id,action,metadata,created_at from cms_audit where record_id in ${sql(data.campaigns.map(c=>c.id))} and action in ('newsletter-test','newsletter-send','newsletter-schedule','newsletter-cancel') order by created_at desc limit 200`;data.logs=logs.map(l=>({id:l.id,campaignId:l.record_id,kind:({'newsletter-test':'test','newsletter-send':'queued','newsletter-schedule':'schedule','newsletter-cancel':'cancel'} as const)[l.action as 'newsletter-test'],at:new Date(l.created_at).toISOString(),count:l.metadata?.recipientCount||0,subject:l.metadata?.subject||''}));}
 const [settings]=await sql`select version from cms_newsletter_resources where id='newsletter-settings'`;
 const [webhook]=await sql`select id from cms_newsletter_resources where id='newsletter-provider'`;
 const contactCount=data.contacts.length,subscribedCount=resolveRecipients({...data,audiences:[{id:'count-all',name:'',description:'',color:'#FFFFFF',mode:'manual',contactIds:data.contacts.map(c=>c.id),tags:[]}]},['count-all']).length;
 if(!manage){data.contacts=[];data.audiences=data.audiences.map(a=>({...a,contactIds:[]}));}
 return {newsletter:data,counts,audienceCounts,contactCount,subscribedCount,settingsVersion:settings?.version||0,permissions:{edit:has(p,'news','create')||has(p,'news','update'),publish:has(p,'news','publish'),manage},provider:{name:'Resend',configured:!!env().RESEND_API_KEY,webhookConfigured:!!(process.env.RESEND_WEBHOOK_SECRET||webhook)}};
}
export async function saveNewsletterResource(tx:any,id:string,kind:string,data:unknown,version:number){
 const [existing]=await tx`select kind,version from cms_newsletter_resources where id=${id} for update`;
 if(existing?(existing.kind!==kind||existing.version!==version):version!==0)throw new CmsError('conflict','Deze inhoud is ondertussen gewijzigd.',409);
 const [row]=await tx`insert into cms_newsletter_resources(id,kind,data,version) values (${id},${kind},${tx.json(data)},1) on conflict(id) do update set data=excluded.data,version=cms_newsletter_resources.version+1,updated_at=now() where cms_newsletter_resources.version=${version} and cms_newsletter_resources.kind=${kind} returning version`;
 if(!row||version===0&&row.version!==1)throw new CmsError('conflict','Deze inhoud is ondertussen gewijzigd. Je werkversie blijft open; laad de serverversie opnieuw.',409);
 return row.version;
}
function assertVersion(row:any,version:number){if(!row||row.version!==version)throw new CmsError('conflict','Deze inhoud is ondertussen gewijzigd. Je werkversie blijft open; laad de serverversie opnieuw.',409);}
export function emailDocumentErrors(blocks:NewsletterCampaign['blocks']):string[]{
 const errors:string[]=[];const check=(node:any)=>{if(node.type==='image'&&(!node.attrs?.src||!validNewsletterImageUrl(node.attrs.src)))errors.push('Een afbeelding in de tekst heeft geen openbaar afbeeldingsadres.');if(node.type==='cmsWidget'||node.type==='rawHTML')errors.push('Websitewidgets horen niet in een e-mail.');for(const mark of node.marks||[])if(mark.type==='link'&&!(validNewsletterLink(mark.attrs?.href||'')||/^(mailto:|tel:)[^\s<>"\\]+$/.test(mark.attrs?.href||'')))errors.push('Een tekstlink is ongeldig.');for(const child of node.content||[])check(child);};
 for(const b of blocks){if(b.body)check(b.body);if(b.imageUrl&&!validNewsletterImageUrl(b.imageUrl))errors.push('Gebruik voor afbeeldingen een openbaar webadres, geen blob:-URL.');}return errors;
}
export function newsletterPreflight(campaign:NewsletterCampaign,data:NewsletterState,requireRecipients=true){
 const config=env();
 const errors=validateCampaign(campaign,data).filter(error=>requireRecipients||!error.includes('doelgroep')&&!error.includes('ontvanger'));
 if(!config.RESEND_API_KEY||!config.MAIL_FROM)errors.push('Stel eerst Resend en het afzenderadres in via de bestaande GitHub-configuratie.');
 if((campaign.snapshot||campaign).mailFrom&&(campaign.snapshot||campaign).mailFrom!==config.MAIL_FROM)errors.push('Het vastgelegde afzenderadres is veranderd. Maak een nieuwe editie met de huidige afzender.');
 errors.push(...emailDocumentErrors(campaign.blocks));if(renderNewsletterEmail(campaign,data.settings).length>195000)errors.push('Deze e-mail is te groot. Verkort de inhoud vóór verzending.');return {errors:[...new Set(errors)],recipientCount:resolveRecipients(data,campaign.audienceIds).length};
}
const inputSchema=z.object({operationId:z.string().uuid(),action:z.enum(['create','save','duplicate','delete','audience','contact','settings','preflight','test','schedule','send','cancel','article','webhook','connect','import']),id:z.string().min(1).max(150).optional(),expectedVersion:z.number().int().min(0).default(0),data:z.unknown().optional(),articleId:z.string().max(150).optional(),scheduledAt:z.string().datetime().optional(),testEmail:newsletterEmailSchema.optional(),unblock:z.boolean().optional()}).strict();
async function enqueue(tx:any,kind:string,payload:any,operation:string,at=new Date().toISOString()){
 await tx`insert into cms_jobs(id,operation_id,kind,payload,run_at,max_attempts) values (${crypto.randomUUID()},${operation},${kind},${tx.json(payload)},${at},5) on conflict(operation_id) do nothing`;
}
export async function mutateNewsletter(p:Principal,value:unknown){
 requireNewsletter(p);const input=inputSchema.parse(value),sql=sqlClient();
 if(['contact','audience','settings','webhook','connect','import'].includes(input.action))requireNewsletterManage(p);
 else if(['test','schedule','send','cancel'].includes(input.action))requireNewsletter(p,'publish');
 else if(!['preflight','article'].includes(input.action))requireNewsletter(p,input.action==='create'||input.action==='duplicate'?'create':'update');
 return sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtextextended(${input.operationId},0))`;
  const [prior]=await tx`select response,actor_id from cms_operations where id=${input.operationId}`;if(prior){if(prior.actor_id!==p.id)throw new CmsError('forbidden','Deze actie is niet beschikbaar.',403);return prior.response;}
  let result:any={ok:true};const at=new Date().toISOString();
  if(input.action==='contact'){
   const contact=newsletterContactSchema.parse(input.data),email=newsletterEmailSchema.parse(contact.email);await newsletterLock(tx,email);
   const oldRows=await tx`select * from cms_newsletter where id=${contact.id} or lower(btrim(email))=${email} for update`,old=oldRows.find(row=>row.id===contact.id);
   if(old)assertVersion(old,input.expectedVersion);else if(input.expectedVersion||oldRows.length)throw new CmsError('duplicate','Dit adres bestaat al. Bewerk het bestaande contact.',409);
   if(old&&newsletterEmail(old.email)!==email)throw new CmsError('email-immutable','Meld een ander adres via een nieuwe bevestigingsstroom aan.',422);
   const status=contact.status==='subscribed'?'active':contact.status==='pending'?'pending-confirmation':contact.status;
   if(old?.status==='suppressed'&&status!=='suppressed'&&!input.unblock)throw new CmsError('suppressed','Hef de blokkade eerst expliciet op.',422);
   if(old?.status==='suppressed'&&input.unblock&&status!=='pending-confirmation')throw new CmsError('suppressed','Na opheffen is eerst een nieuwe bevestiging nodig.',422);
   if(old?.status==='unsubscribed'&&status==='active')throw new CmsError('consent','Opnieuw aanmelden vereist een nieuwe bevestiging per e-mail.',422);
   if(status==='active'&&(!contact.consentAt||Date.parse(contact.consentAt)>Date.now()||contact.source==='demo'||email.endsWith('.invalid')))throw new CmsError('consent','Leg geldige toestemming vast; voorbeeldadressen worden nooit geactiveerd.',422);
   const raw=randomBytes(32).toString('hex');
   if(old)await tx`update cms_newsletter set name=${contact.name},topics=${tx.json(contact.tags)},status=${status},consent_at=${contact.consentAt||null},confirmed_at=${status==='active'?(old.confirmed_at||at):old.confirmed_at},unsubscribed_at=${['unsubscribed','suppressed'].includes(status)?at:old.unsubscribed_at},version=version+1 where id=${contact.id}`;
   else await tx`insert into cms_newsletter(id,email,name,topics,status,consent_version,consent_at,confirmed_at,source,confirmation_hash,unsubscribe_hash,expires_at) values (${contact.id},${email},${contact.name},${tx.json(contact.tags)},${status},'newsletter-admin-consent-v1',${contact.consentAt||null},${status==='active'?at:null},'manual',${newsletterHash(raw)},${newsletterHash(randomBytes(32).toString('hex'))},now())`;
  }else if(input.action==='audience'){
   const data=newsletterAudienceSchema.parse(input.data);if(data.mode==='tags'&&!data.tags.length)throw new CmsError('audience','Kies minimaal één interesse.',422);
   result.version=await saveNewsletterResource(tx,data.id,'audience',data,input.expectedVersion);
  }else if(input.action==='settings'){
   const settings=newsletterSettingsSchema.parse(input.data);if(settings.siteUrl.replace(/\/$/,'')!==env().APP_BASE_URL.replace(/\/$/,''))throw new CmsError('origin','Gebruik het geconfigureerde publieke websiteadres.',422);
   result.version=await saveNewsletterResource(tx,'newsletter-settings','settings',settings,input.expectedVersion);
  }else if(input.action==='connect'){
   await tx`select pg_advisory_xact_lock(hashtextextended('newsletter-provider-setup',0))`;
   const detail=await connectNewsletterProvider(),[row]=await tx`select version from cms_newsletter_resources where id='newsletter-provider' for update`;
   await saveNewsletterResource(tx,'newsletter-provider','provider',{webhookSecret:detail.signing_secret,webhookId:detail.id},row?.version||0);
  }else if(input.action==='webhook'){
   const {secret}=z.object({secret:z.string().regex(/^whsec_[A-Za-z0-9+/=_-]{20,500}$/)}).strict().parse(input.data);
   const [row]=await tx`select version from cms_newsletter_resources where id='newsletter-provider' for update`;
   await saveNewsletterResource(tx,'newsletter-provider','provider',{webhookSecret:secret},row?.version||0);
  }else if(input.action==='import'){
   result=await importNewsletterBackup(tx,input.data);
  }else if(input.action==='create'||input.action==='article'){
   const state=(await loadState(false,p,tx,input.articleId?[input.articleId]:[])).state,data=await readNewsletterState(tx);
   if(input.articleId){const [source]=await tx`select live from cms_records where id=${input.articleId} and module='articles' and deleted_at is null`;if(source?.live?.contentType!=='news')throw new CmsError('missing','Kies een beschikbaar gepubliceerd nieuwsbericht.',404);
    if(source.live.coverId){const [cover]=await tx`select id,live from cms_records where id=${source.live.coverId} and module='media' and live is not null and deleted_at is null`;state.media=state.media.filter(m=>m.id!==source.live.coverId);if(cover)state.media.push({...cover.live,id:cover.id,published:true});}
   }
   if(input.action==='article'){result.block=articleToBlock(state,input.articleId||'');}
   else{const campaign=createCampaign({...state,newsletter:data} as any,input.articleId);campaign.blocks=await freezeNewsletterImages(tx,campaign.blocks);await saveNewsletterResource(tx,campaign.id,'campaign',campaign,0);result.id=campaign.id;}
  }else{
   const [row]=await tx`select * from cms_newsletter_resources where id=${input.id||''} and kind='campaign' for update`;if(!row||row.data.deletedAt)throw new CmsError('missing','Nieuwsbrief niet gevonden.',404);
   const campaign={...row.data,id:row.id,version:row.version} as NewsletterCampaign;
   assertVersion(row,input.expectedVersion);
   if(input.action==='preflight')result=newsletterPreflight(campaign,await readNewsletterState(tx));
   else if(input.action==='duplicate'){
    const source=campaign.snapshot||campaign,copy:NewsletterCampaign={...newsletterContentSchema.parse({name:source.name,subject:source.subject,preheader:source.preheader,fromName:source.fromName,replyTo:source.replyTo,audienceIds:source.audienceIds,blocks:source.blocks}),id:crypto.randomUUID(),name:(source.name+' · kopie').slice(0,250),status:'draft',updatedAt:at,scheduledAt:''};copy.blocks=copy.blocks.map(b=>({...b,id:crypto.randomUUID()}));await saveNewsletterResource(tx,copy.id,'campaign',copy,0);result.id=copy.id;
   }else if(input.action==='delete'){
    if(campaign.status!=='draft')throw new CmsError('locked','Alleen een concept kan worden verwijderd.',422);campaign.deletedAt=at;delete campaign.version;await saveNewsletterResource(tx,row.id,'campaign',campaign,row.version);
   }else if(input.action==='save'){
    if(campaign.status!=='draft')throw new CmsError('locked','Maak een kopie of trek eerst de planning in.',409);const content=newsletterContentSchema.parse(input.data);content.blocks=await freezeNewsletterImages(tx,content.blocks);Object.assign(campaign,content,{updatedAt:at});delete campaign.version;result.version=await saveNewsletterResource(tx,row.id,'campaign',campaign,row.version);result.recipientCount=resolveRecipients(await readNewsletterState(tx),campaign.audienceIds).length;
   }else if(input.action==='cancel'){
    if(campaign.status!=='scheduled')throw new CmsError('locked','De worker heeft deze editie al verwerkt of de planning is niet actief.',409);
    await tx`update cms_jobs set status='cancelled',lease_owner=null,lease_until=null where kind='newsletter-dispatch' and payload->>'editionId'=${campaign.snapshot!.editionId!} and status in ('pending','processing')`;
    campaign.status='draft';campaign.scheduledAt='';delete campaign.snapshot;delete campaign.version;result.version=await saveNewsletterResource(tx,row.id,'campaign',campaign,row.version);
   }else if(['test','schedule','send'].includes(input.action)){
    const data=await readNewsletterState(tx),content=campaign.snapshot||campaign,check=newsletterPreflight(content as NewsletterCampaign,data,input.action!=='test');
    if(check.errors.length)throw new CmsError('preflight',check.errors.join(' '),422,{errors:check.errors});
    if(input.action!=='test'&&campaign.status!=='draft')throw new CmsError('locked','Deze editie is al vastgelegd. Dupliceer voor een nieuwe verzending.',409);
    const snapshot=campaign.snapshot||{...captureCampaign(campaign),settings:structuredClone(data.settings),templateVersion:'clubpost-v1',mailFrom:env().MAIL_FROM!,editionId:crypto.randomUUID()};
    if(input.action==='test'){
     if(!input.testEmail)throw new CmsError('test-address','Vul het testadres in.',422);const deliveryId=crypto.randomUUID(),editionId=crypto.randomUUID();
     const html=renderNewsletterEmail({...campaign,status:'queued',snapshot},data.settings,{contactName:'supporter',preview:true});
     await tx`insert into cms_newsletter_deliveries(id,campaign_id,edition_id,email,test,message) values (${deliveryId},${row.id},${editionId},${input.testEmail},true,${tx.json({to:[input.testEmail],subject:'[TEST] '+snapshot.subject.replace(/\{\{\s*voornaam\s*\}\}/gi,'supporter'),text:renderNewsletterText({...campaign,status:'queued',snapshot},data.settings,{contactName:'supporter'}),html,fromName:snapshot.fromName,replyTo:snapshot.replyTo,fromAddress:snapshot.mailFrom})})`;
     await enqueue(tx,'newsletter-delivery',{deliveryId,actorId:p.id},'newsletter-test:'+input.operationId);result.queued=1;
    }else{
     const when=input.action==='schedule'?input.scheduledAt:at;if(!when||input.action==='schedule'&&Date.parse(when)<=Date.now())throw new CmsError('schedule','Kies een toekomstig moment in Nederland.',422);
     campaign.snapshot=snapshot;campaign.status='scheduled';campaign.scheduledAt=when;campaign.updatedAt=at;delete campaign.version;
     result.version=await saveNewsletterResource(tx,row.id,'campaign',campaign,row.version);
     await enqueue(tx,'newsletter-dispatch',{campaignId:row.id,editionId:snapshot.editionId,actorId:p.id},'newsletter-dispatch:'+snapshot.editionId,when);result.recipientCount=check.recipientCount;
    }
   }
  }
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${p.id},${'newsletter-'+input.action},${input.id||null},${input.operationId},${tx.json({recipientCount:result.recipientCount||result.queued||0})})`;
  await tx`insert into cms_operations(id,actor_id,response) values (${input.operationId},${p.id},${tx.json(result)})`;
  return result;
 });
}

/** Import content for review; never resume a prototype schedule or grant consent by import. */
export async function importNewsletterBackup(tx:any,value:unknown){
 const data=newsletterSchema.parse(value),contacts:Record<string,string>={},audiences:Record<string,string>={},created:string[]=[];let imported=0,ignored=0;
 for(const c of data.contacts){
  const email=newsletterEmail(c.email);if(c.source==='demo'||email.endsWith('.invalid')){ignored++;continue;}await newsletterLock(tx,email);
  const existing=await tx`select id,status from cms_newsletter where lower(btrim(email))=${email} for update`;
  if(existing.length){contacts[c.id]=existing[0].id;if(['unsubscribed','suppressed'].includes(c.status))await tx`update cms_newsletter set status=case when status='suppressed' then status else ${c.status} end,unsubscribed_at=coalesce(unsubscribed_at,now()),version=version+1 where lower(btrim(email))=${email}`;continue;}
  const id=crypto.randomUUID();contacts[c.id]=id;
  await tx`insert into cms_newsletter(id,email,name,topics,status,consent_version,source,confirmation_hash,unsubscribe_hash,expires_at) values (${id},${email},${c.name},${tx.json(c.tags)},${['unsubscribed','suppressed'].includes(c.status)?c.status:'pending-confirmation'},'newsletter-import-review-v1','manual',${newsletterHash(randomBytes(32).toString('hex'))},${newsletterHash(randomBytes(32).toString('hex'))},now())`;imported++;
 }
 for(const a of data.audiences){const id=crypto.randomUUID();audiences[a.id]=id;await saveNewsletterResource(tx,id,'audience',{...a,id,contactIds:a.contactIds.flatMap(id=>contacts[id]?[contacts[id]]:[])},0);created.push(id);}
 for(const c of data.campaigns){const copy={...newsletterContentSchema.parse({name:c.name,subject:c.subject,preheader:c.preheader,fromName:c.fromName,replyTo:c.replyTo,audienceIds:c.audienceIds.flatMap(id=>audiences[id]?[audiences[id]]:[]),blocks:c.blocks}),id:crypto.randomUUID(),status:'draft',updatedAt:new Date().toISOString(),scheduledAt:''};await saveNewsletterResource(tx,copy.id,'campaign',copy,0);created.push(copy.id);}
 const [settings]=await tx`select id from cms_newsletter_resources where id='newsletter-settings'`;
 if(!settings)await saveNewsletterResource(tx,'newsletter-settings','settings',{...data.settings,siteUrl:env().APP_BASE_URL},0);
 return {importedContacts:imported,ignoredDemoContacts:ignored,created,warning:'Nieuwsbriefedities worden uitsluitend als concept geïmporteerd. Contacten worden niet door import geactiveerd. Globale blokkades blijven behouden.'};
}

/** Freeze published media URLs and remove live media lookup IDs from copied TipTap. */
async function freezeNewsletterImages(tx:any,blocks:NewsletterCampaign['blocks']){
 const result=structuredClone(blocks),ids=new Set<string>();
 const idFor=(src:string)=>/^\/api\/(?:cms\/)?media\/([^/?#]+)(?:\/file)?$/.exec(src)?.[1];
 const visit=(node:any,collect:boolean,known=new Map<string,any>())=>{if(node.type==='image'){
  const id=node.attrs?.mediaId||idFor(node.attrs?.src||'');if(id){if(collect)ids.add(id);else{node.attrs={...node.attrs,src:known.get(id)?.src||''};delete node.attrs.mediaId;}}
 }for(const child of node.content||[])visit(child,collect,known);};
 for(const b of result){if(b.body)visit(b.body,true);const id=idFor(b.imageUrl||'');if(id)ids.add(id);}
 const rows=ids.size?await tx`select id,live from cms_records where module='media' and id in ${tx([...ids])} and live is not null and deleted_at is null`:[],known=new Map<string,any>(rows.map((r:any)=>[r.id,{...r.live,src:newsletterImageUrl(r.live.src||'/api/media/'+r.id)}]));
 for(const b of result){if(b.body)visit(b.body,false,known);const id=idFor(b.imageUrl||'');if(id)b.imageUrl=known.get(id)?.src||'';}
 return result;
}

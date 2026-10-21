import {newsletterLock,newsletterEmail} from './newsletter-workspace';
import {newsletterEmailSchema,newsletterTags} from '../cms/newsletter-schema';
import {createNewsletterSeed} from '../cms/newsletter';
import {renderNewsletterEmail} from '../cms/newsletter-email';
import {textDoc} from '../cms/model';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {env} from './env';
import {CmsError} from './errors';
import {authorize,type Principal} from './permissions';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const topics=z.array(z.string().trim().min(1).max(120)).max(20).transform(v=>[...new Set(v)]);

export async function requestNewsletter(value:unknown,clientKey='server'){
 const d=z.object({operationId:z.string().uuid(),email:newsletterEmailSchema,name:z.string().trim().max(150).default(''),topics:newsletterTags,consent:z.literal(true)}).strict().parse(value);
 const token=randomBytes(32).toString('hex'),unsubscribe=randomBytes(32).toString('hex'),sql=sqlClient(),config=env();
 await sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtextextended(${'newsletter:'+d.operationId},0))`;
  const [prior]=await tx`select id from cms_jobs where operation_id=${`newsletter-confirm:${d.operationId}`}`;if(prior)return;
  await newsletterLock(tx,d.email);await newsletterPublicRate(tx,clientKey,d.email);
  const records=await tx`select * from cms_newsletter where lower(btrim(email))=${d.email} for update`;
  if(records.some(r=>r.status==='suppressed'))return;
  const old=records.find(r=>['active','confirmed'].includes(r.status))||records[0];if(old&&['active','confirmed'].includes(old.status))return;
  const id=old?.id||crypto.randomUUID();
  if(old)await tx`update cms_newsletter set name=${d.name},topics=${tx.json(d.topics)},status='pending-confirmation',confirmation_hash=${hash(token)},expires_at=now()+interval '24 hours',consent_version='newsletter-opt-in-v2',consent_at=now(),confirmed_at=null,version=version+1 where id=${id}`;
  else await tx`insert into cms_newsletter(id,email,name,topics,status,consent_version,consent_at,confirmation_hash,unsubscribe_hash,expires_at) values (${id},${d.email},${d.name},${tx.json(d.topics)},'pending-confirmation','newsletter-opt-in-v2',now(),${hash(token)},${hash(unsubscribe)},now()+interval '24 hours')`;
  await tx`insert into cms_newsletter_tokens(hash,contact_id,purpose,expires_at) values (${hash(unsubscribe)},${id},'preferences',now()+interval '2 years')`;
  const confirm=new URL('/nieuwsbrief/bevestigen',config.APP_BASE_URL);confirm.searchParams.set('token',token);
  const leave=new URL('/nieuwsbrief/afmelden',config.APP_BASE_URL);leave.searchParams.set('token',unsubscribe);
  const preferences=new URL('/nieuwsbrief/voorkeuren',config.APP_BASE_URL);preferences.searchParams.set('token',unsubscribe);
  const data=createNewsletterSeed(),campaign={id:'confirmation',name:'Bevestiging',subject:'Duindorp SV — bevestig je nieuwsbriefaanvraag',preheader:'Bevestig binnen 24 uur je inschrijving voor De clubpost.',fromName:'Duindorp SV',replyTo:'secretariaat@duindorpsv.nl',audienceIds:[],status:'draft' as const,updatedAt:new Date().toISOString(),scheduledAt:'',blocks:[{id:'intro',type:'text' as const,body:textDoc(['Beste {{voornaam}},','Bevestig je aanvraag voor De clubpost van Duindorp SV. De knop is 24 uur geldig. Zonder bevestiging ontvang je geen nieuwsbrief.'])},{id:'confirm',type:'button' as const,title:'Mijn inschrijving bevestigen',url:confirm.href}]};
  data.settings.siteUrl=config.APP_BASE_URL;
  const html=renderNewsletterEmail(campaign,data.settings,{contactName:d.name,preferencesUrl:preferences.href,unsubscribeUrl:leave.href});
  await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${`newsletter-confirm:${d.operationId}`},'mail',${tx.json({to:[d.email],subject:campaign.subject,text:`Bevestig binnen 24 uur: ${confirm.href}\nAfmelden: ${leave.href}`,html})})`;
 });
 return {status:'confirmation-requested',message:'Je aanvraag is opgeslagen. Als bevestiging nodig is, ontvang je een e-mail.'};
}
export async function newsletterPublicRate(tx:any,key:string,email:string){
 const rateKey=hash('newsletter-public:'+key+':'+email);
 const [rate]=await tx`insert into cms_rate_limits(key,count,expires_at) values (${rateKey},1,now()+interval '24 hours') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+interval '24 hours' else cms_rate_limits.expires_at end returning count`;
 if(rate.count>5)throw new CmsError('rate-limit','Probeer morgen opnieuw.',429);
}
export async function confirmNewsletter(token:string){
 if(!/^[0-9a-f]{64}$/.test(token))throw new CmsError('token','Bevestigingslink is ongeldig.',422);
 await sqlClient().begin(async tx=>{
  const [found]=await tx`select email from cms_newsletter where confirmation_hash=${hash(token)}`;if(!found)throw new CmsError('token','Deze bevestigingslink is verlopen of al gebruikt.',422);
  await newsletterLock(tx,found.email);
  const rows=await tx`select * from cms_newsletter where lower(btrim(email))=${newsletterEmail(found.email)} for update`;
  const n=rows.find(r=>r.confirmation_hash===hash(token)&&r.status==='pending-confirmation'&&new Date(r.expires_at).getTime()>Date.now());
  if(!n||rows.some(r=>r.status==='suppressed'))throw new CmsError('token','Deze bevestigingslink is verlopen of niet beschikbaar.',422);
  // A newly verified opt-in may clear a previous global opt-out, never a suppression.
  await tx`update cms_newsletter set status='active',confirmed_at=now(),consent_at=coalesce(consent_at,now()),unsubscribed_at=null,confirmation_hash=${hash(randomBytes(32).toString('hex'))},version=version+1 where lower(btrim(email))=${newsletterEmail(found.email)} and status!='suppressed'`;
 });
 return {status:'active',message:'Je nieuwsbriefinschrijving is bevestigd. Je staat op de abonneelijst van Duindorp SV.'};
}
export async function unsubscribeNewsletter(token:string){
 if(!/^[0-9a-f]{64}$/.test(token))throw new CmsError('token','Afmeldlink is ongeldig.',422);
 await sqlClient().begin(async tx=>{
  const [n]=await tx`select email from cms_newsletter where unsubscribe_hash=${hash(token)} or id in (select contact_id from cms_newsletter_tokens where hash=${hash(token)} and purpose='preferences' and expires_at>now()) limit 1`;
  if(!n)throw new CmsError('token','Afmeldlink is ongeldig.',422);
  await unsubscribeAddress(tx,n.email);
 });
 return {status:'unsubscribed',message:'Je bent afgemeld van de nieuwsbrief van Duindorp SV.'};
}
export async function unsubscribeAddress(tx:any,email:string){
 await newsletterLock(tx,email);
 await tx`update cms_newsletter set status=case when status='suppressed' then status else 'unsubscribed' end,unsubscribed_at=coalesce(unsubscribed_at,now()),version=version+1 where lower(btrim(email))=${newsletterEmail(email)}`;
 await tx`update cms_newsletter_deliveries set status='unsubscribed',updated_at=now() where email=${newsletterEmail(email)} and test=false and status in ('queued','retry')`;
}
export async function newsletterPreferences(token:string,value?:unknown){
 if(!/^[0-9a-f]{64}$/.test(token))throw new CmsError('token','Deze persoonlijke link is ongeldig.',422);
 return sqlClient().begin(async tx=>{
  const [n]=await tx`select n.* from cms_newsletter n join cms_newsletter_tokens t on t.contact_id=n.id where t.hash=${hash(token)} and t.purpose='preferences' and t.expires_at>now()`;
  if(!n)throw new CmsError('token','Deze persoonlijke link is verlopen of ongeldig.',422);
  if(value!==undefined){await newsletterLock(tx,n.email);const rows=await tx`select * from cms_newsletter where lower(btrim(email))=${newsletterEmail(n.email)} for update`;if(rows.some(r=>['suppressed','unsubscribed'].includes(r.status))||!rows.some(r=>r.status==='active'&&r.confirmed_at))throw new CmsError('consent','Dit adres is niet actief. Opnieuw aanmelden vereist bevestiging.',422);
   const data=z.object({name:z.string().trim().max(150),topics:newsletterTags}).strict().parse(value);
   await tx`update cms_newsletter set name=${data.name},topics=${tx.json(data.topics)},version=version+1 where lower(btrim(email))=${newsletterEmail(n.email)} and status='active'`;
   return {message:'Je voorkeuren zijn opgeslagen.'};
  }
  return {name:n.name,topics:n.topics,status:n.status==='active'?'subscribed':n.status};
 });
}
export async function requestNewsletterAccess(value:unknown,key:string){
 const d=z.object({email:newsletterEmailSchema,action:z.enum(['preferences','unsubscribe'])}).strict().parse(value);
 await sqlClient().begin(async tx=>{
  await newsletterLock(tx,d.email);await newsletterPublicRate(tx,key,d.email);
  if(d.action==='unsubscribe'){await unsubscribeAddress(tx,d.email);return;}
  const rows=await tx`select * from cms_newsletter where lower(btrim(email))=${d.email}`;const n=rows.find(r=>r.status==='active'&&r.confirmed_at);if(!n||rows.some(r=>['suppressed','unsubscribed'].includes(r.status)))return;
  const token=randomBytes(32).toString('hex');await tx`insert into cms_newsletter_tokens(hash,contact_id,purpose,expires_at) values (${hash(token)},${n.id},'preferences',now()+interval '1 day')`;
  const url=new URL('/nieuwsbrief/voorkeuren',env().APP_BASE_URL);url.searchParams.set('token',token);
  await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'newsletter-access:'+crypto.randomUUID()},'mail',${tx.json({to:[d.email],subject:'Duindorp SV — je nieuwsbriefvoorkeuren',text:`Pas je nieuwsbriefvoorkeuren aan via deze persoonlijke link (24 uur geldig): ${url.href}`})})`;
 });
 return {message:d.action==='unsubscribe'?'Als dit adres bij ons bekend is, is het afgemeld.':'Als dit adres actief is, ontvang je een persoonlijke link per e-mail.'};
}
// Complete old queued synchronization jobs locally; never contact a list provider.
export async function settleLegacyNewsletterJob(id:string){
 await sqlClient()`update cms_newsletter set status='active',version=version+1 where id=${id} and status='confirmed' and confirmed_at is not null`;
}
export async function listSubscribers(p:Principal,value:unknown){
 authorize(p,'settings','manage');
 const filter=z.object({q:z.string().trim().max(200).default(''),topic:z.string().trim().max(120).default(''),status:z.enum(['all','active','pending-confirmation','unsubscribed','suppressed']).default('all'),offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(value);
 const sql=sqlClient();
 // Parameterized literal matching also treats %, _ and backslashes as text.
 const where=sql`${filter.status==='all'?sql`true`:sql`status=${filter.status}`} and ${filter.q?sql`(strpos(lower(email),lower(${filter.q}))>0 or strpos(lower(name),lower(${filter.q}))>0)`:sql`true`} and ${filter.topic?sql`topics @> ${sql.json([filter.topic])}`:sql`true`}`;
 const [rows,[count]]=await Promise.all([
  sql`select id,email,name,topics,status,consent_version,confirmed_at,unsubscribed_at,created_at,version from cms_newsletter where ${where} order by created_at desc,id limit ${filter.limit} offset ${filter.offset}`,
  sql`select count(*)::int as total from cms_newsletter where ${where}`,
 ]);
 return {items:rows,total:count.total,offset:filter.offset,limit:filter.limit};
}
export async function changeSubscriber(p:Principal,id:string,value:unknown,requestId=crypto.randomUUID()){
 authorize(p,'settings','manage');
 const base={expectedVersion:z.number().int().min(1)};
 const input=z.discriminatedUnion('action',[
  z.object({...base,action:z.literal('update'),name:z.string().trim().max(120),topics}).strict(),
  z.object({...base,action:z.literal('unsubscribe')}).strict(),
 ]).parse(value);
 await sqlClient().begin(async tx=>{
  const [address]=await tx`select email from cms_newsletter where id=${id}`;if(address)await newsletterLock(tx,address.email);
  const [old]=await tx`select id,version from cms_newsletter where id=${id} for update`;
  if(!old)throw new CmsError('missing','Abonnee niet gevonden.',404);
  if(old.version!==input.expectedVersion)throw new CmsError('conflict','Deze abonnee is ondertussen gewijzigd. Laad de lijst opnieuw.',409);
  if(input.action==='update')await tx`update cms_newsletter set name=${input.name},topics=${tx.json(input.topics)},version=version+1 where id=${id}`;
  else{const [address]=await tx`select email from cms_newsletter where id=${id}`;await unsubscribeAddress(tx,address.email);}
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},${'newsletter-'+input.action},${id},${requestId})`;
 });
 return {ok:true};
}

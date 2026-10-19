import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {env} from './env';
import {CmsError} from './errors';
import {authorize,type Principal} from './permissions';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const topics=z.array(z.string().trim().min(1).max(120)).max(20).transform(v=>[...new Set(v)]);

export async function requestNewsletter(value:unknown,clientKey='server'){
 const d=z.object({operationId:z.string().uuid(),email:z.string().email().max(200),name:z.string().trim().max(120).default(''),topics,consent:z.literal(true)}).strict().parse(value);
 const token=randomBytes(32).toString('hex'),unsubscribe=randomBytes(32).toString('hex'),sql=sqlClient(),config=env();
 await sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtextextended(${'newsletter:'+d.operationId},0))`;
  const [prior]=await tx`select id from cms_jobs where operation_id=${`newsletter-confirm:${d.operationId}`}`;if(prior)return;
  const rateKey=hash('newsletter:'+clientKey+':'+d.email.toLowerCase());
  const [rate]=await tx`insert into cms_rate_limits(key,count,expires_at) values (${rateKey},1,now()+interval '24 hours') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+interval '24 hours' else cms_rate_limits.expires_at end returning count`;
  if(rate.count>5)throw new CmsError('rate-limit','Probeer morgen opnieuw.',429);
  const [record]=await tx`insert into cms_newsletter(id,email,name,topics,consent_version,confirmation_hash,unsubscribe_hash,expires_at) values (${crypto.randomUUID()},${d.email.toLowerCase()},${d.name},${tx.json(d.topics)},'newsletter-opt-in-v1',${hash(token)},${hash(unsubscribe)},now()+interval '24 hours')
   on conflict(email) do update set
    name=case when cms_newsletter.status='active' then cms_newsletter.name else excluded.name end,
    topics=case when cms_newsletter.status='active' then cms_newsletter.topics else excluded.topics end,
    confirmation_hash=case when cms_newsletter.status='active' then cms_newsletter.confirmation_hash else excluded.confirmation_hash end,
    unsubscribe_hash=case when cms_newsletter.status='active' then cms_newsletter.unsubscribe_hash else excluded.unsubscribe_hash end,
    expires_at=case when cms_newsletter.status='active' then cms_newsletter.expires_at else excluded.expires_at end,
    status=case when cms_newsletter.status='active' then 'active' else 'pending-confirmation' end,
    version=cms_newsletter.version+1 returning id,status`;
  if(record.status==='active')return;
  const confirm=new URL('/nieuwsbrief/bevestigen',config.APP_BASE_URL);confirm.searchParams.set('token',token);
  const leave=new URL('/nieuwsbrief/afmelden',config.APP_BASE_URL);leave.searchParams.set('token',unsubscribe);
  await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${`newsletter-confirm:${d.operationId}`},'mail',${tx.json({to:[d.email.toLowerCase()],subject:'Duindorp SV — bevestig je nieuwsbriefaanvraag',text:`Bevestig binnen 24 uur: ${confirm.href}\nAfmelden: ${leave.href}`})})`;
 });
 return {status:'confirmation-requested',message:'Je aanvraag is opgeslagen. Je ontvangt een e-mail om je inschrijving te bevestigen.'};
}
export async function confirmNewsletter(token:string){
 if(!/^[0-9a-f]{64}$/.test(token))throw new CmsError('token','Bevestigingslink is ongeldig.',422);
 const [n]=await sqlClient()`update cms_newsletter set status='active',confirmed_at=now(),unsubscribed_at=null,version=version+1 where confirmation_hash=${hash(token)} and expires_at>now() and status='pending-confirmation' returning id`;
 if(!n)throw new CmsError('token','Deze bevestigingslink is verlopen of al gebruikt.',422);
 return {status:'active',message:'Je nieuwsbriefinschrijving is bevestigd. Je staat op de abonneelijst van Duindorp SV.'};
}
export async function unsubscribeNewsletter(token:string){
 if(!/^[0-9a-f]{64}$/.test(token))throw new CmsError('token','Afmeldlink is ongeldig.',422);
 const [n]=await sqlClient()`update cms_newsletter set status='unsubscribed',unsubscribed_at=coalesce(unsubscribed_at,now()),version=version+1 where unsubscribe_hash=${hash(token)} returning id`;
 if(!n)throw new CmsError('token','Afmeldlink is ongeldig.',422);
 return {status:'unsubscribed',message:'Je bent afgemeld van de nieuwsbrief van Duindorp SV.'};
}
// Complete old queued synchronization jobs locally; never contact a list provider.
export async function settleLegacyNewsletterJob(id:string){
 await sqlClient()`update cms_newsletter set status='active',version=version+1 where id=${id} and status='confirmed' and confirmed_at is not null`;
}
export async function listSubscribers(p:Principal,value:unknown){
 authorize(p,'settings','manage');
 const filter=z.object({q:z.string().trim().max(200).default(''),topic:z.string().trim().max(120).default(''),status:z.enum(['all','active','pending-confirmation','unsubscribed']).default('all'),offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(value);
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
  const [old]=await tx`select id,version from cms_newsletter where id=${id} for update`;
  if(!old)throw new CmsError('missing','Abonnee niet gevonden.',404);
  if(old.version!==input.expectedVersion)throw new CmsError('conflict','Deze abonnee is ondertussen gewijzigd. Laad de lijst opnieuw.',409);
  if(input.action==='update')await tx`update cms_newsletter set name=${input.name},topics=${tx.json(input.topics)},version=version+1 where id=${id}`;
  else await tx`update cms_newsletter set status='unsubscribed',unsubscribed_at=coalesce(unsubscribed_at,now()),version=version+1 where id=${id}`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},${'newsletter-'+input.action},${id},${requestId})`;
 });
 return {ok:true};
}

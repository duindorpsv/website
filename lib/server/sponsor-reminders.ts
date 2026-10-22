import {sqlClient} from '../../db';
import {getSponsorReminders} from '../cms/sponsorship';
import type {CmsState} from '../cms/types';
import type {SponsorReminder} from '../cms/sponsorship-types';
import type {Principal} from './permissions';
import {readDomainStore,digestText} from './sponsor-store';
import {sponsorMail} from './sponsor-mail';
import {env} from './env';
const worker:Principal={id:'sponsor-scheduler',name:'Herinneringen',email:'',roleId:'system',teamScoped:false,teams:[],departments:[],grants:[{module:'sponsors',action:'*'}],mfa:false};
function threshold(reminder:SponsorReminder,state:CmsState){
 const days=Math.ceil((Date.parse(reminder.dueDate)-Date.parse(new Date().toISOString().slice(0,10)))/86400000);
 if(!Number.isFinite(days))return '';
 const values=reminder.kind==='renewal'?[90,60,30,14,7,1,0]:[...new Set([...state.sponsorship!.settings.reminderDays,0])].sort((a,b)=>b-a);
 if(days<0)return 'overdue-'+Math.floor(Math.abs(days)/7);
 const bucket=values.filter(n=>days<=n).at(-1);return bucket===undefined?'':String(bucket);
}
async function recipients(tx:any,state:CmsState,reminder:SponsorReminder){
 const agreement=state.sponsorship!.agreements.find(a=>a.id===reminder.referenceId),task=state.sponsorship!.tasks.find(t=>t.id===reminder.referenceId);
 const staff=reminder.kind==='task'||reminder.kind==='renewal'||agreement?.status==='awaiting-club-signature';
 if(staff){
  const rows=await tx`select u.id,u.email from auth_user u join cms_memberships m on m.user_id=u.id join cms_roles r on r.id=m.role_id where m.active and not coalesce(u.banned,false) and not r.team_scoped and exists(select 1 from cms_grants g where g.role_id=m.role_id and g.module in ('sponsors','*') and g.action in ('read','manage','*'))`;
  const owner=task?.ownerId||state.sponsorship!.sponsors.find(s=>s.id===reminder.sponsorId)?.ownerId;return owner&&rows.some((r:any)=>r.id===owner)?rows.filter((r:any)=>r.id===owner):rows;
 }
 const role=reminder.kind==='invoice'?'billing':'signer';
 return tx`select u.id,u.email from cms_sponsor_memberships s join cms_memberships m on m.user_id=s.user_id join auth_user u on u.id=s.user_id where s.sponsor_id=${reminder.sponsorId} and ${role}=any(s.roles) and m.active and not coalesce(u.banned,false)`;
}
export async function queueSponsorReminder(tx:any,state:CmsState,id:string,manualOperation=''){
 const reminder=getSponsorReminders(state).find(r=>r.id===id);if(!reminder)return;
 const bucket=manualOperation?'manual-'+manualOperation:threshold(reminder,state);if(!bucket)return;
 for(const account of await recipients(tx,state,reminder)){
  const deliveryId=digestText('sponsor-reminder\0'+reminder.id+'\0'+account.id+'\0'+bucket);
  const rows=await tx`insert into cms_sponsor_deliveries(id,sponsor_id,user_id,reference_id,kind) values (${deliveryId},${reminder.sponsorId},${account.id},${reminder.referenceId},${reminder.kind}) on conflict(id) do nothing returning id`;
  if(rows.length)await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'sponsor-reminder-'+deliveryId},'sponsor-notification',${tx.json({deliveryId,reminderId:reminder.id})}) on conflict(operation_id) do nothing`;
 }
}
export async function scheduleSponsorReminders(){
 const sql=sqlClient();await sql.begin(async tx=>{
  // Only one scheduler instance performs a scan at a time; jobs deduplicate forever.
  const [lock]=await tx`select pg_try_advisory_xact_lock(736498) as owned`;if(!lock.owned)return;
  const store=await readDomainStore(tx,worker);
  for(const reminder of getSponsorReminders(store.state))await queueSponsorReminder(tx,store.state,reminder.id);
 });
}
export async function deliverSponsorReminder(deliveryId:string,reminderId:string){
 const sql=sqlClient(),[delivery]=await sql`select * from cms_sponsor_deliveries where id=${deliveryId}`;
 if(!delivery||delivery.status==='accepted'||delivery.status==='cancelled')return;
 const store=await readDomainStore(sql,worker),reminder=getSponsorReminders(store.state).find(r=>r.id===reminderId);
 const allowed=reminder?await recipients(sql,store.state,reminder):[],account=allowed.find((u:any)=>u.id===delivery.user_id);
 if(!reminder||!account){await sql`update cms_sponsor_deliveries set status='cancelled' where id=${deliveryId}`;return;}
 try{await sponsorMail(account.email,'Duindorp SV · '+reminder.title,reminder.title+'\nBekijk je afspraken en de actuele status in je persoonlijke omgeving.','sponsor-reminder-'+deliveryId,{label:'Afspraken bekijken',href:env().APP_BASE_URL.replace(/\/$/,'')+(reminder.kind==='task'||reminder.kind==='renewal'||store.state.sponsorship!.agreements.find(a=>a.id===reminder.referenceId)?.status==='awaiting-club-signature'?'/beheer#sponsoring':'/sponsorportaal')});
 }catch(error){await sql`update cms_sponsor_deliveries set status='failed' where id=${deliveryId}`;throw error;}
 await sql`update cms_sponsor_deliveries set status='accepted',delivered_at=now() where id=${deliveryId}`;
}

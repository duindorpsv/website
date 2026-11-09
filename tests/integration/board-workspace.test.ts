import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {assertLocalSupabaseTests,authPost,authCookies} from '../helpers/supabase-auth';
import {capturedEmailCode} from '../helpers/email-code';
import {getAuth,deliverEmailCode} from '../../lib/server/auth';
import {sqlClient,closeDb} from '../../db';
import {GET,POST} from '../../app/api/cms/board/route';
import {GET as PDF} from '../../app/api/cms/board/pdf/route';
import {POST as PLAN} from '../../app/api/cms/board/planning/route';
import {POST as COMMUNICATE} from '../../app/api/cms/board/communications/route';
import {boardTransaction} from '../../lib/server/board-workspace';
import {CmsError} from '../../lib/server/errors';
import {makeBase,boardToday,type BoardState,type BoardRole} from '../../lib/cms/board';
import {getBoardExportSource} from '../../lib/cms/board-transitions';
assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);
const base=process.env.APP_BASE_URL!,prefix='board-it-'+randomUUID(),secret='EIGEN-PRIVENOTITIE-'+randomUUID();
const request=(cookie='',path='/api/cms/board',body?:unknown)=>new Request(new URL(path,base),{method:body===undefined?'GET':'POST',headers:{cookie,origin:new URL(base).origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
type Account={id:string;personId:string;cookie:string;roleId:string;role?:BoardRole};
async function fixture(role?:BoardRole,admin=false,linked=true):Promise<Account>{
 const id=randomUUID(),email=prefix+'-'+id+'@example.invalid',roleId=admin?'admin':prefix+'-'+id;
 if(!admin){await sql`insert into cms_roles(id,name,description,team_scoped) values (${roleId},'Fictieve bestuursrol','Geïsoleerde integratiefixture',false)`;
  if(role){await sql`insert into cms_grants(role_id,module,action) values (${roleId},'board','read'),(${roleId},'board',${role})`;if(role==='chair'||role==='secretary')for(const module of ['pages','news'])for(const action of ['read','create','update'])await sql`insert into cms_grants(role_id,module,action) values (${roleId},${module},${action})`;}
 }
 const {user}=await getAuth().api.createUser({body:{email,name:'Fictieve bestuursgebruiker',password:randomUUID()+randomUUID()}});
 await sql`insert into cms_memberships(user_id,role_id) values (${user.id},${roleId})`;
 const [canonical]=await sql`select person_id from cms_person_accounts where user_id=${user.id}`;assert.ok(canonical);
 const personId=String(canonical.person_id);
 // Account creation supplies the real canonical person. Only this newly created
 // fixture loses its link when exercising the unlinked-account boundary.
 if(!linked)await sql.begin(async tx=>{await tx`select set_config('duindorp.canonical_account_write','register',true)`;await tx`delete from cms_person_accounts where user_id=${user.id} and person_id=${personId}`;});
 const after=Date.now(),response=await authPost('email-code/request',{email});assert.equal(response.status,200);
 const challengeCookie=authCookies(response),nonce=/duindorp-login=([a-f0-9]{64})/.exec(challengeCookie)?.[1];assert.ok(nonce);
 const operation='login-'+createHash('sha256').update(nonce).digest('hex'),[job]=await sql`select id,payload from cms_jobs where operation_id=${operation}`;assert.ok(job);
 await deliverEmailCode(job.payload,`<${operation}@duindorp.invalid>`);await sql`update cms_jobs set status='done' where id=${job.id}`;
 const signed=await authPost('email-code/verify',{email,code:await capturedEmailCode(email,after)},challengeCookie);assert.equal(signed.status,200);
 return {id:user.id,personId,cookie:authCookies(signed),roleId,role};
}
async function read(account:Account){const response=await GET(request(account.cookie));assert.equal(response.status,200);return response.json();}
async function body(account:Account,recipe:(board:BoardState)=>void){const before=await read(account),board=structuredClone(before.board) as BoardState;recipe(board);return {operationId:randomUUID(),expectedVersion:before.version,board};}
async function mutate(account:Account,recipe:(board:BoardState)=>void){const input=await body(account,recipe),response=await POST(request(account.cookie,'/api/cms/board',input));const data=await response.json();assert.equal(response.status,200,JSON.stringify({code:data.code,message:data.message,details:data.details}));return data;}
async function post(handler:typeof POST,account:Account,path:string,data:object){return handler(request(account.cookie,path,data));}

test('board: real personal authority, scoped persistence, CAS and internal side objects',async t=>{
 const chair=await fixture('chair'),secretary=await fixture('secretary'),member=await fixture('member'),committee=await fixture('committee'),other=await fixture('committee'),outsider=await fixture(),admin=await fixture(undefined,true),unlinked=await fixture('member',false,false);
 const committeeId=randomUUID(),otherCommitteeId=randomUUID();
 for(const [id,person] of [[committeeId,committee.personId],[otherCommitteeId,other.personId]])await sql`insert into cms_records(id,module,title,draft) values (${id},'committees','Fictieve commissie',${sql.json({id,name:'Fictieve commissie '+id.slice(0,6),description:'',color:'#03438a',active:true,members:[{personId:person,role:'Lid'}]})})`;
 let meetingId='',pointId='',proposalId='',actionId='',decisionId='',cycleId='',itemId='',voteId='';
 await t.test('anonymous, missing role/person and wildcard administrator cannot acquire a workflow identity',async()=>{
  assert.equal((await GET(request())).status,401);assert.equal((await GET(request(outsider.cookie))).status,403);assert.equal((await GET(request(unlinked.cookie))).status,403);
  const config=await read(admin);assert.equal(config.actor,null);assert.equal(config.permissions.configure,true);assert.deepEqual(config.board.meetings,[]);assert.deepEqual(config.people,[]);
  assert.equal((await POST(request(member.cookie,'/api/cms/board',{operationId:randomUUID(),expectedVersion:0,board:{},actor:{role:'chair'}}))).status,422);
 });
 await t.test('same operation concurrently commits one server-numbered record; changed replay and stale version are rejected',async()=>{
  const input=await body(member,board=>{const row={...makeBase(board,'proposal'),title:prefix+' voorstel',kind:'decision' as const,summary:'Fictieve toelichting',request:'Exacte fictieve besluitvraag',ownerId:member.personId,committeeId:'',status:'draft' as const,versions:[]};proposalId=row.id;row.code='FORGED-1900-9999';row.createdAt='1900-01-01T00:00:00Z';board.proposals.push(row);});
  const responses=await Promise.all([POST(request(member.cookie,'/api/cms/board',input)),POST(request(member.cookie,'/api/cms/board',input))]);assert.deepEqual(responses.map(r=>r.status),[200,200]);
  const current=await read(member),saved=current.board.proposals.find((p:any)=>p.id===proposalId);assert.match(saved.code,/^VST-\d{4}-\d+$/);assert.notEqual(saved.createdAt,'1900-01-01T00:00:00Z');assert.equal(saved.createdByUserId,member.id);
  assert.equal((await sql`select operation_id from cms_board_operations where actor_id=${member.id} and operation_id=${input.operationId}::uuid`).length,1);
  const altered=structuredClone(input);altered.board.proposals.find(p=>p.id===proposalId)!.title='Andere inhoud';assert.equal((await POST(request(member.cookie,'/api/cms/board',altered))).status,409);
  assert.equal((await POST(request(member.cookie,'/api/cms/board',{...input,operationId:randomUUID()}))).status,409);
 });
 await t.test('committee response and writes retain exact person/committee scope',async()=>{
  await mutate(chair,board=>{for(const [ownerId,scope] of [[committee.personId,committeeId],[other.personId,otherCommitteeId]]){const action={...makeBase(board,'action'),title:prefix+' actie '+scope,description:'Fictief gewenst resultaat',ownerId,committeeId:scope,portfolioOwnerId:chair.personId,dueDate:boardToday(),status:'pending' as const,progress:''};board.actions.push(action);if(scope===committeeId)actionId=action.id;}});
  const scoped=await read(committee);assert.ok(scoped.board.actions.some((a:any)=>a.id===actionId));assert.ok(scoped.board.actions.every((a:any)=>a.committeeId===committeeId||a.ownerId===committee.personId));
  for(const key of ['meetings','decisions','alvs','alvItems','dossiers','portfolios','communications','handoffs'])assert.deepEqual(scoped.board[key],[]);assert.deepEqual(scoped.board.counters,{});
  assert.ok(!scoped.committees.some((c:any)=>c.id===otherCommitteeId));assert.ok(!scoped.people.some((p:any)=>p.id===other.personId));assert.ok(scoped.people.every((p:any)=>!('userId'in p)));
  const bad=await body(committee,board=>board.proposals.push({...makeBase(board,'proposal'),title:'Verboden andere commissie',kind:'info',summary:'',request:'',ownerId:committee.personId,committeeId:otherCommitteeId,status:'draft',versions:[]}));assert.equal((await POST(request(committee.cookie,'/api/cms/board',bad))).status,403);
  await mutate(committee,board=>{board.actions.find(a=>a.id===actionId)!.status='open';});
 });
 await t.test('agenda handoff requires secretary then chair; stale and unauthorized approval leave the snapshot unchanged',async()=>{
  await mutate(secretary,board=>{const point={...makeBase(board,'point'),title:'Fictief besluitpunt',kind:'decision' as const,description:'Behandeling in test',ownerId:secretary.personId,notes:'',privateNotes:{},votes:{}};pointId=point.id;const meeting={...makeBase(board,'meeting'),title:prefix+' vergadering',date:boardToday(),time:'20:00',location:'Fictieve kamer',status:'draft' as const,points:[point],attendeeIds:[chair.personId,secretary.personId,member.personId],minutesStatus:'draft' as const,minutesVersion:1,minutesSummary:'',agendaVersion:1};meetingId=meeting.id;board.meetings.push(meeting);});
  const forbidden=await body(member,board=>{board.meetings.find(m=>m.id===meetingId)!.status='review';});assert.equal((await POST(request(member.cookie,'/api/cms/board',forbidden))).status,403);
  await mutate(secretary,board=>{board.meetings.find(m=>m.id===meetingId)!.status='review';});
  const stale=await body(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.status='approved';});
  const secApprove=await body(secretary,board=>{board.meetings.find(m=>m.id===meetingId)!.status='approved';});assert.equal((await POST(request(secretary.cookie,'/api/cms/board',secApprove))).status,403);
  await mutate(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.status='draft';board.meetings.find(m=>m.id===meetingId)!.feedback='Fictieve correctie';board.meetings.find(m=>m.id===meetingId)!.agendaVersion++;});
  assert.equal((await POST(request(chair.cookie,'/api/cms/board',stale))).status,409);
  await mutate(secretary,board=>{board.meetings.find(m=>m.id===meetingId)!.status='review';});await mutate(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.status='approved';});
 });
 await t.test('private notes are writer-only, absent from shared history/audit and cannot impersonate another author',async()=>{
  await mutate(secretary,board=>{board.meetings.find(m=>m.id===meetingId)!.points[0].privateNotes[secretary.personId]=secret;});
  assert.ok(JSON.stringify(await read(secretary)).includes(secret));assert.ok(!JSON.stringify(await read(chair)).includes(secret));assert.ok(!JSON.stringify(await read(member)).includes(secret));
  const [raw]=await sql`select data::text as body from cms_board_state where id='club'`;assert.ok(!raw.body.includes(secret));assert.equal((await sql`select id from cms_board_revisions where snapshot::text like ${'%'+secret+'%'}`).length,0);assert.equal((await sql`select id from cms_audit where metadata::text like ${'%'+secret+'%'}`).length,0);
  const forged=await body(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.points[0].privateNotes[secretary.personId]='Verboden';});assert.equal((await POST(request(chair.cookie,'/api/cms/board',forged))).status,403);
  assert.notEqual((await PDF(request(member.cookie,`/api/cms/board/pdf?kind=minutes&id=${meetingId}`))).status,200);
 });
 await t.test('approved minutes and authorized PDF retain their captured text and exclude private notes',async()=>{
  await mutate(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.status='live';});
  await mutate(secretary,board=>{const point=board.meetings.find(m=>m.id===meetingId)!.points.find(p=>p.id===pointId)!;const decision={...makeBase(board,'decision'),title:'Fictief uitvoeringsbesluit',text:'Exacte openbare besluittekst',effectiveFrom:boardToday(),effectiveUntil:'',source:'bestuur' as const,meetingId,pointId,outcome:'adopted' as const};decisionId=decision.id;board.decisions.push(decision);Object.assign(point,{outcome:'decided',result:decision.text,decisionId,notes:'Openbare verslagnotitie'});});
  await mutate(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.status='closed';});await mutate(secretary,board=>{const meeting=board.meetings.find(m=>m.id===meetingId)!;meeting.minutesSummary='Vastgelegde algemene verslagtekst';meeting.minutesStatus='review';});await mutate(chair,board=>{board.meetings.find(m=>m.id===meetingId)!.minutesStatus='approved';});
  const view=await read(member),source=getBoardExportSource(view.board,view.actor,'minutes',meetingId,view.people);assert.ok(JSON.stringify(source).includes('Vastgelegde algemene verslagtekst'));assert.ok(!JSON.stringify(source).includes(secret));
  const pdf=await PDF(request(member.cookie,`/api/cms/board/pdf?kind=minutes&id=${meetingId}`));assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');assert.equal((await PDF(request(committee.cookie,`/api/cms/board/pdf?kind=minutes&id=${meetingId}`))).status,403);
  await mutate(committee,board=>{const action=board.actions.find(a=>a.id===actionId)!;action.progress='Voortgang na goedgekeurde notulen';action.status='progress';});const after=await read(member);assert.deepEqual(getBoardExportSource(after.board,after.actor,'minutes',meetingId,after.people),source);
 });
 await t.test('actual internal planning and newsletter drafts commit once and never publish or enqueue mail',async()=>{
  const initial=await read(chair),planInput={operationId:randomUUID(),expectedVersion:initial.version,decisionId,date:boardToday()};const plan=await post(PLAN,chair,'/api/cms/board/planning',planInput);assert.equal(plan.status,200);assert.equal((await post(PLAN,chair,'/api/cms/board/planning',planInput)).status,200);
  const current=await read(chair),handoff=current.board.handoffs.find((h:any)=>h.decisionId===decisionId);assert.ok(handoff);const [activity]=await sql`select status,live,draft from cms_records where id=${handoff.activityId}`;assert.equal(activity.status,'draft');assert.equal(activity.live,null);assert.equal(activity.draft.public,false);
  const commInput={operationId:randomUUID(),expectedVersion:current.version,decisionId,title:'Fictief intern bericht',audience:'Fictieve commissie',body:'Fictieve tekst, nooit verzonden.',status:'ready'};const saved=await post(COMMUNICATE,chair,'/api/cms/board/communications',commInput);assert.equal(saved.status,200);assert.equal((await post(COMMUNICATE,chair,'/api/cms/board/communications',commInput)).status,200);
  const board=(await read(chair)).board,c=board.communications.find((c:any)=>c.decisionId===decisionId);assert.ok(c.campaignId);const [campaign]=await sql`select data from cms_newsletter_resources where id=${c.campaignId}`;assert.equal(campaign.data.status,'draft');assert.deepEqual(campaign.data.audienceIds,[]);assert.equal((await sql`select id from cms_jobs where payload->>'campaignId'=${c.campaignId}`).length,0);
  const edit=await read(chair),updated=await post(COMMUNICATE,chair,'/api/cms/board/communications',{...commInput,operationId:randomUUID(),expectedVersion:edit.version,communicationId:c.id,body:'Gewijzigde fictieve tekst'});assert.equal(updated.status,200);assert.equal((await updated.json()).board.communications.find((r:any)=>r.id===c.id).status,'draft');
 });
 await t.test('a real transaction failure after side-object insertion rolls back every board side effect',async()=>{
  const before=await read(chair),temporary=randomUUID(),operationId=randomUUID();
  await assert.rejects(boardTransaction(request(chair.cookie,'/api/cms/board/communications',{}),{operationId,expectedVersion:before.version},'communication',async tx=>{await tx`insert into cms_newsletter_resources(id,kind,data) values (${temporary},'campaign','{"status":"draft"}'::jsonb)`;throw new CmsError('fixture-failure','Fictieve gecontroleerde transactiefout',503);}),/Fictieve gecontroleerde/);
  assert.equal((await sql`select id from cms_newsletter_resources where id=${temporary}`).length,0);assert.equal((await sql`select operation_id from cms_board_operations where operation_id=${operationId}::uuid`).length,0);assert.equal((await read(chair)).version,before.version);
 });
 await t.test('linked planning date acknowledgement and cached retries require current target-module rights',async()=>{
  const current=await read(chair),handoff=current.board.handoffs.find((row:any)=>row.decisionId===decisionId),date=new Date(handoff.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);const movedDate=date.toISOString().slice(0,10);
  // Only the activity created above is moved, representing a separate editor's
  // explicit planning change. Board acknowledgement must never move it back.
  await sql`update cms_records set draft=jsonb_set(draft,'{date}',${sql.json(movedDate)}::jsonb),version=version+1 where id=${handoff.activityId}`;
  const ack=await body(chair,board=>{board.handoffs.find(row=>row.id===handoff.id)!.date=movedDate;});
  await sql`delete from cms_grants where role_id=${chair.roleId} and module='pages' and action='read'`;
  assert.deepEqual((await read(chair)).planning,[]);
  assert.equal((await POST(request(chair.cookie,'/api/cms/board',ack))).status,403);
  assert.equal((await post(PLAN,chair,'/api/cms/board/planning',{operationId:randomUUID(),expectedVersion:current.version,decisionId,date:movedDate})).status,403);
  assert.equal((await read(chair)).version,current.version);
  await sql`insert into cms_grants(role_id,module,action) values (${chair.roleId},'pages','read')`;
  assert.equal((await POST(request(chair.cookie,'/api/cms/board',ack))).status,200);
  await sql`delete from cms_grants where role_id=${chair.roleId} and module='pages' and action='read'`;
  assert.equal((await POST(request(chair.cookie,'/api/cms/board',ack))).status,403);
  await sql`insert into cms_grants(role_id,module,action) values (${chair.roleId},'pages','read')`;
  await sql`delete from cms_grants where role_id=${chair.roleId} and module='news' and action='update'`;
  const latest=await read(chair);
  assert.equal((await post(COMMUNICATE,chair,'/api/cms/board/communications',{operationId:randomUUID(),expectedVersion:latest.version,decisionId,title:'Verboden na intrekking',audience:'Fictieve leden',body:'Niet opslaan',status:'draft'})).status,403);
  await sql`insert into cms_grants(role_id,module,action) values (${chair.roleId},'news','update')`;
 });
 await t.test('ALV uses two real identities; concurrent confirmation creates one immutable exact-text decision',async()=>{
  await mutate(secretary,board=>{const cycle={...makeBase(board,'alv'),title:prefix+' ALV',date:boardToday(),time:'20:00',location:'Fictieve zaal',status:'draft' as const,agendaIds:[] as string[],agendaSnapshot:[],minutes:'',votes:[],promises:[]};cycleId=cycle.id;const item={...makeBase(board,'alvItem'),title:'Fictieve ALV stemvraag',description:'Voorbereid fictief punt',ownerId:secretary.personId,kind:'decision' as const,status:'ready' as const,alvId:cycle.id,stance:'Fictief bestuursstandpunt',document:'Gecontroleerd fictief stuk',question:'Exacte definitieve ALV-tekst',checklist:{stance:true,document:true,question:true},documentReleased:true,notes:''};itemId=item.id;cycle.agendaIds=[itemId];board.alvs.push(cycle);board.alvItems.push(item);});
  await mutate(chair,board=>{board.alvs.find(a=>a.id===cycleId)!.status='approved';board.alvItems.find(i=>i.id===itemId)!.status='scheduled';});await mutate(chair,board=>{board.alvs.find(a=>a.id===cycleId)!.status='live';});
  await mutate(secretary,board=>{const vote={...makeBase(board,'vote'),itemId,text:'Exacte definitieve ALV-tekst',kind:'motion' as const,counts:{voor:20,tegen:4,onthouding:1,ongeldig:0},countedBy:secretary.personId,outcome:'adopted' as const};voteId=vote.id;board.alvs.find(a=>a.id===cycleId)!.votes.push(vote);});
  const confirm=async(account:Account)=>body(account,board=>{const vote=board.alvs.find(a=>a.id===cycleId)!.votes.find(v=>v.id===voteId)!,decision={...makeBase(board,'decision'),title:'Fictief ALV-besluit',text:vote.text,effectiveFrom:boardToday(),effectiveUntil:'',source:'alv' as const,alvItemId:itemId,outcome:vote.outcome};board.decisions.push(decision);Object.assign(vote,{confirmedBy:account.personId,confirmedAt:new Date().toISOString(),decisionId:decision.id});});
  assert.equal((await POST(request(secretary.cookie,'/api/cms/board',await confirm(secretary)))).status,403);
  const input=await confirm(chair),duplicate={...structuredClone(input),operationId:randomUUID()},responses=await Promise.all([POST(request(chair.cookie,'/api/cms/board',input)),POST(request(chair.cookie,'/api/cms/board',duplicate))]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const current=await read(chair),cycle=current.board.alvs.find((a:any)=>a.id===cycleId),vote=cycle.votes.find((v:any)=>v.id===voteId);assert.equal(vote.countedByUserId,secretary.id);assert.equal(vote.confirmedByUserId,chair.id);assert.equal(current.board.decisions.filter((d:any)=>d.alvItemId===itemId).length,1);assert.equal(current.board.decisions.find((d:any)=>d.id===vote.decisionId).text,vote.text);
  await mutate(chair,board=>{board.alvs.find(a=>a.id===cycleId)!.status='closed';});assert.equal((await PDF(request(member.cookie,`/api/cms/board/pdf?kind=alv-minutes&id=${cycleId}`))).status,200);
 });
 await t.test('current grants, account state and committee changes revoke old tabs, cached replays and exports',async()=>{
  const cached=await body(member,board=>{board.proposals.find(p=>p.id===proposalId)!.title='Laatste eigen concept';});assert.equal((await POST(request(member.cookie,'/api/cms/board',cached))).status,200);
  await sql`delete from cms_grants where role_id=${member.roleId} and module='board'`;assert.equal((await GET(request(member.cookie))).status,403);assert.equal((await POST(request(member.cookie,'/api/cms/board',cached))).status,403);assert.equal((await PDF(request(member.cookie,`/api/cms/board/pdf?kind=minutes&id=${meetingId}`))).status,403);
  await sql`update cms_memberships set active=false where user_id=${other.id}`;assert.equal((await GET(request(other.cookie))).status,403);
  await sql`update cms_records set draft=jsonb_set(draft,'{members}','[]'::jsonb),version=version+1 where id=${committeeId}`;const fresh=await read(committee);assert.deepEqual(fresh.actor.committeeIds,[]);assert.ok(fresh.committees.every((c:any)=>c.id!==committeeId));
 });
});

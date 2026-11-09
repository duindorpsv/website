import {boardSchema} from './board-schema';
import {boardCanonical,boardSnapshotHash} from './board-integrity';
import {boardCodePrefixes,boardToday,createEmptyBoard,formatBoardDate,type BoardActor,type BoardPerson,type BoardState,type BoardBase,type Meeting,type MeetingPoint,type Proposal,type Decision,type AlvItem,type Alv,type BoardAgendaSnapshot,type BoardMinutesSnapshot,type BoardAlvMinutesSnapshot} from './board';

export type BoardValidationContext={now:string;people:BoardPerson[];committees:{id:string;name:string;active?:boolean}[];planning?:{id:string;date?:string;status?:string;public?:boolean}[];campaigns?:{id:string;status?:string}[];integration?:'planning'|'communication'};
export type BoardPrivateNoteChange={meetingId:string;pointId:string;personId:string;userId:string;text:string};
export type BoardChangeAudit={collection:string;recordId:string;operation:'create'|'update'|'delete';actorId:string;userId:string;at:string;fromStatus?:string;toStatus?:string;hash?:string};
export type BoardTransitionResult={board:BoardState;changes:BoardChangeAudit[];privateNotes:BoardPrivateNoteChange[]};
export class BoardTransitionError extends Error {constructor(message:string,public code:'forbidden'|'validation'|'conflict'='validation'){super(message);this.name='BoardTransitionError';} get status(){return this.code==='forbidden'?403:this.code==='conflict'?409:422;}}
function ensure(test:unknown,message:string):asserts test{if(!test)throw new BoardTransitionError(message);}
function access(test:unknown,message:string):asserts test{if(!test)throw new BoardTransitionError(message,'forbidden');}
const clone=<T,>(v:T):T=>structuredClone(v);
const equal=(a:unknown,b:unknown)=>boardCanonical(a)===boardCanonical(b);
const manager=(a:BoardActor)=>a.role==='chair'||a.role==='secretary';
const collections=['meetings','proposals','decisions','actions','alvs','alvItems','communications','handoffs','portfolios','dossiers'] as const;
type Collection=typeof collections[number];
const without=(value:any,keys:string[])=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
function only(before:any,after:any,keys:string[],message:string){ensure(equal(without(before,keys),without(after,keys)),message);}
function unique(values:string[],message:string){ensure(new Set(values).size===values.length,message);}
function canReadProposal(p:Proposal,a:BoardActor){return p.ownerId===a.id||(a.role!=='committee'&&(['ready','scheduled','handled'].includes(p.status)||a.role==='chair'&&['submitted','changes'].includes(p.status)));}
function minutesReadable(m:Meeting,a:BoardActor){return m.minutesStatus==='approved'||a.role==='secretary'||m.minutesStatus==='review'&&a.role==='chair';}
export function projectBoardState(board:BoardState,actor:BoardActor):BoardState {
 const visible=clone(board);visible.proposals=visible.proposals.filter(p=>canReadProposal(p,actor));
 if(actor.role==='committee'){
  const result=createEmptyBoard();result.proposals=visible.proposals;result.actions=visible.actions.filter(a=>a.ownerId===actor.id||!!a.committeeId&&actor.committeeIds.includes(a.committeeId));return result;
 }
 for(const m of visible.meetings){for(const p of m.points)p.privateNotes=Object.hasOwn(p.privateNotes,actor.id)?{[actor.id]:p.privateNotes[actor.id]}:{};
  if(m.status==='closed'&&!minutesReadable(m,actor)){m.minutesSummary='';delete m.minutesSnapshot;delete m.minutesHash;delete m.minutesHistory;for(const p of m.points)p.notes='';}}
 return visible;
}
/** Merge a visible edit into the full canonical state, retaining every hidden field. */
function mergeVisible(full:any,visible:any,next:any):any {
 if(equal(visible,next))return clone(full);
 if(Array.isArray(next)&&Array.isArray(visible)&&Array.isArray(full)){
  if(next.every(x=>x&&typeof x==='object'&&typeof x.id==='string')&&visible.every(x=>x&&typeof x==='object'&&typeof x.id==='string'))return [...full.filter(f=>!visible.some(v=>v.id===f.id)).map(clone),...next.map(n=>{access(!full.some(f=>f.id===n.id)||visible.some(v=>v.id===n.id),'Dit geneste record valt buiten jouw bereik.');const v=visible.find(x=>x.id===n.id),f=full.find(x=>x.id===n.id);return v&&f?mergeVisible(f,v,n):clone(n);})];
  return clone(next);
 }
 if(next&&visible&&full&&typeof next==='object'&&typeof visible==='object'&&typeof full==='object'){
  const result={...full};for(const key of new Set([...Object.keys(visible),...Object.keys(next)])){
   if(equal(visible[key],next[key]))continue;
   if(!Object.hasOwn(next,key))delete result[key];else result[key]=mergeVisible(full[key],visible[key],next[key]);
  }return result;
 }return clone(next);
}
function allBases(board:BoardState):BoardBase[]{return [...collections.flatMap(k=>board[k] as BoardBase[]),...board.meetings.flatMap(m=>m.points),...board.alvs.flatMap(a=>a.votes)];}
function checkBase(old:BoardBase,next:BoardBase){for(const key of ['id','code','createdAt','createdBy','createdByUserId'] as const)ensure(old[key]===next[key],'De identiteit en oorspronkelijke metadata mogen niet veranderen.');}
function agendaSnapshot(m:Meeting):BoardAgendaSnapshot{return {title:m.title,date:m.date,time:m.time,location:m.location,version:m.agendaVersion,points:m.points.map(p=>({id:p.id,code:p.code,title:p.title,kind:p.kind,description:p.description,ownerId:p.ownerId,...(p.proposalId?{proposalId:p.proposalId}:{}),...(p.carriedFrom?{carriedFrom:p.carriedFrom}:{}),...(p.portfolioId?{portfolioId:p.portfolioId}:{}),...(p.committeeId?{committeeId:p.committeeId}:{})}))};}
const voteSummary=(v:MeetingPoint['votes'])=>Object.keys(v).length?(['voor','tegen','onthouding','afwezig'] as const).map(k=>`${k}: ${Object.values(v).filter(x=>x===k).length}`).join(' · '):'';
const outcomeLabels={decided:'Besloten',work:'Uitwerken',deferred:'Doorschuiven',alv:'Naar de ALV',noted:'Kennisgenomen'};
export function buildBoardMinutesSnapshot(board:BoardState,m:Meeting,people:BoardPerson[]):BoardMinutesSnapshot{
 const person=(id:string)=>people.find(p=>p.id===id)?.name||'Actiehouder';
 return {title:m.title,date:m.date,time:m.time,location:m.location,code:m.minutesCode||m.code,version:m.minutesVersion,summary:m.minutesSummary,attendance:m.attendeeIds.map(person).join(', '),sections:(['info','discussion','decision','risk'] as const).flatMap(kind=>m.points.filter(p=>p.kind===kind)).map(p=>{
  const d=board.decisions.find(d=>d.id===p.decisionId),a=board.actions.find(a=>a.id===p.actionId),item=board.alvItems.find(i=>i.id===p.alvItemId),v=voteSummary(p.votes);
  return {heading:`${p.code} · ${p.title}`,text:[p.notes,p.outcome&&`Uitkomst · ${outcomeLabels[p.outcome]}`,p.result,d&&`${d.code} · ${d.outcome==='adopted'?'Aangenomen':'Afgewezen'}`,v&&`Stemregistratie · ${v}`,a&&`${a.code} · ${a.title} · ${person(a.ownerId)} · ${formatBoardDate(a.dueDate)}`,item&&`${item.code} · Voorbereiding voor de ALV`].filter(Boolean).join('\n')||'Geen aantekeningen.'};})};
}
function snapshotAlvItem(i:AlvItem){return {id:i.id,title:i.title,kind:i.kind,stance:i.stance,document:i.document,...(i.documentReleased!==undefined?{documentReleased:i.documentReleased}:{}),question:i.kind==='decision'?i.question:''};}
function readyAlvItem(i:AlvItem){return !!i.title.trim()&&!!i.ownerId&&!!i.stance.trim()&&!!i.document.trim()&&i.checklist.stance&&i.checklist.document&&(i.kind!=='decision'||!!i.question.trim()&&i.checklist.question);}
export function boardDecisionStatus(decision:Decision,decisions:Decision[],today=boardToday()):'current'|'upcoming'|'archive'{
 if(decision.outcome==='rejected')return 'archive';const starts=decision.effectiveFrom||decision.createdAt.slice(0,10);if(starts>today)return 'upcoming';
 if(decision.effectiveUntil&&decision.effectiveUntil<today||decisions.some(d=>d.outcome==='adopted'&&d.replacesId===decision.id&&(d.effectiveFrom||d.createdAt.slice(0,10))<=today))return 'archive';return 'current';
}
function validateLinks(board:BoardState,context:BoardValidationContext,previous:BoardState){
 const person=(id:string,historical=false)=>!id||historical||context.people.some(p=>p.id===id&&p.active!==false),committee=(id:string,historical=false)=>!id||historical||context.committees.some(c=>c.id===id&&c.active!==false),get=(kind:Collection,id?:string)=>!id||board[kind].some(r=>r.id===id);
 const points=board.meetings.flatMap(m=>m.points.map(p=>({m,p})));unique(allBases(board).map(r=>r.id),'Een technische bestuurs-ID is dubbel gebruikt.');unique(allBases(board).map(r=>r.code),'Een bestuurscode is dubbel gebruikt.');
 for(const k of collections)for(const row of board[k] as any[]){const old=(previous[k] as any[]).find(v=>v.id===row.id);if('title'in row)ensure(row.title.trim(),'Een titel is verplicht.');if('ownerId'in row)ensure(row.ownerId&&person(row.ownerId,!!old&&old.ownerId===row.ownerId),'De verantwoordelijke persoon bestaat niet.');if('committeeId'in row)ensure(committee(row.committeeId,!!old&&old.committeeId===row.committeeId),'De commissie bestaat niet.');if('dossierId'in row)ensure(get('dossiers',row.dossierId),'Het dossier bestaat niet.');}
 for(const m of board.meetings){const oldMeeting=previous.meetings.find(v=>v.id===m.id);unique(m.attendeeIds,'Een persoon staat dubbel bij aanwezigheid.');ensure(m.attendeeIds.every(id=>oldMeeting?.attendeeIds.includes(id)||person(id)&&context.people.find(p=>p.id===id)?.role!=='committee'),'Kies aanwezige bestuursleden uit het personenregister.');
  for(const key of ['proposalId','portfolioId','carriedFrom'] as const){const refs=m.points.map(p=>p[key]).filter(Boolean) as string[];unique(refs,'Deze bron staat al op de agenda.');}
  for(const p of m.points){const oldPoint=oldMeeting?.points.find(v=>v.id===p.id);ensure(p.ownerId&&person(p.ownerId,!!oldPoint&&oldPoint.ownerId===p.ownerId)&&committee(p.committeeId||'',!!oldPoint&&oldPoint.committeeId===p.committeeId),'Ongeldige eigenaar of commissie.');ensure(get('proposals',p.proposalId)&&get('portfolios',p.portfolioId),'Een agendabron ontbreekt.');
   if(p.carriedFrom){const origin=points.find(x=>x.p.id===p.carriedFrom);ensure(origin&&origin.m.status==='closed'&&origin.p.outcome==='deferred'&&origin.m.date<=m.date&&(!origin.p.dueDate||origin.p.dueDate<=m.date),'Dit terugkompunt past niet bij deze vergadering.');}
   ensure(get('decisions',p.decisionId)&&get('actions',p.actionId)&&get('alvItems',p.alvItemId),'Een gekoppeld resultaat ontbreekt.');
   if(p.outcome){ensure(p.result?.trim(),'Leg de exacte uitkomst vast.');ensure((p.outcome==='decided'||!p.decisionId)&&(p.outcome==='decided'||p.outcome==='work'||p.outcome==='deferred'||!p.actionId)&&(p.outcome==='alv'||!p.alvItemId),'De resultaatkoppelingen passen niet bij de gekozen uitkomst.');if(p.outcome==='noted')ensure(p.kind==='info','Kennisname hoort bij een informatief punt.');
    if(p.outcome==='decided'){const d=board.decisions.find(d=>d.id===p.decisionId);ensure(d&&d.meetingId===m.id&&d.pointId===p.id&&d.text===p.result,'De besluittekst en puntkoppeling moeten exact overeenkomen.');}
    if(p.outcome==='work'||p.outcome==='deferred')ensure(p.actionId&&p.ownerId&&p.dueDate,'Een vervolg vraagt een verantwoordelijke en termijn.');
    if(p.actionId){const action=board.actions.find(a=>a.id===p.actionId);ensure(action&&action.meetingId===m.id&&action.pointId===p.id&&action.decisionId===p.decisionId&&(oldPoint?.outcome&&oldPoint.actionId===p.actionId||action.description===p.result&&action.ownerId===p.ownerId&&action.dueDate===p.dueDate),'De vervolgactie moet bij de exacte puntuitkomst, eigenaar en termijn horen.');}
    if(p.outcome==='deferred')ensure(p.dueDate!>m.date,'De terugkomdatum moet na de vergadering liggen.');
    if(p.outcome==='alv'){const i=board.alvItems.find(i=>i.id===p.alvItemId);ensure(i&&i.meetingId===m.id&&i.pointId===p.id&&(oldPoint?.outcome&&oldPoint.alvItemId===p.alvItemId||i.description===p.result&&i.ownerId===p.ownerId),'Het ALV-vervolg hoort bij dit punt.');}
   }
   if(Object.keys(p.votes).length){ensure(p.outcome==='decided'&&p.voteText===p.result,'Stemmen horen bij de exacte vastgelegde besluittekst.');ensure(equal(Object.keys(p.votes).sort(),[...m.attendeeIds].sort()),'Registreer precies één keuze per aanwezige.');}
  }}
 unique(points.filter(x=>x.p.proposalId&&!x.p.carriedFrom).map(x=>x.p.proposalId!),'Dit voorstel staat al rechtstreeks op een agenda.');
 unique(points.map(x=>x.p.carriedFrom).filter(Boolean) as string[],'Een terugkompunt is al doorgezet.');
 for(const d of board.decisions){ensure(!d.effectiveUntil||!!d.effectiveFrom&&d.effectiveUntil>=d.effectiveFrom,'De einddatum ligt vóór de begindatum.');ensure(get('meetings',d.meetingId)&&get('proposals',d.proposalId)&&get('alvItems',d.alvItemId),'Een besluitbron ontbreekt.');
  if(d.replacesId){const prior=board.decisions.find(x=>x.id===d.replacesId);ensure(prior&&prior.id!==d.id&&prior.outcome==='adopted'&&d.outcome==='adopted','Alleen aangenomen besluiten kunnen een ander besluit vervangen.');ensure((prior.effectiveFrom||prior.createdAt.slice(0,10))<=(d.effectiveFrom||d.createdAt.slice(0,10)),'Een vervanger kan niet vóór zijn voorganger ingaan.');const seen=new Set([d.id]);let next:Decision|undefined=prior;while(next){ensure(!seen.has(next.id),'Een circulaire vervanging is niet toegestaan.');seen.add(next.id);next=board.decisions.find(x=>x.id===next?.replacesId);}}
 }
 unique(board.decisions.filter(d=>d.outcome==='adopted'&&d.replacesId).map(d=>d.replacesId!),'Een besluit heeft al een opvolger.');
 for(const a of board.actions){const old=previous.actions.find(v=>v.id===a.id);ensure(person(a.portfolioOwnerId,!!old&&old.portfolioOwnerId===a.portfolioOwnerId)&&get('decisions',a.decisionId)&&get('meetings',a.meetingId)&&get('proposals',a.proposalId),'Een actiehouder, portefeuillehouder of bron ontbreekt.');ensure(a.ownerId&&a.portfolioOwnerId&&a.dueDate&&a.description.trim(),'Een actie vraagt eigenaar, portefeuillehouder, omschrijving en deadline.');if(a.pointId)ensure(points.some(x=>x.p.id===a.pointId&&x.m.id===a.meetingId),'De actie hoort niet bij dit vergaderpunt.');if(a.status==='done')ensure(a.progress.trim(),'Vul het afgeronde resultaat in.');if(a.status==='blocked')ensure(a.helpRequest?.trim(),'Omschrijf de hulpvraag.');}
 for(const i of board.alvItems){ensure(get('alvs',i.alvId)&&get('meetings',i.meetingId),'Een ALV-bron ontbreekt.');if(['ready','scheduled','handled'].includes(i.status))ensure(readyAlvItem(i),'Controleer eerst eigenaar, stukken en stemtekst.');if(i.documentReleased)ensure(i.checklist.document&&i.document.trim(),'Alleen gecontroleerde stukken kunnen worden vrijgegeven.');}
 for(const alv of board.alvs){unique(alv.agendaIds,'Een ALV-punt staat dubbel op de agenda.');ensure(alv.agendaIds.every(id=>board.alvItems.some(i=>i.id===id&&i.alvId===alv.id)),'Een agendapunt hoort bij een andere ALV.');
  for(const v of alv.votes){ensure(alv.agendaSnapshot.some(i=>i.id===v.itemId&&i.kind==='decision'),'Een telling hoort bij een vastgesteld beslispunt.');ensure(v.text.trim()&&Number.isSafeInteger(Object.values(v.counts).reduce((a,b)=>a+b,0))&&Object.values(v.counts).reduce((a,b)=>a+b,0)>0,'Een telling vraagt exacte tekst en ten minste één stem.');ensure(person(v.countedBy,previous.alvs.some(old=>old.votes.some(prior=>prior.id===v.id&&prior.countedBy===v.countedBy))),'De invoerder ontbreekt.');if(v.confirmedAt){ensure(v.confirmedBy&&v.confirmedBy!==v.countedBy&&v.countedByUserId&&v.confirmedByUserId&&v.confirmedByUserId!==v.countedByUserId,'De telling vraagt een tweede, andere bevoegde identiteit.');if(v.kind==='motion'){const d=board.decisions.find(d=>d.id===v.decisionId);ensure(d&&d.source==='alv'&&d.alvItemId===v.itemId&&d.text===v.text&&d.outcome===v.outcome,'De ALV-besluittekst en uitslag moeten exact overeenkomen.');}else ensure(!v.decisionId,'Een amendement maakt nog geen definitief besluit.');}}
  for(const id of alv.agendaIds){const votes=alv.votes.filter(v=>v.itemId===id);ensure(votes.filter(v=>!v.confirmedAt).length<=1,'Er staat al een telling open.');ensure(votes.filter(v=>v.kind==='motion').length<=1,'Er is al een definitieve voorstelstemming.');const final=votes.find(v=>v.kind==='motion');if(final)ensure(!votes.some(v=>v.kind==='amendment'&&v.createdAt>final.createdAt),'Na de definitieve stemming kan geen amendement volgen.');}
 }
 unique(board.handoffs.map(h=>h.decisionId),'Er bestaat al een jaaragendakoppeling voor dit besluit.');unique(board.handoffs.map(h=>h.activityId),'Dit jaaragenda-item is al gekoppeld.');
 for(const h of board.handoffs)ensure(board.decisions.some(d=>d.id===h.decisionId&&d.outcome==='adopted'),'Alleen aangenomen besluiten kunnen naar uitvoering.');
 for(const c of board.communications)ensure(board.decisions.some(d=>d.id===c.decisionId&&d.outcome==='adopted'),'Een bericht hoort bij een aangenomen besluit.');
 ensure(board.meetings.filter(m=>m.status==='live').length<=1&&board.alvs.filter(a=>a.status==='live').length<=1,'Er loopt al een vergadering van dit type.');
}

function validateProposal(old:Proposal|undefined,row:Proposal|undefined,a:BoardActor,board:BoardState,context:BoardValidationContext){
 if(!old){ensure(row,'Voorstel ontbreekt.');access(row.ownerId===a.id,'Maak alleen een eigen concept.');ensure(row.status==='draft'&&!row.versions.length&&!row.reviewReason,'Een nieuw voorstel begint als eigen concept.');if(a.role==='committee'){access(!row.committeeId||a.committeeIds.includes(row.committeeId),'Deze commissie valt buiten jouw bereik.');access(!row.dossierId,'Een afgeschermd dossier kan niet worden gekoppeld.');}return;}
 if(!row){access(old.ownerId===a.id&&['draft','changes'].includes(old.status),'Alleen een eigen bewerkbaar concept kan worden verwijderd.');return;}
 checkBase(old,row);ensure(equal(row.versions.slice(0,old.versions.length),old.versions),'Eerdere ingediende voorstelversies zijn onveranderlijk.');
 const editable=['title','kind','summary','request','committeeId','dossierId','attachment'];
 if(['draft','changes'].includes(old.status)){
  access(old.ownerId===a.id,'Alleen de indiener kan dit concept bewerken.');
  if(row.status===old.status){only(old,row,editable,'Dit voorstel kan alleen inhoudelijk worden aangepast.');}
  else {ensure(row.status==='submitted','Ongeldige voorstelovergang.');only(old,row,[...editable,'status','versions','reviewReason'],'Ongeldige voorstelwijziging.');ensure(row.summary.trim()&&(row.kind!=='decision'||row.request.trim()),'Een ingediend besluitvoorstel vraagt toelichting en exacte besluitvraag.');ensure(row.versions.length===old.versions.length+1,'Dien precies één nieuwe tekstversie in.');
   const snapshot={title:row.title,kind:row.kind,summary:row.summary,request:row.request,committeeId:row.committeeId,...(row.dossierId?{dossierId:row.dossierId}:{}),...(row.attachment?{attachment:row.attachment}:{})};row.versions=[...old.versions,{number:old.versions.length+1,at:context.now,summary:row.summary,request:row.request,personId:a.id,userId:a.userId,snapshot,hash:boardSnapshotHash(snapshot)}];delete row.reviewReason;
  }
  if(a.role==='committee'){access(!row.committeeId||a.committeeIds.includes(row.committeeId),'Deze commissie valt buiten jouw bereik.');access(row.dossierId===old.dossierId,'Een afgeschermd dossier kan niet worden gekoppeld.');}return;
 }
 if(old.status==='submitted'){access(a.role==='chair','Alleen de voorzitter beoordeelt een voorstel.');ensure(row.status==='ready'||row.status==='changes','Kies vrijgeven of aanvulling vragen.');only(old,row,['status','reviewReason'],'De ingediende tekstversie mag niet worden aangepast.');if(row.status==='changes')ensure(row.reviewReason?.trim(),'Omschrijf de gevraagde aanvulling.');return;}
 access(manager(a),'Alleen de voorzitter of secretaris kan agendering verwerken.');only(old,row,['status'],'Vrijgegeven voorstelinhoud is onveranderlijk.');
 ensure(old.status==='ready'&&row.status==='scheduled'||old.status==='scheduled'&&['ready','handled'].includes(row.status),'Ongeldige agenderingsstatus.');
 const scheduled=board.meetings.some(m=>m.points.some(p=>p.proposalId===row.id));if(row.status==='scheduled')ensure(scheduled,'Een agendakoppeling ontbreekt.');if(row.status==='ready')ensure(!scheduled,'Het voorstel staat nog op een agenda.');if(row.status==='handled')ensure(board.meetings.some(m=>m.points.some(p=>p.proposalId===row.id&&p.outcome&&p.outcome!=='deferred')),'Een behandeling ontbreekt.');
}
function validatePoint(old:MeetingPoint|undefined,row:MeetingPoint|undefined,before:Meeting|undefined,m:Meeting,a:BoardActor,full:BoardState){
 if(!old){access(manager(a)&&m.status==='draft','Alleen bij een conceptagenda kunnen punten worden toegevoegd.');ensure(row&&!row.outcome&&!row.decisionId&&!row.actionId&&!row.alvItemId&&!row.notes&&!Object.keys(row.votes).length,'Een nieuw punt heeft nog geen uitkomst.');if(row.proposalId){const source=full.proposals.find(p=>p.id===row.proposalId);ensure(source&&['ready','scheduled'].includes(source.status),'Agendeer alleen een vrijgegeven voorstel.');}return;}
 if(!row){access(manager(a)&&before?.status==='draft'&&m.status==='draft','Alleen een conceptagendapunt kan worden verwijderd.');return;}
 checkBase(old,row);
 if(before?.status==='draft'&&m.status==='draft'){
  if(manager(a)){only(old,row,['title','kind','description','ownerId','committeeId','reviewReason'],'De bronverwijzingen en resultaten mogen niet veranderen.');if(old.reviewReason&&row.reviewReason!==old.reviewReason)ensure(!row.reviewReason,'Verwerk het bespreekverzoek bewust.');}
  else {access(a.role==='member'&&old.kind==='info','Je kunt alleen bij een informatief conceptpunt bespreking vragen.');only(old,row,['reviewReason'],'Alleen het bespreekverzoek kan worden aangepast.');ensure(row.reviewReason?.trim(),'Motiveer het bespreekverzoek.');}return;
 }
 if(before?.status==='live'&&m.status==='live'){
  access(manager(a),'Alleen voorzitter en secretaris leggen de vergadering vast.');if(old.outcome){only(old,row,['notes'],'Een vastgelegde uitkomst is onveranderlijk.');return;}
  only(old,row,['notes','outcome','result','dueDate','ownerId','committeeId','decisionId','actionId','alvItemId','votes','voteText'],'Ongeldige behandeling van het agendapunt.');
  if(row.outcome==='decided')ensure(full.decisions.some(d=>d.id===row.decisionId),'Een besluitregistratie ontbreekt.');return;
 }
 ensure(equal(old,row),'Deze agenda of vastgelegde behandeling is niet meer bewerkbaar.');
}
function validateMeeting(old:Meeting|undefined,row:Meeting|undefined,a:BoardActor,full:BoardState,context:BoardValidationContext){
 if(!old){access(manager(a),'Alleen voorzitter en secretaris plannen vergaderingen.');ensure(row&&row.status==='draft'&&row.agendaVersion===1&&row.minutesStatus==='draft'&&row.minutesVersion===1&&!row.minutesSnapshot&&!row.minutesHistory&&!row.minutesHash&&!row.agendaSnapshot&&!row.agendaHistory&&!row.agendaHash&&!row.minutesCode&&!row.closedAt&&!row.agendaApprovedAt&&!row.agendaEstablishedAt&&!row.minutesSubmittedAt&&!row.minutesApprovedAt,'Een nieuwe vergadering begint in concept.');for(const p of row.points)validatePoint(undefined,p,undefined,row,a,full);return;}
 ensure(row,'Vergaderingen mogen niet worden verwijderd.');checkBase(old,row);
 const metadata=['agendaSnapshot','agendaHash','agendaHistory','minutesHistory','minutesHash'];for(const key of metadata)ensure(equal((old as any)[key],(row as any)[key]),'Vastgelegde versies en hashes zijn servergegevens.');
 if(row.status!==old.status){
  if(old.status==='draft'&&row.status==='review'){access(a.role==='secretary','Alleen de secretaris dient de agenda in.');only(old,row,['status','feedback'],'Dien de actuele, ongewijzigde conceptagenda in.');ensure(row.points.length&&!row.points.some(p=>p.kind==='info'&&p.reviewReason),'Een lege agenda of open bespreekverzoek kan niet worden ingediend.');delete row.feedback;}
  else if(old.status==='review'&&row.status==='draft'){access(a.role==='chair','Alleen de voorzitter vraagt agendacorrecties.');only(old,row,['status','feedback','agendaVersion'],'De voorzitter geeft uitsluitend correctiefeedback.');ensure(row.feedback?.trim()&&row.agendaVersion===old.agendaVersion+1,'Een correctie vraagt toelichting en één nieuwe versie.');}
  else if(old.status==='review'&&row.status==='approved'){access(a.role==='chair','Alleen de voorzitter keurt de agenda goed.');only(old,row,['status','agendaApprovedAt','feedback'],'De voorgelegde agenda moet ongewijzigd worden beoordeeld.');row.agendaApprovedAt=context.now;delete row.feedback;const snapshot=agendaSnapshot(row),hash=boardSnapshotHash(snapshot);row.agendaSnapshot=snapshot;row.agendaHash=hash;row.agendaHistory=[...(old.agendaHistory||[]),{version:row.agendaVersion,at:context.now,personId:a.id,userId:a.userId,hash,snapshot}];}
  else if(old.status==='approved'&&row.status==='live'){access(a.role==='chair','Alleen de voorzitter opent de vergadering.');only(old,row,['status','agendaEstablishedAt'],'Open uitsluitend de vastgestelde agenda.');row.agendaEstablishedAt=context.now;}
  else if(old.status==='live'&&row.status==='closed'){access(a.role==='chair','Alleen de voorzitter sluit de vergadering.');only(old,row,['status','closedAt','minutesCode'],'Leg de uitkomsten vast vóór afsluiting.');ensure(row.points.length&&row.points.every(p=>p.outcome),'Behandel eerst alle agendapunten.');row.closedAt=context.now;}
  else throw new BoardTransitionError('Ongeldige vergaderovergang.');
  return;
 }
 if(old.status==='draft'){
  if(manager(a))only(old,row,['title','date','time','location','points','attendeeIds'],'Pas alleen de conceptvergadering en agenda aan.');else only(old,row,['points'],'Je kunt uitsluitend een bespreekverzoek doen.');
 }else if(old.status==='live'){access(manager(a),'Alleen voorzitter en secretaris werken de vergadering bij.');only(old,row,['points','attendeeIds'],'Pas alleen de aanwezigheid en behandeling aan.');}
 else if(old.status==='closed'){
  if(old.minutesStatus==='approved')ensure(equal(old,row),'Goedgekeurde notulen zijn onveranderlijk.');
  else if(old.minutesStatus==='draft'){
   access(a.role==='secretary','Alleen de secretaris bewerkt conceptnotulen.');only(old,row,['minutesSummary','minutesStatus','minutesSnapshot','minutesSubmittedAt','feedback'],'Pas alleen de conceptnotulen aan.');
   if(row.minutesStatus==='review'){const snapshot=buildBoardMinutesSnapshot(full,row,context.people),hash=boardSnapshotHash(snapshot);row.minutesSnapshot={attendance:snapshot.attendance,sections:snapshot.sections};row.minutesHash=hash;row.minutesHistory=[...(old.minutesHistory||[]),{version:row.minutesVersion,at:context.now,personId:a.id,userId:a.userId,hash,snapshot}];row.minutesSubmittedAt=context.now;delete row.feedback;}else ensure(row.minutesStatus==='draft'&&equal(old.minutesSnapshot,row.minutesSnapshot)&&old.minutesSubmittedAt===row.minutesSubmittedAt,'Dien de notulen via de juiste overgang in.');
  }else{
   access(a.role==='chair','Alleen de voorzitter beoordeelt ingediende notulen.');only(old,row,['minutesStatus','minutesApprovedAt','minutesVersion','minutesSnapshot','minutesSubmittedAt','feedback'],'Ingediende notuleninhoud is onveranderlijk.');
   if(row.minutesStatus==='approved'){ensure(row.minutesVersion===old.minutesVersion&&equal(row.minutesSnapshot,old.minutesSnapshot)&&old.minutesSubmittedAt===row.minutesSubmittedAt,'Keur uitsluitend de voorgelegde versie goed.');row.minutesApprovedAt=context.now;}
   else {ensure(row.minutesStatus==='draft'&&row.minutesVersion===old.minutesVersion+1&&row.feedback?.trim(),'Een notulencorrectie vraagt reden en één nieuwe versie.');delete row.minutesSnapshot;delete row.minutesSubmittedAt;}
  }
 }else ensure(equal(old,row),'Een agenda in beoordeling of goedgekeurde agenda is niet bewerkbaar.');
 for(const id of new Set([...old.points.map(p=>p.id),...row.points.map(p=>p.id)])){const before=old.points.find(p=>p.id===id),next=row.points.find(p=>p.id===id);if(!equal(before,next))validatePoint(before,next,old,row,a,full);}
}
function validateAlv(old:Alv|undefined,row:Alv|undefined,a:BoardActor,full:BoardState,context:BoardValidationContext){
 access(manager(a),'Alleen voorzitter en secretaris beheren de ALV.');
 if(!old){ensure(row&&row.status==='draft'&&!row.agendaSnapshot.length&&!row.votes.length&&!row.agendaHash&&!row.agendaApprovedAt&&!row.minutesHistory&&!row.minutesHash&&!row.minutesVersion&&!row.agendaApprovedBy&&!row.agendaApprovedByUserId,'Een nieuwe ALV begint als concept.');if(row.previousId)ensure(full.alvs.some(x=>x.id===row.previousId&&x.status==='closed'),'Overnemen kan alleen uit een afgeronde ALV.');return;}
 ensure(row,'Een ALV mag niet worden verwijderd.');checkBase(old,row);for(const key of ['minutesVersion','minutesHash','minutesHistory'] as const)ensure(equal(old[key],row[key]),'Verslagversies en hashes zijn servergegevens.');
 if(old.status!=='draft')ensure(equal(row.agendaSnapshot,old.agendaSnapshot)&&row.agendaHash===old.agendaHash&&row.agendaApprovedAt===old.agendaApprovedAt&&row.agendaApprovedBy===old.agendaApprovedBy&&row.agendaApprovedByUserId===old.agendaApprovedByUserId,'De vastgestelde ALV-agenda en het ledenpakket zijn onveranderlijk.');
 if(old.status!==row.status){access(a.role==='chair','Alleen de voorzitter stelt vast, opent en sluit de ALV.');
  if(old.status==='draft'&&row.status==='approved'){
   only(old,row,['status','agendaSnapshot'],'Stel de actuele conceptagenda vast.');const points=row.agendaIds.map(id=>full.alvItems.find(i=>i.id===id));ensure(points.length&&points.every(i=>i&&readyAlvItem(i)&&['ready','scheduled'].includes(i.status)),'Controleer de stukken en stemtekst van alle agendapunten.');row.agendaSnapshot=(points as AlvItem[]).map(snapshotAlvItem);row.agendaHash=boardSnapshotHash(row.agendaSnapshot);row.agendaApprovedAt=context.now;row.agendaApprovedBy=a.id;row.agendaApprovedByUserId=a.userId;
  }else if(old.status==='approved'&&row.status==='live'){only(old,row,['status'],'Open de vastgestelde ALV ongewijzigd.');}
  else if(old.status==='live'&&row.status==='closed'){only(old,row,['status'],'Werk eerst de lopende ALV bij.');ensure(row.votes.every(v=>v.confirmedAt),'Laat alle tellingen eerst controleren.');freezeAlvMinutes(row,a,context);}
  else throw new BoardTransitionError('Ongeldige ALV-overgang.');return;
 }
 if(old.status==='draft'){only(old,row,['title','date','time','location','agendaIds'],'Pas alleen de concept-ALV en agendavolgorde aan.');return;}
 if(old.status==='approved'){ensure(equal(old,row),'De vastgestelde ALV is niet meer bewerkbaar.');return;}
 only(old,row,old.status==='live'?['votes','minutes','promises']:['minutes','promises'],'Deze ALV-gegevens zijn onveranderlijk.');if(old.status==='closed'&&(!equal(old.minutes,row.minutes)||!equal(old.promises,row.promises)))freezeAlvMinutes(row,a,context);
 for(const id of new Set([...old.votes.map(v=>v.id),...row.votes.map(v=>v.id)])){
  const before=old.votes.find(v=>v.id===id),next=row.votes.find(v=>v.id===id);if(equal(before,next))continue;
  ensure(old.status==='live','Tellingen kunnen alleen tijdens de ALV worden vastgelegd.');
  if(!before){ensure(!old.votes.some(v=>v.itemId===next?.itemId&&(!v.confirmedAt||v.kind==='motion')),'Er bestaat al een open telling of definitieve stemming.');ensure(next&&!next.confirmedAt&&!next.confirmedBy&&!next.confirmedByUserId&&!next.decisionId,'Een nieuwe telling moet eerst door een andere persoon worden gecontroleerd.');access(next.countedBy===a.id,'Je kunt alleen als jezelf een telling invoeren.');next.countedByUserId=a.userId;}
  else if(!next){access(before.countedBy===a.id&&!before.confirmedAt,'Alleen de invoerder kan een onbevestigde telling verwijderen.');}
  else {checkBase(before,next);ensure(!before.confirmedAt,'Een bevestigde telling is onveranderlijk.');only(before,next,['confirmedBy','confirmedByUserId','confirmedAt','decisionId'],'Een telling wordt exact gecontroleerd, niet gewijzigd.');access(before.countedBy!==a.id&&before.countedByUserId!==a.userId,'De tweede controle vraagt een andere persoon én account.');ensure(next.confirmedBy===a.id&&next.confirmedAt,'Bevestig de telling als jezelf.');next.confirmedByUserId=a.userId;next.confirmedAt=context.now;if(next.kind==='motion')ensure(next.decisionId&&full.decisions.some(d=>d.id===next.decisionId),'De definitieve stemming vraagt precies één gekoppeld besluit.');}
 }
}
function validateRecord(kind:Collection,old:any,row:any,a:BoardActor,board:BoardState,context:BoardValidationContext){
 if(kind==='proposals')return validateProposal(old,row,a,board,context);
 if(kind==='meetings')return validateMeeting(old,row,a,board,context);
 if(kind==='alvs')return validateAlv(old,row,a,board,context);
 ensure(row,'Dit bestuursrecord mag niet worden verwijderd.');if(old)checkBase(old,row);
 if(kind==='decisions'){
  access(manager(a),'Alleen voorzitter en secretaris leggen besluiten vast.');
  if(old){ensure(old.outcome==='adopted','Een verworpen besluit is onveranderlijk.');only(old,row,['effectiveFrom','effectiveUntil','replacesId'],'De vastgelegde besluittekst en herkomst zijn onveranderlijk.');}
  else if(row.source==='bestuur'){const meeting=board.meetings.find(m=>m.id===row.meetingId),point=meeting?.points.find(p=>p.id===row.pointId);ensure(point&&point.outcome==='decided'&&point.decisionId===row.id&&point.result===row.text,'Een bestuursbesluit ontstaat vanuit de exacte puntuitkomst.');}
  else ensure(board.alvs.some(alv=>alv.votes.some(v=>v.kind==='motion'&&v.decisionId===row.id&&v.confirmedAt&&v.text===row.text&&v.itemId===row.alvItemId)),'Een ALV-besluit ontstaat alleen door bevestiging van de definitieve stemming.');return;
 }
 if(kind==='actions'){
  if(!old){access(manager(a),'Alleen voorzitter en secretaris wijzen acties toe.');ensure(row.status==='pending'&&!row.progress&&!row.helpRequest,'Een nieuwe actie wacht op bevestiging.');return;}
  if(old.status==='done')ensure(equal(old,row),'Een afgerond actieresultaat is onveranderlijk.');
  const assignment=['title','description','ownerId','committeeId','portfolioOwnerId','dueDate'];const reassigned=old.ownerId!==row.ownerId||old.committeeId!==row.committeeId;
  if(assignment.some(k=>!equal(old[k],row[k]))){access(manager(a),'Alleen voorzitter en secretaris wijzigen de toewijzing.');only(old,row,[...assignment,'status','helpRequest'],'Pas alleen de toewijzing aan.');if(reassigned)ensure(row.status==='pending'&&!row.helpRequest,'Een nieuwe verantwoordelijke of commissie moet de opdracht opnieuw bevestigen.');else ensure(row.status===old.status&&row.helpRequest===old.helpRequest,'Een toewijzingswijziging bevestigt of voltooit de actie niet.');return;}
  access(row.ownerId===a.id,'Alleen de actiehouder bevestigt en actualiseert deze actie.');only(old,row,['status','progress','helpRequest'],'Pas alleen de voortgang en hulpvraag aan.');
  if(old.status==='pending')ensure(row.status==='open'&&row.progress===old.progress&&!row.helpRequest,'Bevestig de opdracht voordat je voortgang vastlegt.');else ensure(['open','progress','blocked','done'].includes(row.status),'Een lopende actie kan niet zelf opnieuw worden toegewezen.');return;
 }
 if(kind==='alvItems'){
  access(manager(a),'Alleen voorzitter en secretaris bereiden ALV-punten voor.');const cycle=board.alvs.find(v=>v.id===row.alvId);
  if(!old){
   ensure(row.status==='work'||row.status==='ready','Een nieuw ALV-punt begint in voorbereiding.');
   if(row.fromItemId){
    const source=board.alvItems.find(item=>item.id===row.fromItemId),previous=source&&board.alvs.find(alv=>alv.id===source.alvId);
    ensure(source&&source.id!==row.id&&previous?.status==='closed'&&cycle?.status==='draft'&&cycle.previousId===previous.id&&cycle.id!==previous.id&&source.status!=='handled','Neem alleen een onbehandeld punt over uit de afgesloten vorige ALV.');
    ensure(row.status==='work'&&!row.notes&&!row.documentReleased&&!Object.values(row.checklist).some(Boolean),'Een overgenomen punt wordt opnieuw voorbereid en gecontroleerd.');
    for(const key of ['title','description','ownerId','kind','stance','document','question','meetingId','pointId'] as const)ensure(equal(row[key],source[key]),'De oorspronkelijke ALV-bron en vergaderverwijzingen moeten behouden blijven.');
    ensure(board.alvItems.filter(item=>item.alvId===cycle.id&&item.fromItemId===source.id).length===1,'Dit ALV-punt is al overgenomen in deze vergadering.');
   }else if(row.meetingId){const m=board.meetings.find(m=>m.id===row.meetingId),p=m?.points.find(p=>p.id===row.pointId);ensure(p&&p.alvItemId===row.id&&p.outcome==='alv','Dit punt hoort niet bij de doorgestuurde bestuursuitkomst.');}
   return;
  }
  if(old.alvId&&board.alvs.find(v=>v.id===old.alvId)?.status!=='draft'){
   ensure(cycle&&cycle.id===old.alvId&&cycle.status!=='draft','Een vastgesteld punt hoort bij dezelfde ALV.');only(old,row,['notes','status'],'De vastgestelde stukken, stemtekst en vrijgave zijn onveranderlijk.');ensure(row.status===old.status||old.status==='ready'&&row.status==='scheduled'&&cycle.status==='approved'||row.status==='handled','Ongeldige behandeling van een ALV-punt.');if(row.status==='handled'&&row.kind==='decision')ensure(cycle.votes.some(v=>v.itemId===row.id&&v.kind==='motion'&&v.confirmedAt),'Een beslispunt is pas behandeld na de bevestigde voorstelstemming.');
  }else {only(old,row,['title','description','ownerId','kind','status','alvId','stance','document','question','checklist','documentReleased','notes'],'De ALV-herkomst is onveranderlijk.');if(old.document!==row.document)ensure(!row.documentReleased||row.status==='ready'&&row.checklist.document,'Een gewijzigd stuk vraagt opnieuw bewuste controle en vrijgave.');if(old.document!==row.document&&row.status==='work')ensure(!row.documentReleased,'Geef het gewijzigde stuk opnieuw vrij.');}
  return;
 }
 if(kind==='communications'){
  access(manager(a)&&context.integration==='communication','Sla berichten op via de bevoegde conceptberichtactie.');ensure(row.title.trim()&&row.audience.trim()&&row.body.trim(),'Vul onderwerp, doelgroep en bericht in.');
  if(old){only(old,row,['title','body','audience','status','campaignId'],'De besluitherkomst van het bericht is onveranderlijk.');if(old.status==='ready'&&['title','body','audience'].some(k=>old[k]!==row[k]))ensure(row.status==='draft','Een gewijzigd klaarstaand bericht wordt eerst weer concept.');}
  if(row.campaignId)ensure(context.campaigns?.some(c=>c.id===row.campaignId&&c.status==='draft'),'Het gekoppelde bericht moet een echt intern concept zijn.');return;
 }
 if(kind==='handoffs'){
  access(manager(a),'Alleen voorzitter en secretaris beheren de jaaragendakoppeling.');if(!old)access(context.integration==='planning','Maak de jaaragendakoppeling via de bevoegde planningsactie.');else only(old,row,['date'],'De jaaragendakoppeling is onveranderlijk.');
  const activity=context.planning?.find(p=>p.id===row.activityId);ensure(activity&&activity.date===row.date&&activity.public!==true,'De planning moet overeenkomen met het echte interne agenda-item.');return;
 }
 access(a.role!=='committee','Deze dossiers en portefeuilles zijn niet beschikbaar.');access(manager(a)||row.ownerId===a.id&&(!old||old.ownerId===a.id),'Je kunt alleen de eigen portefeuille of het eigen dossier bijwerken.');
 if(old&&!manager(a))only(old,row,kind==='portfolios'?['description','status','update']:['title','description'],'Alleen voorzitter en secretaris wijzigen de toewijzing.');
}

/** Server-side transition boundary. The caller must CAS/serialize and persist atomically. */
export function applyBoardTransition(previous:BoardState,submitted:unknown,actor:BoardActor,context:BoardValidationContext):BoardTransitionResult{
 access(['chair','secretary','member','committee'].includes(actor.role)&&!!actor.userId,'Een actuele expliciete bestuursrol is vereist.');
 const person=context.people.find(p=>p.id===actor.id&&p.active!==false);access(person&&(!person.userId||person.userId===actor.userId)&&(!person.role||person.role===actor.role),'De account-/persoonskoppeling is niet geldig.');
 access(equal([...person.committeeIds].sort(),[...actor.committeeIds].sort()),'De commissiebevoegdheid is gewijzigd.');ensure(Number.isFinite(Date.parse(context.now)),'De servertijd is ongeldig.');
 const before=boardSchema.parse(clone(previous)),input=boardSchema.parse(clone(submitted)),visible=projectBoardState(before,actor),next=clone(before);const privateNotes:BoardPrivateNoteChange[]=[];
 for(const key of collections){
  const fullRows=before[key] as any[],visibleRows=visible[key] as any[],rows=input[key] as any[];
  for(const row of rows)access(!fullRows.some(v=>v.id===row.id)||visibleRows.some(v=>v.id===row.id),'Dit bestuursrecord valt buiten jouw bereik.');
  (next[key] as any)=fullRows.filter(row=>!visibleRows.some(v=>v.id===row.id)).map(clone).concat(rows.map(row=>{const v=visibleRows.find(v=>v.id===row.id),full=fullRows.find(v=>v.id===row.id);return v&&full?mergeVisible(full,v,row):clone(row);}));
 }
 for(const m of next.meetings)for(const point of m.points){
  const source=input.meetings.find(v=>v.id===m.id)?.points.find(v=>v.id===point.id);if(source){access(Object.keys(source.privateNotes).every(id=>id===actor.id),'Privénotities van een andere identiteit zijn afgeschermd.');const prior=before.meetings.find(v=>v.id===m.id)?.points.find(v=>v.id===point.id)?.privateNotes[actor.id]||'',text=source.privateNotes[actor.id]||'';if(text!==prior)privateNotes.push({meetingId:m.id,pointId:point.id,personId:actor.id,userId:actor.userId,text});}
  point.privateNotes={};
 }
 for(const m of before.meetings)for(const p of m.points)p.privateNotes={};
 const oldIds=new Set(allBases(before).map(r=>r.id));next.counters=clone(before.counters);
 for(const base of [...allBases(before),...before.meetings.filter(m=>m.minutesCode).map(m=>({...m,code:m.minutesCode!}))]){const match=base.code.match(/^([A-Z]+-\d{4})-(\d+)$/);if(match)next.counters[match[1]]=Math.max(next.counters[match[1]]||0,Number(match[2]));}
 const issue=(kind:keyof typeof boardCodePrefixes)=>{const key=boardCodePrefixes[kind]+'-'+boardToday(context.now).slice(0,4),value=(next.counters[key]||0)+1;ensure(Number.isSafeInteger(value),'De bestuursnummerreeks is uitgeput.');next.counters[key]=value;return key+'-'+String(value).padStart(4,'0');};
 const kinds:Record<Collection,keyof typeof boardCodePrefixes>={meetings:'meeting',proposals:'proposal',decisions:'decision',actions:'action',alvs:'alv',alvItems:'alvItem',communications:'communication',handoffs:'handoff',portfolios:'portfolio',dossiers:'dossier'};
 for(const k of collections)for(const row of next[k] as BoardBase[])if(!oldIds.has(row.id)){row.code=issue(kinds[k]);row.createdAt=context.now;row.createdBy=actor.id;row.createdByUserId=actor.userId;}
 for(const m of next.meetings){for(const p of m.points)if(!oldIds.has(p.id)){p.code=issue('point');p.createdAt=context.now;p.createdBy=actor.id;p.createdByUserId=actor.userId;}const old=before.meetings.find(v=>v.id===m.id);if(old?.status==='live'&&m.status==='closed')m.minutesCode=issue('minutes');}
 for(const alv of next.alvs)for(const vote of alv.votes)if(!oldIds.has(vote.id)){vote.code=issue('vote');vote.createdAt=context.now;vote.createdBy=actor.id;vote.createdByUserId=actor.userId;}
 // Detect ID reuse across entity kinds before allowing any cross-record mutation.
 const originalLocation=new Map<string,string>();for(const k of collections)for(const r of before[k])originalLocation.set(r.id,k);for(const m of before.meetings)for(const p of m.points)originalLocation.set(p.id,'point:'+m.id);for(const a of before.alvs)for(const v of a.votes)originalLocation.set(v.id,'vote:'+a.id);
 for(const k of collections)for(const r of next[k])ensure(!originalLocation.has(r.id)||originalLocation.get(r.id)===k,'Een bestaande ID kan niet voor een ander type worden gebruikt.');
 for(const m of next.meetings)for(const p of m.points)ensure(!originalLocation.has(p.id)||originalLocation.get(p.id)==='point:'+m.id,'Een punt kan niet naar een andere vergadering worden verplaatst.');
 for(const a of next.alvs)for(const v of a.votes)ensure(!originalLocation.has(v.id)||originalLocation.get(v.id)==='vote:'+a.id,'Een telling kan niet naar een andere ALV worden verplaatst.');
 for(const k of collections)for(const id of new Set([...before[k].map(r=>r.id),...next[k].map(r=>r.id)])){const old=(before[k] as any[]).find(r=>r.id===id),row=(next[k] as any[]).find(r=>r.id===id);if(!equal(old,row))validateRecord(k,old,row,actor,next,context);}
 validateLinks(next,context,before);
 const changes:BoardChangeAudit[]=[];for(const k of collections)for(const id of new Set([...before[k].map(r=>r.id),...next[k].map(r=>r.id)])){const old=(before[k] as any[]).find(r=>r.id===id),row=(next[k] as any[]).find(r=>r.id===id);if(!equal(old,row))changes.push({collection:k,recordId:id,operation:old?row?'update':'delete':'create',actorId:actor.id,userId:actor.userId,at:context.now,...(old?.status?{fromStatus:old.status}:{}),...(row?.status?{toStatus:row.status}:{}),...(row?{hash:boardSnapshotHash(row)}:{})});}
 return {board:boardSchema.parse(next),changes,privateNotes};
}
export const validateBoardTransition=applyBoardTransition;


function buildAlvMinutesSnapshot(alv:Alv,people:BoardPerson[],version:number):BoardAlvMinutesSnapshot {
 const name=(id:string)=>people.find(p=>p.id===id)?.name||'Bestuursgebruiker';
 return {title:alv.title,date:alv.date,time:alv.time,location:alv.location,code:alv.code,version,minutes:alv.minutes,promises:clone(alv.promises),sections:alv.agendaSnapshot.map(point=>({heading:point.title,text:[point.stance,...alv.votes.filter(v=>v.itemId===point.id&&v.confirmedAt).map(v=>[v.kind==='amendment'?'Amendement':'Definitieve voorstelstemming',v.text,...(['voor','tegen','onthouding','ongeldig'] as const).map(key=>`${key}: ${v.counts[key]}`),v.outcome==='adopted'?'Aangenomen':'Verworpen',`Ingevoerd door ${name(v.countedBy)}; gecontroleerd door ${name(v.confirmedBy!)}.`].join('\n'))].filter(Boolean).join('\n\n')}))};
}
function freezeAlvMinutes(alv:Alv,actor:BoardActor,context:BoardValidationContext){
 const version=(alv.minutesVersion||0)+1,snapshot=buildAlvMinutesSnapshot(alv,context.people,version),hash=boardSnapshotHash(snapshot);
 alv.minutesVersion=version;alv.minutesHash=hash;alv.minutesHistory=[...(alv.minutesHistory||[]),{version,at:context.now,personId:actor.id,userId:actor.userId,hash,snapshot}];
}
export type BoardExportSource={title:string;reference:string;sections:{heading:string;text:string}[];snapshotHash?:string;version?:number};
/** Exports consume stored snapshots, never mutable related proposal/action/directory fields. */
export function getBoardExportSource(board:BoardState,actor:BoardActor,kind:'minutes'|'alv-package'|'alv-minutes',id:string,_people:BoardPerson[]=[]):BoardExportSource {
 access(actor.role!=='committee','Deze bestuursdocumenten zijn afgeschermd.');
 if(kind==='minutes'){
  const m=board.meetings.find(row=>row.id===id);ensure(m&&m.status==='closed','Dit verslag is nog niet beschikbaar.');access(m.minutesStatus==='approved'||m.minutesStatus==='review'&&manager(actor),'Deze notulen zijn nog niet vrijgegeven.');
  const version=m.minutesHistory?.find(v=>v.version===m.minutesVersion);ensure(version&&version.hash===m.minutesHash&&version.hash===boardSnapshotHash(version.snapshot),'De vastgelegde notulenversie ontbreekt of is ongeldig.');const s=version.snapshot;
  return {title:`${m.minutesStatus==='approved'?'Notulen':'Conceptnotulen'} · ${s.title}`,reference:`${s.code} · versie ${s.version}`,version:s.version,snapshotHash:version.hash,sections:[{heading:'Vergadering',text:`${formatBoardDate(s.date)} · ${s.time} · ${s.location}`},{heading:'Aanwezig',text:s.attendance},{heading:'Algemeen verslag',text:s.summary},...clone(s.sections)]};
 }
 const alv=board.alvs.find(row=>row.id===id);ensure(alv&&alv.status!=='draft','De ALV-agenda is nog niet vastgesteld.');
 if(kind==='alv-package'){
  ensure(alv.agendaHash&&alv.agendaHash===boardSnapshotHash(alv.agendaSnapshot),'De vastgestelde ledenpakketversie ontbreekt of is ongeldig.');
  return {title:`Ledenpakket · ${alv.title}`,reference:alv.code,snapshotHash:alv.agendaHash,sections:alv.agendaSnapshot.map(p=>({heading:p.title,text:[p.stance,p.kind==='decision'&&`Stemtekst · ${p.question}`,p.documentReleased&&p.document].filter(Boolean).join('\n\n')}))};
 }
 if(alv.status==='live'){const snapshot=buildAlvMinutesSnapshot(alv,_people,1);return {title:`Conceptnotulen · ${snapshot.title}`,reference:`${snapshot.code} · live concept`,version:1,snapshotHash:boardSnapshotHash(snapshot),sections:[{heading:'Ledenvergadering',text:`${formatBoardDate(snapshot.date)} · ${snapshot.time} · ${snapshot.location}`},{heading:'Algemene verslagnotities',text:snapshot.minutes},...snapshot.sections,{heading:'Toezeggingen',text:snapshot.promises.join('\n')}]};}
 ensure(alv.status==='closed','Het ALV-verslag is pas tijdens of na de vergadering beschikbaar.');const version=alv.minutesHistory?.find(v=>v.version===alv.minutesVersion);ensure(version&&version.hash===alv.minutesHash&&version.hash===boardSnapshotHash(version.snapshot),'De vastgelegde ALV-verslagversie ontbreekt of is ongeldig.');const s=version.snapshot;
 return {title:`Conceptnotulen · ${s.title}`,reference:`${s.code} · verslag ${s.version}`,snapshotHash:version.hash,version:s.version,sections:[{heading:'Ledenvergadering',text:`${formatBoardDate(s.date)} · ${s.time} · ${s.location}`},{heading:'Algemene verslagnotities',text:s.minutes},...clone(s.sections),{heading:'Toezeggingen',text:s.promises.join('\n')}]};
}

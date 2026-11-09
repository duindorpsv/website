'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,BookOpen,CalendarDays,CheckCircle2,ClipboardList,FileText,FolderOpen,Gavel,ListChecks,Plus,Search,UsersRound} from 'lucide-react';
import {boardToday,formatBoardDate,makeBase,pointLabels,type BoardActor,type BoardPageProps,type BoardRole,type Decision,type Dossier,type PointKind,type Portfolio,type Proposal} from '@/lib/cms/board';
import type {BoardLocation} from '@/lib/cms/board-work';
import {Meetings} from './meetings';
import {Actions,Decisions} from './followup';
import {Alv} from './alv';
import {RoleOverview} from './role-overview';
import {useBoardServer} from './server-workspace';
import {useCMS} from '../provider';
import './workspace.css';

const tabs = [
  {id:'overview',title:'Overzicht',icon:ClipboardList},
  {id:'proposals',title:'Inbreng & voorstellen',icon:FileText},
  {id:'meetings',title:'Vergaderingen',icon:CalendarDays},
  {id:'decisions',title:'Besluiten',icon:Gavel},
  {id:'actions',title:'Acties',icon:ListChecks},
  {id:'alv',title:'ALV',icon:UsersRound},
  {id:'dossiers',title:'Dossiers & portefeuilles',icon:FolderOpen},
] as const;

const roleNames:Record<BoardRole,string> = {chair:'Voorzitter',secretary:'Secretaris',member:'Bestuurslid',committee:'Commissie'};
const proposalLabels:Record<Proposal['status'],string> = {
  draft:'Concept',submitted:'Ingediend',changes:'Aanvulling gevraagd',ready:'Gereed voor agenda',scheduled:'Geagendeerd',handled:'Behandeld',
};

function proposalVisible(proposal:Proposal,actor:BoardActor) {
  if (actor.role==='committee') return proposal.ownerId===actor.id;
  if (proposal.status==='draft') return proposal.ownerId===actor.id;
  if (proposal.status==='submitted'||proposal.status==='changes') return proposal.ownerId===actor.id||actor.role==='chair';
  return true;
}

function actionVisible(action:BoardPageProps['board']['actions'][number],actor:BoardActor) {
  return actor.role!=='committee'||action.ownerId===actor.id||actor.committeeIds.includes(action.committeeId);
}

export function BoardWorkspace({onOpenPlanning,onOpenCommunication}:{onOpenPlanning:(id:string)=>void;onOpenCommunication:(id:string)=>void}) {
  const server=useBoardServer();
  const {notify}=useCMS();
  const [location,setLocation]=useState<BoardLocation>({tab:'overview'});
  const navigation=useRef<HTMLDivElement>(null);
  const {data,loading,saving,error,notice,retryAvailable,conflict}=server;
  useEffect(()=>{if(notice)notify(notice);},[notice,notify]);
  function navigate(target:BoardLocation){setLocation(target);const menu=navigation.current;if(menu&&menu.getBoundingClientRect().bottom<0)menu.scrollIntoView({block:'start'});}
  if(!data)return <section className="bp-workspace"><div className="bp-panel bp-stack"><h2>Bestuur</h2>{loading?<p role="status">Bestuurswerkruimte laden…</p>:<><p role="alert">{error||'Deze bestuurswerkruimte is niet beschikbaar.'}</p><button className="cms-button" onClick={()=>void server.reload()}>Opnieuw proberen</button></>}</div></section>;
  const {board,actor,people,committees}=data;
  if(!actor)return <section className="bp-workspace"><div className="bp-panel bp-stack"><h2>Bestuur inrichten</h2><p>Er is nog geen bestuursrol aan jouw account gekoppeld. Voor het bestuurswerk is een actieve persoonskoppeling en één expliciete rol nodig: voorzitter, secretaris, bestuurslid of commissie.</p>{data.permissions.configure?<a className="cms-button primary" href="#rollen">Gebruikers & rollen openen <ArrowRight size={16}/></a>:<p>Vraag de beheerder om je persoonskoppeling en bestuursrol te controleren.</p>}</div></section>;
  const permitted=tabs.filter(tab=>actor.role!=='committee'||['overview','proposals','actions'].includes(tab.id));
  const activeTab=permitted.some(tab=>tab.id===location.tab)?location.tab:'overview';
  const onNavigate:BoardPageProps['onNavigate']=(tab,id)=>navigate({tab,id});
  async function stagePlanning(decision:Decision,date:string){
    const result=await server.command('/api/cms/board/planning',{decisionId:decision.id,date},'Intern concept toegevoegd aan de jaaragenda.');
    return result?.board.handoffs.find(row=>row.decisionId===decision.id)?.activityId;
  }
  const saveCommunication:BoardPageProps['saveCommunication']=async input=>!!await server.command('/api/cms/board/communications',input,'Bericht als intern concept bewaard.');
  const props:BoardPageProps={board,actor,people,committees,change:server.change,saveCommunication,focusId:activeTab===location.tab?location.id:undefined,onNavigate};
  return <div className="bp-workspace" aria-busy={saving||loading}>
    {error&&<div className="bp-panel bp-server-message" role="alert"><p>{error}</p><div className="bp-toolbar">{retryAvailable&&<button className="cms-button primary" disabled={saving} onClick={()=>void server.retry()}>Dezelfde wijziging opnieuw proberen</button>}{(conflict||!retryAvailable)&&<button className="cms-button" disabled={saving} onClick={()=>void server.reload()}>Actuele serverversie ophalen</button>}</div></div>}
    <fieldset className="bp-workspace-content" disabled={saving||loading||retryAvailable}>
      <legend className="sr-only">Bestuurswerkruimte</legend>
      <div className="bp-nav-shell" ref={navigation}><nav className="bp-nav" aria-label="Bestuursportaal">{permitted.map(({id,title,icon:Icon})=><button key={id} type="button" aria-current={activeTab===id?'page':undefined} onClick={()=>onNavigate(id)}><Icon size={16}/><span>{id==='actions'&&actor.role==='committee'?'Onze acties':title}</span></button>)}</nav><span className="bp-role"><span aria-hidden="true"/>{roleNames[actor.role]}</span></div>
      {activeTab==='overview'&&(['chair','secretary'].includes(actor.role)?<RoleOverview key={actor.id} {...props} navigate={navigate}/>:<Overview {...props}/>)}
      {activeTab==='proposals'&&<Proposals key={actor.id+'-'+(props.focusId??'list')} {...props}/>}
      {activeTab==='meetings'&&<Meetings {...props} focusSection={location.meetingSection}/>}
      {activeTab==='decisions'&&<Decisions {...props} stagePlanning={stagePlanning} openPlanning={onOpenPlanning} openCommunication={onOpenCommunication} canStagePlanning={data.permissions.planning} canSaveCommunication={data.permissions.communications} lookupPlanning={id=>data.planning.find(activity=>activity.id===id)}/>}
      {activeTab==='actions'&&<Actions {...props}/>}
      {activeTab==='alv'&&<Alv {...props} focusPane={location.alvPane}/>}
      {activeTab==='dossiers'&&<Dossiers key={actor.id+'-'+(props.focusId??'list')} {...props}/>}
    </fieldset>
  </div>;
}

function Overview({board,actor,people,onNavigate}:BoardPageProps) {
  const isCommittee=actor.role==='committee';
  const live=board.meetings.find(row=>row.status==='live');
  const meeting=live??board.meetings.filter(row=>row.status!=='closed').slice().sort((a,b)=>a.date.localeCompare(b.date))[0];
  const actions=board.actions.filter(row=>actionVisible(row,actor)&&row.status!=='done');
  const needsHelp=actions.filter(row=>row.status==='blocked');
  const pending=actions.filter(row=>row.status==='pending'&&row.ownerId===actor.id);
  const proposals=board.proposals.filter(row=>proposalVisible(row,actor)&&!['scheduled','handled'].includes(row.status));
  const nextAlv=board.alvs.filter(row=>row.status!=='closed').slice().sort((a,b)=>a.date.localeCompare(b.date))[0];
  const agendaCount=board.alvItems.filter(row=>row.status==='work').length;
  const stats=isCommittee?[
    {title:'Open opdrachten',count:actions.length,detail:'Binnen je commissie',tab:'actions',icon:ListChecks},
    {title:'Wacht op bevestiging',count:pending.length,detail:'Aan jou toegewezen',tab:'actions',icon:CheckCircle2},
    {title:'Ingediende punten',count:proposals.length,detail:'Jouw inbreng bij het bestuur',tab:'proposals',icon:FileText},
  ] as const:[
    {title:'Open acties',count:actions.length,detail:'Bestuur en commissies',tab:'actions',icon:ListChecks},
    {title:'Hulp nodig',count:needsHelp.length,detail:'Wachten op een antwoord',tab:'actions',icon:UsersRound},
    {title:'Voorstellen in behandeling',count:proposals.length,detail:'In de werkvoorraad',tab:'proposals',icon:FileText},
    {title:'ALV-punten in voorbereiding',count:agendaCount,detail:nextAlv?formatBoardDate(nextAlv.date):'Volgende ledenvergadering',tab:'alv',icon:BookOpen},
  ] as const;

  return <div className="bp-overview">
    <div className="bp-overview-top">
      <section className="bp-hero">
        <div className="bp-hero-main">
          <span className="bp-overline">{isCommittee?'SAMEN AAN DE SLAG':live?'VERGADERING LIVE':'VOLGENDE BESTUURSVERGADERING'}</span>
          <h2>{isCommittee?'Jouw commissiewerk':meeting?.title||'De bestuurskamer'}</h2>
          <p>{isCommittee?'Pak een actie op, geef door waar je hulp bij nodig hebt of leg een voorstel aan het bestuur voor.':meeting?
            <><CalendarDays size={16}/> {formatBoardDate(meeting.date)} · {meeting.time} · {meeting.location}</>:
            'Open de agenda om een nieuwe vergadering voor te bereiden.'}</p>
          <button type="button" className="cms-button" onClick={()=>onNavigate(isCommittee?'actions':'meetings',meeting?.id)}>
            {isCommittee?'Open onze acties':live?'Naar de vergadering':'Open de agenda'} <ArrowRight size={17}/>
          </button>
        </div>
        <div className="bp-hero-mark" aria-hidden="true"><Gavel size={108}/></div>
      </section>
      <section className="bp-panel bp-brief">
        <div className="bp-panel-head"><div><span className="bp-overline">WERKVOORRAAD</span><h2>Jouw eerstvolgende stap</h2></div></div>
        {needsHelp.slice(0,2).map(row=><button key={row.id} type="button" className="bp-brief-row" onClick={()=>onNavigate('actions',row.id)}>
          <span className="bp-signal"/><span><strong>{row.title}</strong><small>Hulpvraag voor {people.find(person=>person.id===row.portfolioOwnerId)?.name??'de portefeuillehouder'}</small></span><ArrowUpRight size={16}/>
        </button>)}
        {isCommittee? <button type="button" className="bp-brief-row" onClick={()=>onNavigate('proposals','new')}>
          <Plus size={16}/><span><strong>Punt indienen</strong><small>Geef aan wat je van het bestuur nodig hebt</small></span><ArrowUpRight size={16}/>
        </button>:<button type="button" className="bp-brief-row" onClick={()=>onNavigate('alv',nextAlv?.id)}>
          <CalendarDays size={16}/><span><strong>{nextAlv?.title??'Plan de volgende ALV'}</strong><small>{nextAlv?formatBoardDate(nextAlv.date):'Open het ALV-draaiboek'}</small></span><ArrowUpRight size={16}/>
        </button>}
      </section>
    </div>
    <div className="bp-metrics">
      {stats.map(({title,count,detail,tab,icon:Icon})=><button type="button" key={title} onClick={()=>onNavigate(tab)}>
        <span className="bp-metric-icon"><Icon size={17}/></span><ArrowUpRight className="bp-metric-arrow" size={15}/>
        <strong>{count}</strong><b>{title}</b><small>{detail}</small>
      </button>)}
    </div>
    <div className="bp-grid">
      <section className="bp-panel">
        <div className="bp-panel-head"><div><span className="bp-overline">VOORBEREIDING</span><h2>Voorstellen en inbreng</h2></div>
          <button type="button" className="cms-button" onClick={()=>onNavigate('proposals','new')}><Plus size={16}/> Nieuw punt</button>
        </div>
        {proposals.length===0&&<p className="bp-empty">Er staan geen voorstellen op je werkvoorraad.</p>}
        <div className="bp-list">{proposals.slice(0,4).map(row=><button type="button" className="bp-record" key={row.id} onClick={()=>onNavigate('proposals',row.id)}>
          <FileText size={18}/><span><strong>{row.title}</strong><small>{row.code} · {pointLabels[row.kind]}</small></span><span className="bp-pill">{proposalLabels[row.status]}</span>
        </button>)}</div>
      </section>
      {!isCommittee&&<section className="bp-panel">
        <div className="bp-panel-head"><div><span className="bp-overline">CLUBZAKEN</span><h2>Portefeuilles</h2></div>
          <button type="button" className="cms-button" onClick={()=>onNavigate('dossiers')}>Open dossiers <ArrowRight size={16}/></button>
        </div>
        <div className="bp-list">{board.portfolios.slice(0,4).map(row=><button type="button" className="bp-record" key={row.id} onClick={()=>onNavigate('dossiers',row.id)}>
          <FolderOpen size={18}/><span><strong>{row.title}</strong><small>{row.update||row.description}</small></span><span className="bp-pill">{portfolioLabels[row.status]}</span>
        </button>)}</div>
      </section>}
    </div>
  </div>;
}

const newProposal=():Pick<Proposal,'title'|'kind'|'summary'|'request'|'committeeId'|'dossierId'|'attachment'>=>({
  title:'',kind:'decision',summary:'',request:'',committeeId:'',dossierId:'',attachment:'',
});

function Proposals({board,actor,people,committees,focusId,change}:BoardPageProps) {
  const rows=board.proposals.filter(row=>proposalVisible(row,actor));
  const [selected,setSelected]=useState(focusId==='new'?'':focusId??rows[0]?.id??'');
  const [query,setQuery]=useState('');
  const [draft,setDraft]=useState(newProposal);
  const [review,setReview]=useState('');
  const [editing,setEditing]=useState(!selected);
  const [error,setError]=useState('');
  const proposal=rows.find(row=>row.id===selected);
  const editable=proposal?.ownerId===actor.id&&['draft','changes'].includes(proposal.status);
  const canReview=proposal?.status==='submitted'&&actor.role==='chair';
  const shown=rows.filter(row=>[row.title,row.code,row.summary].join(' ').toLowerCase().includes(query.toLowerCase()));
  const select=(row?:Proposal)=>{
    setSelected(row?.id??'');
    setDraft(row?{title:row.title,kind:row.kind,summary:row.summary,request:row.request,committeeId:row.committeeId,dossierId:row.dossierId,attachment:row.attachment}:newProposal());
    setEditing(!row);
    setReview('');
    setError('');
  };

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if(!draft.title.trim()) return setError('Geef het voorstel een titel.');
    let id=selected;
    const fields={...draft,title:draft.title.trim(),summary:draft.summary.trim(),request:draft.request.trim(),attachment:draft.attachment?.trim()};
    const saved=await change(current=>{
      const row=current.proposals.find(item=>item.id===selected);
      if(row){
        if(row.ownerId!==actor.id||!['draft','changes'].includes(row.status)) throw new Error('Dit voorstel is niet meer bewerkbaar.');
        Object.assign(row,fields);
      }else{
        const base=makeBase(current,'proposal');
        id=base.id;
        current.proposals.unshift({...base,...fields,ownerId:actor.id,status:'draft',versions:[]});
      }
    },'Conceptvoorstel opgeslagen');
    if(saved){setSelected(id);setEditing(false);}
  }

  async function submit() {
    if(!proposal) return;
    if(!proposal.summary.trim()||(proposal.kind==='decision'&&!proposal.request.trim())) return setError('Vul de toelichting en bij een besluitpunt de exacte besluitvraag in.');
    setError('');
    await change(current=>{
      const row=current.proposals.find(item=>item.id===proposal.id);
      if(!row||row.ownerId!==actor.id||!['draft','changes'].includes(row.status)) throw new Error('Dit voorstel kan nu niet worden ingediend.');
      row.versions.push({number:row.versions.length+1,at:new Date().toISOString(),summary:row.summary,request:row.request});
      row.status='submitted';
      delete row.reviewReason;
    },'Voorstel ingediend bij de voorzitter');
  }

  async function assess(status:'ready'|'changes') {
    if(!proposal||!canReview) return;
    if(status==='changes'&&!review.trim()) return setError('Geef aan wat de indiener moet aanvullen.');
    setError('');
    await change(current=>{
      const row=current.proposals.find(item=>item.id===proposal.id);
      if(!row||row.status!=='submitted') throw new Error('Dit voorstel is al beoordeeld.');
      row.status=status;
      row.reviewReason=review.trim();
    },status==='ready'?'Voorstel gereed voor agendering':'Aanvulling gevraagd');
  }

  async function discard() {
    if(!proposal||!editable||!window.confirm('Dit conceptvoorstel verwijderen?')) return;
    if(await change(current=>{current.proposals=current.proposals.filter(row=>row.id!==proposal.id||row.ownerId!==actor.id||!['draft','changes'].includes(row.status));},'Concept verwijderd'))select();
  }

  return <div className="bp-split">
    <section className="bp-panel">
      <div className="bp-panel-head"><div><span className="bp-overline">WERKVOORRAAD</span><h2>Inbreng & voorstellen</h2></div>
        <button type="button" className="cms-button primary" onClick={()=>select()}><Plus size={16}/> Nieuw</button>
      </div>
      <label className="bp-search"><Search size={17}/><input aria-label="Zoek voorstel" placeholder="Zoek op titel of code" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="bp-list">{shown.map(row=><button key={row.id} type="button" className="bp-record" aria-pressed={row.id===selected} onClick={()=>select(row)}>
        <FileText size={18}/><span><strong>{row.title}</strong><small>{row.code} · {pointLabels[row.kind]}</small></span><span className="bp-pill">{proposalLabels[row.status]}</span>
      </button>)}</div>
      {!shown.length&&<p className="bp-empty">Geen voorstellen in deze weergave.</p>}
    </section>
    <section className="bp-panel">
      {editing?<form className="bp-stack" onSubmit={save}>
        <div className="bp-panel-head"><div><span className="bp-overline">{proposal?.code??'CONCEPT'}</span><h2>{proposal?'Concept bewerken':'Nieuw punt indienen'}</h2></div></div>
        <label className="bp-field">Titel<input required value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
        <div className="bp-fields">
          <label className="bp-field">Soort inbreng<select value={draft.kind} onChange={event=>setDraft({...draft,kind:event.target.value as PointKind})}>
            {Object.entries(pointLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="bp-field">Commissie<select value={draft.committeeId} onChange={event=>setDraft({...draft,committeeId:event.target.value})}>
            <option value="">Geen commissie</option>{committees.filter(row=>actor.role!=='committee'||actor.committeeIds.includes(row.id)).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
        </div>
        <label className="bp-field">Toelichting<textarea rows={4} value={draft.summary} onChange={event=>setDraft({...draft,summary:event.target.value})}/></label>
        <label className="bp-field">{draft.kind==='decision'?'Exacte besluitvraag':'Gewenste uitkomst'}<textarea rows={3} value={draft.request} onChange={event=>setDraft({...draft,request:event.target.value})}/></label>
        <label className="bp-field">Bijlage of documentlink<input value={draft.attachment??''} onChange={event=>setDraft({...draft,attachment:event.target.value})}/></label>
        {actor.role!=='committee'&&<label className="bp-field">Dossier<select value={draft.dossierId??''} onChange={event=>setDraft({...draft,dossierId:event.target.value})}>
          <option value="">Geen dossier</option>{board.dossiers.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}
        </select></label>}
        {error&&<p className="bp-error" role="alert">{error}</p>}
        <div className="bp-toolbar"><button type="submit" className="cms-button primary">Concept opslaan</button>
          {proposal&&<button type="button" className="cms-button" onClick={()=>select(proposal)}>Annuleren</button>}
        </div>
      </form>:proposal?<div className="bp-stack">
        <div className="bp-panel-head"><div><span className="bp-overline">{proposal.code}</span><h2>{proposal.title}</h2></div><span className="bp-pill">{proposalLabels[proposal.status]}</span></div>
        <p className="bp-muted">{pointLabels[proposal.kind]} · {people.find(row=>row.id===proposal.ownerId)?.name??'Onbekende indiener'}</p>
        <div className="bp-inset"><strong>Toelichting</strong><p>{proposal.summary||'Nog geen toelichting.'}</p></div>
        {proposal.request&&<div className="bp-inset"><strong>{proposal.kind==='decision'?'Exacte besluitvraag':'Gewenste uitkomst'}</strong><p>{proposal.request}</p></div>}
        {proposal.attachment&&<div className="bp-inset"><strong>Bijlage of documentlink</strong><p>{proposal.attachment}</p></div>}
        {proposal.reviewReason&&<div className="bp-inset"><strong>Reactie voorzitter</strong><p>{proposal.reviewReason}</p></div>}
        {canReview&&<label className="bp-field">Toelichting bij beoordeling<textarea rows={3} value={review} onChange={event=>setReview(event.target.value)}/></label>}
        {error&&<p className="bp-error" role="alert">{error}</p>}
        <div className="bp-toolbar">
          {editable&&<><button type="button" className="cms-button primary" onClick={submit}>Indienen bij voorzitter</button><button type="button" className="cms-button" onClick={()=>{select(proposal);setEditing(true);}}>Bewerken</button><button type="button" className="cms-button" onClick={discard}>Verwijderen</button></>}
          {canReview&&<><button type="button" className="cms-button primary" onClick={()=>assess('ready')}>Gereed voor agendering</button><button type="button" className="cms-button" onClick={()=>assess('changes')}>Aanvulling vragen</button></>}
        </div>
        {proposal.versions.length>0&&<details className="bp-inset"><summary>Ingediende versies ({proposal.versions.length})</summary>
          {[...proposal.versions].reverse().map(version=><div key={version.number} className="bp-version"><strong>Versie {version.number} · {formatBoardDate(version.at)}</strong><p>{version.summary}</p>{version.request&&<p>{version.request}</p>}</div>)}
        </details>}
      </div>:<p className="bp-empty">Kies een voorstel om de inhoud te bekijken.</p>}
    </section>
  </div>;
}

const portfolioLabels:Record<Portfolio['status'],string>={info:'Ter kennisname',issue:'Knelpunt',decision:'Besluit nodig'};

function Dossiers({board,actor,people,committees,change,onNavigate,focusId}:BoardPageProps) {
  const [selected,setSelected]=useState(focusId??board.dossiers[0]?.id??'');
  const [newDossier,setNewDossier]=useState(false);
  const [draft,setDraft]=useState<Pick<Dossier,'title'|'description'|'ownerId'|'committeeId'>>({title:'',description:'',ownerId:actor.id,committeeId:''});
  const [portfolioDraft,setPortfolioDraft]=useState<Pick<Portfolio,'title'|'description'|'ownerId'|'committeeId'|'status'|'update'>|null>(null);
  const dossier=board.dossiers.find(row=>row.id===selected);
  const portfolio=board.portfolios.find(row=>row.id===selected);
  const canManage=['chair','secretary'].includes(actor.role);
  const canUpdatePortfolio=canManage||portfolio?.ownerId===actor.id;
  const related=dossier?[
    ...board.proposals.filter(row=>row.dossierId===dossier.id&&proposalVisible(row,actor)).map(row=>({...row,tab:'proposals' as const,type:'Voorstel'})),
    ...board.decisions.filter(row=>row.dossierId===dossier.id).map(row=>({...row,tab:'decisions' as const,type:'Besluit'})),
    ...board.actions.filter(row=>board.decisions.some(decision=>decision.dossierId===dossier.id&&decision.id===row.decisionId)||board.proposals.some(proposal=>proposal.dossierId===dossier.id&&proposal.id===row.proposalId&&proposalVisible(proposal,actor))).map(row=>({...row,tab:'actions' as const,type:'Actie'})),
  ].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)):[];

  async function saveDossier(event:FormEvent) {
    event.preventDefault();
    if(!draft.title.trim()) return;
    let id='';
    const saved=await change(current=>{
      const base=makeBase(current,'dossier');
      id=base.id;
      current.dossiers.push({...base,...draft,title:draft.title.trim()});
    },'Bestuursdossier aangemaakt');
    if(saved){setSelected(id);setNewDossier(false);}
  }

  async function savePortfolio(event:FormEvent) {
    event.preventDefault();
    if(!portfolioDraft||!portfolioDraft.title.trim()) return;
    let id=portfolio?.id??'';
    const saved=await change(current=>{
      const row=current.portfolios.find(item=>item.id===id);
      if(row){Object.assign(row,portfolioDraft);}
      else{
        const base=makeBase(current,'portfolio');
        id=base.id;
        current.portfolios.push({...base,...portfolioDraft,title:portfolioDraft.title.trim()});
      }
    },'Portefeuille bijgewerkt');
    if(saved){setSelected(id);setPortfolioDraft(null);}
  }

  return <div className="bp-split">
    <section className="bp-panel bp-stack">
      <div className="bp-panel-head"><div><span className="bp-overline">CLUBZAKEN</span><h2>Dossiers</h2></div>
        <button type="button" className="cms-button" onClick={()=>{setSelected('');setNewDossier(true);setPortfolioDraft(null);}}><Plus size={16}/> Nieuw dossier</button>
      </div>
      <div className="bp-list">{board.dossiers.map(row=><button key={row.id} type="button" className="bp-record" aria-pressed={selected===row.id} onClick={()=>{setSelected(row.id);setNewDossier(false);setPortfolioDraft(null);}}>
        <FolderOpen size={18}/><span><strong>{row.title}</strong><small>{row.code}</small></span>
      </button>)}</div>
      <div className="bp-panel-head"><div><span className="bp-overline">BESTUURSRONDE</span><h2>Portefeuilles</h2></div>
        {canManage&&<button type="button" className="cms-button" onClick={()=>{setSelected('');setNewDossier(false);setPortfolioDraft({title:'',description:'',ownerId:actor.id,committeeId:'',status:'info',update:''});}}><Plus size={16}/> Nieuw</button>}
      </div>
      <div className="bp-list">{board.portfolios.map(row=><button key={row.id} type="button" className="bp-record" aria-pressed={selected===row.id} onClick={()=>{setSelected(row.id);setNewDossier(false);setPortfolioDraft(null);}}>
        <ClipboardList size={18}/><span><strong>{row.title}</strong><small>{row.code}</small></span><span className="bp-pill">{portfolioLabels[row.status]}</span>
      </button>)}</div>
    </section>
    <section className="bp-panel bp-stack">
      {newDossier&&<form className="bp-stack" onSubmit={saveDossier}>
        <div className="bp-panel-head"><h2>Nieuw dossier</h2></div>
        <label className="bp-field">Titel<input required value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
        <label className="bp-field">Toelichting<textarea rows={4} value={draft.description} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
        <label className="bp-field">Eigenaar<select value={draft.ownerId} onChange={event=>setDraft({...draft,ownerId:event.target.value})}>{people.filter(row=>canManage||row.id===actor.id).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="bp-field">Commissie<select value={draft.committeeId} onChange={event=>setDraft({...draft,committeeId:event.target.value})}><option value="">Geen commissie</option>{committees.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <button type="submit" className="cms-button primary">Dossier opslaan</button>
      </form>}
      {dossier&&!newDossier&&<>
        <div className="bp-panel-head"><div><span className="bp-overline">{dossier.code}</span><h2>{dossier.title}</h2></div></div>
        <p>{dossier.description}</p>
        <p className="bp-muted">{people.find(row=>row.id===dossier.ownerId)?.name??'Zonder eigenaar'} · {committees.find(row=>row.id===dossier.committeeId)?.name??'Bestuur'}</p>
        <h3>Dossiertijdlijn</h3>
        {related.length===0&&<p className="bp-empty">Gekoppelde voorstellen, besluiten en acties verschijnen hier.</p>}
        <div className="bp-list">{related.map(row=><button key={row.id} type="button" className="bp-record" onClick={()=>onNavigate(row.tab,row.id)}>
          <FileText size={18}/><span><strong>{row.title}</strong><small>{row.code} · {row.type} · {formatBoardDate(row.createdAt)}</small></span><ArrowUpRight size={16}/>
        </button>)}</div>
      </>}
      {portfolio&&!portfolioDraft&&<>
        <div className="bp-panel-head"><div><span className="bp-overline">{portfolio.code}</span><h2>{portfolio.title}</h2></div><span className="bp-pill">{portfolioLabels[portfolio.status]}</span></div>
        <p>{portfolio.description}</p>
        <p className="bp-muted">{people.find(row=>row.id===portfolio.ownerId)?.name??'Zonder eigenaar'} · {committees.find(row=>row.id===portfolio.committeeId)?.name??'Bestuur'}</p>
        <div className="bp-inset"><strong>Laatste update</strong><p>{portfolio.update||'Er is nog geen update ingevuld.'}</p></div>
        {canUpdatePortfolio&&<div className="bp-toolbar"><button className="cms-button primary" type="button" onClick={()=>setPortfolioDraft(portfolio)}>Update bijwerken</button></div>}
      </>}
      {portfolioDraft&&<form className="bp-stack" onSubmit={savePortfolio}>
        <div className="bp-panel-head"><h2>{portfolio?'Portefeuille bijwerken':'Nieuwe portefeuille'}</h2></div>
        {canManage&&<>
          <label className="bp-field">Titel<input required value={portfolioDraft.title} onChange={event=>setPortfolioDraft({...portfolioDraft,title:event.target.value})}/></label>
          <label className="bp-field">Omschrijving<input value={portfolioDraft.description} onChange={event=>setPortfolioDraft({...portfolioDraft,description:event.target.value})}/></label>
          <div className="bp-fields"><label className="bp-field">Portefeuillehouder<select value={portfolioDraft.ownerId} onChange={event=>setPortfolioDraft({...portfolioDraft,ownerId:event.target.value})}>{people.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="bp-field">Commissie<select value={portfolioDraft.committeeId} onChange={event=>setPortfolioDraft({...portfolioDraft,committeeId:event.target.value})}><option value="">Geen commissie</option>{committees.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
        </>}
        <label className="bp-field">Behandeling<select value={portfolioDraft.status} onChange={event=>setPortfolioDraft({...portfolioDraft,status:event.target.value as Portfolio['status']})}>{Object.entries(portfolioLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="bp-field">Update<textarea rows={5} value={portfolioDraft.update} onChange={event=>setPortfolioDraft({...portfolioDraft,update:event.target.value})}/></label>
        <div className="bp-toolbar"><button type="submit" className="cms-button primary">Update opslaan</button><button type="button" className="cms-button" onClick={()=>setPortfolioDraft(null)}>Annuleren</button></div>
      </form>}
      {!dossier&&!portfolio&&!newDossier&&!portfolioDraft&&<p className="bp-empty">Kies een dossier of portefeuille.</p>}
    </section>
  </div>;
}

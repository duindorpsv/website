'use client';

import {useState} from 'react';
import {ArrowRight,CalendarDays,Check,ClipboardCheck,FileCheck2,Gavel,ListChecks,Plus,UsersRound} from 'lucide-react';
import {boardToday,formatBoardDate,type BoardPageProps,type Meeting} from '@/lib/cms/board';
import {boardWork,nextBoardMeeting,type BoardLocation,type BoardWorkGroup} from '@/lib/cms/board-work';
import './role-overview.css';

const groupIcons={Vergaderen:CalendarDays,Beoordelen:FileCheck2,Opvolgen:ListChecks};
const meetingLabels:Record<Meeting['status'],string>={
  draft:'Bij de secretaris',review:'Bij de voorzitter',approved:'Agenda goedgekeurd',live:'Vergadering loopt',closed:'Afgerond',
};

export function RoleOverview({board,actor,navigate}:Pick<BoardPageProps,'board'|'actor'>&{navigate:(location:BoardLocation)=>void}) {
  const [filter,setFilter]=useState<BoardWorkGroup|'Alles'>('Alles');
  const [expanded,setExpanded]=useState(false);
  const today=boardToday();
  const chair=actor.role==='chair';
  const items=boardWork(board,actor,today);
  const meeting=nextBoardMeeting(board.meetings,today);
  const alv=board.alvs.filter(row=>row.status!=='closed').slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
  const groups=(Object.keys(groupIcons) as BoardWorkGroup[]).map(group=>({group,count:items.filter(item=>item.group===group).length}));
  const visible=items.filter(item=>filter==='Alles'||item.group===filter);
  const displayed=expanded?visible:visible.slice(0,6);
  const waiting=chair?
    board.meetings.filter(row=>row.status==='draft'||row.status==='closed'&&row.minutesStatus==='draft').length:
    board.meetings.filter(row=>row.status==='review'||row.status==='closed'&&row.minutesStatus==='review').length;
  const RoleIcon=chair?Gavel:ClipboardCheck;

  return <div className="bp-role-overview">
    <section className="bp-hero bp-role-hero" aria-label="Mijn werk">
      <div className="bp-hero-main">
        <span className="bp-overline">{chair?'VOORZITTER':'SECRETARIS'} · MIJN WERK</span>
        <h2>{chair?'Voorzittersoverzicht':'Secretarisoverzicht'}</h2>
        <p>{chair?'Beoordeel wat klaarligt, leid de vergadering en houd de opvolging in de gaten.':'Bereid de agenda voor, houd de vergadering bij en rond het verslag af.'}</p>
        <div className="bp-toolbar">
          <button type="button" className="cms-button" onClick={()=>navigate(chair&&meeting?
            {tab:'meetings',id:meeting.id,meetingSection:'agenda'}:{tab:'meetings',id:'new'})}>
            {chair&&meeting?<CalendarDays size={16}/>:<Plus size={16}/>}
            {chair&&meeting?(meeting.status==='live'?'Naar live vergadering':'Open de vergadering'):'Vergadering plannen'}
          </button>
          <button type="button" className="cms-button bp-hero-secondary" onClick={()=>navigate({tab:'proposals',id:'new'})}>
            <Plus size={16}/> Voorstel maken
          </button>
        </div>
      </div>
      <div className="bp-hero-mark" aria-hidden="true"><RoleIcon size={108}/></div>
    </section>

    <div className="bp-role-columns">
      <section className="bp-panel bp-stack bp-work-queue" aria-label="Werkvoorraad">
        <div className="bp-panel-head">
          <div><span className="bp-overline">OP VOLGORDE VAN URGENTIE</span><h2>Mijn werkvoorraad</h2></div>
          <span className="bp-pill">{items.length} {items.length===1?'punt':'punten'}</span>
        </div>
        <div className="bp-work-filters" aria-label="Filter de werkvoorraad">
          {([{group:'Alles',count:items.length},...groups] as const).map(({group,count})=>
            <button key={group} type="button" className="cms-button" aria-pressed={filter===group} onClick={()=>{setFilter(group);setExpanded(false);}}>
              {group} <span>{count}</span>
            </button>
          )}
        </div>
        {visible.length===0&&<div className="bp-work-empty"><Check size={20}/><span><strong>Je bent bij.</strong><small>Hier staan de punten waarvoor jouw rol aan zet is.</small></span></div>}
        {displayed.length>0&&<ul className="bp-work-list">
          {displayed.map(item=>{
            const Icon=groupIcons[item.group];
            return <li key={item.key}>
              <button type="button" className="bp-work-row" onClick={()=>navigate(item.target)}>
                <span className={'bp-work-icon '+item.tone}><Icon size={18}/></span>
                <span className="bp-work-copy">
                  <span className={'bp-work-step '+item.tone}>{item.step}{item.tone==='live'?' · live':''}</span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}{item.date&&<> · {formatBoardDate(item.date)}</>}</small>
                </span>
                <ArrowRight size={17} aria-hidden="true"/>
              </button>
            </li>;
          })}
        </ul>}
        {visible.length>6&&<button type="button" className="cms-button" onClick={()=>setExpanded(value=>!value)}>{expanded?'Minder tonen':'Alle '+visible.length+' punten tonen'}</button>}
      </section>

      <div className="bp-role-side bp-stack">
        <section className="bp-panel bp-stack">
          <div className="bp-panel-head"><div><span className="bp-overline">BESTUUR EN LEDEN</span><h2>Op de planning</h2></div></div>
          {meeting?<button type="button" className="bp-work-row bp-planning-row" onClick={()=>navigate({tab:'meetings',id:meeting.id,meetingSection:'agenda'})}>
            <span className="bp-work-icon blue"><CalendarDays size={18}/></span>
            <span className="bp-work-copy"><strong>{meeting.title}</strong><small>{formatBoardDate(meeting.date)} · {meeting.time} uur · {meeting.location}</small><span className="bp-pill">{meetingLabels[meeting.status]}</span></span>
            <ArrowRight size={17} aria-hidden="true"/>
          </button>:<p>Er is nog geen bestuursvergadering ingepland.</p>}
          {alv?<button type="button" className="bp-work-row bp-planning-row" onClick={()=>navigate({tab:'alv',id:alv.id,alvPane:alv.status==='draft'?'prep':'agenda'})}>
            <span className="bp-work-icon blue"><UsersRound size={18}/></span>
            <span className="bp-work-copy"><strong>{alv.title}</strong><small>{formatBoardDate(alv.date)} · {alv.time} uur · {alv.location}</small></span>
            <ArrowRight size={17} aria-hidden="true"/>
          </button>:<button type="button" className="cms-button" onClick={()=>navigate({tab:'alv'})}>Open ALV <ArrowRight size={16}/></button>}
        </section>
        <section className="bp-panel bp-stack">
          <div className="bp-panel-head"><div><span className="bp-overline">OVERDRACHT</span><h2>Samen aan de beurt</h2></div></div>
          <div className="bp-inset"><strong>{waiting===0?'Geen stukken in overdracht':waiting+' '+(waiting===1?'vergadering':'vergaderingen')+' bij de '+(chair?'secretaris':'voorzitter')}</strong>
            <p>{chair?'De secretaris dient de agenda en notulen in. Daarna verschijnen ze hier voor jouw beoordeling.':'Zodra de voorzitter een agenda of verslag beoordeelt, zie je de volgende stap bij de vergadering.'}</p>
          </div>
          <button type="button" className="cms-button" onClick={()=>navigate({tab:'meetings'})}>Alle vergaderingen <ArrowRight size={16}/></button>
        </section>
      </div>
    </div>
  </div>;
}

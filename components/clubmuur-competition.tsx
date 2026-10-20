'use client';
import {SportlinkMatchDialog} from './sportlink-match-dialog';

import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowRight,ArrowUpRight,CalendarDays,Check,ChevronLeft,ChevronRight,Clock3,LocateFixed,Pause,Play,RefreshCw,Trophy} from 'lucide-react';
import {useSportlink} from '@/hooks/use-sportlink';
import {useStandingsScroll} from '@/hooks/use-standings-scroll';
import type {FormResult,SportlinkMatch,SportlinkRound,SportlinkSide,SportlinkStanding} from '@/lib/sportlink-types';

const PAGE_SIZE=4;
const ROTATION_MS=10_000;
const formLabels:Record<FormResult,string>={W:'Winst',GL:'Gelijkspel',V:'Verlies'};

function dateLabel(value:string|null,options:Intl.DateTimeFormatOptions){
 if(!value)return '';
 const date=new Date(value);
 return Number.isNaN(date.valueOf())?'':new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',...options}).format(date);
}

/** Official logos retain their native proportions; unavailable logos get neutral initials. */
export function ClubLogo({team,className=''}:{team:SportlinkSide;className?:string}){
 const source=team.own?'/assets/logo.png':team.logoUrl;
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[source]);
 const initials=team.name.replace(/\b(sv|s\.v\.|vv|v\.v\.)\b/gi,'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
 return <span className={`cm-club-logo ${className}`} aria-hidden="true">{source&&!failed?<img src={source} alt="" width={40} height={40} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="cm-club-logo-fallback">{initials||'FC'}</span>}</span>;
}

function MatchItem({match,result,index,onOpen}:{match:SportlinkMatch;result:boolean;index:number;onOpen:()=>void}){
 const hasScore=result&&match.homeScore!==null&&match.awayScore!==null;
 const homeWon=hasScore&&match.homeScore!>match.awayScore!;
 const awayWon=hasScore&&match.awayScore!>match.homeScore!;
 const unusualStatus=/afgelast|uitgesteld|vervallen|geannuleerd|cancelled|postponed|gestaakt|onderbroken|niet gespeeld|uitgesloten|teruggetrokken/i.test(match.status);
 const fixtureStatus=result&&!hasScore?(match.status||'Uitslag volgt'):!result&&unusualStatus?match.status:null;
 const own=match.home.own||match.away.own;
 const day=dateLabel(match.kickoff,{weekday:'short',day:'numeric',month:'short'});
 const time=dateLabel(match.kickoff,{hour:'2-digit',minute:'2-digit'});
 return <li className="cm-fixture" data-own={own} data-status={!!fixtureStatus} style={{'--fixture-index':index} as CSSProperties}>
  <button type="button" className="cm-fixture-open" onClick={onOpen} aria-label={`Wedstrijddetails: ${match.home.name} tegen ${match.away.name}`}><span className="sr-only">Bekijk wedstrijd</span></button><div className="cm-fixture-meta"><span>{day||'Datum volgt'}</span>{own&&<span className="cm-fixture-ours">Ons eerste</span>}</div>
  <div className="cm-fixture-teams">
   <div className="cm-fixture-team" data-winner={homeWon}><ClubLogo team={match.home}/><span title={match.home.name}>{match.home.name}</span>{hasScore&&<b>{match.homeScore}</b>}</div>
   <div className="cm-fixture-team" data-winner={awayWon}><ClubLogo team={match.away}/><span title={match.away.name}>{match.away.name}</span>{hasScore&&<b>{match.awayScore}</b>}</div>
   {fixtureStatus?<span className="cm-fixture-status">{fixtureStatus}</span>:!result&&<span className="cm-fixture-time"><b>{time||'–'}</b><small>AFTRAP</small></span>}
  </div>
 </li>;
}

function RoundCard({round,result,animate}:{round:SportlinkRound;result:boolean;animate:boolean}){
 const [selected,setSelected]=useState<SportlinkMatch|null>(null);
 const [page,setPage]=useState(0);
 const [interacting,setInteracting]=useState(false);
 // Keep our first team on the opening page; the rest follows kickoff order.
 const orderedMatches=[...round.matches].sort((a,b)=>
  Number(b.home.own||b.away.own)-Number(a.home.own||a.away.own)
  ||new Date(a.kickoff).getTime()-new Date(b.kickoff).getTime()
  ||a.id.localeCompare(b.id,'nl',{numeric:true}));
 const pages=Math.max(1,Math.ceil(orderedMatches.length/PAGE_SIZE));
 const currentPage=Math.min(page,pages-1);
 const matchKey=orderedMatches.map(match=>match.id).join('|');
 useEffect(()=>setPage(0),[matchKey]);
 useEffect(()=>{
  if(!animate||interacting||pages<2)return;
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')setPage(current=>(current+1)%pages);},ROTATION_MS);
  return()=>window.clearInterval(timer);
 },[animate,interacting,pages,currentPage]);
 const visible=orderedMatches.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
 const title=result?'De uitslagen.':'Het programma.';
 const id=result?'cm-results-heading':'cm-program-heading';
 return <article className={`cm-competition-card cm-round-card ${result?'cm-round-results':'cm-round-program'}`} aria-labelledby={id} data-paused={!animate||interacting}
  onMouseEnter={()=>setInteracting(true)} onMouseLeave={()=>setInteracting(false)} onFocusCapture={()=>setInteracting(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setInteracting(false);}}>
  <div className="cm-competition-card-head"><div><span className="cm-card-eyebrow">{result?'VORIGE SPEELRONDE':'VOLGENDE SPEELRONDE'}</span><h3 id={id}>{title}</h3></div><span className="cm-competition-card-icon">{result?<Check size={19}/>:<CalendarDays size={19}/>}</span></div>
  <div className="cm-round-caption"><span>{round.label||'Competitie'}</span><span>{round.matches.length} {round.matches.length===1?'wedstrijd':'wedstrijden'}</span></div>
  {visible.length?<ol key={`${matchKey}-${currentPage}`} className="cm-fixtures" aria-label={`${result?'Uitslagen':'Programma'}, pagina ${currentPage+1} van ${pages}`}>{visible.map((match,index)=><MatchItem key={match.id} match={match} result={result} index={index} onOpen={()=>setSelected(match)}/>)}</ol>:<div className="cm-competition-empty"><CalendarDays size={28} strokeWidth={1.25}/><strong>{result?'Nog geen uitslagen':'Even geen wedstrijden'}</strong><p>{result?'Zodra er uitslagen beschikbaar zijn, staan ze hier.':'Het volgende programma verschijnt hier zodra het bekend is.'}</p></div>}
  <div className="cm-round-footer"><span>{pages>1?<><b>{String(currentPage+1).padStart(2,'0')}</b><span className="cm-page-divider">/</span>{String(pages).padStart(2,'0')}</>:<><span className="cm-round-small-dot"/>De hele poule</>}</span>{pages>1?<div className="cm-round-controls"><button type="button" onClick={()=>setPage(current=>(current-1+pages)%pages)} aria-label={`Vorige ${result?'uitslagen':'wedstrijden'}`}><ChevronLeft size={17}/></button><button type="button" onClick={()=>setPage(current=>(current+1)%pages)} aria-label={`Volgende ${result?'uitslagen':'wedstrijden'}`}><ChevronRight size={17}/></button></div>:<span className="cm-round-footer-label">{result?'AFGELOPEN':'VOORUITKIJKEN'}</span>}</div>
  {pages>1&&<span key={`progress-${currentPage}`} className="cm-round-progress" aria-hidden="true"/>}
 <SportlinkMatchDialog match={selected} onClose={()=>setSelected(null)}/></article>;
}

function Form({results}:{results:FormResult[]}){
 if(!results.length)return <span className="cm-form-unavailable" title="Nog geen vorm beschikbaar">–</span>;
 return <span className="cm-team-form" aria-label={results.map(value=>formLabels[value]).join(', ')}>{results.slice(-5).map((value,index)=><span key={index} data-result={value} title={formLabels[value]} aria-hidden="true">{value==='GL'?'G':value}</span>)}</span>;
}

function StandingRow({row}:{row:SportlinkStanding}){
 return <tr data-own={row.team.own}>
  <td className="cm-standing-rank">{row.rank}</td><td className="cm-standing-logo"><ClubLogo team={row.team}/></td><th scope="row"><span className="cm-standing-name" title={row.team.name}>{row.team.name}</span></th>
  <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td className="cm-standing-goals"><span title={`${row.goalsFor} doelpunten voor, ${row.goalsAgainst} tegen`}>{row.goalDifference>0?'+':''}{row.goalDifference}</span></td><td className="cm-standing-points">{row.points}</td><td><Form results={row.form}/></td>
 </tr>;
}

function StandingsCard({standings,label,animate}:{standings:SportlinkStanding[];label:string;animate:boolean}){
 const own=standings.find(row=>row.team.own);
 const rowKey=standings.map(row=>`${row.team.id}:${row.rank}:${row.team.own}`).join('|');
 const scroll=useStandingsScroll(rowKey,animate);
 return <article className="cm-competition-card cm-standings-card" aria-labelledby="cm-standings-heading">
  <div className="cm-competition-card-head"><div><span className="cm-card-eyebrow">{label||'ONZE COMPETITIE'}</span><h3 id="cm-standings-heading">Dit is onze plek.</h3></div><span className="cm-competition-card-icon"><Trophy size={20}/></span></div>
  <div className="cm-standing-context"><span>{own?<><b>#{own.rank}</b> Duindorp SV 1</>:'De ranglijst'}</span><span>{standings.length>5?'De hele poule · Duindorp in beeld':'De hele poule'}</span></div>
  {standings.length?<div className="cm-standings-scroll" ref={scroll.viewport} tabIndex={0} role="region" aria-label="Volledige competitiestand. Duindorp blijft zichtbaar tijdens het scrollen."
   onPointerEnter={event=>{if(event.pointerType==='mouse')scroll.setHovered(true);}} onPointerLeave={()=>scroll.setHovered(false)}
   onPointerDown={scroll.interact} onTouchMove={scroll.interact} onWheel={scroll.interact} onKeyDown={scroll.interact}
   onFocus={event=>scroll.setKeyboardFocus(event.currentTarget.matches(':focus-visible'))} onBlur={()=>scroll.setKeyboardFocus(false)}>
   <table className="cm-standings-table"><caption className="sr-only">Stand {label}. De volledige poule, met vijf rijen tegelijk in beeld en Duindorp blijvend zichtbaar.</caption><thead><tr><th scope="col"><span className="sr-only">Plek</span><span aria-hidden="true">#</span></th><th scope="col"><span className="sr-only">Logo</span></th><th scope="col" className="cm-standing-team-head">Team</th><th scope="col"><abbr title="Gespeeld">G</abbr></th><th scope="col"><abbr title="Gewonnen">W</abbr></th><th scope="col"><abbr title="Gelijkgespeeld">GL</abbr></th><th scope="col"><abbr title="Verloren">V</abbr></th><th scope="col"><abbr title="Doelsaldo">+/−</abbr></th><th scope="col"><abbr title="Punten">P</abbr></th><th scope="col">Vorm</th></tr></thead><tbody>{standings.map(row=><StandingRow key={row.team.id||row.team.name} row={row}/>)}</tbody></table>
  </div>:<div className="cm-competition-empty"><Trophy size={28} strokeWidth={1.25}/><strong>De stand volgt</strong><p>De actuele ranglijst verschijnt zodra deze beschikbaar is.</p></div>}
  {standings.length>0&&<div className="cm-standings-swipe">Veeg voor alle cijfers<ArrowRight size={11}/></div>}
  <div className="cm-standings-footer"><span className="cm-form-legend"><i data-result="W"/>Winst <i data-result="GL"/>Gelijk <i data-result="V"/>Verlies</span>{standings.length>5&&<div className="cm-standings-controls">{own&&<button type="button" onClick={scroll.reset} aria-label="Centreer de stand rond Duindorp"><LocateFixed size={13}/><span>Duindorp</span></button>}<button type="button" onClick={()=>scroll.setPaused(value=>!value)} aria-pressed={scroll.paused} aria-label={scroll.paused?'Stand automatisch scrollen':'Automatisch scrollen van de stand pauzeren'}>{scroll.paused?<Play size={13}/>:<Pause size={13}/>}</button></div>}</div>
 </article>;
}

export function ClubmuurCompetition(){
 const {data,loading,error,reload}=useSportlink();
 const section=useRef<HTMLElement>(null);
 const [inView,setInView]=useState(false);
 const [paused,setPaused]=useState(false);
 const [reducedMotion,setReducedMotion]=useState(true);
 useEffect(()=>{
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setReducedMotion(preference.matches);
  update();preference.addEventListener('change',update);
  const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.12});
  if(section.current)observer.observe(section.current);
  return()=>{preference.removeEventListener('change',update);observer.disconnect();};
 },[]);
 const animate=inView&&!paused&&!reducedMotion;
 const hasPages=!!data&&(data.standings.length>5||data.previousRound.matches.length>PAGE_SIZE||data.nextRound.matches.length>PAGE_SIZE);
 return <section className="cm-competition" id="clubmuur-eerste" aria-labelledby="cm-competition-heading" ref={section} data-in-view={inView}>
  <div className="cm-competition-inner">
   <header className="cm-competition-heading"><div><span className="cm-competition-eyebrow"><i/>DUINDORP SV 1</span><h2 id="cm-competition-heading">Ons eerste.{' '}<span>Onze trots.</span></h2></div><div className="cm-competition-heading-side"><span className="cm-competition-label">{data?.competition?.label||'Samen langs de lijn.'}</span><a href="/clubmuur/wedstrijden">Alle wedstrijden<ArrowUpRight size={16}/></a></div></header>
   {(data?.stale||data?.warning||(error&&data))&&<p className="cm-competition-notice" role="status"><Clock3 size={14}/>{data?.warning||'De verbinding wordt bijgewerkt. Je ziet de laatst beschikbare gegevens.'}</p>}
   {data?<div className="cm-competition-grid"><RoundCard round={data.previousRound} result animate={animate}/><StandingsCard standings={data.standings} label={data.competition?.label||''} animate={animate}/><RoundCard round={data.nextRound} result={false} animate={animate}/></div>:loading?<div className="cm-competition-loading" role="status" aria-label="Wedstrijdgegevens laden">{[0,1,2].map(item=><div key={item}><span/><span/><span/><span/></div>)}<span className="sr-only">Wedstrijdgegevens worden opgehaald.</span></div>:<div className="cm-competition-unavailable"><RefreshCw size={27} strokeWidth={1.25}/><h3>De bal ligt heel even stil.</h3><p>{error||'De wedstrijdgegevens zijn nog niet beschikbaar.'}</p><button type="button" onClick={reload}><RefreshCw size={14}/>Opnieuw proberen</button></div>}
   <footer className="cm-competition-source"><span>{data?<>Speelweken via Sportlink<span className="cm-source-separator">·</span>Bijgewerkt {dateLabel(data.updatedAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</>:'Programma, uitslagen en standen via Sportlink'}</span>{hasPages&&!reducedMotion&&<button type="button" onClick={()=>setPaused(value=>!value)} aria-pressed={paused}>{paused?<Play size={12}/>:<Pause size={12}/>}<span>{paused?'Afspelen':'Pauzeren'}</span></button>}</footer>
  </div>
 </section>;
}

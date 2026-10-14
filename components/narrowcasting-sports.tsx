'use client';

import {useEffect,useMemo,useState,type CSSProperties,type ReactNode} from 'react';
import {CalendarDays,Check,Clock3,MapPin,RefreshCw,Trophy} from 'lucide-react';
import {ClubLogo} from '@/components/clubmuur-competition';
import {useSportlink} from '@/hooks/use-sportlink';
import {useSportlinkTeam} from '@/hooks/use-sportlink-team';
import {defaultMatchFilters,filterSportlinkMatches} from '@/lib/sportlink-match-filters';
import type {NarrowcastSportsConfig} from '@/lib/narrowcasting-config';
import type {FormResult,SportlinkMatch,SportlinkSnapshot,SportlinkStanding} from '@/lib/sportlink-types';
import '../app/narrowcasting-sports.css';

const DEFAULT_CONFIG:NarrowcastSportsConfig={scope:'competition',teamIds:[],venue:'all',layout:'auto'};
const PAGE_MS=8_000;
// A slide continues reading its pages even when the playlist unmounts it between visits.
const pageMemory=new Map<string,{page:number;elapsed:number}>();
const formLabels:Record<FormResult,string>={W:'Winst',GL:'Gelijkspel',V:'Verlies'};
const unusualStatus=/afgelast|uitgesteld|vervallen|geannuleerd|cancelled|postponed|gestaakt|onderbroken|niet gespeeld|uitgesloten|teruggetrokken/i;
function dateLabel(value:string|null|undefined,options:Intl.DateTimeFormatOptions){
 if(!value)return '';const date=new Date(value);
 return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',...options}).format(date):'';
}
function usePages(key:string,count:number,playing:boolean){
 const [state,setState]=useState(()=>({key,...(pageMemory.get(key)||{page:0,elapsed:0})}));
 const [reducedMotion,setReducedMotion]=useState(true);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReducedMotion(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{
  const cached=pageMemory.get(key)||{page:0,elapsed:0};let current={page:cached.page%Math.max(1,count),elapsed:cached.elapsed};
  pageMemory.set(key,current);setState({key,...current});if(!playing||count<2)return;
  let last=performance.now();const timer=window.setInterval(()=>{const now=performance.now();const delta=Math.min(500,now-last);last=now;if(document.visibilityState!=='visible')return;const elapsed=current.elapsed+delta;current=elapsed>=PAGE_MS?{page:(current.page+1)%count,elapsed:0}:{...current,elapsed};pageMemory.set(key,current);setState({key,...current});},250);
  return()=>window.clearInterval(timer);
 },[key,count,playing]);
 const current=state.key===key?state:(pageMemory.get(key)||{page:0,elapsed:0});
 return {page:current.page%Math.max(1,count),progress:current.elapsed/PAGE_MS,reducedMotion};
}
function Empty({title,description,loading=false}:{title:string;description:string;loading?:boolean}){
 return <div className="ns-empty" role="status"><RefreshCw size={52} strokeWidth={1.3} className={loading?'ns-loading-icon':''}/><h3>{title}</h3><p>{description}</p></div>;
}
function Source({updatedAt,stale,warning,error}:{updatedAt?:string;stale?:boolean;warning?:string|null;error?:string|null}){
 const notice=warning||(stale||error?(updatedAt?'Verbinding wordt bijgewerkt. Je ziet de laatst beschikbare gegevens.':'Gegevens tijdelijk niet beschikbaar.'):'');
 return <footer className="ns-source"><span>Via Sportlink{updatedAt&&<> · Bijgewerkt {dateLabel(updatedAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</>}</span>{notice&&<span className="ns-source-notice" role="status"><Clock3 size={17}/>{notice}</span>}</footer>;
}
function CardHead({eyebrow,title,icon}:{eyebrow:string;title:string;icon:ReactNode}){
 return <header className="ns-card-head"><div><span className="ns-card-eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="ns-card-icon">{icon}</span></header>;
}
function PageFooter({page,pages,total,result=false,stand=false,progress,playing}:{page:number;pages:number;total:number;result?:boolean;stand?:boolean;progress:number;playing:boolean}){
 return <div className="ns-card-footer"><span className="ns-pagination"><b>{String(page+1).padStart(2,'0')}</b><i>/</i>{String(pages).padStart(2,'0')}<small>{total} {stand?'teams':total===1?'wedstrijd':'wedstrijden'}</small></span>{stand?<span className="ns-legend"><i data-result="W"/>Winst <i data-result="GL"/>Gelijk <i data-result="V"/>Verlies</span>:<span className="ns-footer-label">{result?'AFGELOPEN':'VOORUITKIJKEN'}</span>}{pages>1&&<span className="ns-page-progress" data-playing={playing} style={{transform:`scaleX(${progress})`}} aria-hidden="true"/>}</div>;
}
function Fixture({match,result,index,competition}:{match:SportlinkMatch;result:boolean;index:number;competition:boolean}){
 const hasScore=result&&match.homeScore!==null&&match.awayScore!==null;
 const status=result&&!hasScore?(match.status||'Uitslag volgt'):unusualStatus.test(match.status)?match.status:null;
 const own=match.home.own||match.away.own;
 const day=dateLabel(match.kickoff,{weekday:'short',day:'numeric',month:'short'});const time=dateLabel(match.kickoff,{hour:'2-digit',minute:'2-digit'});
 return <li className="ns-fixture" data-own={own} data-status={!!status} data-scored={hasScore} style={{'--ns-row-index':index} as CSSProperties}>
  <div className="ns-fixture-meta"><span>{day||'Datum volgt'}{match.competitionLabel&&<i> · {match.competitionLabel}</i>}</span>{own&&<span className="ns-fixture-ours">{competition?'Ons eerste':'Duindorp SV'}</span>}</div>
  <div className="ns-fixture-teams"><div className="ns-fixture-team ns-fixture-home" data-winner={hasScore&&match.homeScore!>match.awayScore!}><ClubLogo team={match.home}/><span>{match.home.name}</span>{hasScore&&<b className="ns-team-score">{match.homeScore}</b>}</div><div className="ns-fixture-middle">{status?<span className="ns-fixture-status">{status}</span>:hasScore?<strong className="ns-fixture-score">{match.homeScore}<i>–</i>{match.awayScore}<small>EINDSTAND</small></strong>:<span className="ns-fixture-time"><b>{time||'–'}</b><small>AFTRAP</small></span>}</div><div className="ns-fixture-team ns-fixture-away" data-winner={hasScore&&match.awayScore!>match.homeScore!}><ClubLogo team={match.away}/><span>{match.away.name}</span>{hasScore&&<b className="ns-team-score">{match.awayScore}</b>}</div></div>
  {match.venue&&<div className="ns-fixture-venue"><MapPin size={16}/>{match.venue}</div>}
 </li>;
}
function selectMatches(snapshot:SportlinkSnapshot,config:NarrowcastSportsConfig,result:boolean){
 if(config.scope==='competition')return [...(result?snapshot.previousRound.matches:snapshot.nextRound.matches)].filter(match=>config.venue==='all'||(config.venue==='home'?match.home.own:match.away.own)).sort((a,b)=>Number(b.home.own||b.away.own)-Number(a.home.own||a.away.own)||Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.id.localeCompare(b.id,'nl',{numeric:true}));
 const source=result?snapshot.results:snapshot.fixtures;
 if(config.scope==='teams'){
  const seen=new Map<string,SportlinkMatch>();config.teamIds.forEach(teamId=>filterSportlinkMatches(source,snapshot.teams,{...defaultMatchFilters,teamId,venue:config.venue},result?'desc':'asc').forEach(match=>seen.set(match.id,match)));
  return filterSportlinkMatches([...seen.values()],snapshot.teams,defaultMatchFilters,result?'desc':'asc');
 }
 return filterSportlinkMatches(source.filter(match=>match.home.own||match.away.own),snapshot.teams,{...defaultMatchFilters,venue:config.venue},result?'desc':'asc');
}
function RoundScreen({snapshot,config,result,portrait,playing,error}:{snapshot:SportlinkSnapshot;config:NarrowcastSportsConfig;result:boolean;portrait:boolean;playing:boolean;error:string|null}){
 const selected=useMemo(()=>selectMatches(snapshot,config,result),[snapshot,config,result]);
 const stacked=config.layout==='stacked'||(config.layout==='auto'&&portrait);
 const longRows=selected.some(match=>Math.max(match.home.name.length,match.away.name.length)>38||match.venue.length>70);
 const pageSize=portrait?(longRows?4:5):stacked?3:longRows?3:4;
 const pages=Math.max(1,Math.ceil(selected.length/pageSize));
 const key=`${result?'results':'fixtures'}:${portrait}:${config.scope}:${config.teamIds.join(',')}:${config.venue}:${selected.map(match=>match.id).join('|')}`;
 const rotation=usePages(key,pages,playing);const visible=selected.slice(rotation.page*pageSize,(rotation.page+1)*pageSize);const round=result?snapshot.previousRound:snapshot.nextRound;
 const teamNames=snapshot.teams.filter(team=>config.teamIds.includes(team.id)).map(team=>team.name);
 const teamLabel=teamNames.length>2?`${teamNames.slice(0,2).join(' · ')} · +${teamNames.length-2} teams`:teamNames.join(' · ');
 const selectionLabel=config.scope==='competition'?(round.label||snapshot.competition?.label||'Competitie'):config.scope==='teams'?(teamLabel||'Geselecteerde teams'):'De hele vereniging';
 const venueLabel=config.scope==='competition'?(config.venue==='home'?'Ons eerste · thuis':config.venue==='away'?'Ons eerste · uit':'De hele poule'):config.venue==='home'?'Beschikbare thuiswedstrijden':config.venue==='away'?'Beschikbare uitwedstrijden':'Beschikbare wedstrijden';
 return <div className="ns-data-screen"><section className={`ns-competition-card ns-round-card ${stacked?'ns-stacked':'ns-side-by-side'}`} data-motion={!rotation.reducedMotion} data-paused={!playing}><CardHead eyebrow={config.scope==='competition'?(result?'VORIGE SPEELRONDE':'VOLGENDE SPEELRONDE'):'ONZE WEDSTRIJDEN'} title={result?'De uitslagen.':'Het programma.'} icon={result?<Check size={37}/>:<CalendarDays size={37}/>}/><div className="ns-context"><span>{selectionLabel}</span><span>{venueLabel}</span></div>{visible.length?<ol className="ns-fixtures" key={`${key}:${rotation.page}`} aria-label={`${result?'Uitslagen':'Programma'}, pagina ${rotation.page+1} van ${pages}`}>{visible.map((match,index)=><Fixture key={match.id} match={match} result={result} index={index} competition={config.scope==='competition'}/>)}</ol>:<Empty title={result?'Nog geen uitslagen.':'Even geen wedstrijden.'} description={config.scope==='teams'&&!config.teamIds.length?'Selecteer een team voor dit scherm.':result?'Sportlink heeft voor deze selectie nog geen uitslagen aangeleverd.':'Het programma verschijnt zodra Sportlink wedstrijden voor deze selectie aanlevert.'}/>}<PageFooter page={rotation.page} pages={pages} total={selected.length} result={result} progress={rotation.progress} playing={playing}/></section><Source updatedAt={snapshot.updatedAt} stale={snapshot.stale} warning={snapshot.warning} error={error}/></div>;
}
function Form({results}:{results:FormResult[]}){
 return results.length?<span className="ns-form" aria-label={results.map(value=>formLabels[value]).join(', ')}>{results.slice(-5).map((value,index)=><span key={index} data-result={value}>{value==='GL'?'G':value}</span>)}</span>:<span className="ns-form-unavailable">–</span>;
}
function StandingRow({row,index}:{row:SportlinkStanding;index:number}){
 return <tr data-own={row.team.own} style={{'--ns-row-index':index} as CSSProperties}><td className="ns-standing-rank">{row.rank}</td><td className="ns-standing-logo"><ClubLogo team={row.team}/></td><th scope="row"><span>{row.team.name}</span></th><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td className="ns-standing-goals">{row.goalDifference>0?'+':''}{row.goalDifference}</td><td className="ns-standing-points">{row.points}</td><td className="ns-standing-form"><Form results={row.form}/></td></tr>;
}
function StandingsCard({standings,label,teamName,playing,identity,unavailable=false}:{standings:SportlinkStanding[];label:string;teamName:string;playing:boolean;identity:string;unavailable?:boolean}){
 const own=standings.find(row=>row.team.own);const ownIndex=standings.findIndex(row=>row.team.own);
 const windows=useMemo(()=>{
  if(!standings.length)return [[]] as SportlinkStanding[][];
  if(ownIndex<0)return Array.from({length:Math.ceil(standings.length/5)},(_,index)=>standings.slice(index*5,index*5+5));
  const ownStart=Math.max(0,Math.min(standings.length-5,ownIndex-2));
  const opening=standings.slice(ownStart,ownStart+5);
  const remaining=standings.filter((_,index)=>index!==ownIndex);
  const all=[opening,...Array.from({length:Math.ceil(remaining.length/4)},(_,index)=>[...remaining.slice(index*4,index*4+4),standings[ownIndex]].sort((a,b)=>standings.indexOf(a)-standings.indexOf(b)))];
  const seen=new Set<string>();return all.filter(rows=>{const key=rows.map(row=>`${row.rank}:${row.team.id}`).join('|');if(seen.has(key))return false;seen.add(key);return true;});
 },[standings,ownIndex]);
 const key=`stand:${identity}:${standings.map(row=>`${row.team.id}:${row.rank}`).join('|')}`;const rotation=usePages(key,windows.length,playing);
 return <section className="ns-competition-card ns-standings-card" data-motion={!rotation.reducedMotion} data-paused={!playing}><CardHead eyebrow={label||'ONZE COMPETITIE'} title="Dit is onze plek." icon={<Trophy size={38}/>}/><div className="ns-context ns-standing-context"><span>{own&&<b>#{own.rank}</b>}{teamName||own?.team.name||'De ranglijst'}</span><span>De hele poule · {standings.length} teams</span></div>{standings.length?<div className="ns-standings-viewport"><table className="ns-standings-table"><caption className="sr-only">Stand {label}. Alle cijfers, met vijf complete rijen per pagina.</caption><colgroup><col className="ns-col-rank"/><col className="ns-col-logo"/><col className="ns-col-team"/>{['g','w','gl','v'].map(col=><col className="ns-col-stat" key={col}/>)}<col className="ns-col-goals"/><col className="ns-col-points"/><col className="ns-col-form"/></colgroup><thead><tr><th scope="col">Plek</th><th scope="col"><span className="sr-only">Logo</span></th><th className="ns-team-head" scope="col">Team</th><th scope="col">G</th><th scope="col">W</th><th scope="col">GL</th><th scope="col">V</th><th scope="col">+/−</th><th scope="col">P</th><th scope="col">Vorm</th></tr></thead><tbody key={`${key}:${rotation.page}`}>{windows[rotation.page].map((row,index)=><StandingRow key={row.team.id||row.team.name} row={row} index={index}/>)}</tbody></table></div>:<Empty title={unavailable?'De stand is tijdelijk niet beschikbaar.':'De stand volgt.'} description={unavailable?'Sportlink kan de ranglijst voor dit team op dit moment niet aanleveren.':'De actuele ranglijst verschijnt zodra deze beschikbaar is.'}/>}<PageFooter page={rotation.page} pages={windows.length} total={standings.length} stand progress={rotation.progress} playing={playing}/></section>;
}
function TeamStandings({teamId,playing}:{teamId:string;playing:boolean}){
 const {data,loading,error}=useSportlinkTeam(teamId,'','');const pool=data?.pools.find(item=>item.id===data.selectedPoolId);
 return <div className="ns-data-screen">{data?<StandingsCard standings={data.standings} label={pool?.label||'Competitiestand'} teamName={data.team.name} playing={playing} identity={teamId} unavailable={data.availability.standings==='unavailable'}/>:<section className="ns-competition-card"><Empty loading={loading} title={loading?'De stand wordt opgehaald.':'De stand is tijdelijk niet beschikbaar.'} description={loading?'De actuele teamgegevens komen rechtstreeks van Sportlink.':error||'Sportlink heeft nog geen ranglijst voor dit team aangeleverd.'}/></section>}<Source updatedAt={data?.updatedAt} stale={data?.stale} warning={data?.warning} error={error}/></div>;
}
function Matchday({snapshot,error}:{snapshot:SportlinkSnapshot;error:string|null}){
 const candidate=snapshot.nextMatch;
 // A stale cached fixture must never become a past match labelled as the next one.
 const match=candidate&&(!Number.isFinite(Date.parse(candidate.kickoff))||Date.parse(candidate.kickoff)>=Date.now())?candidate:null;
 if(!match)return <div className="ns-data-screen"><section className="ns-competition-card"><CardHead eyebrow="DUINDORP SV 1" title="De volgende wedstrijd." icon={<CalendarDays size={38}/>}/><Empty title="De volgende wedstrijd volgt." description="De eerstvolgende uit- of thuiswedstrijd van ons eerste verschijnt zodra Sportlink deze aanlevert."/></section><Source updatedAt={snapshot.updatedAt} stale={snapshot.stale} warning={snapshot.warning} error={error}/></div>;
 const status=unusualStatus.test(match.status)?match.status:null;
 return <div className="ns-data-screen ns-matchday"><section className="ns-competition-card ns-next-match"><CardHead eyebrow="DUINDORP SV 1 · ZATERDAGVOETBAL" title="De volgende wedstrijd." icon={<CalendarDays size={38}/>}/><div className="ns-context"><span>{match.competitionLabel||snapshot.competition?.label||'Het eerste'}</span><span>{match.home.own?'THUISWEDSTRIJD':'UITWEDSTRIJD'}</span></div><div className="ns-match-content"><div className="ns-next-teams"><div className="ns-next-team"><ClubLogo team={match.home}/><h3>{match.home.name}</h3><span>THUIS</span></div><strong className="ns-next-vs">VS</strong><div className="ns-next-team"><ClubLogo team={match.away}/><h3>{match.away.name}</h3><span>UIT</span></div></div><div className="ns-next-kickoff"><span>{dateLabel(match.kickoff,{weekday:'long',day:'numeric',month:'long',year:'numeric'})||'Datum volgt'}</span>{status?<strong className="ns-next-status">{status}</strong>:<strong>{dateLabel(match.kickoff,{hour:'2-digit',minute:'2-digit'})||'Tijd volgt'}</strong>}<small><MapPin size={22}/>{match.venue||'Locatie volgt'}</small></div></div><div className="ns-match-slogan">ONZE CLUB. ONZE TROTS.</div></section><Source updatedAt={snapshot.updatedAt} stale={snapshot.stale} warning={snapshot.warning} error={error}/></div>;
}
export function SportsScreen({kind,portrait,config=DEFAULT_CONFIG,playing=true}:{kind:string;portrait:boolean;config?:NarrowcastSportsConfig;playing?:boolean}){
 const {data,loading,error}=useSportlink();let content:ReactNode;
 if(kind==='stand'&&config.scope!=='competition')content=config.teamIds[0]?<TeamStandings teamId={config.teamIds[0]} playing={playing}/>:<section className="ns-competition-card"><Empty title="Kies een team." description="Selecteer een team om de actuele competitiestand te tonen."/></section>;
 else if(!data)content=<section className="ns-competition-card"><Empty loading={loading} title={loading?'De wedstrijdgegevens worden opgehaald.':'Wedstrijdgegevens niet beschikbaar.'} description={loading?'Programma, uitslagen en standen komen rechtstreeks van Sportlink.':error||'De wedstrijdgegevens zijn tijdelijk niet beschikbaar.'}/></section>;
 else if(kind==='wedstrijd')content=<Matchday snapshot={data} error={error}/>;
 else if(kind==='stand')content=<div className="ns-data-screen"><StandingsCard standings={data.standings} label={data.competition?.label||''} teamName={data.firstTeam?.name||'Duindorp SV 1'} playing={playing} identity="first-team"/><Source updatedAt={data.updatedAt} stale={data.stale} warning={data.warning} error={error}/></div>;
 else content=<RoundScreen snapshot={data} config={config} result={kind==='uitslagen'} portrait={portrait} playing={playing} error={error}/>;
 return <div className={`ns-sports ns-${kind}${portrait?' portrait':''}`} data-playing={playing}>{content}</div>;
}

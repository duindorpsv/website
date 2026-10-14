'use client';

import {useEffect,useMemo,useState} from 'react';
import type {CSSProperties} from 'react';
import {ArrowRight,CalendarDays,ChevronRight,Download,MapPin,RefreshCw,Search,ShieldCheck,Trophy,Users} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {ClubLogo} from '@/components/clubmuur-competition';
import {useSportlink} from '@/hooks/use-sportlink';
import type {SportlinkMatch,SportlinkTeam} from '@/lib/sportlink-types';
import {SportlinkMatchFilters} from '@/components/sportlink-match-filters';
import {defaultMatchFilters,filterSportlinkMatches,validateDateRange,type MatchFilters} from '@/lib/sportlink-match-filters';

const dateOptions={timeZone:'Europe/Amsterdam'} as const;
const dateTime=new Intl.DateTimeFormat('nl-NL',{...dateOptions,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const time=new Intl.DateTimeFormat('nl-NL',{...dateOptions,hour:'2-digit',minute:'2-digit'});
const day=new Intl.DateTimeFormat('nl-NL',{...dateOptions,weekday:'long',day:'numeric',month:'long'});

function validDate(value:string){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?null:parsed;}
function matchScore(match:SportlinkMatch){return match.homeScore!==null&&match.awayScore!==null?`${match.homeScore} – ${match.awayScore}`:match.scoreLabel;}
function kickoffTime(match:SportlinkMatch){const date=validDate(match.kickoff);return date?time.format(date):'–';}
function groupByDay(matches:SportlinkMatch[]){
  const groups=new Map<string,{label:string;matches:SportlinkMatch[]}>();
  for(const match of matches){const date=validDate(match.kickoff);const key=date?new Intl.DateTimeFormat('en-CA',dateOptions).format(date):'unknown';const current=groups.get(key)||{label:date?day.format(date):'Datum volgt',matches:[]};current.matches.push(match);groups.set(key,current);}
  return [...groups.entries()];
}

function DataStatus(){
  const {data,loading,error,reload}=useSportlink();
  const updated=data&&validDate(data.updatedAt);
  return <div className="sl-data-status" role="status"><ShieldCheck size={15}/><span>{loading?'Wedstrijdgegevens ophalen…':error&&!data?'De wedstrijdgegevens zijn tijdelijk niet beschikbaar.':data?.stale?'Laatst beschikbare wedstrijdgegevens':'Clubgegevens via Sportlink'}{updated&&<small>Bijgewerkt {new Intl.DateTimeFormat('nl-NL',{...dateOptions,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(updated)}</small>}</span>{(error||data?.stale)&&<button onClick={()=>reload()} disabled={loading}><RefreshCw size={14}/>Opnieuw laden</button>}</div>;
}

function EmptyState({title,description}:{title:string;description:string}){return <div className="sl-empty"><CalendarDays size={30}/><h2>{title}</h2><p>{description}</p></div>;}

export function SportlinkTeamsPage(){
  const {data,loading}=useSportlink();
  const [category,setCategory]=useState('all');
  const [query,setQuery]=useState('');
  const teams=data?.teams||[];
  const categories=[...new Set(teams.map(team=>team.category).filter(Boolean))];
  const shown=teams.filter(team=>(category==='all'||team.category===category)&&team.name.toLocaleLowerCase('nl').includes(query.trim().toLocaleLowerCase('nl')));
  return <main className="sl-page"><div className="sl-page-inner"><header className="sl-page-heading"><div><span className="sl-eyebrow">ELKE GENERATIE. DEZELFDE KLEUREN.</span><h1>ONZE TEAMS.<br/><span>ÉÉN DUINDORP.</span></h1><p>Van de eerste aftrap tot de laatste minuut. Vind je team en bekijk het programma.</p></div><div className="sl-team-total"><Users size={22}/><strong>{loading&&!data?'–':teams.length}</strong><span>teams · één club</span></div></header><div className="sl-team-page-links"><a href="/clubmuur/teams/trainingen">Trainingen <ArrowRight size={15}/></a><a href="/clubmuur/teams/walking-football">Walking Football <ArrowRight size={15}/></a><a href="/clubmuur/club/jeugdorganisatie">Jeugd & begeleiding <ArrowRight size={15}/></a></div><div className="sl-team-toolbar"><div className="sl-category-filters" aria-label="Teamcategorie"><button aria-pressed={category==='all'} onClick={()=>setCategory('all')}>Alle teams <span>{teams.length}</span></button>{categories.map(value=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{value}<span>{teams.filter(team=>team.category===value).length}</span></button>)}</div><label className="sl-search"><Search size={17}/><span className="sr-only">Zoek een team</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Zoek je team" type="search"/></label></div><DataStatus/>{loading&&!data?<div className="sl-team-grid" aria-label="Teams worden geladen">{Array.from({length:6},(_,index)=><div className="sl-team-skeleton" key={index}/>)}</div>:shown.length?<div className="sl-team-grid">{shown.map((team,index)=><TeamCard team={team} key={team.id} index={index}/>)}</div>:<EmptyState title={teams.length?'Geen teams gevonden.':'Teams volgen binnenkort.'} description={teams.length?'Probeer een andere naam of categorie.':'Er zijn op dit moment geen teamgegevens beschikbaar.'}/>}</div></main>;
}

function TeamCard({team,index}:{team:SportlinkTeam;index:number}){
  return <a className="sl-team-card" href={`/clubmuur/teams/${encodeURIComponent(team.id)}`} style={{'--sl-delay':`${Math.min(index,8)*35}ms`} as CSSProperties}><div className="sl-team-card-top"><img src="/assets/logo.png" alt="" width={52} height={59} loading="lazy"/><span>{team.category||'Duindorp SV'}{team.day&&<small>{team.day}</small>}</span><ArrowRight size={20}/></div><h2>{team.name}</h2><div className="sl-team-competitions">{team.competitions.length?team.competitions.map(competition=><span key={competition.id}><Trophy size={13}/><span>{competition.label}{competition.type&&<small>{competition.type}</small>}</span></span>):<p>Nog geen competitie beschikbaar</p>}</div><span className="sl-team-card-link">Ontdek dit team <ChevronRight size={16}/></span></a>;
}

export function SportlinkTeamsStrip(){
  const {data}=useSportlink();
  const teams=data?.teams||[];
  const featured=[...(data?.firstTeam?[data.firstTeam]:[]),...teams.filter(team=>team.id!==data?.firstTeam?.id)].slice(0,4);
  return <section className="sl-team-strip" aria-labelledby="sl-team-strip-title"><div className="sl-team-strip-inner"><div className="sl-team-strip-copy"><span className="sl-eyebrow">DEZELFDE KLEUREN. ELKE GENERATIE.</span><h2 id="sl-team-strip-title">Jouw team.<br/>Onze club.</h2><p>Ontdek onze teams, de komende wedstrijden en de laatste uitslagen.</p><a href="/clubmuur/teams">Bekijk alle {teams.length?`${teams.length} `:''}teams <ArrowRight size={17}/></a></div><div className="sl-team-strip-links">{featured.map(team=><a href={`/clubmuur/teams/${encodeURIComponent(team.id)}`} key={team.id}><img src="/assets/logo.png" alt="" width={31} height={35} loading="lazy"/><span><small>{team.category||'Duindorp SV'}</small><strong>{team.name}</strong></span><ChevronRight size={17}/></a>)}{!featured.length&&<a className="sl-team-strip-all" href="/clubmuur/teams"><Users size={23}/><span><small>DUINDORP SV</small><strong>Vind jouw team</strong></span><ChevronRight size={17}/></a>}</div><div className="sl-team-strip-art"><img src="/assets/team.png" alt="Samen op het veld bij Duindorp SV" loading="lazy"/></div></div></section>;
}

const filterParams={teamId:'team',venue:'locatie',dateFrom:'van',dateTo:'tot',category:'categorie',competition:'competitie',query:'zoek'} as const;

export function SportlinkMatchesPage(){
  const {data,loading,error}=useSportlink();
  const [tab,setTab]=useState<'programma'|'uitslagen'>('programma');
  const [filters,setFilters]=useState<MatchFilters>({...defaultMatchFilters});
  const [sort,setSort]=useState<'asc'|'desc'>('asc');
  const [selected,setSelected]=useState<SportlinkMatch|null>(null);
  useEffect(()=>{
    const sync=()=>{
      const params=new URLSearchParams(window.location.search);
      const mode=window.location.hash==='#uitslagen'?'uitslagen':'programma';
      const venue=params.get('locatie');
      setTab(mode);
      setFilters({
        teamId:params.get('team')||'all',venue:venue==='home'||venue==='away'?venue:'all',
        dateFrom:/^\d{4}-\d{2}-\d{2}$/.test(params.get('van')||'')?params.get('van')!:'',
        dateTo:/^\d{4}-\d{2}-\d{2}$/.test(params.get('tot')||'')?params.get('tot')!:'',
        category:params.get('categorie')||'all',competition:params.get('competitie')||'all',query:params.get('zoek')||'',
      });
      const direction=params.get('volgorde');
      setSort(direction==='asc'||direction==='desc'?direction:mode==='programma'?'asc':'desc');
    };
    sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
    return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
  },[]);
  const teams=data?.teams||[];
  const selectedTeam=teams.find(team=>team.id===filters.teamId);
  const source=(tab==='programma'?data?.fixtures:data?.results)||[];
  const matches=useMemo(()=>filterSportlinkMatches(source,teams,filters,sort),[source,teams,filters,sort]);
  const competitions=[...new Set(source.map(match=>match.competitionLabel).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nl'));
  const groups=groupByDay(matches);
  const dateError=validateDateRange(filters);
  const hasFilters=Object.entries(defaultMatchFilters).some(([key,value])=>filters[key as keyof MatchFilters]!==value);
  function updateUrl(next:MatchFilters,direction=sort,mode=tab){
    const url=new URL(window.location.href);
    for(const [key,param] of Object.entries(filterParams)){
      const value=next[key as keyof MatchFilters];
      if(value===defaultMatchFilters[key as keyof MatchFilters])url.searchParams.delete(param);else url.searchParams.set(param,value);
    }
    if(direction===(mode==='programma'?'asc':'desc'))url.searchParams.delete('volgorde');else url.searchParams.set('volgorde',direction);
    url.hash=mode==='uitslagen'?'uitslagen':'';
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  function changeFilters(patch:Partial<MatchFilters>){const next={...filters,...patch};setFilters(next);updateUrl(next);}
  function resetFilters(){const next={...defaultMatchFilters};setFilters(next);updateUrl(next);}
  function changeSort(direction:'asc'|'desc'){setSort(direction);updateUrl(filters,direction);}
  function selectTab(mode:'programma'|'uitslagen'){const direction=mode==='programma'?'asc':'desc';setTab(mode);setSort(direction);updateUrl(filters,direction,mode);}
  return <main className="sl-page sl-matches-page"><div className="sl-page-inner">
    <header className="sl-page-heading"><div><span className="sl-eyebrow">ELKE WEDSTRIJD TELT</span><h1>HET<br/><span>WEDSTRIJDCENTRUM.</span></h1><p>Jouw team. Jouw zaterdag. Vind de aftrap, de uitslag en de weg naar het veld.</p></div><a className="sl-back-teams" href="/clubmuur/teams"><Users size={17}/>Ontdek onze teams <ArrowRight size={17}/></a></header>
    <div className="sl-match-overview"><div className="sl-view-switch" aria-label="Wedstrijdoverzicht"><button aria-pressed={tab==='programma'} onClick={()=>selectTab('programma')}><CalendarDays size={16}/>Programma</button><button aria-pressed={tab==='uitslagen'} onClick={()=>selectTab('uitslagen')}><Trophy size={16}/>Uitslagen</button></div><span>Alle teams. Eén club.</span></div>
    <SportlinkMatchFilters filters={filters} teams={teams} competitions={competitions} sort={sort} onChange={changeFilters} onSort={changeSort} onReset={resetFilters} mode={tab}/>
    <DataStatus/>
    <div className="sl-match-summary"><h2>{selectedTeam?.name||(filters.teamId!=='all'?'Geselecteerd team':'Alle teams')}</h2><span role="status" aria-live="polite" aria-atomic="true">{loading&&!data?'Wedstrijden laden…':dateError?'Controleer je datumbereik':`${matches.length} ${matches.length===1?'wedstrijd':'wedstrijden'}${hasFilters?' in je selectie':''}`}</span></div>
    {loading&&!data?<div className="sl-fixtures-loading" role="status">Het wedstrijdprogramma wordt opgehaald…</div>:groups.length?<div className="sl-date-groups" key={tab}>{groups.map(([key,group])=><section className="sl-date-group" key={key}><h3><CalendarDays size={16}/>{group.label}</h3><div>{group.matches.map((match,index)=><button type="button" className="sl-fixture" key={match.id} onClick={()=>setSelected(match)} style={{'--sl-delay':`${Math.min(index,7)*35}ms`} as CSSProperties} aria-label={`Wedstrijddetails: ${match.home.name} tegen ${match.away.name}`}><span className="sl-fixture-meta">{match.competitionLabel||'Wedstrijd'}{match.status&&<small>{match.status}</small>}</span><span className="sl-fixture-home"><span>{match.home.name}</span><ClubLogo team={match.home}/></span><strong className={`sl-fixture-score${matchScore(match)?' sl-played':''}`}>{matchScore(match)||kickoffTime(match)}<small>{matchScore(match)?'EINDSTAND':'AFTRAP'}</small></strong><span className="sl-fixture-away"><ClubLogo team={match.away}/><span>{match.away.name}</span></span><span className="sl-fixture-location"><MapPin size={14}/>{match.venue||'Locatie volgt'}</span><ChevronRight size={18} className="sl-fixture-arrow"/></button>)}</div></section>)}</div>:<div className="sl-filter-empty"><EmptyState title={dateError?'Pas je datums aan.':error&&!data?'Even geen verbinding.':hasFilters?'Geen wedstrijden in deze selectie.':tab==='programma'?'Nog geen wedstrijden op het programma.':'Nog geen uitslagen beschikbaar.'} description={dateError?dateError:error&&!data?'De Sportlink-gegevens kunnen op dit moment niet worden opgehaald. Probeer opnieuw via de knop hierboven.':hasFilters?'Probeer een ruimere periode, een ander team of wis je filters.':'Sportlink heeft op dit moment geen wedstrijden voor dit overzicht aangeleverd.'}/>{hasFilters&&!dateError&&<button className="sl-filter-empty-reset" onClick={resetFilters}>Toon alle beschikbare wedstrijden <ArrowRight size={15}/></button>}</div>}
    <p className="sl-filter-coverage">Je filtert het beschikbare Sportlink-programma (6 weken) en de recente uitslagen (8 weken). Datums zijn inclusief en in Nederlandse tijd.</p>
    <SportlinkMatchDialog match={selected} onClose={()=>setSelected(null)}/>
  </div></main>;
}

function escapeCalendar(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function calendarDate(date:Date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function foldCalendarLine(line:string){const encoder=new TextEncoder();let current='';const lines:string[]=[];for(const char of line){if(encoder.encode(current+char).length>74){lines.push(current);current=' ';}current+=char;}lines.push(current);return lines.join('\r\n');}
function downloadMatchCalendar(match:SportlinkMatch){
  const date=validDate(match.kickoff);if(!date)return;
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Duindorp SV//Wedstrijdkalender//NL','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${escapeCalendar(match.id)}@duindorpsv.nl`,`DTSTAMP:${calendarDate(new Date())}`,`DTSTART:${calendarDate(date)}`,`SUMMARY:${escapeCalendar(`${match.home.name} – ${match.away.name}`)}`,`DESCRIPTION:${escapeCalendar([match.competitionLabel,'Wedstrijdgegevens via Sportlink. Controleer het programma voor eventuele wijzigingen.'].filter(Boolean).join('\n'))}`,...(match.venue?[`LOCATION:${escapeCalendar(match.venue)}`]:[]),'END:VEVENT','END:VCALENDAR'];
  const url=URL.createObjectURL(new Blob([lines.map(foldCalendarLine).join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`duindorp-wedstrijd-${match.id.replace(/[^a-z0-9-]/gi,'-')}.ics`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function SportlinkMatchDialog({match,onClose}:{match:SportlinkMatch|null;onClose:()=>void}){
  const kickoff=match&&validDate(match.kickoff);
  const canSave=match&&kickoff&&kickoff.getTime()>Date.now()&&!matchScore(match)&&!/afgelast|geannuleerd|uitgesteld|gestaakt/i.test(match.status);
  return <Dialog open={!!match} onOpenChange={open=>!open&&onClose()}><DialogContent className="club-dialog sl-match-dialog">{match&&<><DialogHeader><span className="sl-eyebrow">{match.competitionLabel||'DUINDORP SV · WEDSTRIJD'}</span><DialogTitle>Onze kleuren. Jouw wedstrijd.</DialogTitle><DialogDescription>{kickoff?dateTime.format(kickoff):'De speeldatum volgt.'}</DialogDescription></DialogHeader><div className="sl-dialog-clubs"><div><ClubLogo team={match.home}/><strong>{match.home.name}</strong></div><div className="sl-dialog-score"><strong>{matchScore(match)||kickoffTime(match)}</strong><small>{matchScore(match)?'EINDSTAND':'AFTRAP'}</small></div><div><ClubLogo team={match.away}/><strong>{match.away.name}</strong></div></div><div className="sl-dialog-details"><p><MapPin size={18}/><span>{match.venue||'De locatie is nog niet doorgegeven.'}</span></p>{match.status&&<p><ShieldCheck size={18}/><span>{match.status}</span></p>}{match.competitionLabel&&<p><Trophy size={18}/><span>{match.competitionLabel}</span></p>}</div>{canSave&&<button className="sl-calendar-button" onClick={()=>downloadMatchCalendar(match)}><Download size={17}/>Bewaar in mijn agenda</button>}<p className="sl-dialog-note">Wedstrijdgegevens via Sportlink. Aanvangstijden en locaties kunnen wijzigen.</p></>}</DialogContent></Dialog>;
}

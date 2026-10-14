'use client';

import {useEffect,useState,type KeyboardEvent} from 'react';
import {ArrowRight,ArrowUpRight,CalendarDays,ChevronRight,Clock3,Info,LoaderCircle,MapPin,Newspaper,RefreshCw,ShieldCheck,Trophy,UserRound,Users} from 'lucide-react';
import {ClubPageFrame,PageSectionHeading,PageNotice} from '@/components/clubmuur-page-kit';
import {ClubLogo} from '@/components/clubmuur-competition';
import {SportlinkMatchDialog} from '@/components/sportlink-pages';
import {useSportlink} from '@/hooks/use-sportlink';
import {useSportlinkTeam} from '@/hooks/use-sportlink-team';
import {trainingForTeam} from '@/lib/clubmuur-training';
import {reportsForTeam} from '@/lib/clubmuur-team-content';
import type {SportlinkMatch,SportlinkStanding} from '@/lib/sportlink-types';
import type {SportlinkTeamDetail,TeamAvailability,TeamPlayer} from '@/lib/sportlink-team-types';

const dateFormat=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'short',day:'numeric',month:'short'});
const timeFormat=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
const updateFormat=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function dateLabel(value:string,formatter=dateFormat){const date=new Date(value);return Number.isFinite(date.getTime())?formatter.format(date):'';}
const tabs=[{id:'overzicht',label:'Overzicht'},{id:'programma',label:'Programma'},{id:'uitslagen',label:'Uitslagen'},{id:'stand',label:'Stand'},{id:'verslagen',label:'Verslagen'},{id:'spelers',label:'Spelers & staf'}] as const;
type Tab=typeof tabs[number]['id'];

function Empty({kind,unavailable=false}:{kind:'fixtures'|'results'|'standings'|'players'|'reports';unavailable?:boolean}){
 const labels={fixtures:['De volgende aftrap volgt.','Er zijn nog geen wedstrijden gepubliceerd voor deze poule.'],results:['De uitslagen volgen.','Er zijn nog geen uitslagen gepubliceerd voor deze poule.'],standings:['Nog geen ranglijst.','Voor deze poule is geen openbare stand beschikbaar. Bij sommige jeugdcompetities wordt geen ranglijst gepubliceerd.'],players:['De selectie volgt.','Er zijn voor dit seizoen nog geen openbare spelersgegevens beschikbaar.'],reports:['Het volgende verhaal volgt.','Voor dit team is nog geen wedstrijdverslag beschikbaar in dit seizoen.']} as const;
 return <div className="tp-empty td-empty"><Info size={25}/><h3>{unavailable?'Even niet beschikbaar.':labels[kind][0]}</h3><p>{unavailable?'Deze gegevens konden nu niet worden opgehaald. De andere onderdelen van je team blijven beschikbaar.':labels[kind][1]}</p></div>;
}

function Matches({matches,availability,onSelect,results=false}:{matches:SportlinkMatch[];availability:TeamAvailability;onSelect:(match:SportlinkMatch)=>void;results?:boolean}){
 const [limit,setLimit]=useState(8);
 if(!matches.length)return <Empty kind={results?'results':'fixtures'} unavailable={availability==='unavailable'}/>;
 return <><div className="tp-match-list">{matches.slice(0,limit).map(match=>{
  const scored=match.homeScore!==null&&match.awayScore!==null;
  const cancelled=/afgelast|uitgesteld|vervallen|geannuleerd/i.test(match.status);
  const unusual=match.status&&!/^(te spelen|vastgesteld|gepland|gespeeld|uitgespeeld|eindstand)$/i.test(match.status);
  const central=cancelled?match.status:scored?`${match.homeScore} – ${match.awayScore}`:match.scoreLabel||(results?'—':dateLabel(match.kickoff,timeFormat)||'—');
  return <button key={match.id} type="button" className="tp-match" onClick={()=>onSelect(match)} aria-label={`Bekijk ${match.home.name} tegen ${match.away.name}`}>
   <span className="tp-match-date"><CalendarDays size={14}/>{dateLabel(match.kickoff)||'Datum volgt'}<small>{match.home.own?'THUIS':'UIT'}{unusual&&` · ${match.status}`}</small></span>
   <span className="tp-match-teams"><span className="tp-match-home"><ClubLogo team={match.home}/><span>{match.home.name}</span></span><strong data-status={cancelled}>{central}<small>{cancelled?'STATUS':scored?'UITSLAG':results?'UITSLAG VOLGT':'AFTRAP'}</small></strong><span className="tp-match-away"><ClubLogo team={match.away}/><span>{match.away.name}</span></span></span>
   <span className="tp-match-venue"><MapPin size={13}/>{match.venue||'Locatie volgt'}<ChevronRight size={17}/></span>
  </button>;
 })}</div>{limit<matches.length&&<button className="cp-button cp-button-secondary td-show-more" onClick={()=>setLimit(value=>value+8)}>Meer {results?'uitslagen':'wedstrijden'} ({matches.length-limit}) <ArrowRight size={16}/></button>}</>;
}

function Standings({rows,availability,label}:{rows:SportlinkStanding[];availability:TeamAvailability;label:string}){
 if(!rows.length)return <Empty kind="standings" unavailable={availability==='unavailable'}/>;
 return <div className="td-table-card"><div className="td-table-scroll" role="region" aria-label={`Stand ${label}, horizontaal scrollbaar`} tabIndex={0}><table className="td-table"><caption className="sr-only">Stand van {label}</caption><thead><tr><th scope="col">#</th><th scope="col" colSpan={2}>Team</th><th scope="col"><abbr title="Gespeeld">G</abbr></th><th scope="col"><abbr title="Gewonnen">W</abbr></th><th scope="col"><abbr title="Gelijk">GL</abbr></th><th scope="col"><abbr title="Verloren">V</abbr></th><th scope="col"><abbr title="Doelsaldo">+/−</abbr></th><th scope="col"><abbr title="Punten">Ptn</abbr></th><th scope="col">Vorm</th></tr></thead><tbody>{rows.map(row=><tr key={`${row.team.id}-${row.rank}`} data-own={row.team.own}>
  <td className="td-rank">{row.rank}</td><td className="td-logo"><ClubLogo team={row.team}/></td><th scope="row">{row.team.name}{row.team.own&&<span className="sr-only"> — ons team</span>}</th><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td><span title={`${row.goalsFor} voor, ${row.goalsAgainst} tegen`}>{row.goalDifference>0?'+':''}{row.goalDifference}</span></td><td className="td-points">{row.points}</td><td><span className="td-form" aria-label={row.form.length?row.form.map(value=>value==='W'?'Winst':value==='GL'?'Gelijkspel':'Verlies').join(', '):'Nog geen vorm beschikbaar'}>{row.form.length?row.form.slice(-5).map((value,index)=><span key={index} data-result={value} aria-hidden="true">{value==='GL'?'G':value}</span>):'—'}</span></td>
 </tr>)}</tbody></table></div><div className="td-table-foot"><span>Vorm: laatste 5 beschikbare wedstrijden · nieuwste rechts</span><span>Veeg voor alle cijfers <ArrowRight size={14}/></span></div></div>;
}

function PersonCard({person}:{person:TeamPlayer}){
 const [photoFailed,setPhotoFailed]=useState(false);
 return <article className="td-person"><div className="td-person-photo">{person.photoUrl&&!photoFailed?<img src={person.photoUrl} alt={person.name} loading="lazy" decoding="async" width={360} height={420} onError={()=>setPhotoFailed(true)}/>:<><UserRound size={66} strokeWidth={1}/><span>DUINDORP SV</span></>}<img className="td-person-crest" src="/assets/logo.png" alt="" width={32} height={38}/></div><div className="td-person-caption"><h3>{person.name}</h3><p>{person.function||person.role||(person.kind==='staff'?'Begeleiding':'Speler')}</p></div></article>;
}

function TeamPhoto({url,name}:{url:string;name:string}){
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 return <figure className="td-official-photo"><img src={url} alt={`Teamfoto van ${name}`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/><figcaption><span>ONZE CLUB. ONZE TROTS.</span><small>Teamfoto via Sportlink</small></figcaption></figure>;
}

function TeamDetail({teamId}:{teamId:string}){
 const club=useSportlink();
 const [season,setSeason]=useState('');
 const [pool,setPool]=useState('');
 const [tab,setTab]=useState<Tab>('overzicht');
 const [selected,setSelected]=useState<SportlinkMatch|null>(null);
 const [catalog,setCatalog]=useState<SportlinkTeamDetail|null>(null);
 const detail=useSportlinkTeam(teamId,season,pool);
 const data=detail.data;
 useEffect(()=>{if(data)setCatalog(data);},[data]);
 const team=data?.team||catalog?.team||club.data?.teams.find(item=>item.id===teamId);
 const selectedSeason=season||data?.selectedSeasonId||catalog?.selectedSeasonId||'';
 const selectedPool=pool||data?.selectedPoolId||(!detail.loading&&catalog?.selectedSeasonId===selectedSeason?catalog?.selectedPoolId:null)||'';
 const choices=data||catalog;
 const pools=choices?.pools.filter(item=>item.seasonId===selectedSeason)||[];
 const competition=pools.find(item=>item.id===selectedPool);
 const training=team?trainingForTeam(team):[];
 const ownStanding=data?.standings.find(row=>row.team.own);
 const reports=team?reportsForTeam(team,selectedSeason):[];
 const nextFixtures=data?.fixtures.filter(match=>new Date(match.kickoff).getTime()>=Date.now()&&!/afgelast|uitgesteld|vervallen|geannuleerd/i.test(match.status))||[];
 const players=data?.players.filter(person=>person.kind==='player')||[];
 const staff=data?.players.filter(person=>person.kind==='staff')||[];
 const isBusy=detail.loading&&!data;
 function tabKey(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next===null)return;event.preventDefault();setTab(tabs[next].id);document.getElementById(`td-tab-${tabs[next].id}`)?.focus();
 }
 if(!team)return <ClubPageFrame title="Jouw team." accent="Samen voor blauw-wit." kicker="ONZE TEAMS" intro="Het programma, de uitslagen en de mensen achter jouw team." group="teams"><div className="tp-empty" role="status">{detail.loading?<LoaderCircle className="td-spin" size={28}/>:<Users size={28}/>}<h2>{detail.loading?'We halen je team erbij.':'Teamgegevens niet beschikbaar.'}</h2><p>{detail.loading?'Een moment, we verzamelen de actuele teaminformatie.':detail.error||'Dit team is niet gevonden in het teamoverzicht.'}</p>{!detail.loading&&<div className="cp-actions"><button className="cp-button" onClick={detail.reload}>Opnieuw proberen</button><a className="cp-button cp-button-secondary" href="/clubmuur/teams">Alle teams <ArrowRight size={16}/></a></div>}</div></ClubPageFrame>;
 return <ClubPageFrame title={team.name} accent="Samen voor blauw-wit." kicker={`${team.category||'ONZE TEAMS'}${team.day?` · ${team.day}`:''}`} intro="De volgende aftrap. Het laatste resultaat. De mensen die onze kleuren dragen. Alles van jouw team, bij elkaar." group="teams">
  <section className="td-team-banner"><div><img src="/assets/logo.png" alt="" width={66} height={78}/><span><span className="td-overline">ONZE CLUB. JOUW TEAM.</span><h2>{team.name}</h2><p>{[team.category,team.day,team.sport].filter(Boolean).join(' · ')}</p></span></div><a href={`/clubmuur/wedstrijden?team=${encodeURIComponent(team.id)}`}>Naar het wedstrijdcentrum <ArrowUpRight size={20}/></a></section>
  <section className="td-selection" aria-label="Kies seizoen en poule"><div className="td-selection-heading"><Trophy size={21}/><span><b>Jouw seizoen. Jouw poule.</b><small>Standaard de meest actuele poule</small></span></div><div className="td-select-fields"><label><span>Seizoen</span><select value={selectedSeason} disabled={!choices||isBusy} onChange={event=>{setSeason(event.target.value);setPool('');setSelected(null);}}>{!choices&&<option>Seizoenen laden…</option>}{choices?.seasons.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="td-pool-select"><span>Competitie / beker / fase</span><select value={selectedPool} disabled={!choices||isBusy||!pools.length} onChange={event=>{setSeason(selectedSeason);setPool(event.target.value);setSelected(null);}}>{!selectedPool&&<option value="">{isBusy?'Poule laden…':pools.length?'Kies een poule':'Nog geen poule bekend'}</option>}{pools.map(item=><option key={item.id} value={item.id}>{[item.type,item.label,item.phase&&!item.label.toLowerCase().includes(item.phase.toLowerCase())?item.phase:null].filter(Boolean).join(' · ')}{item.current?' · actueel':''}</option>)}</select></label></div></section>
  <div className="td-data-line"><span><ShieldCheck size={14}/>{isBusy?'Teamgegevens laden…':data?.stale?'Laatst beschikbare teamgegevens':'Clubgegevens via Sportlink'}{data?.updatedAt&&` · ${dateLabel(data.updatedAt,updateFormat)}`}</span><button type="button" onClick={detail.reload} disabled={detail.loading} aria-label="Ververs teamgegevens"><RefreshCw size={14} className={detail.loading?'td-spin':''}/><span>Verversen</span></button></div>
  {(detail.error||data?.warning)&&<div role="status"><PageNotice>{detail.error||data?.warning}</PageNotice></div>}
  <nav className="tp-tabs td-tabs" role="tablist" aria-label="Teamonderdelen">{tabs.map((item,index)=><button key={item.id} id={`td-tab-${item.id}`} role="tab" aria-selected={tab===item.id} aria-controls={`td-panel-${item.id}`} tabIndex={tab===item.id?0:-1} onClick={()=>setTab(item.id)} onKeyDown={event=>tabKey(event,index)}>{item.label}</button>)}</nav>
  <div className="tp-tab-content td-content" id={`td-panel-${tab}`} role="tabpanel" aria-labelledby={`td-tab-${tab}`} tabIndex={0} key={`${tab}-${data?.selectedSeasonId}-${data?.selectedPoolId}`} aria-busy={isBusy}>
   {isBusy?<div className="td-loading" role="status"><LoaderCircle size={29} className="td-spin"/><h3>We halen deze poule erbij.</h3><p>Programma, uitslagen en de stand worden bijgewerkt.</p></div>:!data?<div className="tp-empty"><Info size={26}/><h3>Even geen teamgegevens.</h3><p>Probeer opnieuw om deze selectie op te halen.</p><button className="cp-button" onClick={detail.reload}>Opnieuw proberen <RefreshCw size={15}/></button></div>:<>
    {tab==='overzicht'&&<>{data.teamPhotoUrl&&<TeamPhoto key={data.teamPhotoUrl} url={data.teamPhotoUrl} name={team.name}/>}<div className="td-overview"><section><PageSectionHeading eyebrow="KIJK VOORUIT" title="De volgende wedstrijd."/><Matches matches={nextFixtures.slice(0,1)} availability={data.availability.fixtures} onSelect={setSelected}/><button className="tp-text-link td-more-link" onClick={()=>setTab('programma')}>Het hele programma <ArrowRight size={16}/></button></section><section className="td-position"><div><span className="td-overline">{competition?.phase||'IN DEZE POULE'}</span><Trophy size={25}/></div><h3>{competition?.label||'Samen voor de punten.'}</h3>{ownStanding?<><div className="td-position-rank"><strong>#{ownStanding.rank}</strong><span>van {data.standings.length} teams</span></div><dl><div><dt>Gespeeld</dt><dd>{ownStanding.played}</dd></div><div><dt>Punten</dt><dd>{ownStanding.points}</dd></div><div><dt>Doelsaldo</dt><dd>{ownStanding.goalDifference>0?'+':''}{ownStanding.goalDifference}</dd></div></dl></>:<p>De stand verschijnt hier zodra er een openbare ranglijst beschikbaar is.</p>}<button onClick={()=>setTab('stand')}>Bekijk de hele stand <ArrowRight size={17}/></button></section><section><PageSectionHeading eyebrow="DE LAATSTE AFTRAP" title="Het laatste resultaat."/><Matches matches={data.results.slice(0,1)} availability={data.availability.results} results onSelect={setSelected}/><button className="tp-text-link td-more-link" onClick={()=>setTab('uitslagen')}>Alle uitslagen <ArrowRight size={16}/></button></section><section className="td-training cp-panel"><Clock3 size={23}/><h3>Op naar het trainingsveld.</h3>{training.length?<div className="td-training-times">{training.map(session=><div key={session.day}><b>{session.day}</b><span>{session.start} – {session.end}</span><small>{session.field}</small></div>)}</div>:<p>Vraag je trainer of teamleider naar de actuele trainingsmomenten.</p>}<a className="tp-text-link" href="/clubmuur/teams/trainingen">Training & afspraken <ArrowRight size={16}/></a></section></div><div className="td-quick-links"><button onClick={()=>setTab('spelers')}><Users size={24}/><span><b>De gezichten van het team.</b><small>{players.length?`${players.length} openbare spelersprofielen`:'Ontmoet spelers en begeleiding'}</small></span><ArrowUpRight size={20}/></button><button onClick={()=>setTab('verslagen')}><Newspaper size={24}/><span><b>De verhalen langs de lijn.</b><small>{reports.length?`${reports.length} ${reports.length===1?'verslag':'verslagen'} in dit seizoen`:'Alle beschikbare teamverslagen'}</small></span><ArrowUpRight size={20}/></button></div></>}
    {tab==='programma'&&<><PageSectionHeading eyebrow={`${selectedSeason} · ${competition?.label||'TEAMPROGRAMMA'}`} title="De volgende aftrap." description="Alle beschikbare wedstrijden van dit team in de gekozen poule. Tik op een wedstrijd voor de details."/><Matches matches={data.fixtures} availability={data.availability.fixtures} onSelect={setSelected}/></>}
    {tab==='uitslagen'&&<><PageSectionHeading eyebrow={`${selectedSeason} · ${competition?.label||'TEAMUITSLAGEN'}`} title="Zo speelden we." description="De beschikbare resultaten van deze poule, met de nieuwste wedstrijd bovenaan."/><Matches matches={data.results} availability={data.availability.results} results onSelect={setSelected}/></>}
    {tab==='stand'&&<><PageSectionHeading eyebrow={`${selectedSeason} · ${competition?.label||'DE RANGLIJST'}`} title="Dit is onze plek." description="De volledige ranglijst van de gekozen poule. Ons team herken je aan de blauwe rij."/><Standings rows={data.standings} availability={data.availability.standings} label={competition?.label||team.name}/></>}
    {tab==='verslagen'&&<><PageSectionHeading eyebrow={`TEAMVERHALEN · ${selectedSeason}`} title="Meer dan de uitslag." description="Wedstrijdverhalen van dit team uit het gekozen seizoen, over alle competities heen."/>{reports.length?<div className="td-reports">{reports.map(report=><article className="td-report" key={report.id}><div className="td-report-art" aria-hidden="true"><Newspaper size={47} strokeWidth={1}/><span>LANGS DE LIJN.</span></div><div><span className="td-overline">{dateLabel(`${report.publishedOn}T12:00:00`)} · {report.competitionLabel}</span><h3>{report.title}</h3><p>{report.summary}</p><a className="tp-text-link" href={report.sourceUrl} target="_blank" rel="noreferrer">Lees het clubverslag <ArrowUpRight size={16}/><span className="sr-only"> (opent in een nieuw tabblad)</span></a></div></article>)}</div>:<Empty kind="reports"/>}<p className="tp-feed-note">Verslagen komen van de officiële clubwebsite. Alleen berichten die aan dit team en seizoen gekoppeld zijn, worden hier getoond.</p></>}
    {tab==='spelers'&&<><PageSectionHeading eyebrow={`DE SELECTIE · ${selectedSeason}`} title="De mensen achter het shirt." description="Samen dragen we blauw-wit. Dit zijn de openbaar gedeelde spelers en begeleiders van dit team."/>{players.length?<div className="td-people">{players.map(person=><PersonCard key={person.id} person={person}/>)}</div>:<Empty kind="players" unavailable={data.availability.players==='unavailable'}/>}{staff.length>0&&<section className="td-staff"><PageSectionHeading eyebrow="LANGS DE LIJN" title="Onze begeleiding."/><div className="td-people">{staff.map(person=><PersonCard key={person.id} person={person}/>)}</div></section>}<p className="tp-feed-note">Alleen namen en foto’s die openbaar zijn gedeeld via Sportlink worden getoond. De openbare lijst kan daardoor afwijken van de volledige selectie.</p></>}
   </>}
  </div>
  {data?.notes.length? <details className="td-source-notes"><summary>Over deze teamgegevens <Info size={15}/></summary><ul>{data.notes.map(note=><li key={note}>{note}</li>)}</ul></details>:null}
  <SportlinkMatchDialog match={selected} onClose={()=>setSelected(null)}/>
 </ClubPageFrame>;
}

export function ClubTeamDetailPage({teamId}:{teamId:string}){return <TeamDetail key={teamId} teamId={teamId}/>;}

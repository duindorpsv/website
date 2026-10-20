'use client';
import {createMatchCalendar} from '@/lib/match-calendar';

import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Clock3,Download,History,MapPin,MessageCircle,Mic2,Navigation,RefreshCw,ShieldCheck,Shirt,Trophy,TrendingUp,UserRound} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {ClubLogo} from '@/components/clubmuur-competition';

import {useSportlink} from '@/hooks/use-sportlink';
import {useMatchDossier,type MatchDossierContext} from '@/hooks/use-match-dossier';
import {buildMatchDossier,supportsPublicMatchResults,type MatchDossierSide} from '@/lib/match-dossier';
import {getPublishedMatchPreview,isFirstTeamMatch} from '@/lib/cms/match-preview';
import {historicalFromMatches} from '@/lib/sportlink-history';
import {formatMatchWhatsApp} from '@/lib/match-share';
import type {FormResult,SportlinkMatch} from '@/lib/sportlink-types';

const zone={timeZone:'Europe/Amsterdam'} as const;
const dateTime=new Intl.DateTimeFormat('nl-NL',{...zone,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const shortDate=new Intl.DateTimeFormat('nl-NL',{...zone,day:'numeric',month:'short',year:'2-digit'});
const historyDate=new Intl.DateTimeFormat('nl-NL',{...zone,day:'numeric',month:'short',year:'numeric'});
const time=new Intl.DateTimeFormat('nl-NL',{...zone,hour:'2-digit',minute:'2-digit'});
const formLabels:Record<FormResult,string>={W:'Gewonnen',GL:'Gelijkgespeeld',V:'Verloren'};
const inactive=(status:string)=>/afgelast|geannuleerd|uitgesteld|gestaakt|vervallen|cancelled|postponed|onderbroken/i.test(status)&&!/niet\s+afgelast/i.test(status);
function validDate(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date:null;}
function score(match:SportlinkMatch){return match.homeScore!==null&&match.awayScore!==null?`${match.homeScore} – ${match.awayScore}`:match.scoreLabel;}
function downloadCalendar(match:SportlinkMatch){
 const date=validDate(match.kickoff);if(!date)return;
 const url=URL.createObjectURL(new Blob([createMatchCalendar(match)],{type:'text/calendar;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=`duindorp-wedstrijd-${match.id.replace(/[^a-z0-9-]/gi,'-')}.ics`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function CompactForm({side}:{side:MatchDossierSide}){
 if(!side.form.length)return null;
 return <div className="md-compact-form"><span className="md-form-chips" role="group" aria-label={`Vorm ${side.team.name}, nieuwste rechts`}>{side.form.map((result,index)=>({result,match:side.matches[index]})).reverse().map(({result,match})=><span key={match.id} data-result={result} title={`${formLabels[result]} · ${shortDate.format(new Date(match.kickoff))} · ${match.home.name} ${score(match)} ${match.away.name}`} aria-label={formLabels[result]}>{result==='GL'?'G':result}</span>)}</span></div>;
}

function RecentMatches({side}:{side:MatchDossierSide}){
 if(!side.matches.length)return null;
 return <section className="md-recent-team"><header><ClubLogo team={side.team}/><h4>{side.team.name}</h4></header><div className="md-recent-summary"><span><b>{side.won}</b> gewonnen</span><span><b>{side.drawn}</b> gelijk</span><span><b>{side.lost}</b> verloren</span></div><ol className="md-history-list">{side.matches.map((match,index)=><li key={match.id}><div className="md-history-date"><time dateTime={match.kickoff}>{shortDate.format(new Date(match.kickoff))}</time><span data-result={side.form[index]}>{side.form[index]==='GL'?'G':side.form[index]}</span></div><div className="md-history-teams"><span>{match.home.name}</span><span>{match.away.name}</span></div><strong className="md-history-score">{match.homeScore}<span>{match.awayScore}</span></strong></li>)}</ol></section>;
}

function MatchDossier({seed,onClose,context}:{seed:SportlinkMatch;onClose:()=>void;context:MatchDossierContext}){
 const opener=useRef<HTMLElement|null>(typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
 const {data:club}=useSportlink();

 const live=useMatchDossier(seed,context),match=live.match;
 const [tab,setTab]=useState('overzicht');
 const [now,setNow]=useState<number|null>(null);
 const [shareUrl,setShareUrl]=useState('');
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  const url=new URL('/clubmuur/wedstrijden',window.location.origin);url.searchParams.set('wedstrijd',match.id);
  const team=live.data?.contextTeamId||context.teamId;if(team)url.searchParams.set('team',team);
  if(match.competitionId)url.searchParams.set('poule',match.competitionId);
  const season=live.data?.contextSeasonId||context.season;if(season)url.searchParams.set('seizoen',season);
  setShareUrl(url.href);
 },[match.id,match.competitionId,context.teamId,context.season,live.data?.contextTeamId,live.data?.contextSeasonId]);
 const fallback=useMemo(()=>club?[...club.previousRound.matches,...club.nextRound.matches,...club.results,...club.fixtures]:[],[club]);
 const standings=live.data?.standings||(club?.competition?.id===match.competitionId?club.standings:[]);
 const dossier=useMemo(()=>buildMatchDossier(match,live.data?.comparisonMatches||fallback,standings),[match,live.data?.comparisonMatches,fallback,standings]);
 const preview=live.data?.preview||null;
 const headToHead=live.data?.headToHead??historicalFromMatches(dossier.encounters);
 const recentSides=[dossier.home,dossier.away].filter(side=>side.matches.length>0);
 const hasHistory=!!live.data?.firstTeamMatch&&!!(headToHead.length||recentSides.length);
 const historyLabel=recentSides.length?(headToHead.length?'Laatste 5 & onderling':'Laatste 5'):'Onderling';
 const homeHeadCoach=live.data?.homeHeadCoach,awayHeadCoach=live.data?.awayHeadCoach;
 const hasPersonnel=!!(match.referee||homeHeadCoach||awayHeadCoach);
 const personnelNote=!!(live.data?.headCoachesStale&&(homeHeadCoach||awayHeadCoach));
 const infoRows=Math.max(1+[match.field,match.homeDressingRoom,match.awayDressingRoom,match.competitionLabel].filter(Boolean).length,[match.referee,homeHeadCoach,awayHeadCoach].filter(Boolean).length+Number(personnelNote));
 const effectiveTab=(tab==='kleedkamer'&&!preview)||(tab==='historie'&&!hasHistory)?'overzicht':tab;
 const resultScore=supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away)&&/^(?:uitgespeeld|gespeeld|eindstand|be[eë]indigd|afgelopen|finished|completed|na verlenging|na strafschoppen)$/i.test(match.status.trim())?score(match):null;
 const kickoff=validDate(match.kickoff),hasScore=!!resultScore,cancelled=inactive(match.status);
 const future=kickoff&&now!==null&&kickoff.getTime()>now&&!hasScore&&!cancelled;
 const remaining=future?Math.max(0,Math.floor((kickoff.getTime()-now!)/1000)):0;
 const days=Math.floor(remaining/86400),hours=Math.floor(remaining/3600)%24,minutes=Math.floor(remaining/60)%60,seconds=remaining%60;
 const routeQuery=[match.venue,match.venueAddress].filter(Boolean).join(', ');
 const updated=live.data?.updatedAt&&validDate(live.data.updatedAt);
 const warning=live.error||(live.data?.stale?(live.data.warning||'De verversing is vertraagd. Je ziet de laatst ontvangen gegevens.'):'');
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent className="club-dialog sl-match-dialog md-dialog" onCloseAutoFocus={event=>{event.preventDefault();opener.current?.focus({preventScroll:true});}}>
  <DialogHeader><span className="sl-eyebrow">{match.competitionLabel||'DUINDORP SV · WEDSTRIJD'}</span><DialogTitle>Onze kleuren. Jouw wedstrijd.</DialogTitle><DialogDescription>{kickoff?dateTime.format(kickoff):'De speeldatum volgt.'}</DialogDescription></DialogHeader>
  <div className="md-hero"><div className="md-match-label"><span>{match.home.own?'Thuiswedstrijd':match.away.own?'Uitwedstrijd':'Competitiewedstrijd'}</span>{match.status&&<span className="md-status" data-cancelled={cancelled}>{match.status}</span>}</div><div className="sl-dialog-clubs md-clubs"><div><ClubLogo team={match.home}/><strong>{match.home.name}</strong>{effectiveTab==='overzicht'&&<CompactForm side={dossier.home}/>}</div><div className="sl-dialog-score"><strong>{resultScore||(kickoff?time.format(kickoff):'–')}</strong><small>{hasScore?'EINDSTAND':'AFTRAP'}</small></div><div><ClubLogo team={match.away}/><strong>{match.away.name}</strong>{effectiveTab==='overzicht'&&<CompactForm side={dossier.away}/>}</div></div>{future&&<div className="md-countdown" aria-label={`Nog ${days} dagen, ${hours} uur en ${minutes} minuten tot de aftrap`}><Clock3 size={14}/><span>Tot de aftrap</span><b aria-hidden="true">{days>0&&`${days}d `}{String(hours).padStart(2,'0')}:{String(minutes).padStart(2,'0')}:{String(seconds).padStart(2,'0')}</b></div>}</div>
  <Tabs value={effectiveTab} onValueChange={setTab} className="md-tabs" data-single-panel={!hasHistory&&!preview}>{(hasHistory||preview)&&<TabsList className="md-tab-list" aria-label="Wedstrijdinformatie"><TabsTrigger value="overzicht"><CalendarDays size={15}/>Overzicht</TabsTrigger>{hasHistory&&<TabsTrigger value="historie"><History size={15}/>{historyLabel}</TabsTrigger>}{preview&&<TabsTrigger value="kleedkamer"><Mic2 size={15}/>Kleedkamer</TabsTrigger>}</TabsList>}
   <TabsContent value="overzicht" className="md-panel"><div className="md-info-columns" data-personnel={hasPersonnel} style={{gridTemplateRows:`repeat(${infoRows},auto)`}}><div className="md-info-grid">
    <div className="md-info-item md-info-wide"><MapPin size={18}/><div><span>Sportpark</span><strong>{match.venue||'Locatie volgt'}</strong>{match.venueAddress&&<small>{match.venueAddress}</small>}</div></div>
    {match.field&&<div className="md-info-item md-info-wide"><Navigation size={18}/><div><span>Veld</span><strong>{match.field}</strong></div></div>}
    {match.homeDressingRoom&&<div className="md-info-item"><Shirt size={18}/><div><span>Kleedkamer · thuis</span><strong>{match.homeDressingRoom}</strong><small>{match.home.name}</small></div></div>}
    {match.awayDressingRoom&&<div className="md-info-item"><Shirt size={18}/><div><span>Kleedkamer · uit</span><strong>{match.awayDressingRoom}</strong><small>{match.away.name}</small></div></div>}
    {match.competitionLabel&&<div className="md-info-item md-info-wide"><Trophy size={18}/><div><span>Competitie</span><strong>{match.competitionLabel}</strong></div></div>}
   </div>{hasPersonnel&&<div className="md-officials">
    {match.referee&&<div className="md-info-item"><ShieldCheck size={18}/><div><span>Scheidsrechter</span><strong>{match.referee}</strong></div></div>}
    {homeHeadCoach&&<div className="md-info-item"><UserRound size={18}/><div><span>Hoofdtrainer · thuis</span><strong>{homeHeadCoach}</strong><small>{match.home.name}</small></div></div>}
    {awayHeadCoach&&<div className="md-info-item"><UserRound size={18}/><div><span>Hoofdtrainer · uit</span><strong>{awayHeadCoach}</strong><small>{match.away.name}</small></div></div>}
    {personnelNote&&<p className="md-personnel-note">Laatst opgeslagen trainersgegevens</p>}
   </div>}</div></TabsContent>
   {hasHistory&&<TabsContent value="historie" className="md-panel">
    {recentSides.length>0&&<section className="md-last-five"><header className="md-section-title"><TrendingUp size={18}/><div><h3>De laatste 5 wedstrijden</h3><p>Huidige poule · meest recente bovenaan</p></div></header><div className={`md-recent-columns${recentSides.length===1?' md-recent-single':''}`}>{recentSides.map(side=><RecentMatches key={side.team.id} side={side}/>)}</div></section>}
    {headToHead.length>0&&<section className="md-h2h"><header className="md-section-title"><History size={18}/><div><h3>Laatste 5 onderlinge ontmoetingen</h3><p>Alle beschikbare seizoenen{live.data?.headToHeadStale?' · laatst opgeslagen resultaten':''}</p></div></header><ol className="md-encounters md-historical-encounters">{headToHead.map(game=><li key={game.id}><time dateTime={game.date}>{historyDate.format(new Date(`${game.date}T12:00:00Z`))}<small>{game.season}</small></time><span>{game.matchLabel}</span><strong>{game.scoreLabel}</strong></li>)}</ol></section>}
   </TabsContent>}
   {preview&&<TabsContent value="kleedkamer" className="md-panel"><section className="md-voice"><span className="md-voice-icon"><Mic2 size={25}/></span><span className="sl-eyebrow">ONS EERSTE · VOORUITBLIK</span><h3>Stem uit de kleedkamer</h3><div className="md-speaker"><strong>{preview.speaker}</strong><span>{preview.role}</span></div>{preview.intro&&<p className="md-voice-intro">{preview.intro}</p>}{[{title:'Wat staat er op het spel?',text:preview.whatAtStake},{title:'Hoe bereiden we ons voor?',text:preview.preparation},{title:'Waarop moeten supporters letten?',text:preview.supporterFocus}].filter(item=>item.text).map(item=><div className="md-voice-answer" key={item.title}><h4>{item.title}</h4><p>{item.text}</p></div>)}</section></TabsContent>}
  </Tabs>
  {warning&&<p className="md-refresh-warning" role="status">{warning}</p>}
  <div className="md-actions">{routeQuery&&<a className="md-action" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeQuery)}`} target="_blank" rel="noreferrer"><Navigation size={16}/>Route openen</a>}{future&&<button type="button" className="md-action md-action-primary" onClick={()=>downloadCalendar(match)}><Download size={16}/>In mijn agenda</button>}{shareUrl&&<a className="md-action md-action-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(formatMatchWhatsApp(match,shareUrl))}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>Delen via WhatsApp</a>}</div>
  <div className="md-sync"><span><i data-stale={!!warning}/>{live.loading?'Gegevens verversen…':updated?`Bijgewerkt ${time.format(updated)}`:'Actuele wedstrijdgegevens'}</span><button type="button" onClick={live.refresh} disabled={live.loading} aria-label="Wedstrijdgegevens verversen"><RefreshCw size={13} className={live.loading?'md-spin':''}/>Verversen</button></div>
 </DialogContent></Dialog>;
}

export function SportlinkMatchDialog({match,onClose,teamId,season,pool}:{match:SportlinkMatch|null;onClose:()=>void}&MatchDossierContext){
 return match?<MatchDossier key={match.id} seed={match} onClose={onClose} context={{teamId,season,pool}}/>:null;
}

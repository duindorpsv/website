'use client';

import {useId,useState} from 'react';
import {ArrowUpRight,CalendarDays,MapPin,RefreshCw} from 'lucide-react';
import {useSportlink} from '@/hooks/use-sportlink';
import {ClubLogo} from './clubmuur-competition';
import {SportlinkMatchDialog} from './sportlink-pages';
import type {HeroCardConfig} from '@/lib/clubmuur-config';

const matchDate=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'short',day:'numeric',month:'long'});
const matchTime=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});

/** One match presentation: its compact shape is controlled by the composition's container. */
export function ClubmuurHeroMatch({card}:{card:HeroCardConfig}){
 const {data,loading,error,reload}=useSportlink();
 const [open,setOpen]=useState(false);
 const id=useId();
 const match=data?.nextMatch;
 const date=match?new Date(match.kickoff):null;
 const validDate=date&&Number.isFinite(date.getTime())?date:null;
 return <article className="cm-featured-match" data-slot-id={card.id} aria-labelledby={`${id}-title`}>
  <header className="cm-featured-match-head"><span className="cm-featured-match-kicker">ONS EERSTE<span aria-hidden="true"/>{match?(match.home.own?'THUIS':'UIT'):'DUINDORP SV'}</span><h2 id={`${id}-title`}>{card.title.replace(/[.!]$/,'')||'Volgende wedstrijd'}<span>.</span></h2></header>
  {match&&validDate?<>
   <div className="cm-featured-match-teams"><div><ClubLogo team={match.home}/><strong>{match.home.name}</strong></div><span className="cm-featured-match-vs" aria-label="tegen">VS</span><div><ClubLogo team={match.away}/><strong>{match.away.name}</strong></div></div>
   <div className="cm-featured-match-kickoff"><span><CalendarDays size={14}/><time dateTime={match.kickoff}>{matchDate.format(validDate)}</time></span><strong>{matchTime.format(validDate)}<small>AFTRAP</small></strong></div>
   <p className="cm-featured-match-location"><MapPin size={13}/><span>{match.venue||'Locatie volgt'}</span></p>
   <button className="cm-featured-match-cta" type="button" onClick={()=>setOpen(true)}><span>Alles over deze wedstrijd</span><ArrowUpRight size={18}/></button>
   {data?.stale&&<span className="cm-featured-match-stale">Laatst beschikbare programma</span>}
  </>:<div className="cm-featured-match-empty" role="status"><CalendarDays size={28}/><p>{loading?'De volgende aftrap wordt opgehaald…':error?'Het programma is even niet beschikbaar.':'De volgende aftrap volgt binnenkort.'}</p>{error?<button onClick={reload} type="button"><RefreshCw size={14}/>Opnieuw proberen</button>:!loading&&<a href="/clubmuur/wedstrijden">Naar het wedstrijdcentrum <ArrowUpRight size={16}/></a>}</div>}
  <SportlinkMatchDialog match={open&&match?match:null} onClose={()=>setOpen(false)}/>
 </article>;
}

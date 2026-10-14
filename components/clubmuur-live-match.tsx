'use client';
import {useState} from 'react';
import {CalendarDays,MapPin} from 'lucide-react';
import {useSportlink} from '@/hooks/use-sportlink';
import {ClubLogo} from './clubmuur-competition';
import {SportlinkMatchDialog} from './sportlink-pages';
import type {HeroCardConfig} from '@/lib/clubmuur-config';

export function ClubmuurLiveMatch({card}:{card:HeroCardConfig}){
 const {data,loading,error,reload}=useSportlink();
 const [open,setOpen]=useState(false);
 const match=data?.nextMatch;
 const date=match?new Date(match.kickoff):null;
 return <div className="cm-match" data-slot-id={card.id}>
  <div className="cm-match-top"><h2>{card.title}</h2><span><CalendarDays size={13}/>Eerste elftal</span></div>
  {match&&date?<div className="cm-match-body">
   <div className="cm-clubs"><div><ClubLogo team={match.home}/><strong>{match.home.name}</strong></div><span className="cm-versus">–</span><div><ClubLogo team={match.away}/><strong>{match.away.name}</strong></div></div>
   <p className="cm-match-date">{date.toLocaleDateString('nl-NL',{day:'numeric',month:'short',timeZone:'Europe/Amsterdam'})} · {date.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})}</p>
   <p className="cm-match-location"><MapPin size={12}/>{match.venue||'Locatie volgt'}{data?.stale?' · laatst opgehaald':''}</p>
   <button className="btn btn-blue" onClick={()=>setOpen(true)}>Bekijk wedstrijd</button>
  </div>:<div className="cm-match-body cm-match-state" aria-live="polite"><CalendarDays size={32}/><p>{loading?'Programma ophalen…':error?'Programma tijdelijk niet beschikbaar.':'Nog geen wedstrijd gepland.'}</p>{error&&<button className="btn btn-blue" onClick={reload}>Opnieuw proberen</button>}</div>}
  <SportlinkMatchDialog match={open&&match?match:null} onClose={()=>setOpen(false)}/>
 </div>;
}

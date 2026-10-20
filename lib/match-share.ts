import {supportsPublicMatchResults} from './match-dossier';
import type {SportlinkMatch} from './sportlink-types';

const dateFormat=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const timeFormat=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
const text=(value:string|undefined|null)=>value?.replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()||'';
const normalized=(value:string)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const completed=(status:string)=>['uitgespeeld','gespeeld','eindstand','beeindigd','afgelopen','finished','completed','na verlenging','na strafschoppen'].includes(normalized(status));
const cancelled=(status:string)=>/afgelast|geannuleerd|uitgesteld|gestaakt|vervallen|cancelled|postponed|onderbroken/i.test(status)&&!/niet\s+afgelast/i.test(status);
const validScore=(value:number|null):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** WhatsApp understands asterisks and line breaks; every optional detail comes from this match. */
export function formatMatchWhatsApp(match:SportlinkMatch,url:string):string{
 const heading=['💙🤍 *DUINDORP SV*',`⚽ *${text(match.home.name)} – ${text(match.away.name)}*`];
 const status=text(match.status);
 const showScore=completed(status)&&supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away);
 if(showScore&&validScore(match.homeScore)&&validScore(match.awayScore))heading.push(`🏁 *Eindstand: ${match.homeScore} – ${match.awayScore}*`);
 else if(showScore&&/^\d+\s*[-–:]\s*\d+$/.test(text(match.scoreLabel)))heading.push(`🏁 *Eindstand: ${text(match.scoreLabel)}*`);
 else if(status&&!['te spelen','gepland','scheduled'].includes(normalized(status)))heading.push(`${cancelled(status)?'⚠️':'ℹ️'} *${status}*`);
 const details:string[]=[];
 const kickoff=new Date(match.kickoff);
 if(Number.isFinite(kickoff.getTime())){
  const date=dateFormat.format(kickoff);
  details.push(`📅 ${date.charAt(0).toUpperCase()+date.slice(1)}`,`🕒 ${timeFormat.format(kickoff)} uur`);
 }
 const location=[text(match.venue),text(match.venueAddress)].filter(Boolean).join(' · ');
 if(location)details.push(`📍 ${location}`);
 if(text(match.field))details.push(`🏟️ Veld: ${text(match.field)}`);
 if(text(match.competitionLabel))details.push(`🏆 ${text(match.competitionLabel)}`);
 return [heading.join('\n'),details.join('\n'),`Bekijk alle wedstrijdinformatie:\n${url.trim()}`,'Onze wijk. Onze club. Onze trots.'].filter(Boolean).join('\n\n');
}

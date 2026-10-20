import type {SportlinkMatch} from './sportlink-types';
const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n?|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=(date:Date)=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function fold(line:string){const encoder=new TextEncoder(),lines:string[]=[];let current='';for(const point of line){if(encoder.encode(current+point).length>75){lines.push(current);current=' ';}current+=point;}return [...lines,current].join('\r\n');}
/** RFC 5545: UTC instants, CRLF, stable UID, escaped text, and UTF-8 octet folding. */
export function createMatchCalendar(match:SportlinkMatch,now=new Date()){
 const kickoff=new Date(match.kickoff);if(!Number.isFinite(kickoff.getTime()))throw Error('Ongeldige aftrapdatum.');
 const description=[match.competitionLabel,match.field&&`Veld: ${match.field}`,match.homeDressingRoom&&`Kleedkamer ${match.home.name}: ${match.homeDressingRoom}`,match.awayDressingRoom&&`Kleedkamer ${match.away.name}: ${match.awayDressingRoom}`].filter(Boolean).join('\n');
 const location=[match.venue,match.venueAddress].filter(Boolean).join(', ');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Duindorp SV//Wedstrijdkalender//NL','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${escape(match.id)}@duindorpsv.nl`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(kickoff)}`,`SUMMARY:${escape(`${match.home.name} – ${match.away.name}`)}`,`DESCRIPTION:${escape(description)}`,...(location?[`LOCATION:${escape(location)}`]:[]),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}

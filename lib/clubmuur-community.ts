import {getPublicActivities,planningInstant} from './cms/planning';
import type {ClubAgendaEvent} from './club-agenda';
import {upcomingAgenda} from './club-agenda';
import type {CmsActivity,CmsState} from './cms/types';
export type ClubCommunityEvent=ClubAgendaEvent&{endTime?:string;location?:string;type?:CmsActivity['type'];central?:boolean;occurrence?:'earlier'|'later'|'reject'};

/** Public server projections remain authoritative; legacy agenda stays until reviewed migration. */
export function publicCommunityEvents(state:CmsState,now=Date.now()):ClubCommunityEvent[]{
 const central=getPublicActivities(state).map(item=>({id:item.id,title:item.title,date:item.date,time:item.startTime,endTime:item.endTime,description:item.description,location:item.location,type:item.type,occurrence:item.occurrence,central:true}));
 const centralIds=new Set(state.planning.activities.map(item=>item.id));
 const legacy=(state.appearance?.agenda||[]).filter(item=>!centralIds.has(item.id));
 return upcomingAgenda<ClubCommunityEvent>([...legacy,...central],now).slice(0,5);
}

export type ClubCommunityRole = { id: string; title: string; duration: string; description: string };

export const clubCommunityRoles: ClubCommunityRole[] = [
  { id: 'kantine', title: 'Een uurtje achter de bar', duration: '1–2 uur', description: 'Een kop koffie, een praatje, een warm welkom. Help een keer mee in de kantine, samen met een ervaren vrijwilliger.' },
  { id: 'clubdag', title: 'Handen uit de mouwen', duration: '2 uur', description: 'Help met een kleine klus rond het clubgebouw. We zoeken samen iets dat bij jou past. Twee handige handen zijn al een mooi begin.' },
  { id: 'jeugd', title: 'Help bij een jeugdactiviteit', duration: '1 uur', description: 'Help een activiteit klaarzetten of begeleid een spelletje. Met een beetje van jouw tijd geef je onze jeugd een mooie middag.' },
];

export const clubCommunityPoll = {
  id: 'clubactiviteit-2026-10',
  question: 'Waar ben jij graag bij?',
  options: [
    { id: 'familie', label: 'Een gezellige familiedag', votes: 42 },
    { id: 'quiz', label: 'Een clubquiz in de kantine', votes: 31 },
    { id: 'toernooi', label: 'Een onderling voetbaltoernooi', votes: 27 },
  ],
};

function escapeCalendarText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldCalendarLine(value: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let line = '';
  let bytes = 0;
  for (const character of value) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += character;
    bytes += length;
  }
  lines.push(line);
  return lines.join('\r\n');
}

export function communityEventCalendar(event: ClubCommunityEvent) {
  const instant=(time:string)=>planningInstant(`${event.date}T${time}`,event.occurrence||'earlier').replaceAll('-','').replaceAll(':','');
  const start=instant(event.time);
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Duindorp SV//Clubagenda//NL', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:activiteit-${event.id}@duindorpsv.nl`,
    `DTSTAMP:${stamp}`, `DTSTART:${start}`,...(event.endTime?[`DTEND:${instant(event.endTime)}`]:[]),
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(event.description)}`,
    ...(event.location?[`LOCATION:${escapeCalendarText(event.location)}`]:[]), 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldCalendarLine).join('\r\n');
}

export type ClubCommunityEvent = {
  id: string;
  title: string;
  day: string;
  month: string;
  category: string;
  date: string;
  description: string;
};

// Only confirmed club activities belong in the public agenda.
export const clubCommunityEvents: ClubCommunityEvent[] = [];

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
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
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
  const nextDay = new Date(`${event.date}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const end = nextDay.toISOString().slice(0, 10).replaceAll('-', '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Duindorp SV//Clubagenda//NL', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:activiteit-${event.id}-${event.date}@duindorpsv.nl`,
    'DTSTAMP:20261010T000000Z', `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(event.description)}`,
    'LOCATION:Houtrust - Duindorp SV', 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldCalendarLine).join('\r\n');
}

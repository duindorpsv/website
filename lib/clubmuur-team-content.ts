import type { SportlinkTeam } from './sportlink-types';

/** Editorial links, verified against public Duindorp SV articles on 11 October 2026.
 * These are short, newly written summaries, not generated match reports.
 * A team name and season must both match: never reuse a first-team article for
 * another squad, or present an archived report as a current-season report.
 */
export type TeamReport = {
  id: string;
  title: string;
  summary: string;
  season: string;
  publishedOn: string;
  matchDate?: string;
  competitionLabel: string;
  competitionKind: 'competitie' | 'beker' | 'vriendschappelijk' | 'toernooi';
  sourceUrl: string;
};

type EditorialTeamReport = TeamReport & { teamKeys: readonly string[] };

export const teamReportsVerifiedOn = '2026-10-11';

const reports: readonly EditorialTeamReport[] = [
  {
    id: 'dsv-walking-2026-08-28',
    teamKeys: ['walkingfootball'],
    title: 'Walking Football eindigt op de derde plaats',
    summary: 'Op het toernooi bij SVV Scheveningen behaalde het Walking Football-team een derde plaats. Onder meer WIK, SVC’08 en DUNO deden mee aan het toernooi op Houtrust.',
    season: '2026/2027',
    publishedOn: '2026-08-28',
    competitionLabel: 'Walking Football-toernooi · SVV Scheveningen',
    competitionKind: 'toernooi',
    sourceUrl: 'https://www.duindorpsv.nl/1/452/de-legendes-van-duindorp-sv-walking-football-team-pakken-derde-plaats/',
  },
  {
    id: 'dsv-houtwijk-2026-08-20',
    teamKeys: ['1'],
    title: 'Finaleplek na 0–3 bij Houtwijk',
    summary: 'Na een doelpuntloze eerste helft scoorden Jeremy Keus tweemaal en Nicky Keus eenmaal. De oefenzege leverde Duindorp een plaats in de toernooifinale op.',
    season: '2026/2027',
    publishedOn: '2026-08-21',
    matchDate: '2026-08-20',
    competitionLabel: 'SV Houtwijk-toernooi',
    competitionKind: 'vriendschappelijk',
    sourceUrl: 'https://www.duindorpsv.nl/1/446/duindorp-sv-naar-finale-na-zege-op-sv-houtwijk/',
  },
  {
    id: 'dsv-dhc-2026-05-19',
    teamKeys: ['1'],
    title: 'Via strafschoppen naar de bekerfinale',
    summary: 'Duindorp schakelde DHC uit na strafschoppen en bereikte de finale van de Halve Maan Cup. De club blikte terug op de kwalificatie en vooruit naar de finaledag.',
    season: '2025/2026',
    publishedOn: '2026-05-20',
    matchDate: '2026-05-19',
    competitionLabel: 'Haaglanden Voetbal · Halve Maan Cup',
    competitionKind: 'beker',
    sourceUrl: 'https://www.duindorpsv.nl/1/415/finale-shirts--met-zn-allen-naar-de-finale/',
  },
  {
    id: 'dsv-ariston-2026-04-21',
    teamKeys: ['1'],
    title: 'Bekerwinst tegen Ariston’80',
    summary: 'Dylan Verbaan en Colin Plug maakten de Duindorpse doelpunten in de 2–1 overwinning. Ariston’80 scoorde vlak voor tijd nog tegen; de volgende ronde was voor Duindorp.',
    season: '2025/2026',
    publishedOn: '2026-04-22',
    matchDate: '2026-04-21',
    competitionLabel: 'Haaglanden Voetbal · Halve Maan Cup',
    competitionKind: 'beker',
    sourceUrl: 'https://www.duindorpsv.nl/1/403/duindorp-sv-bekert-verder-na-winst-op-ariston80/',
  },
];

function editorialTeamKey(team: Pick<SportlinkTeam, 'name' | 'sport'>): string {
  // Keep zaal and veld teams separate, even when their displayed names coincide.
  if (/zaal|futsal/i.test(`${team.sport} ${team.name}`)) return '';
  return team.name.toLowerCase().trim()
    .replace(/^duindorp\s*s\.?v\.?\s*/, '')
    .replace(/^za[-\s]*/, '')
    .replace(/\s+/g, '');
}

export function reportsForTeam(team: Pick<SportlinkTeam, 'name' | 'sport'>, season?: string): TeamReport[] {
  const key = editorialTeamKey(team);
  if (!key) return [];
  return reports
    .filter(report => report.teamKeys.includes(key) && (!season || report.season === season))
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn))
    .map(({ teamKeys: _teamKeys, ...report }) => report);
}

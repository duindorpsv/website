import type {
  FormResult, SportlinkMatch, SportlinkRound,
  SportlinkSide, SportlinkSnapshot, SportlinkStanding, SportlinkTeam,
} from './sportlink-types';
import {sportlinkAssignmentFields} from './sportlink-assignments';

type Raw = Record<string, unknown>;
type Input = {
  teams: unknown[]; standings: unknown[]; leagueResults: unknown[];
  leagueFixtures: unknown[]; clubResults: unknown[]; clubFixtures: unknown[];
};
const ZONE = 'Europe/Amsterdam';
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const raw = (value: unknown): Raw => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
const key = (value: unknown): string => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
const truth = (value: unknown): boolean => value === true || ['true', 'ja', '1'].includes(key(value));
const integer = (value: unknown): number => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
const validTeamCode = (value: unknown): string => /^\d+$/.test(text(value)) && Number(value) > 0 ? text(value) : '';
const sideKey = (club: string, name: string): string => `${club}:${key(name)}`;
const completed = (status: string): boolean => ['uitgespeeld', 'gespeeld', 'eindstand', 'beeindigd', 'afgelopen', 'finished', 'completed', 'na verlenging', 'na strafschoppen'].includes(key(status));

function localDate(date: Date): string {
  const fields = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => fields.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Group by the Dutch calendar week, not UTC days. No official round number is supplied.
function weekKey(kickoff: string): string {
  const date = new Date(`${localDate(new Date(kickoff))}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: ZONE }).format(new Date(`${date}T12:00:00Z`));
}

function kickoff(row: Raw): string | null {
  const value = text(row.wedstrijddatum);
  // Sportlink emits an offset such as +0200. Do not interpret dates in the server's timezone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const time = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

function score(row: Raw, status: string): [number, number] | null {
  if (!completed(status)) return null;
  const value = text(row.uitslag) || text(row['uitslag-regulier']);
  const pair = value.match(/^(\d{1,3})\s*[-–:]\s*(\d{1,3})(?:\s*\([^)]*\))?$/);
  return pair ? [Number(pair[1]), Number(pair[2])] : null;
}

function normalizeTeams(input: unknown[]): SportlinkTeam[] {
  const teams = new Map<string, SportlinkTeam>();
  for (const value of input) {
    const row = raw(value);
    const teamCode = text(row.teamcode);
    const localTeamCode = text(row.lokaleteamcode) || '-1';
    const name = text(row.teamnaam);
    if (!name || (!validTeamCode(teamCode) && !validTeamCode(localTeamCode))) continue;
    const id = `${teamCode}:${localTeamCode}`;
    let team = teams.get(id);
    if (!team) {
      team = { id, teamCode, localTeamCode, name, category: text(row.leeftijdscategorie), gender: text(row.geslacht), sport: text(row.spelsoort), day: text(row.speeldag), competitions: [] };
      teams.set(id, team);
    }
    const competitionId = text(row.poulecode);
    if (validTeamCode(competitionId) && !team.competitions.some(item => item.id === competitionId)) {
      team.competitions.push({ id: competitionId, label: text(row.klassepoule) || text(row.competitienaam), type: key(row.competitiesoort) });
    }
  }
  return [...teams.values()];
}

/** Five surrounding positions, extending the other edge when Duindorp is near the top or bottom. */
export function centeredStandings(rows: SportlinkStanding[], limit = 5): SportlinkStanding[] {
  const size = Math.min(rows.length, Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : rows.length));
  const ownIndex = rows.findIndex(row => row.team.own);
  const start = Math.max(0, Math.min((ownIndex < 0 ? 0 : ownIndex) - Math.floor(size / 2), rows.length - size));
  return rows.slice(start, start + size);
}

export function normalizeSportlink(input: Input, now = new Date()): SportlinkSnapshot {
  const teams = normalizeTeams(input.teams);
  const firstTeam = teams.find(team => /^duindorp(?: sv)? 1$/.test(key(team.name)) && (!team.gender || key(team.gender) === 'man')) || null;
  const competition = firstTeam?.competitions.find(item => item.type === 'regulier') || null;
  const ownCodes = new Set(teams.map(team => validTeamCode(team.teamCode)).filter(Boolean));
  const leagueRows = [...input.leagueResults, ...input.leagueFixtures].map(raw);
  const allRawMatches = [...leagueRows, ...input.clubResults.map(raw), ...input.clubFixtures.map(raw)];
  const ownStanding = input.standings.map(raw).find(row => truth(row.eigenteam));
  let ownClubCode = text(ownStanding?.clubrelatiecode);
  if (!ownClubCode) {
    for (const row of allRawMatches) {
      for (const prefix of ['thuis', 'uit']) {
        const code = validTeamCode(row[`${prefix}teamid`]);
        if (code && ownCodes.has(code) && text(row[`${prefix}teamclubrelatiecode`])) ownClubCode = text(row[`${prefix}teamclubrelatiecode`]);
      }
      if (ownClubCode) break;
    }
  }
  const sideIds = new Map<string, string>();
  for (const row of allRawMatches) {
    for (const prefix of ['thuis', 'uit']) {
      const id = validTeamCode(row[`${prefix}teamid`]);
      if (id) sideIds.set(sideKey(text(row[`${prefix}teamclubrelatiecode`]), text(row[`${prefix}team`])), id);
    }
  }
  const side = (name: string, clubCode: string, id: string, explicitOwn = false): SportlinkSide => {
    const own = explicitOwn || (!!clubCode && clubCode === ownClubCode) || (!!validTeamCode(id) && ownCodes.has(id)) || /^duindorp(?: sv)?(?: |$)/.test(key(name));
    return {
      id: validTeamCode(id) || sideIds.get(sideKey(clubCode, name)) || sideKey(clubCode, name), name, clubCode, own,
      logoUrl: own ? '/assets/logo.png' : clubCode ? `https://logoapi.voetbal.nl/logo.php?clubcode=${encodeURIComponent(clubCode)}` : null,
    };
  };
  const leagueMatchIds = new Set(leagueRows.map(row => text(row.wedstrijdcode)));
  const match = (row: Raw, league = false): SportlinkMatch | null => {
    const id = text(row.wedstrijdcode);
    const date = kickoff(row);
    const homeName = text(row.thuisteam);
    const awayName = text(row.uitteam);
    if (!id || !date || !homeName || !awayName) return null;
    const status = text(row.status);
    const goals = score(row, status);
    const inLeague = league || leagueMatchIds.has(id);
    return {
      id, kickoff: date,
      home: side(homeName, text(row.thuisteamclubrelatiecode), text(row.thuisteamid)),
      away: side(awayName, text(row.uitteamclubrelatiecode), text(row.uitteamid)),
      homeScore: goals?.[0] ?? null, awayScore: goals?.[1] ?? null,
      scoreLabel: goals ? `${goals[0]} – ${goals[1]}` : null, status, venue: text(row.accommodatie), ...sportlinkAssignmentFields(row),
      competitionId: inLeague ? competition?.id || '' : text(row.poulecode),
      competitionLabel: inLeague ? competition?.label || '' : text(row.klassepoule) || text(row.competitienaam) || text(row.competitie),
    };
  };
  const matches = (rows: unknown[], league = false): SportlinkMatch[] => {
    const unique = new Map<string, SportlinkMatch>();
    for (const row of rows) {
      const item = match(raw(row), league);
      if (item) unique.set(item.id, item);
    }
    return [...unique.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  };
  const leagueResults = competition ? matches(input.leagueResults, true) : [];
  const leagueFixtures = competition ? matches(input.leagueFixtures, true) : [];
  const previous = leagueResults.filter(item => new Date(item.kickoff).getTime() <= now.getTime());
  const upcoming = leagueFixtures.filter(item => new Date(item.kickoff).getTime() >= now.getTime() && !completed(item.status));
  const toRound = (items: SportlinkMatch[], fallback: string): SportlinkRound => {
    if (!items.length) return { label: fallback, startDate: null, endDate: null, matches: [] };
    const startDate = localDate(new Date(items[0].kickoff));
    const endDate = localDate(new Date(items[items.length - 1].kickoff));
    return { label: startDate === endDate ? dateLabel(startDate) : `${dateLabel(startDate)} – ${dateLabel(endDate)}`, startDate, endDate, matches: items };
  };
  const pastWeek = previous.length ? weekKey(previous[previous.length - 1].kickoff) : null;
  const nextWeek = upcoming.length ? weekKey(upcoming[0].kickoff) : null;
  const results = matches(input.clubResults);
  const fixtures = matches(input.clubFixtures);
  const formFor = (team: SportlinkSide): FormResult[] => previous
    .filter(item => item.homeScore !== null && item.awayScore !== null && (item.home.id === team.id || item.away.id === team.id))
    .slice(-5)
    .map(item => {
      const home = item.home.id === team.id;
      const own = home ? item.homeScore! : item.awayScore!;
      const opponent = home ? item.awayScore! : item.homeScore!;
      return own === opponent ? 'GL' : own > opponent ? 'W' : 'V';
    });
  const standings: SportlinkStanding[] = competition ? input.standings.map(raw).filter(row => integer(row.positie) > 0 && !!text(row.teamnaam)).map(row => {
    const team = side(text(row.teamnaam), text(row.clubrelatiecode), text(row.teamcode), truth(row.eigenteam));
    return {
      rank: integer(row.positie), team, played: integer(row.gespeeldewedstrijden), won: integer(row.gewonnen), drawn: integer(row.gelijk), lost: integer(row.verloren),
      goalsFor: integer(row.doelpuntenvoor), goalsAgainst: integer(row.doelpuntentegen), goalDifference: integer(row.doelsaldo), points: integer(row.punten), form: formFor(team),
    };
  }).sort((a, b) => a.rank - b.rank) : [];
  const candidates = new Map([...leagueFixtures, ...fixtures].map(item => [item.id, item]));
  const nextMatch = firstTeam ? [...candidates.values()]
    .filter(item => new Date(item.kickoff).getTime() >= now.getTime() && !completed(item.status) && !/afgelast|uitgesteld|vervallen|geannuleerd|cancelled|postponed/i.test(item.status) && (item.home.id === firstTeam.teamCode || item.away.id === firstTeam.teamCode))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0] || null : null;
  return {
    updatedAt: now.toISOString(), stale: false, warning: null, teams, firstTeam, competition, standings,
    previousRound: toRound(previous.filter(item => weekKey(item.kickoff) === pastWeek), 'Nog geen uitslagen'),
    nextRound: toRound(upcoming.filter(item => weekKey(item.kickoff) === nextWeek), 'Programma volgt'),
    nextMatch, results, fixtures,
  };
}

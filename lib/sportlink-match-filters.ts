import type { SportlinkMatch, SportlinkSide, SportlinkTeam } from './sportlink-types';

export type MatchFilters = {
  teamId: string;
  venue: 'all' | 'home' | 'away';
  dateFrom: string;
  dateTo: string;
  category: string;
  competition: string;
  query: string;
};

export const defaultMatchFilters: MatchFilters = {
  teamId: 'all', venue: 'all', dateFrom: '', dateTo: '',
  category: 'all', competition: 'all', query: '',
};

export type MatchDatePreset = 'today' | 'thisweek' | 'weekend' | 'next7' | 'last7';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
});
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('nl-NL').replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
const teamCode = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0 ? value.trim() : '';

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Date-only values are already local calendar dates; timestamps are converted to Dutch time. */
export function amsterdamDateKey(value: Date | string): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return validDateKey(value) ? value : null;
  // Normalized Sportlink kickoffs carry a timezone. Reject ambiguous browser-local timestamps.
  if (typeof value === 'string' && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) || !validDateKey(value.slice(0, 10)))) return null;
  const date = value instanceof Date ? value : new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = dateFormatter.formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Returns an inline validation message, or null for a valid (including open-ended) range. */
export function validateDateRange(filters: Pick<MatchFilters, 'dateFrom' | 'dateTo'>): string | null {
  if ((filters.dateFrom && !validDateKey(filters.dateFrom)) || (filters.dateTo && !validDateKey(filters.dateTo))) return 'Kies een geldige datum.';
  return filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
    ? 'De einddatum moet op of na de begindatum liggen.' : null;
}

function shiftDay(key: string, amount: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar ranges: no addition of 24h to local midnight across DST changes. */
export function matchDatePreset(preset: MatchDatePreset, now: Date = new Date()): Pick<MatchFilters, 'dateFrom' | 'dateTo'> {
  const today = amsterdamDateKey(now);
  if (!today) return { dateFrom: '', dateTo: '' };
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shiftDay(today, -weekday);
  switch (preset) {
    case 'today': return { dateFrom: today, dateTo: today };
    case 'thisweek': return { dateFrom: monday, dateTo: shiftDay(monday, 6) };
    case 'weekend': return { dateFrom: shiftDay(monday, 5), dateTo: shiftDay(monday, 6) };
    case 'next7': return { dateFrom: today, dateTo: shiftDay(today, 6) };
    case 'last7': return { dateFrom: shiftDay(today, -6), dateTo: today };
  }
}

function matchesTeam(side: SportlinkSide, team: SportlinkTeam): boolean {
  const ownCode = teamCode(team.teamCode);
  const sideCode = teamCode(side.id);
  // Different real IDs must never match merely because names happen to overlap.
  if (ownCode && sideCode) return ownCode === sideCode;
  const name = normalized(team.name);
  return !!name && normalized(side.name) === name;
}

/** Filters the available feed only; does not imply that Sportlink supplied a complete date range. */
export function filterSportlinkMatches(
  source: readonly SportlinkMatch[],
  teams: readonly SportlinkTeam[],
  filters: MatchFilters,
  sortDirection: 'asc' | 'desc' = 'asc',
): SportlinkMatch[] {
  if (validateDateRange(filters)) return [];
  const hasTeam = filters.teamId !== 'all';
  const selectedTeam = hasTeam ? teams.find(team => team.id === filters.teamId) : undefined;
  if (hasTeam && !selectedTeam) return [];
  const hasCategory = filters.category !== 'all';
  const eligibleTeams = (selectedTeam ? [selectedTeam] : teams).filter(team => !hasCategory || team.category === filters.category);
  const sideMatches = (side: SportlinkSide) => eligibleTeams.some(team => matchesTeam(side, team)) || (!hasTeam && !hasCategory && side.own);
  const terms = normalized(filters.query).split(' ').filter(Boolean);
  const dated = !!(filters.dateFrom || filters.dateTo);

  return source.filter(match => {
    const home = sideMatches(match.home);
    const away = sideMatches(match.away);
    if ((hasTeam || hasCategory) && !home && !away) return false;
    if (filters.venue === 'home' && !home) return false;
    if (filters.venue === 'away' && !away) return false;
    if (filters.competition !== 'all' && match.competitionLabel !== filters.competition) return false;
    if (dated) {
      const date = amsterdamDateKey(match.kickoff);
      if (!date || (filters.dateFrom && date < filters.dateFrom) || (filters.dateTo && date > filters.dateTo)) return false;
    }
    if (terms.length) {
      const haystack = normalized(`${match.home.name} ${match.away.name} ${match.venue}`);
      if (!terms.every(term => haystack.includes(term))) return false;
    }
    return true;
  }).sort((a, b) => {
    const aTime = Date.parse(a.kickoff);
    const bTime = Date.parse(b.kickoff);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    // Unknown kickoffs stay last in either view. Equal times retain feed order.
    if (!aValid || !bValid) return aValid ? -1 : bValid ? 1 : 0;
    return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
  });
}

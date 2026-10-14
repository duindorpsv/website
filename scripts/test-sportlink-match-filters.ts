import assert from 'node:assert/strict';
import test from 'node:test';
import type { SportlinkMatch, SportlinkSide, SportlinkTeam } from '../lib/sportlink-types';

const { amsterdamDateKey, defaultMatchFilters, filterSportlinkMatches, matchDatePreset, validateDateRange } = await import(new URL('../lib/sportlink-match-filters.ts', import.meta.url).href) as typeof import('../lib/sportlink-match-filters');
const team = (id: string, name: string, category = 'Senioren'): SportlinkTeam => ({ id: `${id}:-1`, teamCode: id, localTeamCode: '-1', name, category, gender: 'man', sport: 'Veld', day: 'zaterdag', competitions: [] });
const first = team('101', 'Duindorp sv 1');
const second = team('102', 'Duindorp sv 2');
const youth = team('103', 'Duindorp sv JO13-1', 'Jeugd');
const teams = [first, second, youth];
const side = (id: string, name: string, own = false): SportlinkSide => ({ id, name, own, clubCode: own ? 'DSV' : 'OTHER', logoUrl: null });
const firstSide = side('101', first.name, true);
const secondSide = side('102', second.name, true);
const youthSide = side('103', youth.name, true);
const opponent = side('201', 'Die Haghe 1');
const match = (id: string, home = firstSide, away = opponent, kickoff = '2026-10-10T12:30:00Z', extra: Partial<SportlinkMatch> = {}): SportlinkMatch => ({ id, kickoff, home, away, homeScore: null, awayScore: null, scoreLabel: null, status: 'Te spelen', venue: 'Sportpark Houtrust', competitionId: 'league', competitionLabel: '4e klasse C', ...extra });
const filters = (extra: Partial<typeof defaultMatchFilters> = {}) => ({ ...defaultMatchFilters, ...extra });
const ids = (matches: SportlinkMatch[]) => matches.map(item => item.id);

test('combines selected team, own venue, dates, category, competition and normalized search', () => {
  const feed = [
    match('keep'), match('away', opponent, firstSide),
    match('other-team', secondSide), match('other-competition', firstSide, opponent, undefined, { competitionLabel: 'Beker' }),
    match('later', firstSide, opponent, '2026-10-17T12:30:00Z'),
    match('other-location', firstSide, opponent, undefined, { venue: 'Sportpark West' }),
  ];
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ teamId: first.id, venue: 'home', dateFrom: '2026-10-10', dateTo: '2026-10-11', category: 'Senioren', competition: '4e klasse C', query: 'HÁGHE houtrust' }))), ['keep']);
  assert.deepEqual(filterSportlinkMatches(feed, teams, filters({ competition: '4e klasse' })), []);
});

test('home and away refer to the selected team, including a game between two own teams', () => {
  const feed = [match('first-home', firstSide, secondSide), match('second-home', secondSide, firstSide)];
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ teamId: first.id, venue: 'home' }))), ['first-home']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ teamId: first.id, venue: 'away' }))), ['second-home']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ teamId: second.id, venue: 'home' }))), ['second-home']);
});

test('all-team home/away uses own flags or known codes and never generic opponent-name substrings', () => {
  const known = side('101', 'Unexpected feed label');
  const feed = [match('home', known), match('away', opponent, known), match('explicit', side('999', 'Duindorp new team', true)), match('opponents', opponent, side('202', 'Loosduinen 1')), match('misleading', side('999', first.name))];
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ venue: 'home' }))), ['home', 'explicit']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ venue: 'away' }))), ['away']);
});

test('missing team IDs fall back to exact normalized names while mismatched real IDs do not', () => {
  const unknownYouth = team('-1', 'Duindorp S.V. JO13-1', 'Jeugd');
  const feed = [match('name', side('-1', '  DUINDORP sv   JO13-1 ')), match('prefix-only', side('-1', 'Duindorp sv JO13-10')), match('same-name-wrong-code', side('777', first.name)), match('synthesized-id', side('DSV:duindorp sv 1', first.name))];
  assert.deepEqual(ids(filterSportlinkMatches(feed, [unknownYouth], filters({ teamId: unknownYouth.id }))), ['name']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ teamId: first.id }))), ['synthesized-id']);
  assert.deepEqual(filterSportlinkMatches(feed, teams, filters({ teamId: 'missing' })), []);
});

test('category matches known own teams on the correct venue side', () => {
  const feed = [match('youth-home', youthSide), match('youth-away', firstSide, youthSide), match('seniors', firstSide)];
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ category: 'Jeugd' }))), ['youth-home', 'youth-away']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ category: 'Jeugd', venue: 'away' }))), ['youth-away']);
  assert.deepEqual(filterSportlinkMatches(feed, teams, filters({ teamId: first.id, category: 'Jeugd' })), []);
});

test('date keys use Dutch midnight in summer, winter and on both DST transition days', () => {
  assert.equal(amsterdamDateKey('2026-10-09T22:00:00Z'), '2026-10-10');
  assert.equal(amsterdamDateKey('2026-01-09T23:00:00Z'), '2026-01-10');
  assert.equal(amsterdamDateKey('2026-03-29T21:59:59Z'), '2026-03-29');
  assert.equal(amsterdamDateKey('2026-03-29T22:00:00Z'), '2026-03-30');
  assert.equal(amsterdamDateKey('2026-10-25T22:59:59Z'), '2026-10-25');
  assert.equal(amsterdamDateKey('2026-10-25T23:00:00Z'), '2026-10-26');
  assert.equal(amsterdamDateKey('2026-10-10T00:00:00+0200'), '2026-10-10');
  assert.equal(amsterdamDateKey(new Date('2026-10-09T23:00:00Z')), '2026-10-10');
  assert.equal(amsterdamDateKey('2026-02-30'), null);
  assert.equal(amsterdamDateKey('2026-10-10T12:00:00'), null);
  assert.equal(amsterdamDateKey(new Date('invalid')), null);
});

test('date range is inclusive, accepts open ends, and excludes missing kickoffs only when active', () => {
  const feed = [match('before', firstSide, opponent, '2026-10-09T21:59:59Z'), match('start', firstSide, opponent, '2026-10-09T22:00:00Z'), match('end', firstSide, opponent, '2026-10-11T21:59:59Z'), match('after', firstSide, opponent, '2026-10-11T22:00:00Z'), match('unknown', firstSide, opponent, '')];
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ dateFrom: '2026-10-10', dateTo: '2026-10-11' }))), ['start', 'end']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ dateTo: '2026-10-10' }))), ['before', 'start']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters({ dateFrom: '2026-10-12' }))), ['after']);
  assert.equal(filterSportlinkMatches(feed, teams, filters()).at(-1)?.id, 'unknown');
  assert.equal(filterSportlinkMatches(feed, teams, filters(), 'desc').at(-1)?.id, 'unknown');
});

test('invalid date ranges have actionable errors and no accidental unfiltered results', () => {
  assert.equal(validateDateRange(filters()), null);
  assert.equal(validateDateRange(filters({ dateFrom: '2026-10-10', dateTo: '2026-10-10' })), null);
  assert.ok(validateDateRange(filters({ dateFrom: '2026-10-11', dateTo: '2026-10-10' })));
  assert.ok(validateDateRange(filters({ dateFrom: '2026-02-30' })));
  assert.deepEqual(filterSportlinkMatches([match('any')], teams, filters({ dateFrom: '2026-10-11', dateTo: '2026-10-10' })), []);
});

test('presets follow Dutch ISO weeks, include exactly seven calendar days, and cross DST safely', () => {
  const monday = new Date('2026-10-11T22:30:00Z');
  assert.deepEqual(matchDatePreset('today', monday), { dateFrom: '2026-10-12', dateTo: '2026-10-12' });
  assert.deepEqual(matchDatePreset('thisweek', monday), { dateFrom: '2026-10-12', dateTo: '2026-10-18' });
  assert.deepEqual(matchDatePreset('weekend', new Date('2026-10-11T12:00:00Z')), { dateFrom: '2026-10-10', dateTo: '2026-10-11' });
  assert.deepEqual(matchDatePreset('next7', new Date('2026-03-27T23:30:00Z')), { dateFrom: '2026-03-28', dateTo: '2026-04-03' });
  assert.deepEqual(matchDatePreset('last7', new Date('2026-10-25T23:30:00Z')), { dateFrom: '2026-10-20', dateTo: '2026-10-26' });
});

test('sorting uses actual instants, preserves ties and does not mutate input arrays or objects', () => {
  const feed = [match('late', firstSide, opponent, '2026-10-10T12:30:00Z'), match('early', firstSide, opponent, '2026-10-10T13:30:00+02:00'), match('tie', firstSide, opponent, '2026-10-10T12:30:00Z')];
  const before = JSON.stringify({ feed, teams, defaultMatchFilters });
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters())), ['early', 'late', 'tie']);
  assert.deepEqual(ids(filterSportlinkMatches(feed, teams, filters(), 'desc')), ['late', 'tie', 'early']);
  assert.equal(JSON.stringify({ feed, teams, defaultMatchFilters }), before);
});

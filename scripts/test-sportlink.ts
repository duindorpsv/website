import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { SportlinkStanding } from '../lib/sportlink-types';

// A URL import lets Node execute the TypeScript directly without changing the app tsconfig.
const { centeredStandings, normalizeSportlink } = await import(new URL('../lib/sportlink-normalize.ts', import.meta.url).href) as typeof import('../lib/sportlink-normalize');
const now = new Date('2026-10-09T22:30:00Z');
const team = { teamcode: 218380, lokaleteamcode: -1, teamnaam: 'Duindorp sv 1', poulecode: 826233, competitiesoort: 'regulier', klassepoule: '4e klasse C', geslacht: 'man', leeftijdscategorie: 'Senioren' };
const standing = { positie: 5, teamnaam: 'Duindorp sv 1', clubrelatiecode: 'BBGV51U', eigenteam: 'true', gespeeldewedstrijden: 3, gewonnen: 2, gelijk: 0, verloren: 1, doelpuntenvoor: 7, doelpuntentegen: 8, doelsaldo: -1, punten: 6 };
const empty = () => ({ teams: [team], standings: [standing], leagueResults: [] as unknown[], leagueFixtures: [] as unknown[], clubResults: [] as unknown[], clubFixtures: [] as unknown[] });
const game = (id: number, date: string, status = 'Uitgespeeld', score = '1 - 0') => ({ wedstrijdcode: id, wedstrijddatum: date, thuisteamid: '218380', thuisteam: 'Duindorp sv 1', thuisteamclubrelatiecode: 'BBGV51U', uitteamid: '128614', uitteam: 'Die Haghe 1', uitteamclubrelatiecode: 'BBGV42S', status, uitslag: score, thuisteamlogo: 'https://binaries.sportlink.com/expired?sig=temporary', uitteamlogo: 'https://binaries.sportlink.com/expired?sig=temporary' });

test('teams are unique by both codes, retain all poules, and select the regular first-team competition', () => {
  const input = empty();
  input.teams = [
    { ...team, teamcode: 381608, teamnaam: 'Duindorp sv VR1', geslacht: 'vrouw' },
    { ...team, poulecode: 827204, competitiesoort: 'beker', klassepoule: 'KNVB Beker 30' },
    team, team,
    { ...team, teamcode: 355471, teamnaam: 'Duindorp sv 35+1' },
    { ...team, teamcode: 394546, teamnaam: 'Duindorp sv 35+1' },
  ];
  const snapshot = normalizeSportlink(input, now);
  assert.equal(snapshot.teams.length, 4);
  assert.equal(snapshot.firstTeam?.id, '218380:-1');
  assert.deepEqual(snapshot.firstTeam?.competitions.map(item => item.id), ['827204', '826233']);
  assert.equal(snapshot.competition?.id, '826233');
  assert.equal(snapshot.competition?.type, 'regulier');
});

test('a supplied 0–0 is a draw only when completed; abandoned, cancelled and missing scores do not invent form', () => {
  const input = empty();
  input.leagueResults = [
    game(1, '2026-09-01T14:30:00+0200', 'Uitgespeeld', '0 - 0'),
    game(2, '2026-09-02T14:30:00+0200', 'Gestaakt', '0 - 0'),
    game(3, '2026-09-03T14:30:00+0200', 'Afgelast', '5 - 0'),
    game(4, '2026-09-04T14:30:00+0200', 'Uitgesteld', '0 - 2'),
    game(5, '2026-09-05T14:30:00+0200', 'Uitgespeeld', '-'),
    game(6, '2026-09-06T14:30:00+0200', '', '3 - 0'),
  ];
  input.clubResults = input.leagueResults;
  const snapshot = normalizeSportlink(input, now);
  assert.deepEqual(snapshot.standings[0].form, ['GL']);
  assert.equal(snapshot.results[0].homeScore, 0);
  assert.equal(snapshot.results[0].awayScore, 0);
  assert.equal(snapshot.results[0].scoreLabel, '0 – 0');
  assert.ok(snapshot.results.slice(1).every(item => item.homeScore === null && item.awayScore === null && item.scoreLabel === null));
  assert.deepEqual(normalizeSportlink(empty(), now).standings[0].form, []);
});

test('form is chronological, uses the team perspective, is deduplicated and contains at most five played league games', () => {
  const input = empty();
  const a = game(1, '2026-09-01T14:30:00+0200', 'Uitgespeeld', '1 - 0');
  input.leagueResults = [
    game(6, '2026-09-06T14:30:00+0200', 'Uitgespeeld', '0 - 1'), a,
    game(3, '2026-09-03T14:30:00+0200', 'Uitgespeeld', '1 - 0'),
    game(2, '2026-09-02T14:30:00+0200', 'Uitgespeeld', '0 - 0'),
    { ...game(4, '2026-09-04T14:30:00+0200', 'Uitgespeeld', '2 - 0'), thuisteamid: '128614', thuisteam: 'Die Haghe 1', thuisteamclubrelatiecode: 'BBGV42S', uitteamid: '218380', uitteam: 'Duindorp sv 1', uitteamclubrelatiecode: 'BBGV51U' },
    game(5, '2026-09-05T14:30:00+0200', 'Uitgespeeld', '2 - 2'), a,
    game(7, '2026-10-20T14:30:00+0200', 'Uitgespeeld', '5 - 0'),
  ];
  input.clubResults = [game(99, '2026-10-01T14:30:00+0200', 'Uitgespeeld', '9 - 0')];
  assert.deepEqual(normalizeSportlink(input, now).standings[0].form, ['GL', 'W', 'V', 'GL', 'V']);
});

test('rounds use Amsterdam calendar weeks across a UTC Sunday/Monday boundary', () => {
  const input = empty();
  input.leagueResults = [game(1, '2026-10-11T23:30:00+0200'), game(2, '2026-10-12T00:30:00+0200')];
  input.leagueFixtures = [game(3, '2026-10-18T23:30:00+0200', 'Te spelen', ''), game(4, '2026-10-19T00:30:00+0200', 'Te spelen', '')];
  const snapshot = normalizeSportlink(input, new Date('2026-10-11T23:00:00Z'));
  assert.deepEqual(snapshot.previousRound.matches.map(item => item.id), ['2']);
  assert.equal(snapshot.previousRound.startDate, '2026-10-12');
  assert.deepEqual(snapshot.nextRound.matches.map(item => item.id), ['3']);
  assert.equal(snapshot.nextRound.startDate, '2026-10-18');
  assert.equal(snapshot.nextMatch?.id, '3');
});

test('next hero match skips cancellations and youth matches; logo URLs are stable', () => {
  const input = empty();
  input.clubFixtures = [
    game(1, '2026-10-10T10:00:00+0200', 'Afgelast', ''),
    { ...game(2, '2026-10-10T11:00:00+0200', 'Te spelen', ''), thuisteamid: '-1', thuisteam: 'Duindorp sv O14-2', uitteamid: '-1', uitteam: 'Die Haghe O14-3' },
    game(3, '2026-10-10T14:30:00+0200', 'Te spelen', ''),
  ];
  const snapshot = normalizeSportlink(input, now);
  assert.equal(snapshot.nextMatch?.id, '3');
  assert.equal(snapshot.nextMatch?.home.logoUrl, '/assets/logo.png');
  assert.equal(snapshot.nextMatch?.away.logoUrl, 'https://logoapi.voetbal.nl/logo.php?clubcode=BBGV42S');
  assert.equal(JSON.stringify(snapshot).includes('binaries.sportlink.com'), false);
});

test('five rows center on Duindorp and expand at both ends without changing standings', () => {
  const base = normalizeSportlink(empty(), now).standings[0];
  const build = (count: number, own: number): SportlinkStanding[] => Array.from({ length: count }, (_, index) => ({ ...base, rank: index + 1, team: { ...base.team, own: index + 1 === own } }));
  for (const [own, ranks] of [[1, [1, 2, 3, 4, 5]], [2, [1, 2, 3, 4, 5]], [5, [3, 4, 5, 6, 7]], [13, [10, 11, 12, 13, 14]], [14, [10, 11, 12, 13, 14]]] as const) {
    const rows = build(14, own);
    assert.deepEqual(centeredStandings(rows).map(row => row.rank), ranks);
    assert.equal(rows.length, 14);
  }
  assert.deepEqual(centeredStandings(build(3, 2)).map(row => row.rank), [1, 2, 3]);
  assert.deepEqual(centeredStandings(build(14, 0)).map(row => row.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(centeredStandings([], 5), []);
  assert.deepEqual(centeredStandings(build(14, 5), 0), []);
});

test('an empty feed stays empty and invalid dates do not become fabricated matches', () => {
  const input = empty();
  input.teams = [];
  assert.equal(normalizeSportlink(input, now).firstTeam, null);
  assert.equal(normalizeSportlink(input, now).competition, null);
  input.clubFixtures = [game(1, 'not-a-date', 'Te spelen', '')];
  const snapshot = normalizeSportlink(input, now);
  assert.deepEqual(snapshot.fixtures, []);
  assert.equal(snapshot.nextMatch, null);
  assert.deepEqual(snapshot.nextRound.matches, []);
});

const fixtureDir = process.env.SPORTLINK_FIXTURE_DIR || '/workspace/scratch/75a86e84a210/sportlink-v21';
test('observed Sportlink 9 October feed: 28 teams, regular pool, 14 places, real form, seven-match weeks', { skip: !existsSync(join(fixtureDir, 'teams.json')) }, () => {
  const load = (name: string): unknown[] => JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8')) as unknown[];
  const snapshot = normalizeSportlink({ teams: load('teams'), standings: load('poulestand'), leagueResults: load('pouleuitslagen-season'), leagueFixtures: load('poule-programma'), clubResults: load('all-uitslagen'), clubFixtures: load('all-programma') }, now);
  assert.equal(snapshot.teams.length, 28);
  assert.equal(snapshot.firstTeam?.teamCode, '218380');
  assert.equal(snapshot.competition?.id, '826233');
  assert.equal(snapshot.standings.length, 14);
  assert.deepEqual(centeredStandings(snapshot.standings).map(row => row.rank), [3, 4, 5, 6, 7]);
  const own = snapshot.standings.find(row => row.team.own)!;
  assert.equal(own.rank, 5);
  assert.equal(own.played, 3);
  assert.equal(own.points, 6);
  assert.deepEqual(own.form, ['W', 'W', 'V']);
  assert.equal(snapshot.previousRound.startDate, '2026-10-03');
  assert.equal(snapshot.previousRound.matches.length, 7);
  assert.equal(snapshot.nextRound.startDate, '2026-10-10');
  assert.equal(snapshot.nextRound.matches.length, 7);
  assert.equal(snapshot.nextMatch?.id, '20934884');
  assert.equal(snapshot.nextMatch?.away.name, 'Die Haghe 1');
  const suspended = snapshot.previousRound.matches.find(item => item.id === '20935188')!;
  assert.equal(suspended.status, 'Gestaakt');
  assert.equal(suspended.scoreLabel, null);
  assert.equal(snapshot.standings.find(row => row.team.name === 'Quick Steps 1')?.form.length, 2);
});

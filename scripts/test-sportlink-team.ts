import assert from 'node:assert/strict';
import test from 'node:test';
const {currentPool,matchesForTeam,mergeTeamCatalog,normalizeRoster,poolsForTeam,seasonForDate,standingsForTeam,teamCatalog,validSeason,validTeamId}=await import(new URL('../lib/sportlink-team-normalize.ts',import.meta.url).href) as typeof import('../lib/sportlink-team-normalize');
const rawTeam={teamcode:218380,lokaleteamcode:-1,teamnaam:'Duindorp sv 1',poulecode:826233,klassepoule:'4e klasse C',competitienaam:'Mannen Zaterdag',competitiesoort:'regulier'};
const cup={...rawTeam,poulecode:827204,klassepoule:'Beker Groep 3 30',competitienaam:'Mannen KNVB beker Amateurs poulefase',competitiesoort:'beker'};
const team=teamCatalog([rawTeam,cup])[0];
const pools=poolsForTeam([rawTeam,cup],team,'2026/2027');
const game=(id:number,date:string,status='Uitgespeeld',score='1 - 0')=>({wedstrijdcode:id,wedstrijddatum:date,thuisteamid:'218380',thuisteam:'Duindorp sv 1',thuisteamclubrelatiecode:'BBGV51U',uitteamid:'128614',uitteam:'Die Haghe 1',uitteamclubrelatiecode:'BBGV42S',status,uitslag:score,klassepoule:'4e klasse C',competitiesoort:'regulier'});
const now=new Date('2026-10-11T10:00:00Z');

test('season rolls over in Amsterdam at July 1, and invalid IDs/seasons are rejected',()=>{
 assert.equal(seasonForDate(new Date('2026-06-30T21:59:59Z')),'2025/2026');
 assert.equal(seasonForDate(new Date('2026-06-30T22:00:00Z')),'2026/2027');
 assert.ok(validSeason('2026/2027'));assert.ok(!validSeason('2026/2028'));
 assert.ok(validTeamId('218380:-1'));assert.ok(validTeamId('-1:23'));
 for(const value of ['-1:-1','../../teams','218380:NaN','218380:0'])assert.ok(!validTeamId(value));
});
test('catalog retains cup and league per team and does not merge identical names with different codes',()=>{
 const rows=[rawTeam,cup,rawTeam,{...rawTeam,teamcode:9999}];
 assert.equal(teamCatalog(rows).length,2);assert.equal(teamCatalog(rows)[0].competitions.length,2);
 assert.deepEqual(poolsForTeam(rows,team,'2026/2027').map(pool=>pool.id),['826233','827204']);
});
test('team endpoint filters unrelated local friendlies and other teams from the same club',()=>{
 const rows=[game(1,'2026-10-10T14:30:00+0200'),{...game(2,'2026-10-10T14:30:00+0200'),thuisteamid:'-1',thuisteam:'Duindorp sv JO11-2',uitteamid:'-1',uitteam:'Duindorp sv JO10-1'}];
 const result=matchesForTeam(rows,team,pools,'2026/2027');assert.equal(result.length,1);
 assert.equal(result[0].competitionId,'826233');assert.equal(result[0].home.own,true);
 assert.equal(result[0].home.logoUrl,'/assets/logo.png');
 assert.equal(result[0].away.logoUrl,'https://sassets.knvb.nl/sites/voetbal.nl/files/knvblogos_width60/BBGV42S.png');
});
test('previous-season results never leak into the selected season',()=>{
 const rows=[game(1,'2026-06-20T14:30:00+0200'),game(2,'2026-09-20T14:30:00+0200')];
 assert.deepEqual(matchesForTeam(rows,team,pools,'2026/2027').map(match=>match.id),['2']);
});
test('cup and league results map to the specific catalogue without assuming the first team league',()=>{
 const rows=[{...game(1,'2026-09-05T14:30:00+0200'),klassepoule:undefined,competitienaam:cup.competitienaam,competitiesoort:'beker'}];
 const result=matchesForTeam(rows,team,pools,'2026/2027');assert.equal(result[0].competitionId,'827204');
});
test('default picks active league over finished cup even when cup code is larger',()=>{
 const rows=[{...game(1,'2026-09-05T14:30:00+0200'),klassepoule:cup.klassepoule,competitiesoort:'beker'},game(2,'2026-10-10T14:30:00+0200'),game(3,'2026-10-24T14:30:00+0200','Te spelen','')];
 assert.equal(currentPool(pools,matchesForTeam(rows,team,pools,'2026/2027'),now)?.id,'826233');
});
test('the active phase remains selected until it finishes; the next scheduled phase then becomes default',()=>{
 const phase1={...pools[0],id:'900',phase:'Fase 1',label:'Fase 1'};
 const phase2={...pools[0],id:'100',phase:'Fase 2',label:'Fase 2'};
 const phasePools=[phase1,phase2];
 const rows=[{...game(1,'2026-10-10T14:30:00+0200'),poulecode:'900'},{...game(2,'2026-10-17T14:30:00+0200','Te spelen',''),poulecode:'900'},{...game(3,'2026-10-31T14:30:00+0100','Te spelen',''),poulecode:'100'}];
 const normalized=matchesForTeam(rows,team,phasePools,'2026/2027');
 assert.equal(currentPool(phasePools,normalized,now)?.id,'900');
 assert.equal(currentPool(phasePools,normalized,new Date('2026-10-20T10:00:00Z'))?.id,'100');
});
test('zero draw is valid, but cancelled, missing and unfinished scores are not invented',()=>{
 const rows=[game(1,'2026-10-01T14:30:00+0200','Uitgespeeld','0 - 0'),game(2,'2026-10-02T14:30:00+0200','Afgelast','3 - 1'),game(3,'2026-10-03T14:30:00+0200','Te spelen','0 - 0')];
 assert.deepEqual(matchesForTeam(rows,team,pools,'2026/2027').map(match=>match.homeScore),[0,null,null]);
});
test('standings show form for both opponents and selected team, without highlighting another Duindorp team',()=>{
 const results=matchesForTeam([game(1,'2026-10-01T14:30:00+0200')],team,pools,'2026/2027',{allTeams:true});
 const rows=[{positie:1,teamnaam:'Duindorp sv 1',clubrelatiecode:'BBGV51U',eigenteam:'true'},{positie:2,teamnaam:'Die Haghe 1',clubrelatiecode:'BBGV42S'},{positie:3,teamnaam:'Duindorp sv 2',clubrelatiecode:'BBGV51U',eigenteam:'true'}];
 const standings=standingsForTeam(rows,team,results);
 assert.deepEqual(standings.map(row=>row.form),[['W'],['V'],[]]);
 assert.deepEqual(standings.map(row=>row.team.own),[true,false,false]);
 assert.equal(standings[1].team.logoUrl,'https://sassets.knvb.nl/sites/voetbal.nl/files/knvblogos_width60/BBGV42S.png');
});
test('roster respects hidden identities and never exposes contact details or member codes',()=>{
 const roster=normalizeRoster([{naam:'Afgeschermd',relatiecode:'private-1',foto:'/9j/FAKE'},{naam:'Test Speler',rol:'Teamspeler',relatiecode:'private-2',email:'private@example.test',foto:'/9j/AAAA'},{naam:'Test Trainer',rol:'Technische staf',functie:'Trainer',foto:'https://untrusted.test/foto'}],team.id,now);
 assert.equal(roster.hiddenPlayers,1);assert.equal(roster.players.length,2);assert.equal(roster.players[0].kind,'player');assert.equal(roster.players[1].kind,'staff');
 assert.equal(roster.photos.length,1);assert.equal(roster.players[1].photoUrl,null);
 assert.ok(!JSON.stringify(roster).includes('private'));
});
test('portrait IDs stay attached to the same name when roster order changes',()=>{
 const one={naam:'Eerste Speler',rol:'Teamspeler',foto:'/9j/AAAA'},two={naam:'Tweede Speler',rol:'Teamspeler',foto:'/9j/BBBB'};
 const a=normalizeRoster([one,two],team.id,now),b=normalizeRoster([two,one],team.id,now);
 assert.equal(a.players[0].id,b.players[1].id);assert.notEqual(a.players[0].id,a.players[1].id);
});

test('season catalog preserves finished poules while updating current team metadata',()=>{
 const next={...rawTeam,poulecode:99,teamnaam:'Duindorp SV 1',klassepoule:'Nieuwe fase'};
 const merged=mergeTeamCatalog([rawTeam,cup],[next]);
 assert.deepEqual(poolsForTeam(merged,team,'2026/2027').map(pool=>pool.id),['826233','827204','99']);
 assert.equal(teamCatalog(merged)[0].name,'Duindorp SV 1');
});

test('identical class labels across phases resolve by specific competition name and ambiguous rows stay unassigned',()=>{
 const phasePools=[{...pools[0],id:'101',label:'1e klasse 01',competitionName:'Jeugd 1e fase'},{...pools[0],id:'102',label:'1e klasse 01',competitionName:'Jeugd 2e fase'}];
 const rows=[{...game(1,'2026-10-10T14:30:00+0200'),klassepoule:'1e klasse 01',competitienaam:'Jeugd 2e fase'},{...game(2,'2026-10-10T14:30:00+0200'),klassepoule:'1e klasse 01'}];
 assert.deepEqual(matchesForTeam(rows,team,phasePools,'2026/2027').map(match=>match.competitionId),['102','']);
});

test('Sportlink-coded cup labels fall back only to a unique explicit competition type',()=>{
 const row={...game(1,'2026-09-05T14:30:00+0200'),klassepoule:undefined,competitienaam:'B1000 Mannen KNVB beker Amateurs poulefase',competitiesoort:'beker'};
 assert.equal(matchesForTeam([row],team,pools,'2026/2027')[0].competitionId,'827204');
 assert.equal(matchesForTeam([{...row,competitiesoort:undefined}],team,pools,'2026/2027')[0].competitionId,'');
 assert.equal(matchesForTeam([row],team,[...pools,{...pools[1],id:'3',label:'Andere bekerronde',competitionName:'Andere bekerronde'}],'2026/2027')[0].competitionId,'');
});

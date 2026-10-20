import assert from 'node:assert/strict';
import test from 'node:test';
import type {SportlinkMatch} from '../../lib/sportlink-types';
const {normalizeSportlink}=await import(new URL('../../lib/sportlink-normalize.ts',import.meta.url).href) as typeof import('../../lib/sportlink-normalize');
const {matchesForTeam,teamCatalog,poolsForTeam}=await import(new URL('../../lib/sportlink-team-normalize.ts',import.meta.url).href) as typeof import('../../lib/sportlink-team-normalize');
const rawTeam={teamcode:218380,lokaleteamcode:-1,teamnaam:'Duindorp sv 1',poulecode:826233,klassepoule:'4e klasse C',competitiesoort:'regulier'};
const team=teamCatalog([rawTeam])[0],pools=poolsForTeam([rawTeam],team,'2026/2027');
const rawMatch={wedstrijdcode:1001,wedstrijddatum:'2026-10-24T14:30:00+0200',thuisteamid:'218380',thuisteam:'Duindorp sv 1',thuisteamclubrelatiecode:'BBGV51U',uitteamid:'128614',uitteam:'Die Haghe 1',uitteamclubrelatiecode:'BBGV42S',status:'Te spelen',uitslag:'',accommodatie:'Sportpark Duindorp',veld:'Veld 1',kleedkamerthuisteam:'1',kleedkameruitteam:2,scheidsrechter:'A. Voorbeeld',adres:'Houtrustlaan 1',postcode:'2566 ZW',plaats:'Den Haag'};
function clubMatch(row=rawMatch){return normalizeSportlink({teams:[rawTeam],standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:[row]},new Date('2026-10-20T12:00:00Z')).fixtures[0];}
test('club and team feeds expose actual field, both rooms, referee and address',()=>{
 const club=clubMatch(),detail=matchesForTeam([rawMatch],team,pools,'2026/2027')[0];
 for(const match of [club,detail]){
  assert.equal(match.field,'Veld 1');assert.equal(match.homeDressingRoom,'1');assert.equal(match.awayDressingRoom,'2');
  assert.equal(match.referee,'A. Voorbeeld');assert.equal(match.venueAddress,'Houtrustlaan 1 · 2566 ZW · Den Haag');
 }
});
test('removed assignments are explicit empty values rather than an old-value merge',()=>{
 const removed={...rawMatch,veld:'',kleedkamerthuisteam:'',kleedkameruitteam:undefined as unknown as number,scheidsrechter:''};
 for(const match of [clubMatch(removed),matchesForTeam([removed],team,pools,'2026/2027')[0]]){
  assert.equal(match.field,'');assert.equal(match.homeDressingRoom,'');assert.equal(match.awayDressingRoom,'');assert.equal(match.referee,'');
 }
});

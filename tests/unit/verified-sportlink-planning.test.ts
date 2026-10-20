import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSportlink} from '../../lib/sportlink-normalize';
import {verifiedMatchSide,sourceDuration,matchWithDetail} from '../../lib/server/sportlink-planning';
import {accommodationEvidence} from '../../lib/server/sportlink-identity';
import {matchColors,matchSideLabel,needsFieldAssignment} from '../../lib/cms/planning';
import {defaultSportlinkSettings,sportlinkSettingsSchema} from '../../lib/cms/sportlink-settings';
import {createCmsSeed} from '../../lib/cms/seed';
import type {CmsActivity} from '../../lib/cms/types';
const rows=[{teamcode:101,lokaleteamcode:-1,teamnaam:'Duindorp SV JO13-1'}];
const fixture=(home='101',away='202',homeClub='OWN',awayClub='OTHER')=>({wedstrijdcode:301,wedstrijddatum:'2026-10-24T14:00:00+0200',thuisteamid:home,uitteamid:away,thuisteamclubrelatiecode:homeClub,uitteamclubrelatiecode:awayClub,thuisteam:'Duindorp SV JO13-1',uitteam:'Quick JO13-2',accommodatie:'Veld 1'});
const normalize=(clubFixtures:unknown[])=>normalizeSportlink({verifiedClubCode:'OWN',teams:rows,standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures});
test('only the authorized team catalog and matching club identity establish own-team planning',()=>{
 const first=normalize([fixture()]),second=normalize([fixture()]);assert.deepEqual(first.teams,second.teams);assert.equal(first.teams.length,1);assert.equal(first.teams[0].id,'101:-1');assert.equal(verifiedMatchSide(first.fixtures[0],first.teams,'OWN'),'home');
 const away=normalize([fixture('202','101','OTHER','OWN')]);assert.equal(verifiedMatchSide(away.fixtures[0],away.teams,'OWN'),'away');
 const forged=normalize([fixture('999','202','OWN','OTHER')]);assert.equal(forged.fixtures[0].home.own,false);assert.equal(verifiedMatchSide(forged.fixtures[0],forged.teams,'OWN'),null,'club name/code alone does not make an unknown team our team');
 const conflict=normalize([fixture('101','202','OTHER','OTHER')]);assert.equal(verifiedMatchSide(conflict.fixtures[0],conflict.teams,'OWN'),null);assert.equal(conflict.fixtures.length,1,'public opponent data remains intact');
 assert.equal(verifiedMatchSide(first.fixtures[0],[...first.teams,{...first.teams[0],id:'101:22',localTeamCode:'22'}],'OWN'),null,'ambiguous local team codes require review');
});
test('identical park labels are evidence to review, never resource IDs',()=>{
 const own=accommodationEvidence({accommodatie:{naam:'Veld 1',straat:'Eigenstraat 1',plaats:'Den Haag'}}),foreign=accommodationEvidence({accommodatie:{naam:'Veld 1',straat:'Anderestraat 2',plaats:'Delft'}});
 assert.notEqual(own.fingerprint,foreign.fingerprint);assert.equal(accommodationEvidence({venue:'Veld 1'}).fingerprint,'');
 const config=defaultSportlinkSettings();config.locationMappings=[{sourceType:'field',sourceValue:'Veld 1',locationId:'a',clubCode:'OWN',accommodationId:'park-a'},{sourceType:'field',sourceValue:'Veld 1',locationId:'b',clubCode:'OTHER',accommodationId:'park-b'}];assert.ok(sportlinkSettingsSchema.safeParse(config).success);
});
const activity=(side:'home'|'away'|'unknown',verified=false):CmsActivity=>({id:'match',title:'Wedstrijd',type:'match',date:'2026-10-24',startTime:'14:00',endTime:'15:30',locationIds:[],personIds:[],committeeIds:[],teamIds:[],public:false,description:'',status:'planned',source:'sportlink',sourceId:'OWN:301',sourceData:{provider:'sportlink',clubId:'OWN',matchId:'301',locationIds:[],side,accommodationVerified:verified,lastSyncedAt:'2026-10-20T12:00:00Z'}});
test('away is not cancellation and only a verified own-park home match needs an own field',()=>{
 const state=createCmsSeed();assert.equal(matchSideLabel(activity('away')),'Uit');assert.equal(needsFieldAssignment(state,activity('away')),false);assert.equal(needsFieldAssignment(state,activity('home')),false);assert.equal(needsFieldAssignment(state,activity('home',true)),true);
 assert.deepEqual(matchColors(activity('home')),{background:'#eaf2fc',borderColor:'#5c99d4',color:'#356da7'});assert.deepEqual(matchColors(activity('away')),{background:'#f1f3f5',borderColor:'#b4beca',color:'#4b596b'});assert.equal(matchSideLabel(activity('unknown')),'Nog te bepalen');
 assert.equal(needsFieldAssignment(state,{...activity('home',true),status:'cancelled'}),false);
});
test('a missing duration is never guessed',()=>{assert.equal(sourceDuration(''),null);assert.equal(sourceDuration('01:30'),90);assert.equal(sourceDuration(90),90);assert.equal(sourceDuration('90 minuten'),null);assert.equal(sourceDuration('00:90'),null);});

test('documented detail datetime is authoritative and contradictory team IDs or ambiguous local hours abort',()=>{const match=normalize([fixture()]).fixtures[0];assert.equal(matchWithDetail(match,{wedstrijdinformatie:{wedstrijddatetime:'2026-10-24T14:15:00+0200'}}).kickoff,'2026-10-24T12:15:00.000Z');assert.throws(()=>matchWithDetail(match,{wedstrijdinformatie:{thuisteamid:999}}));assert.throws(()=>matchWithDetail(match,{wedstrijdinformatie:{wedstrijddatum:'2026-10-25',aanvangstijd:'02:30'}}));});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {defaultSportlinkSettings,nextSportlinkRun,sportlinkSettingsSchema,sportlinkArticleDataset} from '../../lib/cms/sportlink-settings';
import {sportlinkAssignmentFields} from '../../lib/sportlink-assignments';
import {normalizeSportlink} from '../../lib/sportlink-normalize';
test('Sportlink defaults distinguish slow catalogs from source-authoritative match assignments',()=>{
 const config=defaultSportlinkSettings();assert.ok(sportlinkSettingsSchema.safeParse(config).success);
 assert.deepEqual(config.schedules.teams,{enabled:true,every:3,unit:'month'});assert.deepEqual(config.schedules.players,{enabled:true,every:1,unit:'month'});assert.deepEqual(config.schedules.matches,{enabled:true,every:6,unit:'hour'});assert.deepEqual(config.schedules.assignments,{enabled:true,every:15,unit:'minute'});
 config.schedules.assignments={enabled:true,every:6,unit:'hour'};assert.equal(sportlinkSettingsSchema.safeParse(config).success,false);
});
test('calendar-month synchronization respects month boundaries, leap years and Amsterdam DST',()=>{
 assert.equal(new Date(nextSportlinkRun({enabled:true,every:1,unit:'month'},new Date('2028-01-31T11:00:00Z'))).toISOString(),'2028-02-29T11:00:00.000Z');
 assert.equal(new Date(nextSportlinkRun({enabled:true,every:3,unit:'month'},new Date('2026-01-31T11:00:00Z'))).toISOString(),'2026-04-30T10:00:00.000Z');
 assert.equal(nextSportlinkRun({enabled:true,every:6,unit:'hour'},new Date('2026-10-25T00:00:00Z'))-Date.parse('2026-10-25T00:00:00Z'),6*3600000);
});
test('configuration rejects duplicate mappings, unsafe targets and authority overrides',()=>{
 const config=defaultSportlinkSettings();config.locationMappings=[{sourceType:'field',sourceValue:'Veld Één',locationId:'field-1'},{sourceType:'field',sourceValue:' veld een ',locationId:'field-2'}];assert.equal(sportlinkSettingsSchema.safeParse(config).success,false);
 config.locationMappings=[];config.teamMappings=[{cmsTeamId:'one',teamId:'123:-1'},{cmsTeamId:'two',teamId:'123:-1'}];assert.equal(sportlinkSettingsSchema.safeParse(config).success,false);
 assert.equal(sportlinkSettingsSchema.safeParse({...defaultSportlinkSettings(),apiUrl:'https://example.invalid',localOverrides:true}).success,false);
 for(const name of ['programma','poule-programma'])assert.equal(sportlinkArticleDataset(name),'matches');assert.equal(sportlinkArticleDataset('team-indeling'),'players');assert.equal(sportlinkArticleDataset('wedstrijd-kleedkamers'),'assignments');
});
test('field and changing-room identity comes from actual source fields, never the accommodation',()=>{
 assert.deepEqual(sportlinkAssignmentFields({accommodatie:'Sportpark Duindorp',veld:'Veld 1',kleedkamerthuisteam:'3',kleedkameruitteam:'4'}),{field:'Veld 1',homeDressingRoom:'3',awayDressingRoom:'4',referee:'',venueAddress:'',changingRooms:{home:'3',away:'4',official:''}});
 assert.equal(sportlinkAssignmentFields({accommodatie:'Veld 1'}).field,'');
 const match={wedstrijdcode:123,wedstrijddatum:'2026-10-24T14:30:00+0200',thuisteamid:'1',thuisteam:'Duindorp sv 1',uitteamid:'2',uitteam:'Tegenstander 1',veld:'Veld 2',kleedkamerthuisteam:'A',kleedkameruitteam:'B',kleedkamerscheidsrechter:'C',accommodatie:'Sportpark'};
 const snapshot=normalizeSportlink({teams:[{teamcode:1,lokaleteamcode:-1,teamnaam:'Duindorp sv 1'}],standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:[match]});assert.equal(snapshot.fixtures[0].field,'Veld 2');assert.deepEqual(snapshot.fixtures[0].changingRooms,{home:'A',away:'B',official:'C'});
});

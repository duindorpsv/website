import assert from 'node:assert/strict';
import test from 'node:test';
import type {SportlinkMatch} from '../../lib/sportlink-types';
const {historicalDate,historicalFromMatches,mergeHistoricalResults,normalizeHistoricalResults}=await import(new URL('../../lib/sportlink-history.ts',import.meta.url).href) as typeof import('../../lib/sportlink-history');
const home={id:'218380',name:'Duindorp sv 1',clubCode:'BBGV51U',logoUrl:null,own:true};
const away={id:'128614',name:'Die Haghe 1',clubCode:'OTHER',logoUrl:null,own:false};
const target:SportlinkMatch={id:'1234',kickoff:'2026-10-24T12:30:00Z',home,away,homeScore:null,awayScore:null,scoreLabel:null,status:'Te spelen',venue:'Sportpark',competitionId:'100',competitionLabel:'4e klasse C'};
const now=new Date('2026-10-20T12:00:00Z');
const row=(date='2016-09-12',score='1 - 2',label='Die Haghe 1 - Duindorp sv 1')=>({wedstrijddatum:date,uitslag:score,wedstrijd:label,seizoen:"seizoen 2016/'17"});

test('documented historical date columns accept Dutch and ISO forms without UTC or browser timezone drift',()=>{
 assert.equal(historicalDate('2024-02-29'),'2024-02-29');
 assert.equal(historicalDate('29-02-2024 14:30'),'2024-02-29');
 assert.equal(historicalDate('za 29-02-2024'),'2024-02-29');
 assert.equal(historicalDate('2024-10-01T23:30:00Z'),'2024-10-02');
 assert.equal(historicalDate('2024-10-01T14:30:00+0200'),'2024-10-01');
 for(const value of ['2023-02-29','2024-02-30T14:30:00Z','31-04-2024','not-a-date'])assert.equal(historicalDate(value),null,value);
});
test('earlier seasons retain the actual home-away label and penalty suffix, with normalized season names',()=>{
 const results=normalizeHistoricalResults([row('2016-09-12','1 - 1 (5 - 4)')],target,now);
 assert.equal(results[0].date,'2016-09-12');assert.equal(results[0].season,'2016/2017');
 assert.equal(results[0].matchLabel,'Die Haghe 1 - Duindorp sv 1');
 assert.equal(results[0].scoreLabel,'1 – 1 (5 - 4)');
 const noSeason={...row('2024-05-12'),seizoen:''};
 assert.equal(normalizeHistoricalResults([noSeason],target,now)[0].season,'2023/2024');
});
test('only the latest five valid encounters before the target and known today are selected across seasons',()=>{
 const rows=Array.from({length:9},(_,index)=>({...row(`${2016+index}-09-12`),seizoen:''}));
 rows.push(row('2026-10-22'),row('2026-10-24'),row('not-a-date'),row('2024-09-20','-'));
 const results=normalizeHistoricalResults(rows,target,now);
 assert.deepEqual(results.map(item=>item.date),['2024-09-12','2023-09-12','2022-09-12','2021-09-12','2020-09-12']);
 assert.deepEqual(normalizeHistoricalResults(rows,target,NaN),[]);
});
test('provider corrections replace archive scores and duplicate rows, including date corrections by source match code',()=>{
 const archived=normalizeHistoricalResults([{...row(),wedstrijdcode:77}],target,now);
 const corrected=normalizeHistoricalResults([{...row('2016-09-13','3 - 0'),wedstrijdcode:77}],target,now);
 const result=mergeHistoricalResults(archived,corrected,target,now);
 assert.equal(result.length,1);assert.equal(result[0].date,'2016-09-13');assert.equal(result[0].scoreLabel,'3 – 0');
 const noId=normalizeHistoricalResults([row('2016-09-12','4 - 1')],target,now);
 const merged=mergeHistoricalResults(archived,noId,target,now);
 assert.equal(merged.length,1);assert.equal(merged[0].scoreLabel,'4 – 1');
});
test('unpublished age groups and malformed/abandoned/missing results never create H2H content',()=>{
 const younger={...target,home:{...home,name:'Duindorp sv O10-1'},away:{...away,name:'Die Haghe O10-1'}};
 assert.deepEqual(normalizeHistoricalResults([row()],younger,now),[]);
 const invalid=[{...row(),status:'Afgelast'},row('2016-09-12',''),row('2016-09-12','wordt gespeeld'),{...row(),wedstrijd:''}];
 assert.deepEqual(normalizeHistoricalResults(invalid,target,now),[]);
});
test('canonical archive conversion uses real completed scores and never fabricates a result from an upcoming match',()=>{
 assert.deepEqual(historicalFromMatches([target]),[]);
 const game={...target,id:'77',kickoff:'2024-09-12T12:30:00Z',home:away,away:home,status:'Uitgespeeld',homeScore:0,awayScore:0};
 const records=historicalFromMatches([game]);
 assert.equal(records[0].matchLabel,'Die Haghe 1 – Duindorp sv 1');assert.equal(records[0].scoreLabel,'0 – 0');assert.equal(records[0].season,'2024/2025');
 assert.deepEqual(historicalFromMatches([{...game,status:'Gestaakt'}]),[]);
});

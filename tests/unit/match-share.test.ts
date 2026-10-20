import assert from 'node:assert/strict';
import test from 'node:test';
import type {SportlinkMatch} from '../../lib/sportlink-types';
const {formatMatchWhatsApp}=await import(new URL('../../lib/match-share.ts',import.meta.url).href) as typeof import('../../lib/match-share');

const match:SportlinkMatch={id:'123',kickoff:'2026-10-24T12:30:00Z',home:{id:'1',name:'Duindorp SV 1',clubCode:'A',own:true,logoUrl:null},away:{id:'2',name:'Die Haghe 1',clubCode:'B',own:false,logoUrl:null},homeScore:null,awayScore:null,scoreLabel:null,status:'Te spelen',venue:'Sportpark Houtrust',competitionId:'456',competitionLabel:'4e klasse C'};
const url='https://example.test/clubmuur/wedstrijden?wedstrijd=123';

test('share uses Amsterdam summer and winter kickoff times with a direct match link',()=>{
 const summer=formatMatchWhatsApp(match,url);
 assert.match(summer,/Zaterdag 24 oktober 2026/);
 assert.match(summer,/14:30 uur/);
 assert.ok(summer.includes(`Bekijk alle wedstrijdinformatie:\n${url}`));
 const winter=formatMatchWhatsApp({...match,kickoff:'2026-11-07T12:30:00Z'},url);
 assert.match(winter,/13:30 uur/);
});

test('missing source data stays absent without empty labels or invalid dates',()=>{
 const result=formatMatchWhatsApp({...match,kickoff:'invalid',venue:'',venueAddress:'',field:'',competitionLabel:''},url);
 assert.doesNotMatch(result,/📅|🕒|📍|🏟️|🏆|undefined|null|Invalid Date/);
 assert.ok(result.includes('*Duindorp SV 1 – Die Haghe 1*'));
});

test('cancelled and pending placeholder scores are never shared as a final result',()=>{
 const pending=formatMatchWhatsApp({...match,homeScore:0,awayScore:0,scoreLabel:'0-0'},url);
 assert.doesNotMatch(pending,/Eindstand|0 – 0|0-0/);
 const cancelled=formatMatchWhatsApp({...match,status:'Afgelast',homeScore:3,awayScore:0},url);
 assert.match(cancelled,/⚠️ \*Afgelast\*/);
 assert.doesNotMatch(cancelled,/Eindstand|3 – 0/);
});

test('public senior finals include real zero draws while O10 and younger never share scores',()=>{
 const played={...match,status:'Uitgespeeld',homeScore:0,awayScore:0};
 assert.match(formatMatchWhatsApp(played,url),/\*Eindstand: 0 – 0\*/);
 for(const name of ['Duindorp SV O10-1','Duindorp SV JO9-1']){
  const youth=formatMatchWhatsApp({...played,home:{...match.home,name}},url);
  assert.doesNotMatch(youth,/Eindstand|0 – 0|0-0/);
 }
});

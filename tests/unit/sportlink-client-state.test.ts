import assert from 'node:assert/strict';
import test from 'node:test';
import type {SportlinkMatch,SportlinkSnapshot} from '../../lib/sportlink-types';
const {receiveMatchVersion,receiveSnapshot}=await import(new URL('../../lib/sportlink-client-state.ts',import.meta.url).href) as typeof import('../../lib/sportlink-client-state');
const side={id:'1',name:'Duindorp sv 1',clubCode:'DSV',logoUrl:null,own:true};
const match:SportlinkMatch={id:'match-1',home:side,away:{...side,id:'2',name:'Opponent 1',clubCode:'OPP',own:false},kickoff:'2026-10-24T12:30:00Z',homeScore:null,awayScore:null,scoreLabel:null,status:'Te spelen',venue:'Sportpark',competitionId:'100',competitionLabel:'Competitie',field:'Veld 1',homeDressingRoom:'1'};
const snapshot=(game:SportlinkMatch,updatedAt:string):SportlinkSnapshot=>({updatedAt,stale:false,warning:null,teams:[],firstTeam:null,competition:null,standings:[],fixtures:[game],results:[],nextMatch:game,previousRound:{label:'',startDate:null,endDate:null,matches:[]},nextRound:{label:'',startDate:null,endDate:null,matches:[game]}});
test('a slow page response cannot restore a removed room or old field after a newer modal sync',()=>{
 const versions=new Map();
 const changed={...match,field:'Veld 2',homeDressingRoom:''};
 receiveMatchVersion(versions,changed,'2026-10-20T12:02:00Z');
 const result=receiveSnapshot(versions,snapshot(match,'2026-10-20T12:01:00Z'));
 for(const item of [result.fixtures[0],result.nextMatch!,result.nextRound.matches[0]]){assert.equal(item.field,'Veld 2');assert.equal(item.homeDressingRoom,'');}
});
test('a newer snapshot replaces an older modal result; later stale modal responses cannot roll it back',()=>{
 const versions=new Map();
 receiveMatchVersion(versions,match,'2026-10-20T12:01:00Z');
 const changed={...match,status:'Afgelast',field:'',homeDressingRoom:''};
 assert.equal(receiveSnapshot(versions,snapshot(changed,'2026-10-20T12:03:00Z')).fixtures[0].status,'Afgelast');
 assert.equal(receiveMatchVersion(versions,match,'2026-10-20T12:02:00Z').status,'Afgelast');
 assert.equal(receiveMatchVersion(versions,match,'not-a-date').status,'Afgelast');
});

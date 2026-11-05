import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCmsSeed} from '../../lib/cms/seed';
import type {CmsActivity} from '../../lib/cms/types';
import {communityEventCalendar,publicCommunityEvents} from '../../lib/clubmuur-community';

test('homepage agenda merges reviewed legacy and published central moments, limits to five and keeps actual times and location',()=>{
 const state=createCmsSeed();state.planning.locations=[{id:'room',name:'Bestuurskamer',type:'room',capacity:10,description:'Privé locatie-informatie',active:true,sportlinkFieldName:'',color:'#112233'}];
 const activity=(id:string,time:string):CmsActivity=>({id,title:id,type:'meeting',date:'2026-10-22',startTime:time,endTime:'22:00',description:'Goedgekeurde omschrijving',locationIds:['room'],personIds:['private-person'],committeeIds:['private-committee'],teamIds:[],public:true,status:'planned',source:'manual',published:true});
 state.planning.activities=[...Array.from({length:8},(_,i)=>activity('public-'+i,`${String(12+i).padStart(2,'0')}:00`)),{...activity('private','10:00'),public:false},{...activity('cancelled','10:30'),status:'cancelled'},{...activity('draft','11:00'),published:false}];
 state.appearance={agenda:[{id:'legacy',title:'Nog niet overgenomen',date:'2026-10-22',time:'09:00',description:'Bestaande goedgekeurde activiteit'},{id:'public-0',title:'Geen dubbel record',date:'2026-10-22',time:'12:00',description:'Compatibiliteitsprojectie'}]};
 const events=publicCommunityEvents(state,Date.parse('2026-10-20T10:00:00Z'));
 assert.equal(events.length,5);assert.deepEqual(events.map(item=>item.id),['legacy','public-0','public-1','public-2','public-3']);
 assert.equal(events[1].time,'12:00');assert.equal(events[1].endTime,'22:00');assert.equal(events[1].location,'Bestuurskamer');assert.equal(events[1].central,true);
 for(const value of ['private-person','private-committee','Privé locatie-informatie'])assert.equal(JSON.stringify(events).includes(value),false);
 state.planning.activities[0].published=false;state.appearance.agenda=state.appearance.agenda!.filter(item=>item.id!=='public-0');assert.ok(!publicCommunityEvents(state,Date.parse('2026-10-20T10:00:00Z')).some(item=>item.id==='public-0'));
});

test('legacy calendar never invents a location or duration; optional reviewed values preserve actual Amsterdam instants',()=>{
 const event={id:'legacy',title:'Club; avond',date:'2026-10-25',time:'02:30',description:'Regel 1\r\nRegel 2'};
 const legacy=communityEventCalendar(event);assert.equal(legacy.includes('LOCATION:'),false);assert.equal(legacy.includes('DTEND:'),false);
 const later=communityEventCalendar({...event,endTime:'03:30',location:'Zaal, A',occurrence:'later'});assert.ok(later.includes('DTSTART:20261025T013000Z'));assert.ok(later.includes('DTEND:20261025T023000Z'));assert.ok(later.includes('LOCATION:Zaal\\, A'));assert.equal(later.includes('Houtrust'),false);
});

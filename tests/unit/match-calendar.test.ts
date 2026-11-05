import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMatchCalendar} from '../../lib/match-calendar';
import {dossierFixture} from '../helpers/match-dossier-fixture';
test('ICS uses UTC summer/winter kickoff, a stable UID and no invented end time',()=>{
 const {match}=dossierFixture(),first=createMatchCalendar(match,new Date('2026-10-21T10:00:00Z'));
 assert.ok(first.includes('DTSTART:20261024T123000Z\r\n'));assert.ok(!first.includes('DTEND'));
 const winter=createMatchCalendar({...match,kickoff:'2026-11-01T14:30:00+01:00'});assert.ok(winter.includes('DTSTART:20261101T133000Z\r\n'));
 assert.equal(first.match(/^UID:.*$/m)?.[0],winter.match(/^UID:.*$/m)?.[0]);
});
test('ICS escapes text and folds at UTF-8 octet boundaries without splitting a character',()=>{
 const {match}=dossierFixture(),value=createMatchCalendar({...match,venue:'Park, zaal; pad\\weg\nTweede regel',home:{...match.home,name:'Één '.repeat(50)}});
 for(const line of value.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
 const unfolded=value.replace(/\r\n /g,'');assert.ok(unfolded.includes('Park\\, zaal\\; pad\\\\weg\\nTweede regel'));assert.ok(unfolded.includes('Één '.repeat(50)));assert.ok(!value.includes('�'));assert.ok(value.endsWith('END:VCALENDAR\r\n'));
});

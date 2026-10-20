import assert from 'node:assert/strict';
import test from 'node:test';
const {publicCoachName,publicMatchHeadCoach}=await import(new URL('../../lib/sportlink-match-coaches.ts',import.meta.url).href) as typeof import('../../lib/sportlink-match-coaches');

test('primary KNVB and explicit head-coach functions are accepted from either documented role field',()=>{
 for(const role of ['Trainer/coach','Trainer-coach','Hoofdtrainer','Hoofdcoach',' hoofdTRAINER ']){
  assert.equal(publicMatchHeadCoach([{naam:'  Jan   Jansen ',functie:role}]),'Jan Jansen',role);
  assert.equal(publicMatchHeadCoach([{naam:'Jan Jansen',rol:role}]),'Jan Jansen',role);
 }
});
test('generic trainers, assistants, goalkeeper coaches and team managers do not impersonate the head coach',()=>{
 for(const role of ['Trainer','Assistent-trainer/coach','Keeperstrainer','Teammanager','Assistent Hoofdtrainer','Hoofdtrainer jeugdcoördinatie']){
  assert.equal(publicMatchHeadCoach([{naam:'Een ander',functie:role}]),null,role);
 }
 assert.equal(publicMatchHeadCoach([{naam:'Een ander',functie:'Hoofdtrainer',rol:'Assistent-trainer'}]),null);
});
test('privacy changes and empty responses clear a former public registration',()=>{
 for(const name of ['', '   ', 'Afgeschermd', 'Naam afgeschermd', 'Anoniem', 'Niet openbaar',null]){
  assert.equal(publicMatchHeadCoach([{naam:name,functie:'Trainer/coach'}]),null);
  assert.equal(publicCoachName(name),null);
 }
 assert.equal(publicMatchHeadCoach([]),null);assert.equal(publicMatchHeadCoach({}),null);
});
test('conflicting primary registrations are omitted and duplicate role rows are collapsed',()=>{
 const head={naam:'Jan Jansen',functie:'Trainer/coach',email:'private@example.com',relatiecode:'private'};
 assert.equal(publicMatchHeadCoach([head,{...head,rol:'Hoofdtrainer'}]),'Jan Jansen');
 assert.equal(publicMatchHeadCoach([head,{naam:'Piet Peters',functie:'Hoofdtrainer'}]),null);
 assert.equal(publicMatchHeadCoach([null,'not a row',head,{naam:'Ander',functie:'Trainer'}]),'Jan Jansen');
});

test('a shielded competing primary registration cannot identify a unique public head coach',()=>{
 assert.equal(publicMatchHeadCoach([{naam:'A. Trainer',functie:'Hoofdtrainer'},{naam:'Afgeschermd',functie:'Hoofdcoach'}]),null);
 assert.equal(publicCoachName('A. ****'),null);
});

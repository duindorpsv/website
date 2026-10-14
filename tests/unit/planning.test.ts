import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningInstant,planningInput} from '../../lib/cms/planning';
test('PUB04: Amsterdam spring gap is rejected, winter ambiguity requires a choice',()=>{
  assert.throws(()=>planningInstant('2027-03-28T02:30'));
  assert.throws(()=>planningInstant('2026-10-25T02:30'));
  assert.equal(planningInstant('2026-10-25T02:30','earlier'),'2026-10-25T00:30:00Z');
  assert.equal(planningInstant('2026-10-25T02:30','later'),'2026-10-25T01:30:00Z');
  assert.throws(()=>planningInstant('2027-03-28T02:30','later'));
  assert.equal(planningInput('2026-10-25T01:30:00Z'),'2026-10-25T02:30');
  assert.equal(planningInstant('2026-10-14T14:00'),'2026-10-14T12:00:00Z');
});

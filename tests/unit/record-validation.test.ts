import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCmsSeed} from '../../lib/cms/seed';
import {validateCandidate} from '../../lib/server/records';

test('settings commands accept their envelope ID without storing it as content',()=>{
 const settings=structuredClone(createCmsSeed().settings),input={...settings,id:'settings'};
 const result=validateCandidate('settings',input);
 assert.deepEqual(result,settings);
 assert.equal(input.id,'settings');
 assert.deepEqual(result.teams.map((team:{id:string})=>team.id),settings.teams.map(team=>team.id));
});

test('settings normalization retains strict field and value validation',()=>{
 const settings={...createCmsSeed().settings,id:'settings'};
 assert.throws(()=>validateCandidate('settings',{...settings,unexpected:true}),(error:any)=>error.code==='unknown-field'&&error.status===422);
 assert.throws(()=>validateCandidate('settings',{...settings,newsletterEnabled:'yes'}),(error:any)=>error.code==='validation'&&error.status===422);
});

test('media and news content retain their actual record IDs and reject unknown fields',()=>{
 const state=createCmsSeed();
 for(const [module,record] of [['media',state.media[0]],['articles',state.articles[0]]] as const){
  assert.equal(validateCandidate(module,record).id,record.id);
  assert.throws(()=>validateCandidate(module,{...record,unexpected:true}),(error:any)=>error.code==='unknown-field');
 }
});

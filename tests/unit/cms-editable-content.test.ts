import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCmsSeed} from '../../lib/cms/seed';
import {validateDocument,referencesIn} from '../../lib/cms/layout/document';
import {validatePage} from '../../lib/cms/model';
import {trainingSchema} from '../../lib/cms/training';
import {clubTrainingSchedule} from '../../lib/clubmuur-training';
import {formDefinitionErrors} from '../../lib/cms/form-definition';
import {listPagination} from '../../lib/server/pagination';
import {siteText} from '../../lib/cms/site-copy';

test('every supplied club page has editable, valid content and keeps working dynamic forms and training widgets',()=>{
 const state=createCmsSeed();
 for(const page of state.pages){assert.equal(page.useBuilder,true,page.slug);assert.equal(page.bodyFormat,'page-layout-v2');assert.ok(page.body.content?.length,page.slug);assert.doesNotMatch(JSON.stringify(page.body),/Voorvertoning van de werkversie|Verzenden is uitgeschakeld/i);assert.deepEqual(validateDocument(page.body),[],page.slug);assert.deepEqual(validatePage(page,state),[],page.slug);}
 assert.ok(referencesIn(state.pages.find(page=>page.slug==='club/contact')!.body).includes('contact'));
 assert.ok(referencesIn(state.pages.find(page=>page.slug==='club/lidmaatschap')!.body).includes('membership'));
 assert.ok(JSON.stringify(state.pages.find(page=>page.slug==='teams/trainingen')!.body).includes('"kind":"training"'));
 assert.equal(state.people.filter(person=>person.group==='Commissies').length,8);
});
test('training rejects duplicate teams, reversed times and invalid weekdays; empty schedules are intentional',()=>{
 assert.equal(trainingSchema.safeParse(clubTrainingSchedule).success,true);
 assert.equal(trainingSchema.safeParse([]).success,true);
 assert.equal(trainingSchema.safeParse([...clubTrainingSchedule,clubTrainingSchedule[0]]).success,false);
 const team={teamLabel:'JO13',sessions:[{day:'Maandag',start:'20:00',end:'19:00',field:'Veld 1'}]};assert.equal(trainingSchema.safeParse([team]).success,false);
 team.sessions[0]={...team.sessions[0],day:'Morgen',end:'21:00'};assert.equal(trainingSchema.safeParse([team]).success,false);
});
test('publishing custom forms requires labels, choices and valid conditional fields',()=>{
 const form=createCmsSeed().forms[0];assert.deepEqual(formDefinitionErrors(form),[]);
 assert.ok(formDefinitionErrors({...form,name:''}).length);
 assert.ok(formDefinitionErrors({...form,fields:[{id:'choice',label:'Keuze',type:'select',required:true,options:[]}]}).length);
 assert.ok(formDefinitionErrors({...form,fields:[{id:'conditional',label:'Ouder',type:'text',required:true,condition:{fieldId:'missing',operator:'under18'}}]}).length);
});
test('SQL list pagination defaults to 25 and rejects unbounded or malformed requests',()=>{
 assert.deepEqual(listPagination(new URL('https://example.invalid/')), {limit:25,offset:0});
 for(const limit of [25,50,100])assert.deepEqual(listPagination(new URL(`https://example.invalid/?limit=${limit}&offset=100`)),{limit,offset:100});
 for(const query of ['limit=101','limit=-1','limit=NaN','offset=-1','offset=1.5','offset=1000001'])assert.throws(()=>listPagination(new URL('https://example.invalid/?'+query)));
});
test('website copy preserves the current design by default and accepts an intentionally empty custom value',()=>{
 const state=createCmsSeed();assert.equal(siteText(state,'albumTitle'),'IN ONS FOTOALBUM.');
 state.settings.siteCopy={albumTitle:'Clubalbums',photoEmphasis:''};assert.equal(siteText(state,'albumTitle'),'Clubalbums');assert.equal(siteText(state,'photoEmphasis'),'');
});

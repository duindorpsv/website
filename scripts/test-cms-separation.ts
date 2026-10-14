import assert from 'node:assert/strict';
import test from 'node:test';
import type {CmsForm} from '../lib/cms/types';

const {createSubmissionSnapshot,statusesForFormKind,filterSubmissions}=await import(new URL('../lib/cms/forms.ts',import.meta.url).href) as typeof import('../lib/cms/forms');

function form(kind:CmsForm['kind']='registration'):CmsForm{
 return {id:'form-one',kind,name:'Aanmelden proeftraining',departmentId:'jeugd',active:true,retentionDays:90,fields:[{id:'name',label:'Naam deelnemer',type:'text',required:true},{id:'email',label:'E-mailadres ouder',type:'email',required:true},{id:'team',label:'Gewenst team',type:'text',required:true},{id:'message',label:'Toelichting',type:'textarea',required:false}]};
}

test('each submission keeps its kind, name and complete field answers when the original form changes',()=>{
 const original=form(),values={name:'  Robin  ',email:' ouder@example.com ',team:'JO11',message:'Proeftraining op woensdag'};
 const submission=createSubmissionSnapshot(original,values,{id:'submission',departmentId:'jeugd',createdAt:'2026-10-13T10:00:00.000Z'});
 original.kind='contact';original.name='Nieuw contactformulier';original.fields[2].label='Nieuwe vraag';original.fields[2].type='textarea';original.fields.splice(3,1);values.team='JO13';
 assert.equal(submission.kind,'registration');assert.equal(submission.formName,'Aanmelden proeftraining');assert.equal(submission.name,'Robin');assert.equal(submission.email,'ouder@example.com');
 assert.deepEqual(submission.answers[2],{fieldId:'team',label:'Gewenst team',type:'text',value:'JO11'});
 assert.equal(submission.answers[3].value,'Proeftraining op woensdag');assert.ok(submission.message.includes('Gewenst team: JO11'));assert.equal(submission.departmentId,'jeugd');assert.equal(submission.demo,true);
});

test('contact, registration and request workflows offer only their relevant statuses',()=>{
 assert.deepEqual(statusesForFormKind('contact'),['new','in-progress','done']);
 assert.deepEqual(statusesForFormKind('registration'),['new','in-progress','accepted','waitlist','declined','done']);
 assert.deepEqual(statusesForFormKind('request'),['new','in-progress','accepted','declined','done']);
});

test('submission views never mix kinds, even for the same form ID, department, status and matching search term',()=>{
 const rows=(['contact','registration','request'] as const).map((kind,index)=>createSubmissionSnapshot(form(kind),{name:'Robin',email:'ouder@example.com',team:'JO11',message:'Gezamenlijke zoekterm'},{id:kind,departmentId:'jeugd',createdAt:`2026-10-13T${10+index}:00:00.000Z`}));
 for(const kind of ['contact','registration','request'] as const){
  const selected=filterSubmissions(rows,{kind,formId:'form-one',departmentId:'jeugd',status:'new',query:'zoekterm'});
  assert.deepEqual(selected.map(row=>row.id),[kind]);
 }
 assert.deepEqual(filterSubmissions(rows,{kind:'registration',departmentId:'senioren'}),[]);
 assert.deepEqual(filterSubmissions(rows,{kind:'registration',formId:'missing'}),[]);
 assert.deepEqual(filterSubmissions(rows,{kind:'registration',status:'accepted'}),[]);
 assert.deepEqual(filterSubmissions(rows,{kind:'registration',query:'jo11'}).map(row=>row.id),['registration']);
});

test('registration inbox orders newest first without mutating saved submissions',()=>{
 const original=form();const early=createSubmissionSnapshot(original,{name:'Robin'},{id:'early',departmentId:'jeugd',createdAt:'2026-10-12T10:00:00.000Z'}),late=createSubmissionSnapshot(original,{name:'Sam'},{id:'late',departmentId:'jeugd',createdAt:'2026-10-13T10:00:00.000Z'});
 const rows=[early,late];assert.deepEqual(filterSubmissions(rows,{kind:'registration'}).map(row=>row.id),['late','early']);assert.deepEqual(rows.map(row=>row.id),['early','late']);
});

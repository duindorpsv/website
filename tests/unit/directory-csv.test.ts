import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../../lib/server/records';
import {parsePeopleCsv} from '../../lib/cms/people-csv';
import {importDirectoryPeople} from '../../lib/cms/directory';
import {directorySchema} from '../../lib/cms/directory-schema';

test('reimport replaces the complete private CSV snapshot within the column limit',()=>{
 const state=emptyState();
 state.roles=[{id:'admin',name:'Test',description:'',teamScoped:false,permissions:['directory']}];
 state.members=[{id:'actor',name:'Test',email:'test@example.invalid',active:true,roleId:'admin',teamIds:[]}];
 const csv=(prefix:string)=>['bronId','naam',...Array.from({length:198},(_,index)=>`${prefix} ${index}`)].join(';')+'\n'+['SOURCE1','Fictief lid',...Array.from({length:198},(_,index)=>String(index))].join(';');
 const rows=(source:string)=>parsePeopleCsv(source).map(({id,role,teamId,...person})=>({sportlinkId:id,...person}));
 assert.deepEqual(importDirectoryPeople(state,'actor',rows(csv('Oud'))),{created:1,updated:0});
 const person=state.people.find(person=>person.sportlinkId==='SOURCE1')!;
 assert.deepEqual(importDirectoryPeople(state,'actor',rows(csv('Nieuw'))),{created:0,updated:1});
 const profile=state.directory!.profiles.find(profile=>profile.personId===person.id)!;
 assert.equal(Object.keys(profile.sourceFields!).length,200);
 assert.equal(profile.sourceFields!['Nieuw 0'],'0');
 assert.equal(Object.hasOwn(profile.sourceFields!,'Oud 0'),false);
 directorySchema.parse(state.directory);
 assert.equal(Object.hasOwn(person,'sourceFields'),false);
 const snapshot=structuredClone(profile.sourceFields);
 importDirectoryPeople(state,'actor',[{sportlinkId:'SOURCE1',name:'Bijgewerkt lid',email:'',phone:''}]);
 assert.deepEqual(profile.sourceFields,snapshot,'JSON updates without source fields preserve the last CSV snapshot');
 assert.equal(state.members.length,1,'Import does not create accounts');
});

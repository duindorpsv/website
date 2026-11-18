import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../../lib/server/records';
import {bindDirectoryAccount,directoryPersonTemplate,directoryProfileTemplate,initializeDirectory,portalDirectoryProjection,saveDirectoryAssignment,saveDirectoryPerson} from '../../lib/cms/directory';
import type {DirectoryAssignment} from '../../lib/cms/directory-types';

test('the sole administrator can also be chair through the canonical person without changing account access',()=>{
 const state=emptyState(),userId='sole-admin',personId='existing-club-person';
 state.roles=[{id:'admin',name:'Beheerder',description:'',teamScoped:false,permissions:['users','directory']}];
 state.members=[{id:userId,name:'Clubvoorzitter',email:'voorzitter@example.invalid',roleId:'admin',active:true,teamIds:[]}];
 initializeDirectory(state);
 saveDirectoryPerson(state,userId,{person:{...directoryPersonTemplate(personId),name:'Clubvoorzitter',email:'voorzitter@example.invalid'},profile:directoryProfileTemplate(personId)});
 bindDirectoryAccount(state,userId,personId,userId);
 const accounts=structuredClone(state.members),roles=structuredClone(state.roles);
 const assignment:DirectoryAssignment={id:'chair-assignment',personId,kind:'board',name:'Voorzitter',teamId:'',committeeId:'',startsAt:'',endsAt:''};

 saveDirectoryAssignment(state,userId,assignment);
 assert.deepEqual(state.directory!.assignments,[assignment]);
 assert.deepEqual(portalDirectoryProjection(state,userId).functions,['Voorzitter']);
 assert.equal(state.members[0].personId,personId);
 assert.notEqual(personId,`person-account-${userId}`);
 assert.deepEqual(state.members,accounts,'A club function does not replace or disable the administrator account');
 assert.deepEqual(state.roles,roles,'A club function does not add CMS permissions');

 saveDirectoryAssignment(state,userId,{...assignment,name:'Bestuursvoorzitter'});
 assert.equal(state.directory!.assignments.length,1,'Editing keeps the same function assignment');
 assert.deepEqual(portalDirectoryProjection(state,userId).functions,['Bestuursvoorzitter']);
 assert.deepEqual(state.members,accounts);
});

test('a sponsor contact cannot assign themselves a board function',()=>{
 const state=emptyState();
 state.roles=[{id:'sponsor',name:'Sponsorcontact',description:'',teamScoped:false,permissions:['sponsors']}];
 state.members=[{id:'contact',name:'Sponsorcontact',email:'contact@example.invalid',roleId:'sponsor',active:true,teamIds:[]}];
 initializeDirectory(state);
 assert.throws(()=>saveDirectoryAssignment(state,'contact',{id:'forged-board',personId:state.members[0].personId!,kind:'board',name:'Voorzitter',teamId:'',committeeId:'',startsAt:'',endsAt:''}),/ledenadministratie/);
 assert.deepEqual(state.directory!.assignments,[]);
 assert.equal(state.members[0].roleId,'sponsor');
});

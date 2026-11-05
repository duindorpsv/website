import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCmsSeed} from '../../lib/cms/seed';
import {createSponsorshipSeed} from '../../lib/cms/sponsorship';
import {donorProjection,staffProjection,type DomainStore} from '../../lib/server/sponsor-store';
import type {Principal} from '../../lib/server/permissions';

const p:Principal={id:'test-donor-reader',name:'Lezer',email:'reader@example.invalid',roleId:'test-donor-reader',teamScoped:false,teams:[],departments:[],grants:[{module:'donors',action:'read'}],mfa:false};
function fixture():DomainStore{
 const state=createCmsSeed(),data=createSponsorshipSeed();state.sponsorship=data;
 state.directory={version:1,profiles:[],assignments:[],guardians:[],invitations:[],events:[]};
 state.roles=[{id:p.roleId,name:'Donateurs bekijken',description:'',teamScoped:false,permissions:['donors']},{id:'private-role',name:'PRIVATE_ROLE_SENTINEL',description:'',teamScoped:false,permissions:['users']}];
 state.members=[{id:p.id,name:p.name,email:p.email,roleId:p.roleId,active:true,teamIds:[]}];
 data.sponsors=[{id:'private-sponsor',name:'Sponsornaam',notes:'PRIVATE_SPONSOR_NOTE_SENTINEL'} as any];
 data.tasks=[{id:'private-task',note:'PRIVATE_TASK_SENTINEL'} as any];
 data.settings.contractClubDetails={legalName:'Testclub',address:'Testlaan 1',companyNumber:'',representative:'',representativeFunction:'',email:'club@example.invalid'};
 data.donors={people:[{id:'test-person',name:'Fictieve donateur',kind:'person',email:'test@example.invalid',phone:'',address:'Teststraat 1',postalCode:'',city:'Teststad',notes:'',active:true,createdAt:'2026-11-06T00:00:00Z',updatedAt:'2026-11-06T00:00:00Z'}],contributions:[],invoices:[]};
 const records=new Map([['test-person',{kind:'donorPeople'}],['private-task',{kind:'tasks'}]]);
 return {state,versions:{'record:test-person':2,'record:private-task':4,'company:private-sponsor':3,'record:sponsor-settings':1},records,people:new Map(),profiles:new Map(),accounts:new Map()};
}

test('DONOR-PROJECTION: readers get an explicit donor allowlist and detached data',()=>{
 const store=fixture(),result=donorProjection(store,p),text=JSON.stringify(result);
 assert.equal(result.state.sponsorship!.donors!.people.length,1);
 assert.deepEqual(result.state.sponsorship!.sponsors,[]);
 assert.deepEqual(result.state.sponsorship!.agreements,[]);
 assert.deepEqual(result.state.sponsorship!.proposals,[]);
 assert.deepEqual(result.state.sponsorship!.tasks,[]);
 assert.deepEqual(result.state.people,[]);
 assert.equal(result.state.members.length,1);
 assert.equal(result.state.roles.length,1);
 assert.ok(!text.includes('PRIVATE_'));
 assert.deepEqual(result.versions,{'record:test-person':2,'record:sponsor-settings':1});
 assert.equal(result.state.sponsorship!.settings.invoiceNumbering,undefined);
 result.state.sponsorship!.donors!.people[0].name='Changed only in projection';
 assert.equal(store.state.sponsorship!.donors!.people[0].name,'Fictieve donateur');
 assert.throws(()=>donorProjection(store,{...p,teamScoped:true}),/geen toegang/);
 assert.throws(()=>donorProjection(store,{...p,grants:[]}),/geen toegang/);
});

test('DONOR-PROJECTION: sponsor workspace does not inherit donor data or donor version keys',()=>{
 const store=fixture(),staff={...p,grants:[{module:'sponsors',action:'manage'}]};
 store.state.roles[0].permissions=['sponsors'];
 const result=staffProjection(store,staff);
 assert.equal(result.state.sponsorship!.donors,undefined);
 assert.equal(result.versions['record:test-person'],undefined);
 assert.equal(result.versions['record:private-task'],4);
});

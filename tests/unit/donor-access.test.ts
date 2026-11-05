import {test} from 'node:test';
import assert from 'node:assert/strict';
import {donorGrant,donorPermissions,type DonorAction} from '../../lib/cms/donor-permissions';
import {cmsPermissions,type Principal} from '../../lib/server/permissions';
import {roleInput} from '../../lib/server/role-input';

const actor:Principal={id:'donor-viewer',name:'Test',email:'viewer@example.invalid',roleId:'donor-viewer',teamScoped:false,teams:[],departments:[],grants:[{module:'donors',action:'read'}],mfa:false};

test('DONOR-AUTH: each donor action is independent and view access remains a prerequisite',()=>{
 assert.deepEqual(donorPermissions(actor.grants),['donors']);
 for(const action of ['manage','invoice','settings'] as DonorAction[]){
  assert.equal(donorGrant(actor.grants,false,action),false);
  const grants=[...actor.grants,{module:'donors',action}];
  assert.equal(donorGrant(grants,false,action),true);
  assert.equal(donorGrant([{module:'donors',action}],false,action),false);
  for(const other of ['manage','invoice','settings'] as DonorAction[])if(other!==action)assert.equal(donorGrant(grants,false,other),false);
 }
 assert.equal(donorGrant([{module:'sponsors',action:'manage'}],false),false);
 assert.equal(donorGrant([{module:'users',action:'manage'}],false),false);
 assert.deepEqual(donorPermissions([{module:'*',action:'*'}]),['donors','donors-manage','donors-invoice','donors-settings']);
 assert.deepEqual(donorPermissions([{module:'*',action:'*'}],true),[]);
});

test('DONOR-AUTH: navigation translates exact server actions without escalating readers',()=>{
 assert.deepEqual(cmsPermissions(actor),['donors']);
 assert.deepEqual(cmsPermissions({...actor,grants:[...actor.grants,{module:'donors',action:'invoice'}]}),['donors','donors-invoice']);
 assert.deepEqual(cmsPermissions({...actor,teamScoped:true}),[]);
 assert.ok(!cmsPermissions({...actor,grants:[{module:'sponsors',action:'manage'}]}).includes('donors'));
});

test('DONOR-AUTH: role configuration accepts four donor grants and rejects invalid module actions',()=>{
 const value={id:'donor-finance',name:'Donateurfinanciën',description:'',teamScoped:false,expectedVersion:0,grants:[{module:'donors',action:'read'},{module:'donors',action:'invoice'}]};
 assert.ok(roleInput.safeParse(value).success);
 assert.equal(roleInput.safeParse({...value,grants:[{module:'donors',action:'invoice'}]}).success,false);
 assert.equal(roleInput.safeParse({...value,grants:[{module:'sponsors',action:'invoice'}]}).success,false);
 assert.equal(roleInput.safeParse({...value,grants:[{module:'donors',action:'publish'}]}).success,false);
 assert.ok(roleInput.safeParse({...value,grants:[{module:'news',action:'publish'}]}).success);
});

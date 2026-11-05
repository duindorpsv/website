import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cmsPermissions,has,type Principal} from '../../lib/server/permissions';
const editor:Principal={id:'editor',name:'Test',email:'editor@example.invalid',roleId:'team',teamScoped:true,teams:['1'],departments:[],grants:[{module:'news',action:'update'},{module:'news',action:'read'}],mfa:false};
test('owner navigation includes stories and specific story grants stay separate from news',()=>{
 assert.ok(cmsPermissions({...editor,grants:[{module:'*',action:'*'}]}).includes('stories'));
 assert.ok(cmsPermissions({...editor,grants:[{module:'stories',action:'read'}]}).includes('stories'));
 assert.ok(!cmsPermissions(editor).includes('stories'));
 assert.ok(!cmsPermissions({...editor,grants:[{module:'*',action:'read'}]}).includes('publish'));
});
test('AUTH02: permissions are action-specific and restricted to current account teams',()=>{assert.ok(has(editor,'news','update',{teamId:'1'}));assert.ok(!has(editor,'news','publish',{teamId:'1'}));assert.ok(!has(editor,'news','read',{teamId:'2'}));assert.ok(!has(editor,'users','manage'));assert.ok(!has(editor,'news','update',{teamId:''}));});
test('AUTH03: inbox access requires both stream and department, independently of form editing',()=>{const p={...editor,roleId:'handler',teamScoped:false,departments:[{id:'secretariat',kind:'contact'}],grants:[{module:'submissions',action:'read'}]};assert.ok(has(p,'submissions','read',{departmentId:'secretariat',kind:'contact'}));assert.ok(!has(p,'submissions','read',{departmentId:'secretariat',kind:'registration'}));assert.ok(!has(p,'submissions','read',{departmentId:'board',kind:'contact'}));assert.ok(!has(p,'forms','update'));});

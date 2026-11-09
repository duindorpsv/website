import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roleInput} from '../../lib/server/role-input';
import {cmsPermissions,type Principal} from '../../lib/server/permissions';
import {explicitBoardRole,boardReadRight,boardManageRight} from '../../lib/server/board-access';
const principal=(grants:Principal['grants'],teamScoped=false):Principal=>({id:'user',name:'Fictief',email:'fictief@example.invalid',roleId:'test',teamScoped,teams:[],departments:[],grants,mfa:false});
const role=(grants:Principal['grants'],teamScoped=false)=>({id:'board-test',name:'Bestuur',description:'',teamScoped,expectedVersion:0,grants});
test('board grants require one explicit workflow role and read; wildcard config is not a chair identity',()=>{
 const admin=principal([{module:'*',action:'*'}]);assert.equal(boardReadRight(admin),true);assert.equal(boardManageRight(admin),true);assert.equal(explicitBoardRole(admin),null);assert.ok(cmsPermissions(admin).includes('board'));
 for(const action of ['chair','secretary','member','committee']){const p=principal([{module:'board',action:'read'},{module:'board',action}]);assert.equal(explicitBoardRole(p),action);assert.ok(cmsPermissions(p).includes('board'));assert.ok(roleInput.safeParse(role(p.grants)).success);assert.equal(roleInput.safeParse(role([{module:'board',action}])).success,false);}
 assert.equal(roleInput.safeParse(role([{module:'board',action:'read'},{module:'board',action:'chair'},{module:'board',action:'secretary'}])).success,false);
 assert.equal(explicitBoardRole(principal([{module:'board',action:'read'},{module:'board',action:'chair'},{module:'board',action:'secretary'}])),null);
});
test('board role input is clubwide and role actions cannot be used on another CMS module',()=>{
 assert.equal(roleInput.safeParse(role([{module:'board',action:'read'},{module:'board',action:'member'}],true)).success,false);
 assert.equal(boardReadRight(principal([{module:'board',action:'read'},{module:'board',action:'member'}],true)),false);
 assert.equal(roleInput.safeParse(role([{module:'news',action:'chair'}])).success,false);
 assert.equal(roleInput.safeParse(role([{module:'board',action:'publish'}])).success,false);
 assert.ok(roleInput.safeParse(role([{module:'board',action:'manage'}])).success);
});

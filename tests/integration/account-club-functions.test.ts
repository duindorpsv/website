import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests,authCookies,loginEmail} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {getAuth} from '../../lib/server/auth';
import {changeAccount} from '../../lib/server/accounts';
import {principal} from '../../lib/server/permissions';
import {workspaceRead} from '../../lib/server/sponsor-workspace';
import {workspaceCommands} from '../../lib/server/sponsor-commands';
import {directoryPersonTemplate,directoryProfileTemplate} from '../../lib/cms/directory';
import {GET as listUsers} from '../../app/api/cms/users/route';

assertLocalSupabaseTests();
const sql=sqlClient();after(closeDb);
const request=(path:string,cookie:string)=>new Request(new URL(path,process.env.APP_BASE_URL),{headers:{cookie,origin:new URL(process.env.APP_BASE_URL!).origin}});

test('account management links the canonical person and preserves the sole administrator when saving a board function',async()=>{
 const {user}=await getAuth().api.createUser({body:{email:'chair-'+crypto.randomUUID()+'@example.invalid',name:'Fictieve voorzitter',password:crypto.randomUUID()+crypto.randomUUID(),role:'admin'}});
 await sql`insert into cms_memberships(user_id,role_id) values (${user.id},'admin')`;
 const cookie=authCookies(await loginEmail(user.email)),personId=crypto.randomUUID();let personCreated=false;
 async function command(name:string,args:unknown[]){
  const state=await workspaceRead(request('/api/cms/sponsor-workspace?mode=directory'+(personCreated?'&personId='+personId:''),cookie));
  const body={operationId:crypto.randomUUID(),mode:'directory',companyId:'',versions:state.versions,commands:[{name,args,offset:0}]};
  return workspaceCommands(request('/api/cms/sponsor-workspace',cookie),body);
 }
 await command('saveDirectoryPerson',[{person:{...directoryPersonTemplate(personId),name:user.name,email:user.email},profile:directoryProfileTemplate(personId)}]);
 personCreated=true;
 await command('bindDirectoryAccount',[personId,user.id]);
 assert.notEqual(personId,'person-account-'+user.id);
 const before=(await sql`select role_id,active,version from cms_memberships where user_id=${user.id}`)[0];
 const otherAdmins=await sql`select user_id,active from cms_memberships where role_id='admin' and user_id<>${user.id}`;
 try{
  await sql`update cms_memberships set active=false where role_id='admin' and user_id<>${user.id}`;
  const p=await principal(new Headers({cookie}));
  await assert.rejects(changeAccount(p,user.id,{expectedVersion:before.version,roleId:'editor',active:true,teamIds:[],departments:[]}),(error:any)=>error.code==='last-admin');
  await command('saveDirectoryAssignment',[{id:crypto.randomUUID(),personId,kind:'board',name:'Voorzitter',teamId:'',committeeId:'',startsAt:'',endsAt:''}]);
  const after=(await sql`select role_id,active,version from cms_memberships where user_id=${user.id}`)[0];
  assert.deepEqual(after,before,'Adding a board function must not edit account access or its version');
  assert.equal((await getAuth().api.getSession({headers:new Headers({cookie})}))?.user.id,user.id,'The administrator remains logged in');
  const users=await listUsers(request('/api/cms/users?limit=100',cookie));
  assert.equal(users.status,200);
  const listed=(await users.json()).items.find((row:any)=>row.id===user.id);
  assert.equal(listed.person_id,personId,'The link uses the canonical registry mapping');
  assert.equal(listed.role_id,'admin');
  assert.equal(listed.active,true);
  const portal=await workspaceRead(request('/api/portal/workspace',cookie),true);
  assert.deepEqual(portal.personal!.functions,['Voorzitter']);
 }finally{
  for(const row of otherAdmins)await sql`update cms_memberships set active=${row.active} where user_id=${row.user_id}`;
 }
});

test('historical accounts without a person mapping remain listed with no invented dossier id',async()=>{
 const {user}=await getAuth().api.createUser({body:{email:'users-list-'+crypto.randomUUID()+'@example.invalid',name:'Fictieve beheerder voor gebruikerslijst',password:crypto.randomUUID()+crypto.randomUUID(),role:'admin'}});
 await sql`insert into cms_memberships(user_id,role_id) values (${user.id},'admin')`;
 const cookie=authCookies(await loginEmail(user.email)),legacyId='unlinked-'+crypto.randomUUID();
 await sql`insert into auth_user(id,name,email,role) values (${legacyId},'Historisch ongekoppeld account',${legacyId+'@example.invalid'},'user')`;
 await sql`insert into cms_memberships(user_id,role_id) values (${legacyId},'editor')`;
 const response=await listUsers(request('/api/cms/users?limit=100',cookie));
 assert.equal(response.status,200);
 const account=(await response.json()).items.find((row:any)=>row.id===legacyId);
 assert.ok(account,'A missing registry link must not remove the account from the list');
 assert.equal(account.person_id,null);
});

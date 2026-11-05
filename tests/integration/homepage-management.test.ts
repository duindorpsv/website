import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {loadState,mutate} from '../../lib/server/records';
import {defaultHeroPhotoIds} from '../../lib/clubmuur-layouts';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),actorId='homepage-management-'+crypto.randomUUID();
await sql`insert into auth_user(id,name,email) values (${actorId},'Homeproef',${actorId+'@example.invalid'})`;
const admin:Principal={id:actorId,name:'Homeproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
const event={id:crypto.randomUUID(),title:'Synthetische clubavond',date:'2099-11-01',time:'19:30',description:'Alleen een lokale proef.'};
const change=(module:'agenda'|'heroPhotos',items:unknown[],expectedVersion:number,action:'save'|'publish'='publish')=>({module,id:module==='agenda'?'site-agenda':'site-hero-photos',expectedVersion,action,data:{items}});
async function version(id:string){const [row]=await sql`select version from cms_records where id=${id}`;return row?.version||0;}
const write=(changes:Parameters<typeof mutate>[1],p=admin)=>mutate(p,changes,crypto.randomUUID(),crypto.randomUUID());

test('homepage configuration publishes, edits and removes agenda items; drafts stay private and stale editors cannot overwrite',async()=>{
  let v=await version('site-agenda');
  await write([change('agenda',[event],v++)]);
  assert.equal((await loadState(true)).state.appearance?.agenda?.[0].title,event.title);
  const edited={...event,title:'Gewijzigde clubavond',time:'20:15'};
  await write([change('agenda',[edited],v++,'save')]);
  assert.equal((await loadState(true)).state.appearance?.agenda?.[0].title,event.title);
  assert.equal((await loadState(false,admin)).state.appearance?.agenda?.[0].title,edited.title);
  await write([change('agenda',[edited],v++)]);
  await assert.rejects(write([change('agenda',[event],v-1)]),(error:any)=>error.code==='conflict');
  assert.equal((await loadState(true)).state.appearance?.agenda?.[0].time,'20:15');
  await write([change('agenda',[],v++)]);
  assert.deepEqual((await loadState(true)).state.appearance?.agenda,[]);
  const publications=await sql`select id from cms_publications where record_id='site-agenda'`;
  assert.ok(publications.length>=3);
});
test('photo selection persists and invalid content or missing publication permissions cannot change either configuration',async()=>{
  const v=await version('site-hero-photos');
  await write([change('heroPhotos',['07-walking'],v)]);
  assert.deepEqual((await loadState(true)).state.appearance?.heroPhotos,['07-walking']);
  await assert.rejects(write([change('heroPhotos',[],v+1)]),(error:any)=>error.status===422);
  await assert.rejects(write([change('agenda',[{...event,time:'28:00'}],await version('site-agenda'))]),(error:any)=>error.status===422);
  const editor={...admin,grants:[{module:'pages',action:'update'},{module:'pages',action:'read'}]};
  await assert.rejects(write([change('heroPhotos',['01-trots'],v+1)],editor),(error:any)=>error.code==='forbidden');
  await assert.rejects(write([{...change('agenda',[event],0),id:'other-agenda'}]),(error:any)=>error.code==='configuration-id');
  assert.deepEqual((await loadState(true)).state.appearance?.heroPhotos,['07-walking']);
});
after(async()=>{
  await write([change('agenda',[],await version('site-agenda')),change('heroPhotos',defaultHeroPhotoIds,await version('site-hero-photos'))]);
  await closeDb();
});

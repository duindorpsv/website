import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {loadState,mutate} from '../../lib/server/records';
import {defaultHeroPhotoIds,pickHeroLayout,pickHeroPhoto} from '../../lib/clubmuur-layouts';
import {getHeroSelection,type HeroPortrait} from '../../lib/cms/hero-portraits';
import {parseCmsState} from '../../lib/cms/validation';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),actorId='hero-portrait-'+crypto.randomUUID(),mediaId='hero-media-'+crypto.randomUUID(),privateId='hero-private-'+crypto.randomUUID();
await sql`insert into auth_user(id,name,email) values (${actorId},'Portretproef',${actorId+'@example.invalid'})`;
const admin:Principal={id:actorId,name:'Portretproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
const [before]=await sql`select draft,live from cms_records where id='site-hero-photos'`;
const portrait:HeroPortrait={id:`portrait-${crypto.randomUUID()}`,mediaId,name:'Synthetisch spelersportret',kind:'duo'};
const write=(changes:Parameters<typeof mutate>[1],p=admin)=>mutate(p,changes,crypto.randomUUID(),crypto.randomUUID());
async function version(){const [row]=await sql`select version from cms_records where id='site-hero-photos'`;return row?.version||0;}
const command=(data:Record<string,unknown>,expectedVersion:number,action:'save'|'publish'='publish')=>({module:'heroPhotos' as const,id:'site-hero-photos',expectedVersion,action,data});
const media=(id:string)=>({id,name:'Portretproef',src:'/assets/team.png',folderId:'',alt:'Synthetische portretproef',caption:'',credit:'',teamId:'',season:'2026–2027',published:false,featured:false,order:0,focusX:50,focusY:50,createdAt:new Date().toISOString()});

test('custom-only hero portraits publish actual library references, survive reload and protect private drafts and versions',async()=>{
 await write([{module:'media',id:mediaId,expectedVersion:0,action:'publish',data:media(mediaId)},{module:'media',id:privateId,expectedVersion:0,action:'save',data:media(privateId)}]);
 let v=await version();
 await assert.rejects(write([command({items:[portrait.id],portraits:[{...portrait,mediaId:privateId}]},v)]),(error:any)=>error.code==='reference-invalid');
 const editor={...admin,grants:[{module:'pages',action:'update'},{module:'pages',action:'read'}]};
 await assert.rejects(write([command({items:[portrait.id],portraits:[portrait]},v)],editor),(error:any)=>error.code==='forbidden');
 await write([command({items:[portrait.id],portraits:[portrait]},v++)]);
 let current=(await loadState(true)).state;
 assert.deepEqual(current.appearance?.heroPhotos,[portrait.id]);assert.deepEqual(current.appearance?.heroPortraits,[portrait]);
 assert.ok(parseCmsState(JSON.stringify((await loadState(false,admin)).state)),'backups and bootstrap parse custom portrait IDs with their descriptors');
 const selection=getHeroSelection(current.appearance,current.media),layout=pickHeroLayout('01',0,selection.enabled,selection.catalog);
 assert.ok(['02','08'].includes(layout));assert.equal(pickHeroPhoto(layout,'01-trots',0,selection.enabled,selection.catalog),portrait.id);
 await write([command({items:[portrait.id],portraits:[{...portrait,name:'Private werknaam',kind:'walking'}]},v++,'save')]);
 assert.equal((await loadState(true)).state.appearance?.heroPortraits?.[0].name,portrait.name);
 await assert.rejects(write([command({items:[portrait.id],portraits:[portrait]},v-1)]),(error:any)=>error.code==='conflict');
 await assert.rejects(write([command({items:[portrait.id]},v)]),(error:any)=>error.code==='conflict','legacy clients cannot publish private descriptor changes');
 current=(await loadState(true)).state;assert.equal(current.appearance?.heroPortraits?.[0].name,portrait.name);
 await write([command({items:[portrait.id],portraits:[{...portrait,name:'Expliciet gepubliceerd',kind:'walking'}]},v++)]);
 await write([command({items:[portrait.id]},v++)]);
 current=(await loadState(true)).state;assert.equal(current.appearance?.heroPortraits?.[0].name,'Expliciet gepubliceerd','legacy commands preserve already approved custom descriptors');
 assert.equal(getHeroSelection(current.appearance,current.media).catalog.find(item=>item.id===portrait.id)?.kind,'walking');
 const refs=await sql`select target_id from cms_references where record_id='site-hero-photos' and snapshot='live'`;
 assert.ok(refs.some(row=>row.target_id===mediaId));
});

after(async()=>{
 if(before){
  const previous=before.live||before.draft;
  await write([{...command({...previous,portraits:previous.portraits||[]},await version()),action:before.live?'publish':'unpublish'}]);
  await write([command({...before.draft,portraits:before.draft.portraits||[]},await version(),'save')]);
 }else await write([command({items:defaultHeroPhotoIds,portraits:[]},await version())]);
 await sql`delete from cms_records where id in ${sql([mediaId,privateId])}`;
 await closeDb();
});

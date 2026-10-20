import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {loadState,mutate} from '../../lib/server/records';
import {createDefaultHeroSlider,resolveHeroSlides,type CmsHeroSlider} from '../../lib/cms/hero-slider';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),actorId='slider-test-'+crypto.randomUUID(),publicId='slider-public-'+crypto.randomUUID(),privateId='slider-private-'+crypto.randomUUID();
await sql`insert into auth_user(id,name,email) values (${actorId},'Sliderproef',${actorId+'@example.invalid'})`;
const admin:Principal={id:actorId,name:'Sliderproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
const [before]=await sql`select draft,live from cms_records where id='site-hero-slider'`;
const write=(changes:Parameters<typeof mutate>[1],principal=admin)=>mutate(principal,changes,crypto.randomUUID(),crypto.randomUUID());
async function version(){const [row]=await sql`select version from cms_records where id='site-hero-slider'`;return row?.version||0;}
const command=(data:CmsHeroSlider,expectedVersion:number,action:'save'|'publish'|'unpublish'='publish')=>({module:'heroSlider' as const,id:'site-hero-slider',expectedVersion,action,data});
const media=(id:string)=>({id,name:'Synthetische sliderfoto',src:'/assets/team.png',folderId:'',alt:'Spelers van Duindorp',caption:'',credit:'',teamId:'',season:'2026–2027',published:false,featured:false,order:0,focusX:50,focusY:50,createdAt:new Date().toISOString()});

test('hero-slider separates working copies from explicit publications and guards versions, permissions and media references',async()=>{
 await write([{module:'media',id:publicId,expectedVersion:0,action:'publish',data:media(publicId)},{module:'media',id:privateId,expectedVersion:0,action:'save',data:media(privateId)}]);
 const original=(await loadState(true)).state.appearance?.heroSlider,defaults=createDefaultHeroSlider();
 const draft={...defaults,slides:[{id:'private-slide',source:'media' as const,sourceId:privateId,label:'Private werkfoto',enabled:true,focusX:30,focusY:70}]};
 const editor={...admin,grants:[{module:'pages',action:'read'},{module:'pages',action:'create'},{module:'pages',action:'update'}]};
 let current=await version();await write([command(draft,current++,'save')],editor);
 assert.deepEqual((await loadState(true)).state.appearance?.heroSlider,original);
 assert.deepEqual((await loadState(false,admin)).state.appearance?.heroSlider,draft);
 await assert.rejects(write([command(draft,current)],editor),(error:any)=>error.code==='forbidden');
 await assert.rejects(write([command(draft,current)]),(error:any)=>error.code==='reference-invalid');
 const approved={...draft,slides:[{...draft.slides[0],sourceId:publicId,label:'Goedgekeurde achtergrond'}]};
 await write([command(approved,current++)]);
 const published=(await loadState(true)).state;assert.deepEqual(published.appearance?.heroSlider,approved);assert.equal(resolveHeroSlides(published.appearance!.heroSlider!,published.media)[0].src,'/assets/team.png');
 const refs=await sql`select target_id from cms_references where record_id='site-hero-slider' and snapshot='live'`;assert.ok(refs.some(row=>row.target_id===publicId));
 await assert.rejects(write([command({...approved,zoom:'cinematic'},current-1)]),(error:any)=>error.code==='conflict');
 await assert.rejects(write([{...command(approved,0),id:'other-slider'}]),(error:any)=>error.code==='configuration-id');
 await assert.rejects(write([command({...approved,slides:[{...approved.slides[0],src:'blob:https://private.example/photo'}]} as any,current)]),(error:any)=>error.status===422);
 await write([command({...approved,slides:[]},current++,'save')]);assert.equal((await loadState(true)).state.appearance?.heroSlider?.slides.length,1);
 await write([command({...approved,slides:[]},current++)]);assert.deepEqual((await loadState(true)).state.appearance?.heroSlider?.slides,[]);
 assert.ok((await loadState(false,admin)).state.media.some(item=>item.id===publicId&&!item.deletedAt),'removing a slide preserves its media record');
});

after(async()=>{
 try{
  if(before){const live=before.live||before.draft;await write([command(live,await version(),before.live?'publish':'unpublish')]);await write([command(before.draft,await version(),'save')]);}
  else{await write([command(createDefaultHeroSlider(),await version())]);}
  const media=await sql`select id,version from cms_records where id in ${sql([publicId,privateId])} and deleted_at is null`;
  for(const row of media)await write([{module:'media',id:row.id,expectedVersion:row.version,action:'trash'}]);
 }finally{await closeDb();}
});

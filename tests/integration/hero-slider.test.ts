import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {loadState,mutate} from '../../lib/server/records';
import {createDefaultHeroSlider,resolveHeroSlides,type CmsHeroSlider} from '../../lib/cms/hero-slider';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),actorId='slider-test-'+crypto.randomUUID(),publicId='slider-public-'+crypto.randomUUID(),privateId='slider-private-'+crypto.randomUUID();
const admin:Principal={id:actorId,name:'Sliderproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
const command=(data:CmsHeroSlider,expectedVersion:number,action:'save'|'publish'|'unpublish'='publish')=>({module:'heroSlider' as const,id:'site-hero-slider',expectedVersion,action,data});
const media=(id:string)=>({id,name:'Synthetische sliderfoto',src:'/assets/team.png',folderId:'',alt:'Spelers van Duindorp',caption:'',credit:'',teamId:'',season:'2026–2027',published:false,featured:false,order:0,focusX:50,focusY:50,createdAt:new Date().toISOString()});

test('hero-slider separates working copies from explicit publications and guards versions, permissions and media references',async()=>{
 const [preimage]=await sql`select * from cms_records where id='site-hero-slider'`;
 const rollback=Symbol('hero-slider-fixture-rollback');
 try{await sql.begin(async tx=>{
 await tx`select pg_advisory_xact_lock(736402)`;
 await tx`insert into auth_user(id,name,email) values (${actorId},'Sliderproef',${actorId+'@example.invalid'})`;
 const write=(changes:Parameters<typeof mutate>[1],principal=admin)=>mutate(principal,changes,crypto.randomUUID(),crypto.randomUUID(),tx);
 const read=(publicOnly=false,principal?:Principal)=>loadState(publicOnly,principal,tx);
 const version=async()=>{const [row]=await tx`select version from cms_records where id='site-hero-slider'`;return row?.version||0;};
 // Earlier tests may have archived the singleton. Restore through the real
 // command path, then roll the complete fixture back to its exact original state.
 const [before]=await tx`select version,deleted_at from cms_records where id='site-hero-slider'`;
 if(before?.deleted_at)await write([{module:'heroSlider',id:'site-hero-slider',expectedVersion:before.version,action:'restore'}]);
 await write([{module:'media',id:publicId,expectedVersion:0,action:'publish',data:media(publicId)},{module:'media',id:privateId,expectedVersion:0,action:'save',data:media(privateId)}]);
 const original=(await read(true)).state.appearance?.heroSlider,defaults=createDefaultHeroSlider();
 const draft={...defaults,slides:[{id:'private-slide',source:'media' as const,sourceId:privateId,label:'Private werkfoto',enabled:true,focusX:30,focusY:70}]};
 const editor={...admin,grants:[{module:'pages',action:'read'},{module:'pages',action:'create'},{module:'pages',action:'update'}]};
 let current=await version();await write([command(draft,current++,'save')],editor);
 assert.deepEqual((await read(true)).state.appearance?.heroSlider,original);
 assert.deepEqual((await read(false,admin)).state.appearance?.heroSlider,draft);
 await assert.rejects(write([command(draft,current)],editor),(error:any)=>error.code==='forbidden');
 await assert.rejects(write([command(draft,current)]),(error:any)=>error.code==='reference-invalid');
 const approved={...draft,slides:[{...draft.slides[0],sourceId:publicId,label:'Goedgekeurde achtergrond'}]};
 await write([command(approved,current++)]);
 const published=(await read(true)).state;assert.deepEqual(published.appearance?.heroSlider,approved);assert.equal(resolveHeroSlides(published.appearance!.heroSlider!,published.media)[0].src,'/assets/team.png');
 const refs=await tx`select target_id from cms_references where record_id='site-hero-slider' and snapshot='live'`;assert.ok(refs.some(row=>row.target_id===publicId));
 await assert.rejects(write([command({...approved,zoom:'cinematic'},current-1)]),(error:any)=>error.code==='conflict');
 await assert.rejects(write([{...command(approved,0),id:'other-slider'}]),(error:any)=>error.code==='configuration-id');
 await assert.rejects(write([command({...approved,slides:[{...approved.slides[0],src:'blob:https://private.example/photo'}]} as any,current)]),(error:any)=>error.status===422);
 await write([command({...approved,slides:[]},current++,'save')]);assert.equal((await read(true)).state.appearance?.heroSlider?.slides.length,1);
 await write([command({...approved,slides:[]},current++)]);assert.deepEqual((await read(true)).state.appearance?.heroSlider?.slides,[]);
 assert.ok((await read(false,admin)).state.media.some(item=>item.id===publicId&&!item.deletedAt),'removing a slide preserves its media record');
 throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 const [restored]=await sql`select * from cms_records where id='site-hero-slider'`;
 assert.deepEqual(restored,preimage,'fixture rollback preserves an absent, active or soft-deleted singleton exactly');
 assert.equal((await sql`select id from cms_records where id in ${sql([publicId,privateId])}`).length,0,'fixture media are rolled back as well');
});

after(()=>closeDb());

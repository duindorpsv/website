import {test,after} from 'node:test';import assert from 'node:assert/strict';import postgres from 'postgres';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';import {databaseOptions} from '../../lib/server/database-config';import {createCmsSeed} from '../../lib/cms/seed';import {loadState,mutate} from '../../lib/server/records';import {defaultHeroCards} from '../../lib/clubmuur-config';import {heroPageOptions,heroPageHref} from '../../lib/cms/hero-pages';import type {Principal} from '../../lib/server/permissions';
assertLocalSupabaseTests();const url=new URL(process.env.MIGRATION_DATABASE_URL||'postgres://invalid/invalid');if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Isolated local connection required');const sql=postgres(url.href,databaseOptions(1));
test('all four hero slots publish real CMS destinations while drafts, missing pages and stale versions are rejected',async()=>{const rollback=new Error('rollback');try{await sql.begin(async tx=>{
 const actorId=crypto.randomUUID(),pageId='page-'+crypto.randomUUID(),draftId='page-'+crypto.randomUUID(),slug='club/activiteiten-'+crypto.randomUUID(),seed=createCmsSeed();await tx`insert into auth_user(id,name,email) values (${actorId},'Herocontrole',${actorId+'@example.invalid'})`;
 const actor:Principal={id:actorId,name:'Herocontrole',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
 const page={...seed.pages[0].live!,title:'Eigen activiteitenpagina',slug,menuVisible:false};await tx`insert into cms_records(id,module,draft,live) values (${pageId},'pages',${tx.json(page)},${tx.json(page)})`;const draft={...page,slug:slug+'-privaat'};await tx`insert into cms_records(id,module,draft) values (${draftId},'pages',${tx.json(draft)})`;
 const cards=defaultHeroCards.map(card=>({...card,kind:'page' as const,target:slug}));let version=(await tx`select version from cms_records where id='site-hero'`)[0]?.version||0;
 const publish=(items:typeof cards,expectedVersion=version)=>mutate(actor,[{module:'hero',id:'site-hero',action:'publish',expectedVersion,data:{items}}],crypto.randomUUID(),crypto.randomUUID(),tx);
 await publish(cards);version++;let state=(await loadState(true,undefined,tx)).state;assert.ok(heroPageOptions(state.pages).some(option=>option.value===slug));assert.deepEqual(state.appearance!.hero!.map(card=>heroPageHref(card.target)),Array(4).fill('/clubmuur/'+slug));
 await assert.rejects(publish(cards,version-1),(error:any)=>error.code==='conflict');for(const target of [draft.slug,slug+'-ontbreekt'])await assert.rejects(publish(cards.map(card=>({...card,target}))),(error:any)=>error.code==='hero-destination');
 const renamed={...page,slug:slug+'-nieuw'};await mutate(actor,[{module:'pages',id:pageId,action:'publish',expectedVersion:1,data:renamed}],crypto.randomUUID(),crypto.randomUUID(),tx);
 await publish(cards);version++;state=(await loadState(true,undefined,tx)).state;assert.ok(state.appearance!.hero!.every(card=>card.target===renamed.slug));
 await tx`update cms_records set live=null where id=${pageId}`;await assert.rejects(publish(cards.map(card=>({...card,target:renamed.slug}))),(error:any)=>error.code==='hero-destination');
 await tx`update cms_records set live=null where module='pages' and draft->>'slug'='club/bestuur'`;await assert.rejects(publish(cards.map(card=>({...card,target:'club/bestuur'}))),(error:any)=>error.code==='hero-destination');
 throw rollback;
 });}catch(error){if(error!==rollback)throw error;}});
after(()=>sql.end({timeout:2}));

import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {mutate,loadState} from '../../lib/server/records';
import {cmsArticlesForSite} from '../../lib/cms/public-adapters';
import {heroClubArticles} from '../../lib/clubmuur-articles';
import {createCmsSeed} from '../../lib/cms/seed';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),actorId='publication-test-'+crypto.randomUUID();
await sql`insert into auth_user(id,name,email) values (${actorId},'Publicatieproef',${actorId+'@example.invalid'})`;
const admin:Principal={id:actorId,name:'Publicatieproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:true};
const seed=createCmsSeed();
const emptySettings={...seed.settings,homepageArticleIds:[],homepageStoryIds:[],homepagePhotoIds:[],homepageAlbumIds:[]};
await sql`insert into cms_records(id,module,title,draft,live) values ('settings','settings','Instellingen',${sql.json(emptySettings)},${sql.json(emptySettings)}) on conflict do nothing`;
const news=()=>({...structuredClone(seed.articles.find(a=>a.contentType==='news')!),id:'publish-'+crypto.randomUUID(),slug:'publish-'+crypto.randomUUID(),coverId:'',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Synthetisch nieuws.'}]}]},featured:true,featuredUntil:'2099-01-01T00:00:00Z',live:undefined,scheduledAt:'',revisions:[],publishedAt:''});

test('NEWS03: publication and explicit homepage settings never conflict with their own batch',async()=>{
  const article=news(),[home]=await sql`select draft,version from cms_records where id='settings'`;
  const operationId=crypto.randomUUID();
  const changes=[{module:'articles' as const,id:article.id,expectedVersion:0,action:'publish' as const,data:article},{module:'settings' as const,id:'settings',expectedVersion:home.version,action:'publish' as const,data:{...home.draft,homepageArticleIds:[...home.draft.homepageArticleIds,article.id]}}];
  const result=await mutate(admin,changes,operationId,crypto.randomUUID());
  const [saved]=await sql`select live,status from cms_records where id=${article.id}`;
  const [settings]=await sql`select live,version from cms_records where id='settings'`;
  assert.equal(saved.status,'published');assert.equal(saved.live.title,article.title);
  assert.ok(settings.live.homepageArticleIds.includes(article.id));
  assert.equal(result.settings,settings.version);
  assert.deepEqual(await mutate(admin,changes,operationId,crypto.randomUUID()),result);
  await assert.rejects(mutate(admin,[{...changes[1],data:home.draft}],crypto.randomUUID(),crypto.randomUUID()),(error:any)=>error.code==='conflict');
});

test('NEWS04: repeated publication preserves selection order and reports derived settings versions',async()=>{
  const article=news();
  const result=await mutate(admin,[{module:'articles',id:article.id,expectedVersion:0,action:'publish',data:article}],crypto.randomUUID(),crypto.randomUUID());
  const [before]=await sql`select draft,version from cms_records where id='settings'`;
  assert.equal(result.settings,before.version);
  await mutate(admin,[{module:'articles',id:article.id,expectedVersion:1,action:'publish',data:{...article,title:'Bijgewerkt'}}],crypto.randomUUID(),crypto.randomUUID());
  const [after]=await sql`select draft,version from cms_records where id='settings'`;
  assert.deepEqual(after.draft.homepageArticleIds,before.draft.homepageArticleIds);
  assert.equal(after.version,before.version);
});

test('NEWS05: publish now cancels pending publication and does not keep a future publication date',async()=>{
  const article=news(),scheduledAt=new Date(Date.now()+86400000).toISOString();
  await mutate(admin,[{module:'articles',id:article.id,expectedVersion:0,action:'schedule',data:{...article,publishedAt:scheduledAt},scheduledAt}],crypto.randomUUID(),crypto.randomUUID());
  await mutate(admin,[{module:'articles',id:article.id,expectedVersion:1,action:'publish',data:{...article,publishedAt:scheduledAt}}],crypto.randomUUID(),crypto.randomUUID());
  const [saved]=await sql`select status,draft,live from cms_records where id=${article.id}`;
  assert.equal(saved.status,'published');assert.ok(Date.parse(saved.live.publishedAt)<=Date.now());
  assert.equal(saved.draft.publishedAt,saved.live.publishedAt);
  const jobs=await sql`select status from cms_jobs where kind='publish' and payload->>'id'=${article.id}`;
  assert.deepEqual(jobs.map(job=>job.status),['cancelled']);
});

test('NEWS09: an archive beyond the bootstrap limit still supplies newest news, active pins and cover images',async()=>{
  const prefix='hero-limit-'+crypto.randomUUID(),coverId=prefix+'-cover';
  const cover={...seed.media[0],id:coverId};
  const source=news(),latest={...source,id:prefix+'-latest',featured:false,featuredUntil:'',publishedAt:'2060-01-01T00:00:00Z',coverId};
  const pinned={...latest,id:prefix+'-pinned',featured:true,featuredUntil:'2099-01-01T00:00:00Z',publishedAt:'2050-01-01T00:00:00Z'};
  try{
    await sql`insert into cms_records(id,module,title,draft,live,updated_at)
      select ${prefix+'-media-'}||n::text,'media','Synthetische archiefvulling',${sql.json(cover)},${sql.json(cover)},'2098-01-01'::timestamptz from generate_series(1,1501) n`;
    await sql`insert into cms_records(id,module,title,draft,live,updated_at) values (${coverId},'media','Omslag',${sql.json(cover)},${sql.json(cover)},'2000-01-01'::timestamptz)`;
    for(const article of [latest,pinned])await sql`insert into cms_records(id,module,title,draft,live,updated_at) values (${article.id},'articles',${article.title},${sql.json(article)},${sql.json(article)},'2000-01-01'::timestamptz)`;
    const window=await sql`select id from cms_records where live is not null and deleted_at is null
      order by case when module in ('settings','navigation','hero') then 0 else 1 end,updated_at desc,id limit 1500`;
    assert.ok(!window.some(row=>[latest.id,pinned.id,coverId].includes(row.id)));
    const {state}=await loadState(true),items=cmsArticlesForSite(state);
    assert.ok(items.some(item=>item.id===latest.id));
    assert.equal(heroClubArticles(items)[0].id,pinned.id);
    assert.ok(state.media.some(media=>media.id===coverId&&media.published));
  }finally{await sql`delete from cms_records where id like ${prefix+'%'}`;}
});

after(closeDb);

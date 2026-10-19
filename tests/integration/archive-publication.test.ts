import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {loadState,mutate} from '../../lib/server/records';
import {publishImportedNews} from '../../lib/server/publish-imported-news';
import {createCmsSeed} from '../../lib/cms/seed';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient(),prefix='archive-publication-'+crypto.randomUUID(),actorId=prefix+'-owner';
await sql`insert into auth_user(id,name,email) values (${actorId},'Archiefproef',${actorId+'@example.invalid'})`;
const admin:Principal={id:actorId,name:'Archiefproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
const seed=createCmsSeed(),image={...seed.media[0],alt:'',published:false,featured:false},source={...seed.articles[0],contentType:'news',storyFormat:'story',featured:false,live:undefined,revisions:[],body:{type:'doc',content:[]},intro:'Oorspronkelijke archieftekst.',publishedAt:'2015-02-10T15:30:00Z'};
for(const key of ['deletedAt','version','imported'])delete (source as any)[key];
const photoId=(n:number)=>`${prefix}-photo-${n}`,articleId=(n:number)=>`${prefix}-article-${n}`;
await sql`insert into cms_records(id,module,draft,live,status,updated_at)
 select ${prefix+'-photo-'}||n,'media',${sql.json(image)}||jsonb_build_object('id',${prefix+'-photo-'}||n,'src','/api/media/'||${prefix+'-photo-'}||n),
 case when n<=36 then ${sql.json({...image,published:true,alt:'Bestaande archieffoto'})}||jsonb_build_object('id',${prefix+'-photo-'}||n,'src','/api/media/'||${prefix+'-photo-'}||n) else null end,
 case when n<=36 then 'published' else 'draft' end,'2000-01-01'::timestamptz from generate_series(1,445) n`;
await sql`insert into cms_media_objects(id,storage_key,checksum,mime,bytes,state) select ${prefix+'-photo-'}||n,${prefix+'-object-'}||n,'synthetic','image/png',1,'ready' from generate_series(1,445) n`;
await sql`insert into cms_records(id,module,title,draft,live,status,updated_at)
 select ${prefix+'-article-'}||n,'articles','Archiefbericht '||n,
 ${sql.json(source)}||jsonb_build_object('id',${prefix+'-article-'}||n,'title','Archiefbericht '||n,'slug',${prefix+'-bericht-'}||n,'coverId',${prefix+'-photo-'}||n),
 case when n<=36 then ${sql.json(source)}||jsonb_build_object('id',${prefix+'-article-'}||n,'title','Archiefbericht '||n,'slug',${prefix+'-bericht-'}||n,'coverId',${prefix+'-photo-'}||n) else null end,
 case when n<=36 then 'published' else 'draft' end,'2000-01-01'::timestamptz from generate_series(1,445) n`;
await sql`insert into cms_news_import_identities(source,source_id,record_id,provenance)
 select ${prefix},n::text,${prefix+'-article-'}||n,jsonb_build_object('sourceId',n::text,'media',jsonb_build_array(jsonb_build_object('mediaId',${prefix+'-photo-'}||n,'kind','image'))) from generate_series(1,445) n`;
await sql`insert into cms_records(id,module,draft,live,updated_at) select ${prefix+'-filler-'}||n,'media',${sql.json(image)},${sql.json({...image,published:true})},'2098-01-01'::timestamptz from generate_series(1,1600) n`;

await sql`insert into cms_records(id,module,draft,deleted_at,updated_at) select ${prefix+'-trash-'}||n,'articles',${sql.json({...source,coverId:''})},now(),'2098-01-01'::timestamptz from generate_series(1,1600) n`;

test('all 445 imported articles and their photos load despite 1600 more recently updated media records',async()=>{
  const {state}=await loadState(false,admin);
  assert.equal(state.articles.filter(article=>article.id.startsWith(prefix+'-article-')).length,445);
  assert.equal(state.media.filter(media=>media.id.startsWith(prefix+'-photo-')).length,445);
  assert.ok(state.articles.filter(article=>article.id.startsWith(prefix+'-article-')).every(article=>article.imported));
});
test('associated image publication respects rights and rolls back when the article version is stale',async()=>{
  const scoped={...admin,grants:[{module:'news',action:'publish'},{module:'news',action:'read'}]};
  await assert.rejects(mutate(scoped,[{module:'articles',id:articleId(37),expectedVersion:1,action:'publish'}],crypto.randomUUID(),crypto.randomUUID()),(error:any)=>error.code==='forbidden');
  await assert.rejects(mutate(admin,[{module:'articles',id:articleId(37),expectedVersion:0,action:'publish'}],crypto.randomUUID(),crypto.randomUUID()),(error:any)=>error.code==='conflict');
  assert.equal((await sql`select live from cms_records where id=${photoId(37)}`)[0].live,null);
});
test('archive publication publishes all remaining 409 articles and linked photos, preserves original dates and leaves manual drafts alone',async()=>{
  const manualId=prefix+'-manual';
  await sql`insert into cms_records(id,module,draft) values (${manualId},'articles',${sql.json({...source,id:manualId,title:'Bewust handmatig concept',slug:manualId,coverId:''})})`;
  const privateId=prefix+'-private';
  await sql`insert into cms_records(id,module,draft) values (${privateId},'media',${sql.json({...image,id:privateId,src:'/api/media/'+privateId})})`;
  await assert.rejects(mutate(admin,[{module:'articles',id:manualId,expectedVersion:1,action:'publish',data:{...source,id:manualId,title:'Bewust handmatig concept',slug:manualId,coverId:privateId,imported:true,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bestaande inhoud.'}]}]}}}],crypto.randomUUID(),crypto.randomUUID()),(error:any)=>error.code==='publication-invalid');
  assert.equal((await sql`select live from cms_records where id=${privateId}`)[0].live,null);
  const result=await publishImportedNews(admin);
  assert.equal(result.publishedNow,409);assert.equal(result.failed.length,0);
  assert.equal(result.published,445);
  const articles=await sql`select live from cms_records where id like ${prefix+'-article-%'}`;
  assert.equal(articles.length,445);assert.ok(articles.every(row=>row.live));
  assert.ok(articles.every(row=>Date.parse(row.live.publishedAt)===Date.parse('2015-02-10T15:30:00Z')));
  assert.equal((await sql`select live from cms_records where id=${manualId}`)[0].live,null);
  assert.match((await sql`select live from cms_records where id=${photoId(37)}`)[0].live.alt,/Archiefbericht 37/);
  const repeat=await publishImportedNews(admin);assert.equal(repeat.publishedNow,0);assert.equal(repeat.failed.length,0);
  const [saved]=await sql`select version,draft from cms_records where id=${articleId(37)}`;
  await mutate(admin,[{module:'articles',id:articleId(37),expectedVersion:saved.version,action:'save',data:{...saved.draft,title:'Bijgewerkte importversie'}}],crypto.randomUUID(),crypto.randomUUID());
  assert.equal((await publishImportedNews(admin)).publishedNow,1);
  assert.equal((await sql`select live from cms_records where id=${articleId(37)}`)[0].live.title,'Bijgewerkte importversie');
  const {state}=await loadState(true);assert.equal(state.articles.filter(article=>article.id.startsWith(prefix+'-article-')).length,445);
});
after(async()=>{
  // Preserve immutable history, while removing these synthetic records from use.
  // Later worker tests must not spend their bounded runs on this archive's caches.
  await sql`delete from cms_jobs where payload->>'id' like ${prefix+'%'}`;
  await sql`update cms_records set live=null,live_id=null,deleted_at=now(),status='archived',updated_at='2000-01-01T00:00:00Z' where id like ${prefix+'%'}`;
  await closeDb();
});

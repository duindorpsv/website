import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {sqlClient,closeDb} from '../../db';
import {getAuth} from '../../lib/server/auth';
import {actorPrincipal} from '../../lib/server/permissions';
import {createNewsSession,uploadNewsPart,finishNewsUpload,analyzeNewsSession,newsImportStatus,startNewsImport,processNewsBatch,expireNewsSession,newsRowPreview,newsImagePreview,newsProvenance,newsSession} from '../../lib/server/news-imports';
import {NEWS_IMPORT_CHUNK_BYTES} from '../../lib/cms/news-import';
import {zipBytes} from '../helpers/news-zip';
if(process.env.APP_ENV!=='test'||!process.env.DATABASE_URL?.endsWith('/duindorp_test'))throw new Error('Vereist geïsoleerde duindorp_test database.');
const sql=sqlClient(),user=await getAuth().api.createUser({body:{email:`news-import-${crypto.randomUUID()}@example.invalid`,name:'Importproef',password:crypto.randomUUID()+crypto.randomUUID(),role:'admin'}});
await sql`insert into cms_memberships(user_id,role_id) values (${user.user.id},'admin')`;
const p=await actorPrincipal(user.user.id),sessions:string[]=[],prefix=crypto.randomUUID();let counter=0;
const row=(id=String(counter++))=>({sourceId:`${prefix}-${id}`,sourceUrl:`https://www.duindorpsv.nl/1/123/${id}/`,title:'Archiefbericht '+id,publishedAt:'2016-07-23T12:00:00+02:00',lead:'Intro '+id,bodyHtml:`<p>Intro ${id}</p><h2>Historisch</h2><p>Inhoud van ${id}</p>`,sourceHtmlPath:`source-html/${id}.html`,media:[],warnings:[],status:'ok',fetchedAt:'2026-10-14T12:00:00Z'});
const manifest=(articles:any[],extra={})=>({schemaVersion:1,source:'https://www.duindorpsv.nl',articles,media:[],failures:[],...extra});
async function upload(value:object|Buffer,filename='willekeurige-naam.json'){
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),{id}=await createNewsSession(p,{filename,bytes:bytes.length,fingerprint:createHash('sha256').update(bytes).digest('hex')});sessions.push(id);
 for(let offset=0;offset<bytes.length;offset+=NEWS_IMPORT_CHUNK_BYTES)await uploadNewsPart(p,id,offset/NEWS_IMPORT_CHUNK_BYTES,bytes.subarray(offset,offset+NEWS_IMPORT_CHUNK_BYTES));await finishNewsUpload(p,id);await analyzeNewsSession(id);return id;
}
async function run(id:string,sourceIds:string[],status='draft',retry=false){const operationId=crypto.randomUUID();await startNewsImport(p,id,{operationId,sourceIds,status,retry});for(let batch=0;batch<20;batch++){await processNewsBatch(id,operationId,batch);if((await newsImportStatus(p,id)).status!=='importing')return operationId;}throw new Error('Import did not finish');}
async function expire(id:string){await expireNewsSession(p,id);}
after(async()=>{for(const id of sessions)await expire(id).catch(()=>{});await closeDb();});
test('10 candidates, explicit 3 selections, historical dates, news only, replay preserves editorial changes',async()=>{
 const articles=Array.from({length:10},()=>row()),id=await upload(manifest(articles));const before=await sql`select module,count(*)::int as n from cms_records where module!='articles' group by module`;
 const initial=await newsImportStatus(p,id);assert.equal(initial.counts.candidates,10);assert.equal(initial.counts.selected,0);
 await assert.rejects(startNewsImport(p,id,{operationId:crypto.randomUUID(),sourceIds:[],status:'draft'}),(e:any)=>e.status===422);await assert.rejects(startNewsImport(p,id,{operationId:crypto.randomUUID(),sourceIds:['unknown'],status:'draft'}),(e:any)=>e.status===422);
 const selection=articles.slice(0,3).map(a=>a.sourceId),operationId=await run(id,selection);assert.equal((await newsImportStatus(p,id)).counts.imported,3);
 const saved=await sql`select r.* from cms_records r join cms_news_import_identities i on r.id=i.record_id where i.session_id=${id}`;assert.equal(saved.length,3);for(const r of saved){assert.equal(r.content_type,'news');assert.equal(r.live,null);assert.equal(r.draft.author,'');assert.equal(r.draft.publishedAt,'2016-07-23T10:00:00.000Z');assert.ok(!JSON.stringify(r.draft.body).includes(r.draft.intro));}
 assert.deepEqual(await sql`select module,count(*)::int as n from cms_records where module!='articles' group by module`,before);
 assert.equal((await startNewsImport(p,id,{operationId,sourceIds:selection,status:'draft'})).selected,3);
 const [first]=saved;await sql`update cms_records set draft=jsonb_set(draft,'{title}','"Redactioneel gewijzigd"') where id=${first.id}`;
 const second=await upload(manifest(articles,{exportedAt:new Date().toISOString()}));assert.equal((await newsImportStatus(p,second)).counts.duplicates,3);assert.equal((await sql`select draft->>'title' as title from cms_records where id=${first.id}`)[0].title,'Redactioneel gewijzigd');await expire(id);await expire(second);
});
test('partial exports, failures, conflicting identities, invalid rows and JSON missing media remain understandable',async()=>{
 const a=row(),b=row(),c=row();b.status='pending';b.publishedAt=null as any;b.media=[{url:'https://never-fetch.invalid/a.jpg',kind:'image',path:'media/a.jpg',status:'saved',includedInZip:true}] as any;
 const id=await upload(manifest([a,{...a,title:'Conflicting title'},b,c,{sourceId:'invalid',title:'No body'}],{summary:{archiveComplete:false,articleFailures:3},failures:[{id:'failure-only',error:'timeout'}],package:{partial:true}}));const status=await newsImportStatus(p,id);assert.equal(status.counts.candidates,4);assert.equal(status.counts.invalid,2);assert.equal(status.counts.importable,2);assert.equal(status.summary.failures.length,1);assert.equal(status.rows.find(r=>r.sourceId===b.sourceId)?.mediaAvailable,0);
 await run(id,[b.sourceId,c.sourceId],'published');const results=await newsImportStatus(p,id);assert.equal(results.counts.imported,2);const [bRecord]=await sql`select r.* from cms_records r join cms_news_import_identities i on i.record_id=r.id where i.source_id=${b.sourceId}`;assert.equal(bRecord.status,'draft');assert.equal(bRecord.draft.publishedAt,'');assert.equal(bRecord.live,null);const [cRecord]=await sql`select r.* from cms_records r join cms_news_import_identities i on i.record_id=r.id where i.source_id=${c.sourceId}`;assert.equal(cRecord.status,'published');assert.equal(cRecord.live.publishedAt,'2016-07-23T10:00:00.000Z');await expire(id);
});
test('ZIP manifest last: only selected shared photo/PDF persist, false flags and corrupt photos skip, real cover and private previews',async()=>{
 const photo=await sharp({create:{width:40,height:30,channels:3,background:'#0066aa'}}).png().toBuffer(),a=row(),b=row(),unselected=row();
 const media=[{url:'https://old.invalid/bad.png',kind:'image',alt:'Bad',path:'media/bad.png',status:'saved',includedInZip:true},{url:'https://old.invalid/good.png',kind:'image',alt:'Clubfoto',path:'media/good.png',status:'saved',includedInZip:true},{url:'https://old.invalid/false.png',kind:'image',alt:'Excluded',path:'media/false.png',status:'saved',includedInZip:false},{url:'https://old.invalid/info.pdf',kind:'file',path:'media/info.pdf',status:'saved',includedInZip:true}];
 a.media=media as any;b.media=[media[1]] as any;unselected.media=[{...media[1],url:'https://old.invalid/unselected.png',path:'media/unselected.png'}] as any;a.bodyHtml+='<img src="media/good.png" alt="Clubfoto"><p><a href="media/info.pdf">Informatie</a></p>';
 const archive=zipBytes([{name:'media/bad.png',bytes:Buffer.from('not a photo')},{name:'media/good.png',bytes:photo},{name:'media/false.png',bytes:photo},{name:'media/unselected.png',bytes:photo},{name:'media/info.pdf',bytes:Buffer.from('%PDF-1.4\nSynthetic fixture\n%%EOF')},{name:'source-html/never-execute.html',bytes:Buffer.from('<script>evil()</script>')},{name:'nieuws.json',bytes:Buffer.from(JSON.stringify(manifest([a,b,unselected],{media})))}]);
 const id=await upload(archive,'export.zip'),preview=await newsRowPreview(p,id,a.sourceId);assert.ok(!JSON.stringify(preview.body).includes('https://old.invalid/good.png'));const response=await newsImagePreview(p,id,'media/good.png');assert.equal(response.headers.get('content-type'),'image/webp');
 await run(id,[a.sourceId,b.sourceId],'published');const result=await newsImportStatus(p,id);assert.equal(result.counts.imported,2);const assets=await sql`select * from cms_news_import_assets where session_id=${id}`;assert.equal(assets.length,2);assert.equal(assets.filter(a=>a.kind==='image').length,1);const records=await sql`select r.* from cms_news_import_identities i join cms_records r on r.id=i.record_id where i.session_id=${id}`;assert.equal(records[0].draft.coverId,records[1].draft.coverId);assert.equal(records[0].status,'published');for(const record of records)assert.ok((await newsProvenance(p,record.id)).sourceId);const [pdf]=assets.filter(a=>a.kind==='file');assert.equal((await sql`select record_id from cms_references where target_id=${pdf.media_id} and snapshot='live'`).length,1);assert.ok((await sql`select live from cms_records where id=${pdf.media_id}`)[0].live);await expire(id);
});
test('selection sessions bind owner and environment; retries only contain prior selected failures',async()=>{
 const a=row(),b=row(),id=await upload(manifest([a,b]));await assert.rejects(newsSession({...p,id:'another-user'},id),(e:any)=>e.status===404);const prior=process.env.APP_ENV;try{process.env.APP_ENV='development';await assert.rejects(newsSession(p,id),(e:any)=>e.status===404);}finally{process.env.APP_ENV=prior;}
 await run(id,[a.sourceId]);await assert.rejects(startNewsImport(p,id,{operationId:crypto.randomUUID(),sourceIds:[b.sourceId],status:'draft',retry:true}),(e:any)=>e.status===422);
 // A selected failed row is durable; only it is retried and the earlier success remains.
 await sql`update cms_news_import_rows set selected=true,status='failed',error='Synthetic interrupted write' where session_id=${id} and source_id=${b.sourceId}`;await run(id,[b.sourceId],'draft',true);assert.equal((await newsImportStatus(p,id)).counts.imported,2);await expire(id);
});
test('resumable upload parts are idempotent and conflicting repeats are rejected',async()=>{
 const bytes=Buffer.from(JSON.stringify(manifest([row()]))),input={filename:'anything.json',bytes:bytes.length,fingerprint:createHash('sha256').update(bytes).digest('hex')},{id}=await createNewsSession(p,input);sessions.push(id);assert.equal((await createNewsSession(p,input)).id,id);await assert.rejects(finishNewsUpload(p,id),(e:any)=>e.status===409);await uploadNewsPart(p,id,0,bytes);await uploadNewsPart(p,id,0,bytes);await assert.rejects(uploadNewsPart(p,id,0,Buffer.alloc(bytes.length)),(e:any)=>e.status===409);await finishNewsUpload(p,id);await analyzeNewsSession(id);assert.equal((await newsImportStatus(p,id)).status,'ready');await expire(id);
});
test('malicious ZIP paths, duplicate canonical names and symlinks are rejected before permanent records',async()=>{
 for(const entry of [{name:'../outside',bytes:Buffer.from('bad')},{name:'/absolute',bytes:Buffer.from('bad')},{name:'media/link',bytes:Buffer.from('/etc/passwd'),mode:0xa1ff}]){const archive=zipBytes([entry,{name:'nieuws.json',bytes:Buffer.from(JSON.stringify(manifest([row()])))}]);const {id}=await createNewsSession(p,{filename:'bad.zip',bytes:archive.length,fingerprint:createHash('sha256').update(archive).digest('hex')});sessions.push(id);await uploadNewsPart(p,id,0,archive);await finishNewsUpload(p,id);await assert.rejects(analyzeNewsSession(id),(e:any)=>e.code==='news-zip');await expire(id);}
 const archive=zipBytes([{name:'media/A.png',bytes:Buffer.from('a')},{name:'media/a.png',bytes:Buffer.from('b')},{name:'nieuws.json',bytes:Buffer.from('{}')}]);const {id}=await createNewsSession(p,{filename:'duplicate.zip',bytes:archive.length,fingerprint:createHash('sha256').update(archive).digest('hex')});sessions.push(id);await uploadNewsPart(p,id,0,archive);await finishNewsUpload(p,id);await assert.rejects(analyzeNewsSession(id),(e:any)=>e.code==='news-zip');await expire(id);
});

test('concurrent duplicate commands and separate uploads produce one immutable source identity',async()=>{
 const a=row(),id=await upload(manifest([a])),other=await upload(manifest([a],{exportedAt:'2026-10-15T12:00:00Z'})),operationId=crypto.randomUUID();
 const input={operationId,sourceIds:[a.sourceId],status:'draft'};const accepted=await Promise.all([startNewsImport(p,id,input),startNewsImport(p,id,input)]);assert.deepEqual(accepted[0],accepted[1]);
 const second=crypto.randomUUID();await startNewsImport(p,other,{...input,operationId:second});await Promise.all([processNewsBatch(id,operationId,0),processNewsBatch(other,second,0)]);assert.equal((await sql`select record_id from cms_news_import_identities where source_id=${a.sourceId}`).length,1);const counts=await sql`select status,count(*)::int as n from cms_news_import_rows where session_id in (${id},${other}) group by status`;assert.equal(counts.find(c=>c.status==='imported')?.n,1);assert.equal(counts.find(c=>c.status==='duplicate')?.n,1);await expire(id);await expire(other);
});
test('encrypted/unsupported compression, oversized expansion and a missing root manifest are rejected',async()=>{
 const base=zipBytes([{name:'nieuws.json',bytes:Buffer.from(JSON.stringify(manifest([row()])))}]),central=base.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 const encrypted=Buffer.from(base);encrypted.writeUInt16LE(1,central+8);encrypted.writeUInt16LE(1,6);
 const compression=Buffer.from(base);compression.writeUInt16LE(99,central+10);compression.writeUInt16LE(99,8);
 const bomb=Buffer.from(base);bomb.writeUInt32LE(3000*1048576,central+24);
 for(const archive of [encrypted,compression,bomb,zipBytes([{name:'nested/nieuws.json',bytes:Buffer.from('{}')}])]){
  const {id}=await createNewsSession(p,{filename:'unsafe.zip',bytes:archive.length,fingerprint:createHash('sha256').update(archive).digest('hex')});sessions.push(id);await uploadNewsPart(p,id,0,archive);await finishNewsUpload(p,id);await assert.rejects(analyzeNewsSession(id),(e:any)=>e.code==='news-zip');await expire(id);
 }
});

test('a real transaction failure preserves successes and retries only the failed selected article',async()=>{
 const fault='news_fault_'+crypto.randomUUID().replace(/-/g,''),articles=[row(),{...row(),title:fault},row(),row()],id=await upload(manifest(articles));
 await sql.unsafe(`create function ${fault}() returns trigger language plpgsql as $$ begin if NEW.title = '${fault}' then raise exception 'Synthetic transient storage failure'; end if; return NEW; end $$`);
 await sql.unsafe(`create trigger ${fault} before insert on cms_records for each row execute function ${fault}()`);
 try{await run(id,articles.slice(0,3).map(a=>a.sourceId));const result=await newsImportStatus(p,id);assert.equal(result.status,'partial');assert.equal(result.counts.imported,2);assert.equal(result.counts.failed,1);assert.equal(result.counts.selected,3);assert.equal(result.rows.find(r=>r.sourceId===articles[3].sourceId)?.status,'ready');}
 finally{await sql.unsafe(`drop trigger ${fault} on cms_records`);await sql.unsafe(`drop function ${fault}()`);}
 await run(id,[articles[1].sourceId],'draft',true);const result=await newsImportStatus(p,id);assert.equal(result.status,'completed');assert.equal(result.counts.imported,3);assert.equal(result.counts.failed,0);assert.equal(result.counts.importable,1);await expire(id);
});

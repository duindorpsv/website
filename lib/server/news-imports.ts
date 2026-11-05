import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {sqlClient} from '../../db';
import {env} from './env';
import {CmsError} from './errors';
import {authorize,has,actorPrincipal,type Principal} from './permissions';
import {putObject,deleteObject} from './storage';
import {NewsArchive,newsImportLimits,type ArchiveSource} from './news-archive';
import {NEWS_SOURCE,archiveText,normalizeMedia,normalizeArticle,rowChecksum,mergeMedia,mediaAvailable,mediaKey,webUrl,convertNewsHtml,type MediaMapping} from './news-content';
import {uploadMedia,processImage} from './media';
import {uploadDocument} from './documents';
import {mutate} from './records';
import {slugify,emptySEO} from '../cms/model';
import type {NewsImportArticle,NewsImportMedia,NewsImportRow} from '../cms/news-import';

const sql=sqlClient;
const warn=(items:unknown[])=>[...new Set(items.filter((s):s is string=>typeof s==='string').map(s=>s.slice(0,1000)))].slice(0,80);
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function newsAccess(p:Principal,teamId:string,action='create'){authorize(p,'news','read',{teamId});authorize(p,'news',action,{teamId});}
export async function newsSession(p:Principal,id:string){
 const [s]=await sql()`select * from cms_news_import_sessions where id=${id} and actor_id=${p.id} and environment=${env().APP_ENV}`;
 if(!s)throw new CmsError('news-session','Deze nieuwsimport is niet beschikbaar voor dit account.',404);
 newsAccess(p,s.team_id||'');return s;
}
function active(s:any){if(s.status==='expired'||new Date(s.expires_at).getTime()<=Date.now())throw new CmsError('news-expired','Deze tijdelijke upload is verlopen. Het importverslag blijft beschikbaar.',410);}
export async function createNewsSession(p:Principal,input:any){
 const limits=newsImportLimits();if(!input||typeof input.filename!=='string'||!/\.(json|zip)$/i.test(input.filename)||!Number.isSafeInteger(input.bytes)||input.bytes<=0||input.bytes>(/\.json$/i.test(input.filename)?limits.jsonBytes:limits.uploadBytes)||typeof input.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(input.fingerprint))throw new CmsError('news-upload','Kies een JSON- of ZIP-bestand binnen de aangegeven uploadlimiet.',413);
 const teamId=typeof input.teamId==='string'?input.teamId:'';newsAccess(p,teamId);
 if(teamId&&!(await sql()`select id from cms_teams where id=${teamId}`).length)throw new CmsError('news-team','Kies een bestaand team.',422);
 return sql().begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtextextended(${`news-upload:${p.id}`},0))`;
  const [prior]=await tx`select id from cms_news_import_sessions where actor_id=${p.id} and environment=${env().APP_ENV} and fingerprint=${input.fingerprint} and bytes=${input.bytes} and coalesce(team_id,'')=${teamId} and expires_at>now() and status!='expired' order by created_at desc limit 1`;
  if(prior)return {id:prior.id};
  const [count]=await tx`select count(*)::int as n from cms_news_import_sessions where actor_id=${p.id} and environment=${env().APP_ENV} and status!='expired' and expires_at>now()`;
  if(count.n>=3)throw new CmsError('news-quota','Er staan al drie tijdelijke imports klaar. Ruim een oude upload op; de geïmporteerde nieuwsberichten blijven behouden.',409);
  const id=crypto.randomUUID(),filename=input.filename.replace(/[\\/\u0000-\u001f]/g,'_').slice(-190);
  await tx`insert into cms_news_import_sessions(id,actor_id,environment,filename,bytes,fingerprint,team_id) values (${id},${p.id},${env().APP_ENV},${filename},${input.bytes},${input.fingerprint},${teamId||null})`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},'news-import-upload',${id},${crypto.randomUUID()})`;
  return {id};
 });
}
export async function uploadNewsPart(p:Principal,id:string,part:number,bytes:Uint8Array){
 const s=await newsSession(p,id);active(s);const size=newsImportLimits().chunkBytes;
 if(!Number.isSafeInteger(part)||part<0||part>=Math.ceil(s.bytes/size)||bytes.length!==Math.min(size,Number(s.bytes)-part*size))throw new CmsError('news-part','Dit uploaddeel heeft een ongeldige omvang of positie.',422);
 const checksum=createHash('sha256').update(bytes).digest('hex');
 return sql().begin(async tx=>{
  const [current]=await tx`select status from cms_news_import_sessions where id=${id} for update`;
  if(current.status!=='uploading')throw new CmsError('news-upload-closed','Deze upload is al afgesloten.',409);
  const [old]=await tx`select checksum from cms_news_import_parts where session_id=${id} and part=${part}`;
  if(old){if(old.checksum!==checksum)throw new CmsError('news-part-conflict','Dit deel komt niet overeen met de eerdere upload. Kies het oorspronkelijke bestand of start een nieuwe import.',409);return {part};}
  const key=`news-imports/${id}/parts/${part}-${checksum}.bin`;
  await putObject(key,bytes,'application/octet-stream');
  try{await tx`insert into cms_news_import_parts(session_id,part,storage_key,checksum,bytes) values (${id},${part},${key},${checksum},${bytes.length})`;}
  catch(e){await deleteObject(key);throw e;}
  return {part};
 });
}
async function queue(tx:any,kind:string,id:string,run:string,batch=0){await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${`${kind}:${id}:${run}:${batch}`},${kind},${tx.json({sessionId:id,run,batch})}) on conflict(operation_id) do nothing`;}
export async function finishNewsUpload(p:Principal,id:string){const s=await newsSession(p,id);active(s);return sql().begin(async tx=>{
 const [current]=await tx`select status from cms_news_import_sessions where id=${id} for update`;if(current.status!=='uploading')return {id,status:current.status};
 const parts=await tx`select part,bytes from cms_news_import_parts where session_id=${id} order by part`;
 if(parts.length!==Math.ceil(Number(s.bytes)/newsImportLimits().chunkBytes)||parts.some((r,i)=>r.part!==i)||parts.reduce((n,r)=>n+r.bytes,0)!==Number(s.bytes))throw new CmsError('news-upload-incomplete','De upload is nog niet volledig. Hervat de ontbrekende delen.',409);
 await tx`update cms_news_import_sessions set status='queued',updated_at=now() where id=${id}`;await queue(tx,'news-analyze',id,'analyze');return {id,status:'queued'};
});}
async function archiveFor(s:any){const parts=await sql()`select part,storage_key,bytes,checksum from cms_news_import_parts where session_id=${s.id} order by part`;return new NewsArchive({filename:s.filename,bytes:Number(s.bytes),parts:parts.map(p=>({part:p.part,storage_key:p.storage_key,bytes:p.bytes,checksum:p.checksum}))} as ArchiveSource).open();}
function cleanSummary(value:any){const summary:Record<string,number|boolean>={};for(const key of ['expected','discovered','exported','archiveComplete','articleFailures','mediaSaved','mediaFailed','pending'])if(typeof value?.[key]==='number'||typeof value?.[key]==='boolean')summary[key]=value[key];return summary;}
export async function analyzeNewsSession(id:string){
 return sql().begin(async lock=>{const [claim]=await lock`select pg_try_advisory_xact_lock(hashtextextended(${`news-analyze:${id}`},0)) as acquired`;if(claim.acquired)await analyzeNewsSessionLocked(id);});
}
async function analyzeNewsSessionLocked(id:string){
 const [s]=await sql()`select * from cms_news_import_sessions where id=${id} and environment=${env().APP_ENV}`;if(!s||!['queued','analyzing'].includes(s.status))return;active(s);
 const p=await actorPrincipal(s.actor_id);newsAccess(p,s.team_id||'');await sql()`update cms_news_import_sessions set status='analyzing',error=null where id=${id}`;
 const archive=await archiveFor(s);
 try{
  let manifest:any;try{manifest=JSON.parse((await archive.read('nieuws.json',newsImportLimits().jsonBytes)).toString('utf8'));}catch(error){if(error instanceof CmsError)throw error;throw new CmsError('news-json','nieuws.json bevat geen leesbare JSON.',422);}
  if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.articles)||manifest.articles.length>newsImportLimits().articles)throw new CmsError('news-schema','Gebruik schemaVersion 1 met een lijst articles (maximaal 10.000 berichten).',422);
  const zip=/\.zip$/i.test(s.filename),entries=new Set(archive.entries.keys()),globalMedia=Array.isArray(manifest.media)?manifest.media.filter((m:any)=>m&&typeof m==='object'&&!Array.isArray(m)).slice(0,50000).map(normalizeMedia):[];
  const mediaIndex=new Map<string,NewsImportMedia>();for(const m of globalMedia){if(m.url)mediaIndex.set(webUrl(m.url),m);if(m.path)mediaIndex.set(m.path,m);}
  const rows=new Map<string,any>();let ordinal=0;
  for(const raw of manifest.articles){
   const parsed=normalizeArticle(raw),sourceId=parsed.article?.sourceId||(typeof raw?.sourceId==='string'&&raw.sourceId.length<=200&&raw.sourceId.trim()&&!/[\u0000-\u001f]/.test(raw.sourceId)&&raw.sourceId.isWellFormed()?raw.sourceId.trim().slice(0,200):`invalid-row:${id}:${ordinal}`);
   const row:any={source_id:sourceId,ordinal:ordinal++,title:archiveText(raw?.title,500)||'Ongeldig bericht',published_at:parsed.article?.publishedAt||null,year:parsed.article?.publishedAt?new Intl.DateTimeFormat('en',{timeZone:'Europe/Amsterdam',year:'numeric'}).format(new Date(parsed.article.publishedAt)):'',data:parsed.article,checksum:parsed.article?rowChecksum(parsed.article):null,status:parsed.errors.length?'invalid':'ready',warnings:parsed.warnings,error:parsed.errors.join(' ')||null};
   if(parsed.article){row.data.media=mergeMedia(parsed.article,mediaIndex);let text='';try{const converted=convertNewsHtml(row.data);text=converted.text;row.warnings.push(...converted.warnings.filter(v=>!v.startsWith('Een niet-overgenomen afbeelding')));}catch(e){row.status='invalid';row.error=e instanceof CmsError?e.message:'De inhoud past niet in de bestaande nieuwseditor.';}
    if(!text.trim()&&!parsed.article.lead.trim()){row.status='invalid';row.error='Dit bericht bevat geen bruikbare tekst.';}
    if(row.data.media.some((m:NewsImportMedia)=>!mediaAvailable(m,entries,zip)))row.warnings.push(zip?'Een of meer mediabestanden ontbreken in deze ZIP of zijn niet beschikbaar verklaard.':'JSON bevat geen lokale mediabestanden; de tekst blijft importeerbaar.');
   }
   const duplicate=rows.get(sourceId);if(duplicate){if(duplicate.checksum!==row.checksum||!row.checksum){duplicate.status='invalid';duplicate.error='Tegenstrijdige of ongeldige rijen met hetzelfde bron-ID. Pas de export aan voordat je deze identiteit importeert.';}else duplicate.warnings.push('Dit bron-ID komt identiek meer dan één keer in de export voor; het wordt eenmaal aangeboden.');continue;}
   row.warnings=warn(row.warnings);rows.set(sourceId,row);
  }
  const failures=(Array.isArray(manifest.failures)?manifest.failures:[]).slice(0,10000).map((f:any)=>({id:archiveText(f?.id,200),url:archiveText(f?.url,2000),error:archiveText(f?.error)||'Bron niet uitgelezen.'}));
  const summary={source:archiveText(manifest.source,2000),exportedAt:archiveText(manifest.exportedAt,100),summary:cleanSummary(manifest.summary),package:manifest.package&&typeof manifest.package==='object'?{format:archiveText(manifest.package.format,30),partial:!!manifest.package.partial,storedFilesIncluded:Number.isSafeInteger(manifest.package.storedFilesIncluded)?manifest.package.storedFilesIncluded:null,storedFilesSkipped:Number.isSafeInteger(manifest.package.storedFilesSkipped)?manifest.package.storedFilesSkipped:null,mediaIncluded:Number.isSafeInteger(manifest.package.mediaIncluded)?manifest.package.mediaIncluded:null,sourceHtmlIncluded:Number.isSafeInteger(manifest.package.sourceHtmlIncluded)?manifest.package.sourceHtmlIncluded:null}:null,failures,skippedFiles:(Array.isArray(manifest.skippedFiles)?manifest.skippedFiles:[]).slice(0,10000).map((f:any)=>({path:archiveText(f?.path,600),reason:archiveText(f?.reason),kind:archiveText(f?.kind,30)})),entries:[...entries]};
  const values=[...rows.values()];
  for(let offset=0;offset<values.length;offset+=50){await sql().begin(async tx=>{const [current]=await tx`select status from cms_news_import_sessions where id=${id} for update`;if(current.status!=='analyzing')throw new CmsError('news-cancelled','De analyse is gestopt.',409);
   await tx`insert into cms_news_import_rows(session_id,source_id,ordinal,title,published_at,year,data,checksum,status,warnings,error) select ${id},v.source_id,v.ordinal,v.title,v.published_at::timestamptz,v.year,v.data,v.checksum,v.status,v.warnings,v.error from jsonb_to_recordset(${tx.json(values.slice(offset,offset+50))}) as v(source_id text,ordinal integer,title text,published_at text,year text,data jsonb,checksum text,status text,warnings jsonb,error text) on conflict(session_id,source_id) do update set data=excluded.data,status=excluded.status,warnings=excluded.warnings,error=excluded.error`;
  });}
  await sql().begin(async tx=>{await tx`update cms_news_import_rows r set status='duplicate',record_id=i.record_id from cms_news_import_identities i where r.session_id=${id} and i.source=${NEWS_SOURCE} and i.source_id=r.source_id and r.status='ready'`;await tx`update cms_news_import_sessions set summary=${tx.json(summary)},status='ready',error=null,updated_at=now() where id=${id} and status='analyzing'`;});
 }finally{archive.close();}
}
export async function startNewsImport(p:Principal,id:string,input:any){
 const s=await newsSession(p,id);active(s);if(!input||!uuid(input.operationId)||!Array.isArray(input.sourceIds)||!input.sourceIds.length||input.sourceIds.length>newsImportLimits().articles||input.sourceIds.some((v:any)=>typeof v!=='string'||v.length>200)||new Set(input.sourceIds).size!==input.sourceIds.length||!['draft','published'].includes(input.status))throw new CmsError('news-selection','Kies expliciet minstens één bericht en een geldige publicatiestatus.',422);
 newsAccess(p,s.team_id||'',input.status==='published'?'publish':'create');
 return sql().begin(async tx=>{
  const [current]=await tx`select * from cms_news_import_sessions where id=${id} for update`;
  const [operation]=await tx`select response from cms_operations where id=${input.operationId} and actor_id=${p.id}`;if(operation){if(operation.response.sessionId!==id)throw new CmsError('news-operation','Dit verzoek hoort bij een andere import.',409);return operation.response;}
  if(!['ready','completed','partial','failed'].includes(current.status))throw new CmsError('news-busy','Wacht tot de analyse of huidige import klaar is.',409);
  const items=await tx`select * from cms_news_import_rows where session_id=${id} and source_id in ${tx(input.sourceIds)} for update`;
  if(items.length!==input.sourceIds.length||items.some(r=>input.retry?r.status!=='failed'||!r.selected:!['ready','failed'].includes(r.status)||r.status==='failed'))throw new CmsError('news-selection','De selectie bevat onbekende, reeds geïmporteerde of niet-importeerbare bron-ID’s. Een retry mag alleen eerder geselecteerde fouten bevatten.',422);
  const run=input.operationId;await tx`update cms_news_import_rows set selected=true,status='queued',error=null,run_id=${run} where session_id=${id} and source_id in ${tx(input.sourceIds)}`;
  await tx`update cms_news_import_sessions set status='importing',target_status=${input.status},run_id=${run},batch=0,error=null,updated_at=now() where id=${id}`;
  await queue(tx,'news-import',id,run);const result={sessionId:id,run,selected:items.length};
  await tx`insert into cms_operations(id,actor_id,response) values (${run},${p.id},${tx.json(result)})`;return result;
 });
}
async function prepareAsset(p:Principal,s:any,media:NewsImportMedia,archive:NewsArchive):Promise<MediaMapping|null>{
 const path=media.path!;return sql().begin(async tx=>{
  const [session]=await tx`select status,run_id,expires_at from cms_news_import_sessions where id=${s.id} for share`;
  if(session.status!=='importing'||session.run_id!==s.run_id)throw new CmsError('news-cancelled','Deze import wordt niet meer uitgevoerd.',409);active(session);
  await tx`select pg_advisory_xact_lock(hashtextextended(${`news-asset:${s.id}:${path}`},0))`;
  const [old]=await tx`select a.*,r.deleted_at,o.state from cms_news_import_assets a left join cms_records r on r.id=a.media_id left join cms_media_objects o on o.id=a.media_id where a.session_id=${s.id} and a.path=${path}`;
  if(old?.media_id&&!old.deleted_at&&old.state!=='ready')return null;
  if(old?.media_id&&!old.deleted_at&&old.state==='ready')return {id:old.media_id,kind:old.kind,url:old.kind==='image'?`/api/media/${old.media_id}`:`/api/documents/${old.media_id}`,alt:media.alt||''};
  const isImage=media.kind==='image',kind=isImage?'image':'file';if(!isImage&&media.kind!=='file')throw new CmsError('news-media-kind','Dit mediabestand heeft geen ondersteund type.',422);
  authorize(p,isImage?'media':'pages','create',{teamId:s.team_id||''});
  const bytes=await archive.read(path,isImage?12_000_000:10_000_000),name=path.split('/').pop()||'Bijlage';
  let item:any;
  if(isImage){item=await uploadMedia(p,new File([bytes],name),{teamId:s.team_id||'',season:'',folderId:'',alt:media.alt||'',importBatch:s.id});}
  else{if(s.team_id)throw new CmsError('news-document-scope','Een teamimport kan geen algemene clubdocumenten aanmaken.',403);item=await uploadDocument(p,new File([bytes],name),s.id);}
  await tx`insert into cms_news_import_assets(session_id,path,media_id,kind,error) values (${s.id},${path},${item.id},${kind},null) on conflict(session_id,path) do update set media_id=excluded.media_id,kind=excluded.kind,error=null`;
  if(isImage){try{await processImage(item.id);}catch{await tx`update cms_news_import_assets set error='image-processing' where session_id=${s.id} and path=${path}`;return null;}}
  return {id:item.id,kind,url:isImage?`/api/media/${item.id}`:`/api/documents/${item.id}`,alt:media.alt||''};
 });
}
async function importRow(s:any,item:any,archive:NewsArchive){
 let p=await actorPrincipal(s.actor_id);newsAccess(p,s.team_id||'');
 const article=item.data as NewsImportArticle,warnings=[...item.warnings] as string[];
 const [prior]=await sql()`select record_id from cms_news_import_identities where source=${NEWS_SOURCE} and source_id=${item.source_id}`;
 if(prior){await sql()`update cms_news_import_rows set status='duplicate',record_id=${prior.record_id} where session_id=${s.id} and source_id=${item.source_id} and status in ('queued','processing')`;return;}
 const textAvailable=!!convertNewsHtml(article).text.trim(),published=s.target_status==='published'&&!!article.publishedAt&&textAvailable;
 if(s.target_status==='published'&&!textAvailable)warnings.push('Als concept opgeslagen: alleen een inleiding is beschikbaar. Vul de berichtinhoud aan voordat je publiceert.');
 if(s.target_status==='published'&&!article.publishedAt)warnings.push('Als concept opgeslagen: een geldige historische publicatiedatum ontbreekt.');
 const mapping=new Map<string,MediaMapping>(),assets:MediaMapping[]=[];
 for(const media of article.media){
  if(!mediaAvailable(media,new Set(archive.entries.keys()),/\.zip$/i.test(s.filename)))continue;
  try{
   if(published)authorize(p,media.kind==='image'?'media':'pages','publish',{teamId:s.team_id||''});
   if(published&&media.kind==='image'&&!media.alt?.trim())throw new CmsError('alt-required','Alt-tekst ontbreekt; deze afbeelding is niet meegepubliceerd.',422);
   const mapped=await prepareAsset(p,s,media,archive);if(!mapped){warnings.push('Een afbeelding kon niet worden verwerkt en is overgeslagen.');continue;}assets.push(mapped);for(const raw of [media.url,media.path]){if(!raw)continue;const key=mediaKey(raw);if(key)mapping.set(key,mapped);}
  }catch(e){warnings.push(e instanceof CmsError?e.message:'Een mediabestand kon niet worden opgeslagen; de tekst blijft behouden.');}
 }
 const converted=convertNewsHtml(article,mapping);warnings.push(...converted.warnings);
 await sql().begin(async tx=>{
  await tx`select pg_advisory_xact_lock(736402)`;
  const [current]=await tx`select status,run_id from cms_news_import_sessions where id=${s.id} for update`;
  if(current.status!=='importing'||current.run_id!==s.run_id)return;
  const [row]=await tx`select status from cms_news_import_rows where session_id=${s.id} and source_id=${item.source_id} for update`;
  if(!['queued','processing'].includes(row.status))return;
  const [existing]=await tx`select record_id from cms_news_import_identities where source=${NEWS_SOURCE} and source_id=${item.source_id}`;
  if(existing){await tx`update cms_news_import_rows set status='duplicate',record_id=${existing.record_id} where session_id=${s.id} and source_id=${item.source_id} and status in ('queued','processing')`;return;}
  p=await actorPrincipal(s.actor_id);newsAccess(p,s.team_id||'');if(published)authorize(p,'news','publish',{teamId:s.team_id||''});
  for(const asset of [...new Map(assets.map(a=>[a.id,a])).values()]){const [record]=await tx`select * from cms_records where id=${asset.id}`;if(!record||record.deleted_at)throw new CmsError('news-media','Een geïmporteerd bestand is ondertussen verwijderd.',409);if(published&&!record.live)await mutate(p,[{module:asset.kind==='image'?'media':'documents',id:asset.id,expectedVersion:record.version,action:'publish',data:record.draft}],crypto.randomUUID(),crypto.randomUUID(),tx);}
  const id=crypto.randomUUID(),base=slugify(article.title).slice(0,180).replace(/-$/,'')||'nieuwsbericht';let slug=base,index=2;
  while((await tx`select path from cms_paths where path=${`/clubmuur/nieuws/${slug}`}`).length)slug=`${base}-${index++}`;
  const cover=assets.find(a=>a.kind==='image');const data={id,contentType:'news',storyFormat:'story',title:article.title,slug,intro:article.lead,body:converted.doc,coverId:cover?.id||'',author:'',category:'Clubnieuws',tags:[],teamId:s.team_id||'',season:'',seo:emptySEO(),featured:false,publishedAt:article.publishedAt||''};
  await mutate(p,[{module:'articles',id,expectedVersion:0,action:published?'publish':'save',data}],crypto.randomUUID(),crypto.randomUUID(),tx);
  const provenance={sourceId:article.sourceId,sourceUrl:article.sourceUrl,source:NEWS_SOURCE,exportSource:s.summary.source,exportedAt:s.summary.exportedAt,publishedAt:article.publishedAt,fetchedAt:typeof article.fetchedAt==='string'?article.fetchedAt:null,sourceHtmlPath:typeof article.sourceHtmlPath==='string'?article.sourceHtmlPath:null,media:article.media.map(m=>({url:m.url,path:m.path,kind:m.kind,mediaId:mapping.get(mediaKey(m.path||m.url))?.id||null})),warnings:warn(warnings)};
  await tx`insert into cms_news_import_identities(source,source_id,record_id,session_id,provenance) values (${NEWS_SOURCE},${article.sourceId},${id},${s.id},${tx.json(provenance)})`;
  await tx`update cms_news_import_assets set used=true where session_id=${s.id} and media_id in ${tx(assets.length?assets.map(a=>a.id):['none'])}`;
  await tx`update cms_news_import_rows set status='imported',record_id=${id},warnings=${tx.json(warn(warnings))},error=null where session_id=${s.id} and source_id=${article.sourceId}`;
  if(published)await legacyNewsRedirect(tx,id,article.sourceUrl,slug);
 });
}
export async function legacyNewsRedirect(tx:any,id:string,sourceUrl:string,slug:string){
 let url:URL;try{url=new URL(sourceUrl);}catch{return;}
 if(url.hostname.replace(/^www\./,'')!=='duindorpsv.nl'||!/^\/1\/\d+\//.test(url.pathname))return;
 await tx`insert into cms_redirects(from_path,to_path,record_id) values (${url.pathname},${`/clubmuur/nieuws/${slug}`},${id}) on conflict(from_path) do nothing`;
}
export async function processNewsBatch(id:string,run:string,batch:number){
 const [s]=await sql()`select * from cms_news_import_sessions where id=${id} and environment=${env().APP_ENV}`;if(!s||s.status!=='importing'||s.run_id!==run||s.batch!==batch)return;active(s);
 const p=await actorPrincipal(s.actor_id);newsAccess(p,s.team_id||'');
 const rows=await sql()`select * from cms_news_import_rows where session_id=${id} and run_id=${run} and status in ('queued','processing') order by ordinal limit 3`;
 const archive=await archiveFor(s);
 try{for(const item of rows){await sql()`update cms_news_import_rows set status='processing' where session_id=${id} and source_id=${item.source_id} and status='queued'`;try{await importRow(s,item,archive);}catch(e){await sql()`update cms_news_import_rows set status='failed',error=${e instanceof CmsError?e.message:'De opslag van dit bericht is mislukt. Probeer alleen dit geselecteerde bericht opnieuw.'} where session_id=${id} and source_id=${item.source_id} and status in ('queued','processing')`;}}}finally{archive.close();}
 await sql().begin(async tx=>{const [current]=await tx`select * from cms_news_import_sessions where id=${id} for update`;if(current.run_id!==run||current.batch!==batch||current.status!=='importing')return;
  const [remaining]=await tx`select count(*)::int as n from cms_news_import_rows where session_id=${id} and run_id=${run} and status in ('queued','processing')`;
  if(remaining.n){await tx`update cms_news_import_sessions set batch=batch+1,updated_at=now() where id=${id}`;await queue(tx,'news-import',id,run,batch+1);}
  else{const [result]=await tx`select count(*) filter(where status='failed')::int as failed,count(*) filter(where status='imported')::int as imported from cms_news_import_rows where session_id=${id} and selected`;await tx`update cms_news_import_sessions set status=${result.failed?(result.imported?'partial':'failed'):'completed'},updated_at=now() where id=${id}`;}
 });
 const [current]=await sql()`select status from cms_news_import_sessions where id=${id}`;if(['completed','partial','failed'].includes(current.status))await cleanNewsAssets(id);
}
export async function failNewsJob(id:string,message:string){await sql()`update cms_news_import_sessions set status=case when exists(select 1 from cms_news_import_rows where session_id=${id} and status='imported') then 'partial' else 'failed' end,error=${message.slice(0,1000)},updated_at=now() where id=${id} and status in ('queued','analyzing','importing')`;await sql()`update cms_news_import_rows set status='failed',error=${message.slice(0,1000)} where session_id=${id} and status in ('queued','processing')`;}
export async function newsImportStatus(p:Principal,id:string,search=new URLSearchParams()){
 const s=await newsSession(p,id),query=(search.get('q')||'').slice(0,200),year=(search.get('year')||'').slice(0,4),filter=search.get('filter')||'all',page=Math.max(1,Math.min(1000000,Math.floor(Number(search.get('page')))||1)),limit=[25,50,100].includes(Number(search.get('pageSize')))?Number(search.get('pageSize')):25;
 const [counts]=await sql()`select count(*)::int as candidates,count(*) filter(where status='ready')::int as importable,count(*) filter(where status='duplicate')::int as duplicates,count(*) filter(where status='invalid')::int as invalid,count(*) filter(where jsonb_array_length(warnings)>0)::int as warnings,count(*) filter(where selected)::int as selected,count(*) filter(where status='imported')::int as imported,count(*) filter(where status='failed')::int as failed,count(*) filter(where status in ('queued','processing'))::int as queued from cms_news_import_rows where session_id=${id}`;
 const database=sql(),condition=database`session_id=${id} and title ilike ${'%'+query.replace(/[\\%_]/g,'\\$&')+'%'} and (${!year} or year=${year}) and (${filter==='all'} or status=${filter} or (${filter==='warnings'} and jsonb_array_length(warnings)>0))`;
 const [total]=await database`select count(*)::int as n from cms_news_import_rows where ${condition}`;
 const rows=await database`select r.*,a.draft->>'slug' as slug,a.draft->>'coverId' as cover_id from cms_news_import_rows r left join cms_records a on a.id=r.record_id where ${database`r.session_id=${id} and r.title ilike ${'%'+query.replace(/[\\%_]/g,'\\$&')+'%'} and (${!year} or r.year=${year}) and (${filter==='all'} or r.status=${filter} or (${filter==='warnings'} and jsonb_array_length(r.warnings)>0))`} order by r.ordinal limit ${limit} offset ${(page-1)*limit}`;
 const received=await database`select part from cms_news_import_parts where session_id=${id} order by part`,years=await database`select distinct year from cms_news_import_rows where session_id=${id} and year!='' order by year desc`;
 const {entries,...summary}=s.summary;return {id:s.id,filename:s.filename,bytes:Number(s.bytes),fingerprint:s.fingerprint,teamId:s.team_id||'',status:s.status,expiresAt:new Date(s.expires_at).toISOString(),received:received.map(v=>v.part),chunkBytes:newsImportLimits().chunkBytes,summary,error:s.error,targetStatus:s.target_status,counts,rows:rows.map(r=>rowOutput(s,r)),total:total.n,page,pageSize:limit,years:years.map(y=>y.year),canPublish:has(p,'news','publish',{teamId:s.team_id||''})};
}
function rowOutput(s:any,row:any):NewsImportRow{const article=row.data as NewsImportArticle|null,entries=new Set<string>(s.summary.entries||[]),available=article?.media.filter(m=>mediaAvailable(m,entries,/\.zip$/i.test(s.filename)))||[],image=available.find(m=>m.kind==='image');return {sourceId:row.source_id,title:row.title,lead:article?.lead||'',publishedAt:row.published_at?new Date(row.published_at).toISOString():null,year:row.year,status:row.status,warnings:row.warnings,error:row.error,importable:row.status==='ready',selected:row.selected,recordId:row.record_id,slug:row.slug,previewImage:row.cover_id?`/api/cms/media/${row.cover_id}/file`:image?`/api/cms/news-imports/${s.id}/image?sourceId=${encodeURIComponent(row.source_id)}`:null,mediaAvailable:available.length,mediaTotal:article?.media.length||0,sourceUrl:article?.sourceUrl||''};}
export async function newsRowPreview(p:Principal,id:string,sourceId:string){const s=await newsSession(p,id);active(s);const [row]=await sql()`select r.*,a.draft->>'coverId' as cover_id from cms_news_import_rows r left join cms_records a on a.id=r.record_id where r.session_id=${id} and r.source_id=${sourceId}`;if(!row?.data)throw new CmsError('news-row','Dit bericht is niet beschikbaar voor voorvertoning.',404);const article=row.data as NewsImportArticle,entries=new Set<string>(s.summary.entries||[]);const converted=convertNewsHtml(article,new Map(),m=>mediaAvailable(m,entries,/\.zip$/i.test(s.filename))&&m.kind==='image'?`/api/cms/news-imports/${id}/image?path=${encodeURIComponent(m.path!)}`:'');return {...rowOutput(s,row),body:converted.doc,warnings:warn([...row.warnings,...converted.warnings])};}
export async function newsImportIds(p:Principal,id:string){await newsSession(p,id);return (await sql()`select source_id from cms_news_import_rows where session_id=${id} and status='ready' order by ordinal`).map(r=>r.source_id);}
let imageChain:Promise<unknown>=Promise.resolve();
export async function newsImagePreview(p:Principal,id:string,path:string){const s=await newsSession(p,id);active(s);const rows=await sql()`select data from cms_news_import_rows where session_id=${id} and data->'media' @> ${sql().json([{path,kind:'image'}])} limit 1`;const media=(rows[0]?.data?.media||[]).find((m:NewsImportMedia)=>m.path===path);if(!media||!mediaAvailable(media,new Set(s.summary.entries||[]),/\.zip$/i.test(s.filename)))throw new CmsError('news-image','Deze pakketfoto is niet beschikbaar.',404);
 const task=imageChain.catch(()=>{}).then(async()=>{const archive=await archiveFor(s);try{const bytes=await archive.read(path,12_000_000);const image=sharp(bytes,{limitInputPixels:40000000});let info;try{info=await image.metadata();}catch{throw new CmsError('news-image','Dit bestand is geen ondersteunde foto.',422);}if(!['jpeg','png','webp','avif'].includes(info.format||'')||(info.pages||1)>1)throw new CmsError('news-image','Dit bestand is geen ondersteunde foto.',422);try{return await image.rotate().resize({width:480,withoutEnlargement:true}).webp({quality:75}).toBuffer();}catch{throw new CmsError('news-image','Deze foto kan niet worden verwerkt.',422);}}finally{archive.close();}});imageChain=task;return new Response(Buffer.from(await task),{headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
}
/** Validate cover candidates without making unselected uploads permanent. */
export async function newsCoverPreview(p:Principal,id:string,sourceId:string){
 const s=await newsSession(p,id);active(s);const [row]=await sql()`select data from cms_news_import_rows where session_id=${id} and source_id=${sourceId}`;
 const entries=new Set<string>(s.summary.entries||[]),media=(row?.data?.media||[]) as NewsImportMedia[];
 for(const candidate of media){if(candidate.kind!=='image'||!mediaAvailable(candidate,entries,/\.zip$/i.test(s.filename)))continue;
  try{return await newsImagePreview(p,id,candidate.path!);}catch(e){if(!(e instanceof CmsError)||![404,413,422].includes(e.status))throw e;}
 }
 throw new CmsError('news-image','Er is geen bruikbare pakketfoto voor deze omslag beschikbaar.',404);
}
export async function newsImportReport(p:Principal,id:string){const s=await newsSession(p,id);const rows=await sql()`select source_id,title,status,selected,record_id,warnings,error from cms_news_import_rows where session_id=${id} order by ordinal`;const {entries,...summary}=s.summary;return {id:s.id,filename:s.filename,status:s.status,createdAt:s.created_at,summary,articles:rows};}
export async function listNewsSessions(p:Principal){if(![...p.teams,''].some(teamId=>has(p,'news','create',{teamId})&&has(p,'news','read',{teamId})))throw new CmsError('forbidden','Nieuws importeren vereist nieuwsbeheerrechten.',403);const rows=await sql()`select id,team_id,filename,status,created_at,expires_at from cms_news_import_sessions where actor_id=${p.id} and environment=${env().APP_ENV} order by created_at desc,id`;return rows.filter(r=>has(p,'news','create',{teamId:r.team_id||''})&&has(p,'news','read',{teamId:r.team_id||''}));}
export async function expireNewsSession(p:Principal,id:string){const s=await newsSession(p,id);if(s.status==='importing')throw new CmsError('news-busy','Wacht tot de geselecteerde berichten zijn verwerkt.',409);await sql()`update cms_news_import_sessions set expires_at=now() where id=${id}`;await cleanExpiredNews();return {id,status:'expired'};}
export async function cleanNewsAssets(id:string){
 const keys=await sql().begin(async tx=>{const output:string[]=[];const assets=await tx`select r.id as media_id,r.draft from cms_records r where r.import_batch=${id} and r.module in ('media','documents') and not exists(select 1 from cms_news_import_assets a where a.media_id=r.id and a.used) and not exists(select 1 from cms_references f where f.target_id=r.id) and not exists(select 1 from cms_revisions v where v.record_id=r.id) and not exists(select 1 from cms_publications p where p.record_id=r.id) for update of r`;
  for(const asset of assets){const [object]=await tx`select storage_key,variants from cms_media_objects where id=${asset.media_id}`;if(!object)continue;await tx`delete from cms_news_import_assets where session_id=${id} and media_id=${asset.media_id}`;await tx`delete from cms_jobs where kind='image' and payload->>'id'=${asset.media_id}`;await tx`delete from cms_media_objects where id=${asset.media_id}`;await tx`delete from cms_records where id=${asset.media_id}`;output.push(object.storage_key,...(object.variants||[]).map((v:any)=>v.key));}return output;});
 for(const key of keys)await deleteObject(key).catch(()=>{});
}
export async function cleanExpiredNews(){const sessions=await sql()`select id from cms_news_import_sessions s where environment=${env().APP_ENV} and expires_at<now() and (status!='expired' or exists(select 1 from cms_news_import_parts p where p.session_id=s.id)) order by expires_at limit 20`;
 for(const s of sessions){await sql()`update cms_news_import_sessions set status='expired' where id=${s.id}`;await sql()`update cms_jobs set status='cancelled' where kind in ('news-analyze','news-import') and payload->>'sessionId'=${s.id} and status in ('pending','processing')`;const parts=await sql()`select * from cms_news_import_parts where session_id=${s.id}`;for(const part of parts){await deleteObject(part.storage_key);await sql()`delete from cms_news_import_parts where session_id=${s.id} and part=${part.part}`;}await cleanNewsAssets(s.id);await sql()`update cms_news_import_rows set data=null where session_id=${s.id}`;await sql()`update cms_news_import_sessions set summary=summary-'entries' where id=${s.id}`;}
 await sql()`delete from cms_news_import_sessions where created_at<now()-interval '90 days' and status='expired'`;
}
export async function newsProvenance(p:Principal,id:string){const [row]=await sql()`select r.team_id,r.draft,i.provenance from cms_news_import_identities i join cms_records r on r.id=i.record_id where r.id=${id} and r.deleted_at is null`;if(!row||row.draft.contentType!=='news')return null;authorize(p,'news','read',{teamId:row.team_id||''});return row.provenance;}

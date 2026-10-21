import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {getAuth} from './auth';
import {getObject,putObject,deleteObject,listObjects} from './storage';
import {CmsError} from './errors';
import {archiveContributionSchema,ARCHIVE_POLICY} from '../club-archive-schema';
import {archiveLock,archiveMediaPath,readArchive,requireArchive} from './club-archive';
import {principal} from './permissions';
const exec=promisify(execFile),hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
export const ARCHIVE_COOKIE='duindorp-archive-owner';
export const archiveCookie=()=>randomBytes(32).toString('hex');
export function archiveOwner(headers:Headers){const token=headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(ARCHIVE_COOKIE+'='))?.slice(ARCHIVE_COOKIE.length+1);return token&&/^[a-f0-9]{64}$/.test(token)?hash(token):null;}
async function rate(tx:any,key:string,max:number){const [r]=await tx`insert into cms_rate_limits(key,count,expires_at) values (${hash('archive:'+key)},1,now()+interval '1 day') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+interval '1 day' else cms_rate_limits.expires_at end returning count`;if(r.count>max)throw new CmsError('rate-limit','Er zijn vandaag veel verzoeken ontvangen. Probeer morgen opnieuw.',429);}
export async function archiveSession(headers:Headers){
 const session=await getAuth().api.getSession({headers});const owner=archiveOwner(headers);const sql=sqlClient();
 const [draft]=owner?await sql`select b.id,b.operation_id,b.draft,(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'name',m.name,'bytes',m.bytes,'operationId',m.operation_id,'src','/api/archive/media/'||m.id,'caption','','credit','','approved',false) order by chosen.seq), '[]') from jsonb_array_elements(b.draft->'manifest') with ordinality chosen(entry,seq) join cms_archive_media m on m.batch_id=b.id and m.operation_id=(chosen.entry->>'id')) as media from cms_archive_batches b where b.owner_hash=${owner} and b.submitted_id is null and b.expires_at>now() order by b.created_at desc limit 1`:[];
 const [receipt]=owner?await sql`select submitted_id from cms_archive_batches where owner_hash=${owner} and submitted_id is not null order by created_at desc limit 1`:[];
 return {profile:session?{name:session.user.name,email:session.user.email}:null,draft:draft||null,lastReceipt:receipt?.submitted_id||null,policy:ARCHIVE_POLICY};
}
export async function archiveBatch(headers:Headers,value:unknown,clientKey:string){
 const q=z.object({operationId:z.string().uuid(),data:archiveContributionSchema,manifest:z.array(z.object({id:z.string().uuid(),name:z.string().max(200)})).max(ARCHIVE_POLICY.maxFiles)}).strict().parse(value),owner=archiveOwner(headers);if(!owner)throw new CmsError('session','Open de inzendroute opnieuw om privé te uploaden.',403);
 const session=await getAuth().api.getSession({headers}),sql=sqlClient();return sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(hashtextextended(${q.operationId},0))`;const [existing]=await tx`select * from cms_archive_batches where operation_id=${q.operationId}`;if(existing){if(existing.owner_hash!==owner)throw new CmsError('missing','Inzendconcept niet beschikbaar.',404);if(new Date(existing.expires_at).getTime()<Date.now())throw new CmsError('expired','Dit inzendconcept is verlopen. Begin een nieuwe inzending.',410);if(!existing.submitted_id)await tx`update cms_archive_batches set draft=${tx.json({data:q.data,manifest:q.manifest})} where id=${existing.id}`;return {id:existing.id,submittedId:existing.submitted_id};}
 await rate(tx,'batch-owner:'+owner,20);await rate(tx,'batch-ip:'+clientKey,50);const id=crypto.randomUUID();await tx`insert into cms_archive_batches(id,owner_hash,user_id,operation_id,draft,expires_at) values (${id},${owner},${session?.user.id||null},${q.operationId},${tx.json({data:q.data,manifest:q.manifest})},now()+interval '7 days')`;return {id,submittedId:null};});
}
export async function prepareArchiveFile(bytes:Uint8Array,declared:string){
 if(!bytes.length||bytes.length>ARCHIVE_POLICY.avBytes)throw new CmsError('file-size','Een foto mag maximaal 10 MiB zijn; video of audio maximaal 50 MiB.',413);
 const image=declared.startsWith('image/');if(image){if(bytes.length>ARCHIVE_POLICY.imageBytes)throw new CmsError('file-size','Een foto mag maximaal 10 MiB zijn.',413);try{const source=sharp(bytes,{limitInputPixels:40000000}),meta=await source.metadata();if(!['jpeg','png','webp','avif','gif','heif'].includes(meta.format||'')||meta.format==='heif'&&declared!=='image/avif')throw Error();const safe=await source.rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();return {safe,mime:'image/webp',kind:'image',ext:'webp',metadata:{width:meta.width,height:meta.height,originalMime:declared,animatedSource:(meta.pages||1)>1}};}catch{throw new CmsError('file-type','Deze foto kan niet veilig worden geopend. Gebruik JPG, PNG, WebP, AVIF of GIF.',422);}}
 const b=Buffer.from(bytes),head=b.subarray(0,80),magic=head.toString('latin1');
 if(!(/^(video|audio)\//.test(declared))||!(/^(OggS|fLaC|ID3|RIFF)/.test(magic)||head.subarray(4,8).toString()==='ftyp'||head.subarray(4,8).toString()==='moov'||head[0]===0x1a&&head[1]===0x45||head[0]===255&&(head[1]&0xe0)===0xe0))throw new CmsError('file-type','De inhoud past niet bij een ondersteund audio- of videobestand.',422);
 const dir=await mkdtemp(join(tmpdir(),'duindorp-archive-'));try{const source=join(dir,'source'),output=join(dir,'safe.mp4');await writeFile(source,bytes,{mode:0o600});const probe=await exec('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',source],{timeout:15000,maxBuffer:1000000});const info=JSON.parse(probe.stdout),video=info.streams?.find((s:any)=>s.codec_type==='video'&&!s.disposition?.attached_pic),audio=info.streams?.find((s:any)=>s.codec_type==='audio');if(!video&&!audio)throw Error();const args=['-v','error','-nostdin','-protocol_whitelist','file,pipe','-threads','1','-i',source,'-map_metadata','-1','-map_chapters','-1','-threads','1'];if(video)args.push('-map','0:v:0','-map','0:a:0?','-vf',"scale=w='min(1280,iw)':h=-2",'-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p');else args.push('-map','0:a:0','-vn');args.push('-c:a','aac','-b:a','128k','-movflags','+faststart','-fs',String(96*1024*1024),'-f','mp4',output);await exec('ffmpeg',args,{timeout:90000,maxBuffer:1000000});const size=(await stat(output)).size;if(!size||size>=95*1024*1024)throw Error();return {safe:await readFile(output),mime:video?'video/mp4':'audio/mp4',kind:video?'video':'audio',ext:'mp4',metadata:{duration:Number(info.format?.duration)||null,originalMime:declared}};
 }catch{throw new CmsError('file-decode','Dit audio- of videobestand kan niet veilig worden verwerkt. Gebruik een afspeelbaar MP4, MOV, WebM, MP3, M4A, WAV, OGG of FLAC-bestand.',422);}finally{await rm(dir,{recursive:true,force:true});}
}
/** Charge before reading the body; the counter survives decode/transaction failures. */
export async function archiveUploadGuard(headers:Headers,batchId:string,operation:string,clientKey:string){
 z.string().uuid().parse(batchId);z.string().uuid().parse(operation);const owner=archiveOwner(headers);if(!owner)throw new CmsError('missing','Upload niet beschikbaar.',404);
 const sql=sqlClient(),[batch]=await sql`select draft from cms_archive_batches where id=${batchId} and owner_hash=${owner} and submitted_id is null and expires_at>now()`;
 if(!batch||!batch.draft.manifest.some((m:any)=>m.id===operation))throw new CmsError('missing','Dit uploadconcept is niet beschikbaar.',404);
 await rate(sql,'upload-owner:'+owner,100);await rate(sql,'upload-ip:'+clientKey,300);
}
export async function archiveUpload(headers:Headers,batchId:string,operation:string,name:string,mime:string,bytes:Uint8Array){
 z.string().uuid().parse(batchId);z.string().uuid().parse(operation);const owner=archiveOwner(headers);if(!owner)throw new CmsError('missing','Upload niet beschikbaar.',404);const checksum=hash(bytes),sql=sqlClient();
 return sql.begin(async tx=>{const [batch]=await tx`select * from cms_archive_batches where id=${batchId} and owner_hash=${owner} and expires_at>now() for update`;if(!batch||batch.submitted_id)throw new CmsError('missing','Dit uploadconcept is niet beschikbaar.',404);
 const [existing]=await tx`select id,checksum,kind from cms_archive_media where operation_id=${operation}`;if(existing){const [own]=await tx`select id from cms_archive_media where id=${existing.id} and batch_id=${batchId}`;if(!own||existing.checksum!==checksum)throw new CmsError('conflict','Deze uploadactie bevat een ander bestand.',409);return {id:existing.id,kind:existing.kind,src:archiveMediaPath(existing.id)};}
 if((await tx`select id from cms_archive_media where batch_id=${batchId} and operation_id in ${tx(batch.draft.manifest.map((m:any)=>m.id))}`).length>=ARCHIVE_POLICY.maxFiles)throw new CmsError('file-count','Maximaal tien bestanden per inzending.',422);
 if(!batch.draft.manifest.some((m:any)=>m.id===operation))throw new CmsError('file-owner','Voeg dit bestand eerst aan het inzendconcept toe.',422);
 const id=crypto.randomUUID(),originalKey=`archive/${id}/original`,safeKey=`archive/${id}/safe.${mime.startsWith('image/')?'webp':'mp4'}`;
 if(!bytes.length||bytes.length>(mime.startsWith('image/')?ARCHIVE_POLICY.imageBytes:ARCHIVE_POLICY.avBytes))throw new CmsError('file-size','Foto maximaal 10 MiB, video/audio maximaal 50 MiB.',413);
 if(!/^(image|video|audio)\//.test(mime))throw new CmsError('file-type','Gebruik een ondersteund beeld- of geluidsbestand.',422);
 await putObject(originalKey,bytes,'application/octet-stream');
 await tx`insert into cms_archive_media(id,batch_id,operation_id,original_key,safe_key,name,kind,mime,bytes,checksum,metadata) values (${id},${batchId},${operation},${originalKey},${safeKey},${name.slice(0,200)},${mime.split('/')[0]==='image'?'image':mime.split('/')[0]==='video'?'video':'audio'},${mime},${bytes.length},${checksum},${tx.json({originalMime:mime})})`;
 await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'archive-media:'+id},'archive-media',${tx.json({id})})`;
 return {id,kind:mime.split('/')[0],src:archiveMediaPath(id)};});
}
export async function submitArchive(headers:Headers,value:unknown){
 const q=z.object({batchId:z.string().uuid(),operationId:z.string().uuid(),consent:z.literal(true),data:archiveContributionSchema}).strict().parse(value),owner=archiveOwner(headers),sql=sqlClient();return sql.begin(async tx=>{
  await archiveLock(tx);const [batch]=await tx`select * from cms_archive_batches where id=${q.batchId} and operation_id=${q.operationId} and owner_hash=${owner||''} and expires_at>now() for update`;if(!batch)throw new CmsError('missing','Inzendconcept niet beschikbaar.',404);if(batch.submitted_id)return {id:batch.submitted_id,status:'pending'};
  const media=await tx`select * from cms_archive_media where batch_id=${batch.id}`,data=q.data;
  for(const m of data.media){const file=media.find(f=>f.id===m.id);if(!file||file.state!=='ready'||!batch.draft.manifest.some((entry:any)=>entry.id===file.operation_id))throw new CmsError('media','Een bestand is nog niet volledig geüpload. Probeer opnieuw.',422);m.src=archiveMediaPath(m.id);m.kind=file.kind as any;m.approved=false;}
  if(data.kind==='moment'){delete data.targetId;delete data.targetType;}if(data.kind==='object'&&data.targetType==='object'){delete data.targetId;delete data.targetType;}
  if(data.targetId){const [target]=await tx`select id from cms_archive_catalog where kind=${data.targetType||'moment'} and id=${data.targetId} and live is not null`;if(!target)throw new CmsError('target','Het gekozen verhaal is niet meer gepubliceerd. Kies een ander doel.',422);}
  const id=crypto.randomUUID(),draft={...data,id,status:'pending',createdAt:new Date().toISOString(),note:''};
  await tx`insert into cms_archive_contributions(id,batch_id,user_id,proposed,draft,consent_version) values (${id},${batch.id},${batch.user_id},${tx.json(data)},${tx.json(draft)},${ARCHIVE_POLICY.consentVersion})`;await tx`update cms_archive_batches set submitted_id=${id} where id=${batch.id}`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${batch.user_id},'archive-received',${id},${q.operationId},${tx.json({consentVersion:ARCHIVE_POLICY.consentVersion,files:data.media.length})})`;return {id,status:'pending'};
 });
}
export async function processArchiveMedia(id:string){
 const sql=sqlClient(),[row]=await sql`select * from cms_archive_media where id=${id}`;if(!row||row.state!=='processing')return;
 try{const prepared=await prepareArchiveFile(await getObject(row.original_key),row.metadata.originalMime);await putObject(row.safe_key,prepared.safe,prepared.mime);await sql`update cms_archive_media set kind=${prepared.kind},mime=${prepared.mime},metadata=${sql.json(prepared.metadata)},state='ready',error=null where id=${id}`;}
 catch(e){if(!(e instanceof CmsError))throw e;await sql`update cms_archive_media set state='failed',error=${e.message} where id=${id}`;}
}
/** Explicit retry of an exhausted transient worker job, never of an invalid decoded file. */
export async function retryArchiveMedia(headers:Headers,id:string){
 const sql=sqlClient(),owner=archiveOwner(headers),[file]=await sql`select m.id,m.state from cms_archive_media m join cms_archive_batches b on b.id=m.batch_id where m.id=${id} and b.owner_hash=${owner||''} and b.submitted_id is null and b.expires_at>now()`;
 if(!owner||!file)throw new CmsError('missing','Upload niet beschikbaar.',404);
 const [failed]=await sql`select id from cms_jobs where kind='archive-media' and payload->>'id'=${id} and status='failed'`;
 if(file.state==='processing'&&failed){await rate(sql,'retry-owner:'+owner,10);await sql`update cms_jobs set status='pending',attempts=0,run_at=now(),lease_owner=null,lease_until=null,last_error=null where id=${failed.id} and status='failed'`;}
 return {status:'accepted'};
}
export async function archiveUploadStatus(headers:Headers,id:string){
 const sql=sqlClient(),[r]=await sql`select m.id,m.kind,m.state,m.error,b.owner_hash from cms_archive_media m join cms_archive_batches b on b.id=m.batch_id where m.id=${id}`;
 const owner=archiveOwner(headers);if(!r||!owner||r.owner_hash!==owner)throw new CmsError('missing','Upload niet beschikbaar.',404);
 return {id:r.id,kind:r.kind,state:r.state,message:r.error||'',src:archiveMediaPath(r.id)};
}
export async function archiveFileResponse(request:Request,id:string){
 const sql=sqlClient(),[file]=await sql`select m.*,b.owner_hash from cms_archive_media m left join cms_archive_batches b on b.id=m.batch_id where m.id=${id}`;if(!file)throw new CmsError('missing','Bestand niet beschikbaar.',404);
 const {state}=await readArchive(sql,false),publicUse=[...state.moments,...state.objects,...state.contributions].some(r=>r.media.some(m=>m.id===id&&m.approved));
 if(!publicUse&&(!archiveOwner(request.headers)||file.owner_hash!==archiveOwner(request.headers))){const p=await principal(request.headers);requireArchive(p,true);}
 if(file.state!=='ready')throw new CmsError('processing',file.error||'Dit bestand wordt nog verwerkt.',503);
 const bytes=Buffer.from(await getObject(file.safe_key)),range=request.headers.get('range'),headers={'Content-Type':file.mime,'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Referrer-Policy':'no-referrer'};
 if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`}});const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):bytes.length-1,bytes.length-1);if(start>end||start>=bytes.length)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`}});return new Response(bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});}
 return new Response(bytes,{headers:{...headers,'Content-Length':String(bytes.length)}});
}
export async function cleanArchiveUploads(){
 const sql=sqlClient();await sql.begin(async tx=>{await archiveLock(tx);const batches=await tx`select id from cms_archive_batches where submitted_id is null and expires_at<now() for update skip locked limit 100`;for(const b of batches){const files=await tx`select id from cms_archive_media where batch_id=${b.id}`;const catalog=await tx`select draft,live from cms_archive_catalog`;if(files.some(f=>catalog.some(c=>JSON.stringify([c.draft,c.live]).includes(f.id))))continue;await tx`delete from cms_archive_media where batch_id=${b.id}`;await tx`delete from cms_archive_batches where id=${b.id}`;}});
 const known=await sql`select original_key,safe_key from cms_archive_media`,kept=new Set(known.flatMap(r=>[r.original_key,r.safe_key]));for(const f of await listObjects('archive/'))if(!kept.has(f.key)&&f.at.getTime()<Date.now()-48*3600000)await deleteObject(f.key);
}

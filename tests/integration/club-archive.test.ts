import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {sqlClient,closeDb} from '../../db';
import {assertLocalSupabaseTests,loginEmail,authCookies} from '../helpers/supabase-auth';
import {getAuth} from '../../lib/server/auth';
import {archiveSession,archiveCookie,ARCHIVE_COOKIE,archiveBatch,archiveUpload,archiveUploadGuard,archiveUploadStatus,retryArchiveMedia,submitArchive,processArchiveMedia,archiveFileResponse,prepareArchiveFile,cleanArchiveUploads} from '../../lib/server/archive-uploads';
import {seedClubArchive,ensureClubArchive,attachArchiveNavigation} from '../../lib/server/archive-seed';
import {GET as readiness} from '../../app/health/ready/route';
import {mutateArchive,readArchive,archiveWorkspace,archiveResolve} from '../../lib/server/club-archive';
import type {Principal} from '../../lib/server/permissions';
assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);

test('archive navigation preserves existing current-version history, private menu edits and repeat-import versions',async()=>{
 const rollback=new Error('Rollback isolated navigation history');
 try{await sql.begin(async tx=>{
  const fixtures=[];
  for(const hasHistory of [true,false]){
   const id='archive-nav-'+crypto.randomUUID(),draft={items:[{id:'club',label:'Mijn club',href:'/clubmuur/club',enabled:true,children:[{id:'private',label:'Nog niet gepubliceerd',href:'/clubmuur/club/contact',enabled:false}]}]},live={items:[{id:'club',label:'Onze club',href:'/clubmuur/club',enabled:true,children:[{id:'public',label:'Mijn bestaande link',href:'/clubmuur/club/contact',enabled:true}]}]};
   await tx`insert into cms_records(id,module,draft,live,version) values (${id},'navigation',${tx.json(draft)},${tx.json(live)},7)`;
   const revisionId=crypto.randomUUID();if(hasHistory)await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${revisionId},${id},7,${tx.json(draft)},'Bestaande redactierevisie')`;
   fixtures.push({id,draft,live,hasHistory,revisionId});
  }
  await attachArchiveNavigation(tx);
  const [lock]=await tx`select exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and objid=736402 and granted) as held`;assert.equal(lock.held,true,'the import serializes with ordinary CMS edits');
  for(const f of fixtures){
   const [row]=await tx`select * from cms_records where id=${f.id}`,history=await tx`select * from cms_revisions where record_id=${f.id} order by version`;
   assert.equal(row.version,8);assert.deepEqual(row.draft.items[0].children[0],f.draft.items[0].children[0]);assert.deepEqual(row.live.items[0].children[0],f.live.items[0].children[0]);assert.equal(row.draft.items[0].label,'Mijn club');assert.equal(row.live.items[0].label,'Onze club');
   for(const value of [row.draft,row.live])for(const suffix of ['tijdlijn','museum'])assert.equal(value.items[0].children.filter((item:any)=>item.href==='/clubmuur/club/'+suffix).length,1);
   assert.deepEqual(history.map(r=>r.version),[7,8]);assert.deepEqual(history[0].snapshot,f.draft);if(f.hasHistory){assert.equal(history[0].id,f.revisionId);assert.equal(history[0].label,'Bestaande redactierevisie');}assert.deepEqual(history[1].snapshot,row.draft);
   const [publication]=await tx`select record_version,snapshot from cms_publications where id=${row.live_id}`;assert.equal(publication.record_version,8);assert.deepEqual(publication.snapshot,row.live);
  }
  await attachArchiveNavigation(tx);
  for(const f of fixtures){assert.equal((await tx`select version from cms_records where id=${f.id}`)[0].version,8);assert.equal((await tx`select id from cms_revisions where record_id=${f.id}`).length,2);assert.equal((await tx`select id from cms_publications where record_id=${f.id}`).length,1);}
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
});

test('existing CMS upgrade installs archive before readiness without rerunning the first-install seed',async()=>{
 const [before]=await sql`select draft,live,version from cms_records where id='settings'`;assert.ok(before);
 await sql`delete from cms_archive_relations`;await sql`delete from cms_archive_catalog where seed_hash is not null`;await sql`delete from cms_archive_media where id like 'seed-%'`;
 await sql`insert into cms_heartbeats(id,at) values ('worker',now()) on conflict(id) do update set at=excluded.at`;
 assert.equal((await readiness()).status,503,'a healthy old worker cannot make an empty archive release ready');
 assert.equal(await ensureClubArchive(),true);
 const state=(await readArchive()).state;assert.equal(state.moments.length,16);assert.equal(state.objects.length,9);assert.equal((await sql`select id from cms_archive_media where id like 'seed-%'`).length,12);assert.equal((await readiness()).status,200);
 const [settings]=await sql`select * from cms_archive_catalog where kind='settings' and id='settings'`;
 await sql`update cms_archive_catalog set draft=${sql.json({...settings.draft,widgetEnabled:false})},live=${sql.json({...settings.live,widgetEnabled:false})},version=version+1 where kind='settings' and id='settings'`;
 assert.equal(await ensureClubArchive(),false);assert.equal((await readArchive()).state.widgetEnabled,false,'restarts preserve editorial settings');
 await sql`update cms_archive_catalog set draft=${sql.json(settings.draft)},live=${sql.json(settings.live)},version=version+1 where kind='settings' and id='settings'`;
 const [after]=await sql`select draft,live,version from cms_records where id='settings'`;assert.deepEqual(after,before);
});

test('connected archive: real private uploads, atomic moderation, shared catalog, stable withdrawal and idempotent seed',async()=>{
 const tag=crypto.randomUUID().slice(0,8),actorId='archive-owner-'+tag;
 await sql`insert into auth_user(id,name,email) values (${actorId},'Archiefredacteur',${actorId+'@example.invalid'})`;
 const actor:Principal={id:actorId,name:'Archiefredacteur',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],mfa:false,grants:[{module:'*',action:'*'}]};
 const guest=new Headers({cookie:ARCHIVE_COOKIE+'='+archiveCookie()}),stranger=new Headers({cookie:ARCHIVE_COOKIE+'='+archiveCookie()}),operationId=crypto.randomUUID();
 const data:any={kind:'moment',title:'Onbekende herinnering '+tag,description:'Ontvangen tekst die de bron niet vervangt.',date:{year:1999,precision:'season'},category:'Clubleven',media:[],anonymous:true,name:'',email:'private-'+tag+'@example.org',source:'Privéarchief testbron',people:'Historische persoon'};
 const command=(action:string,rest:any={},who=actor)=>mutateArchive(who,{operationId:crypto.randomUUID(),action,expectedVersion:0,...rest});
 const row=async(id:string)=>(await sql`select * from cms_archive_contributions where id=${id}`)[0];
 const review=async(id:string,action:string,extra:any={})=>{const r=await row(id);return command(action,{id,expectedVersion:r.version,data:r.draft,...extra});};
 await seedClubArchive();const initial=await readArchive();assert.equal(initial.state.moments.filter(m=>initial.catalog.some((r:any)=>r.id===m.id&&r.seed_hash)).length,16);assert.equal(initial.state.objects.length,9);
 const seedMoment=initial.state.moments[0],seedCatalog=initial.catalog.find((r:any)=>r.id===seedMoment.id)!;
 const seedOriginal=structuredClone(seedCatalog.draft),edited={...seedOriginal,title:seedOriginal.title+' · broncontrole'};
 await command('publish',{kind:'moment',data:edited,expectedVersion:seedCatalog.version,reason:'Controle idempotente import'});
 const assetsBefore=(await sql`select id from cms_archive_media`).length;await seedClubArchive();assert.equal((await archiveResolve('moment',edited.slug)).title,edited.title);assert.equal((await sql`select id from cms_archive_media`).length,assetsBefore);
 const [seedNow]=await sql`select version from cms_archive_catalog where kind='moment' and id=${seedMoment.id}`;await command('publish',{kind:'moment',data:seedOriginal,expectedVersion:seedNow.version,reason:'Broncontrole afgerond'});
 await assert.rejects(()=>archiveWorkspace({...actor,teamScoped:true}),(e:any)=>e.status===403);await assert.rejects(()=>archiveWorkspace({...actor,grants:[{module:'pages',action:'read'}]}),(e:any)=>e.status===403);
 await assert.rejects(()=>command('settings',{data:{widgetEnabled:true,featuredMomentId:'',featuredObjectId:''}}, {...actor,grants:[]}),(e:any)=>e.status===403);
 const fileOps=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
 const batch=await archiveBatch(guest,{operationId,data,manifest:fileOps.map((id,i)=>({id,name:'foto-'+i+'.png'}))},tag);assert.equal((await archiveBatch(guest,{operationId,data,manifest:fileOps.map(id=>({id,name:'foto.png'}))},tag)).id,batch.id);
 await assert.rejects(()=>archiveBatch(stranger,{operationId,data,manifest:[]},tag),(e:any)=>e.status===404);
 const png=await sharp({create:{width:60,height:40,channels:3,background:'#03438a'}}).png().toBuffer(),files:any[]=[];
 for(const operation of fileOps){await archiveUploadGuard(guest,batch.id,operation,tag);const file=await archiveUpload(guest,batch.id,operation,'historisch.png','image/png',png);assert.equal((await archiveUpload(guest,batch.id,operation,'historisch.png','image/png',png)).id,file.id);assert.equal((await archiveUploadStatus(guest,file.id)).state,'processing');if(!files.length){await sql`update cms_jobs set status='failed',attempts=5 where kind='archive-media' and payload->>'id'=${file.id}`;await assert.rejects(()=>retryArchiveMedia(stranger,file.id),(e:any)=>e.status===404);await retryArchiveMedia(guest,file.id);await retryArchiveMedia(guest,file.id);const jobs=await sql`select status,attempts from cms_jobs where kind='archive-media' and payload->>'id'=${file.id}`;assert.equal(jobs.length,1);assert.equal(jobs[0].status,'pending');assert.equal(jobs[0].attempts,0);}await processArchiveMedia(file.id);assert.equal((await archiveUploadStatus(guest,file.id)).state,'ready');files.push({...file,name:'historisch.png',caption:'Testbeeld '+files.length,credit:'Synthetische fixture',approved:false});}
 await archiveBatch(guest,{operationId,data:{...data,media:[files[1],files[0]]},manifest:[{id:fileOps[1],name:'tweede.png'},{id:fileOps[0],name:'eerste.png'}]},tag);const recovered=await archiveSession(guest);assert.deepEqual(recovered.draft.media.map((m:any)=>m.id),[files[1].id,files[0].id],'recovery preserves current order and does not restore a removed file');await archiveBatch(guest,{operationId,data,manifest:fileOps.map(id=>({id,name:'foto.png'}))},tag);
 await assert.rejects(()=>archiveUploadStatus(stranger,files[0].id),(e:any)=>e.status===404);
 await assert.rejects(()=>archiveFileResponse(new Request('http://local/api/archive/media/'+files[0].id,{headers:stranger}),files[0].id),(e:any)=>[401,403].includes(e.status));
 const privateFile=await archiveFileResponse(new Request('http://local/',{headers:guest}),files[0].id);assert.equal(privateFile.status,200);assert.equal(privateFile.headers.get('content-type'),'image/webp');assert.equal((await sharp(Buffer.from(await privateFile.arrayBuffer())).metadata()).exif,undefined);
 await assert.rejects(()=>submitArchive(guest,{batchId:batch.id,operationId,consent:false,data:{...data,media:files}}));
 const received=await submitArchive(guest,{batchId:batch.id,operationId,consent:true,data:{...data,media:files}});assert.deepEqual(await submitArchive(guest,{batchId:batch.id,operationId,consent:true,data:{...data,media:files}}),received);let r=await row(received.id);assert.equal(r.consent_version,'clubarchief-publicatie-v1');assert.ok(r.consent_at);assert.equal(r.user_id,null);
 assert.ok(!(await readArchive()).state.moments.some(m=>m.title===data.title));assert.equal((await archiveSession(guest)).lastReceipt,received.id);
 const accepted={...r.draft,media:r.draft.media.map((m:any,i:number)=>({...m,approved:i<2}))};
 const approval={operationId:crypto.randomUUID(),action:'approve',id:r.id,expectedVersion:r.version,data:accepted,reason:'Twee gecontroleerde beelden'};const approved=await mutateArchive(actor,approval);assert.deepEqual(await mutateArchive(actor,approval),approved);
 const after=(await readArchive()).state,moment=after.moments.find(m=>m.title===data.title)!;assert.equal(moment.media.length,2);assert.equal(moment.date.endYear,2000);
 const publicText=JSON.stringify(after);for(const secret of [data.email,'Twee gecontroleerde beelden','original_key','owner_hash','user_id'])assert.ok(!publicText.includes(secret));
 assert.equal((await archiveFileResponse(new Request('http://local/'),files[0].id)).status,200);await assert.rejects(()=>archiveFileResponse(new Request('http://local/'),files[2].id),(e:any)=>[401,403].includes(e.status));
 await assert.rejects(()=>mutateArchive(actor,{...approval,operationId:crypto.randomUUID()}),(e:any)=>e.status===409);
 await review(r.id,'retract');assert.ok(!(await readArchive()).state.moments.some(m=>m.id===moment.id));assert.equal(await archiveResolve('moment',moment.slug),null);await assert.rejects(()=>archiveFileResponse(new Request('http://local/'),files[0].id),(e:any)=>[401,403].includes(e.status));
 await review(r.id,'approve');assert.equal((await archiveResolve('moment',moment.slug)).id,moment.id);assert.equal((await sql`select id from cms_archive_catalog where kind='moment' and id=${moment.id}`).length,1);
 // New text-only correction, received anonymously in a separate batch.
 const send=async(value:any)=>{const op=crypto.randomUUID(),b=await archiveBatch(guest,{operationId:op,data:value,manifest:[]},tag);return submitArchive(guest,{batchId:b.id,operationId:op,consent:true,data:value});};
 const correction=await send({...data,title:'Correctie '+tag,kind:'correction',targetId:moment.id,targetType:'moment',date:{year:1978,approximate:true}});
 await review(correction.id,'approve');const annotated=(await readArchive()).state;assert.equal(annotated.moments.find(m=>m.id===moment.id)!.story[0],data.description);assert.ok(annotated.contributions.some(c=>c.id===correction.id&&c.kind==='correction'));
 const unlinked=await send({...data,title:'Verkeerd doel '+tag,kind:'addition',targetId:moment.id,targetType:'moment'});await review(r.id,'retract');await assert.rejects(()=>review(unlinked.id,'approve'));assert.equal((await row(unlinked.id)).status,'pending');await review(r.id,'approve');
 await review(correction.id,'retract');const protectedCorrection=await row(correction.id);await assert.rejects(()=>review(correction.id,'approve',{data:{...protectedCorrection.draft,kind:'object'}}),(e:any)=>e.status===422);await review(correction.id,'approve');
 const [beforeObjectLink]=await sql`select * from cms_archive_catalog where kind='moment' and id=${moment.id}`;const objectReceipt=await send({...data,title:'Aangeboden digitaal object '+tag,kind:'object',targetType:'moment',targetId:moment.id,offer:'loan'});await review(objectReceipt.id,'approve');const object=(await readArchive()).state.objects.find(o=>o.title==='Aangeboden digitaal object '+tag)!;assert.ok(object.momentIds.includes(moment.id));const [mirrored]=await sql`select * from cms_archive_catalog where kind='moment' and id=${moment.id}`;assert.ok(mirrored.draft.objectIds.includes(object.id));assert.ok(mirrored.live.objectIds.includes(object.id));await assert.rejects(()=>command('save',{kind:'moment',data:beforeObjectLink.draft,expectedVersion:beforeObjectLink.version}),(e:any)=>e.status===409);
 await review(objectReceipt.id,'retract');r=await row(objectReceipt.id);await review(r.id,'approve',{data:{...r.draft,targetId:seedMoment.id,targetType:'moment'}});const moved=(await readArchive()).state;assert.ok(!moved.moments.find(m=>m.id===moment.id)!.objectIds.includes(object.id));assert.ok(moved.moments.find(m=>m.id===seedMoment.id)!.objectIds.includes(object.id));assert.deepEqual(moved.objects.find(o=>o.id===object.id)!.momentIds,[seedMoment.id]);const [mirroredTarget]=await sql`select * from cms_archive_catalog where kind='moment' and id=${seedMoment.id}`;assert.ok(mirroredTarget.draft.objectIds.includes(object.id));await command('publish',{kind:'moment',data:mirroredTarget.draft,expectedVersion:mirroredTarget.version,reason:'Ongewijzigde redactie behoudt de nieuwe koppeling'});assert.ok((await readArchive()).state.objects.find(o=>o.id===object.id)!.momentIds.includes(seedMoment.id));
 const rejection=await send({...data,title:'Te beoordelen '+tag,date:{unknown:true}});await assert.rejects(()=>review(rejection.id,'moderate',{status:'rejected',reason:''}),(e:any)=>e.status===422);await review(rejection.id,'moderate',{status:'info',reason:'Contact ontbreekt; intern opvolgen'});assert.equal((await row(rejection.id)).status,'info');await review(rejection.id,'moderate',{status:'rejected',reason:'Onvoldoende brongegevens'});assert.equal((await row(rejection.id)).status,'rejected');
 // Canonical links, draft/live isolation, old-address redirects and source revisions.
 let [catalog]=await sql`select * from cms_archive_catalog where kind='moment' and id=${moment.id}`;const renamed={...catalog.draft,slug:'ander-adres-'+tag,title:'Nieuwe titel '+tag};await command('save',{kind:'moment',data:renamed,expectedVersion:catalog.version});assert.equal((await archiveResolve('moment',moment.slug)).title,moment.title);[catalog]=await sql`select * from cms_archive_catalog where kind='moment' and id=${moment.id}`;
 await command('publish',{kind:'moment',data:renamed,expectedVersion:catalog.version,reason:'Gecontroleerde adreswijziging'});assert.equal((await archiveResolve('moment',moment.slug)).slug,renamed.slug);
 const [revision]=await sql`select id from cms_archive_revisions where kind='moment' and record_id=${moment.id} order by version limit 1`;[catalog]=await sql`select * from cms_archive_catalog where kind='moment' and id=${moment.id}`;await command('restore',{kind:'moment',id:moment.id,revisionId:revision.id,expectedVersion:catalog.version,reason:'Vorige bron als concept herstellen'});assert.equal((await archiveResolve('moment',renamed.slug)).title,renamed.title);
 const [settings]=await sql`select version from cms_archive_catalog where kind='settings'`;await command('settings',{data:{widgetEnabled:false,featuredMomentId:moment.id,featuredObjectId:object.id},expectedVersion:settings.version});assert.equal((await readArchive()).state.widgetEnabled,false);await review(objectReceipt.id,'retract');const noLongerFeatured=(await readArchive()).state;assert.equal(noLongerFeatured.featuredObjectId,'');const [settingsAfterWithdrawal]=await sql`select version from cms_archive_catalog where kind='settings'`;await command('settings',{data:{widgetEnabled:false,featuredMomentId:noLongerFeatured.featuredMomentId,featuredObjectId:''},expectedVersion:settingsAfterWithdrawal.version});await review(objectReceipt.id,'approve');const [latest]=await sql`select version from cms_archive_catalog where kind='settings'`;await command('settings',{data:{widgetEnabled:true,featuredMomentId:initial.state.featuredMomentId,featuredObjectId:initial.state.featuredObjectId},expectedVersion:latest.version});

 // Collections and real existing-register IDs remain shared, with withdrawn references suppressed.
 const collectionId='archive-collection-'+tag,personId='archive-person-'+tag,articleId='archive-article-'+tag,teamId=String(90000000+Math.floor(Math.random()*1000000))+':-1';
 await command('publish',{kind:'collection',data:{id:collectionId,title:'Historische selectie '+tag,description:'Gecontroleerde collectie',cover:'',published:true},expectedVersion:0});
 let [objectRow]=await sql`select * from cms_archive_catalog where kind='object' and id=${object.id}`;await command('publish',{kind:'object',data:{...objectRow.draft,collectionIds:[collectionId]},expectedVersion:objectRow.version,reason:'Gecontroleerde collectieverbinding'});assert.equal((await readArchive()).state.objects.find(o=>o.id===object.id)!.collection,'Historische selectie '+tag);
 await sql`insert into cms_records(id,module,title,draft,live,status) values (${personId},'people','Gekoppeld persoon',${sql.json({name:'Gekoppeld persoon '+tag})},${sql.json({name:'Gekoppeld persoon '+tag})},'published'),(${articleId},'articles','Gekoppeld verhaal',${sql.json({title:'Gekoppeld verhaal',slug:'gekoppeld-verhaal-'+tag,contentType:'story'})},${sql.json({title:'Gekoppeld verhaal',slug:'gekoppeld-verhaal-'+tag,contentType:'story'})},'published')`;await sql`insert into cms_teams(id,name) values (${teamId},'Historisch team')`;
 [catalog]=await sql`select * from cms_archive_catalog where kind='moment' and id=${moment.id}`;await command('publish',{kind:'moment',data:{...catalog.draft,personIds:[personId],teamIds:[teamId],articleIds:[articleId]},expectedVersion:catalog.version,reason:'Gekoppeld aan bestaande registers'});const linked=(await readArchive()).state.moments.find(m=>m.id===moment.id)!;assert.equal(linked.links!.length,3);assert.ok(linked.people.includes('Gekoppeld persoon '+tag));assert.ok(linked.links!.some(l=>l.href.endsWith('/verhalen/gekoppeld-verhaal-'+tag)));
 await sql`update cms_records set live=null where id in ${sql([personId,articleId])}`;assert.equal((await readArchive()).state.moments.find(m=>m.id===moment.id)!.links!.length,1);
 await sql`delete from cms_records where id in ${sql([personId,articleId])}`;await sql`delete from cms_teams where id=${teamId}`;
 // Cleanup expires only abandoned uploads; received contributions remain.
 await sql`update cms_archive_batches set expires_at=now()-interval '1 day' where id=${batch.id}`;await cleanArchiveUploads();assert.ok(await row(received.id));assert.ok((await archiveWorkspace(actor)).originals.some((o:any)=>o.id===received.id&&o.proposed.email===data.email));
 // Keep unrelated suites on the original seed, with no synthetic public archive records.
 const [objectToUnlink]=await sql`select * from cms_archive_catalog where kind='object' and id=${object.id}`;await command('publish',{kind:'object',data:{...objectToUnlink.draft,momentIds:[]},expectedVersion:objectToUnlink.version,reason:'Synthetische koppeling opruimen'});const ownIds=[received.id,correction.id,unlinked.id,objectReceipt.id,rejection.id];await sql`delete from cms_archive_contributions where id in ${sql(ownIds)}`;await sql`delete from cms_archive_relations where moment_id=${moment.id} or object_id=${object.id}`;await sql`delete from cms_archive_catalog where id in ${sql([moment.id,object.id,collectionId])}`;
});

test('archive decoder validates actual formats, rejects corruption and converts real audio/video',async()=>{
 const input=sharp({create:{width:64,height:48,channels:3,background:'#03438a'}});
 for(const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp'],['avif','image/avif'],['gif','image/gif']] as const){const bytes=await input.clone().toFormat(format).toBuffer(),safe=await prepareArchiveFile(bytes,mime);assert.equal(safe.mime,'image/webp');assert.equal((await sharp(safe.safe).metadata()).format,'webp');}
 for(const bytes of [Buffer.alloc(0),Buffer.from('<script>not an image</script>'),Buffer.from('RIFF0000WEBP')])await assert.rejects(()=>prepareArchiveFile(bytes,'image/png'));
 await assert.rejects(()=>prepareArchiveFile(Buffer.alloc(10485761),'image/png'),(e:any)=>e.status===413);await assert.rejects(()=>prepareArchiveFile(Buffer.alloc(52428801),'video/mp4'),(e:any)=>e.status===413);
 const dir=await mkdtemp(join(tmpdir(),'archive-codec-'));try{
  for(const [ext,args,mime,kind] of [['wav',['-f','lavfi','-i','sine=frequency=440:duration=0.3'],'audio/wav','audio'],['mp4',['-f','lavfi','-i','color=c=blue:s=64x48:d=0.3','-c:v','libx264','-pix_fmt','yuv420p'],'video/mp4','video']] as const){const path=join(dir,'source.'+ext);execFileSync('ffmpeg',['-v','error','-nostdin',...args,'-y',path],{timeout:20000});const result=await prepareArchiveFile(await readFile(path),mime);assert.equal(result.kind,kind);assert.equal(result.mime,kind+'/mp4');assert.ok(result.safe.length>100);}
  await assert.rejects(()=>prepareArchiveFile(Buffer.from('ID3totally corrupt audio'),'audio/mpeg'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {sqlClient,closeDb} from '../../db/index';
import {getAuth} from '../../lib/server/auth';
import {mutate,loadState} from '../../lib/server/records';
import {receiveForm} from '../../lib/server/forms';
import {emptyLayout,row,column,rich} from '../../lib/cms/layout/document';
import {runOnce} from '../../lib/server/worker';
import {uploadMedia,mediaResponse} from '../../lib/server/media';
import {changeAccount} from '../../lib/server/accounts';
import type {Principal} from '../../lib/server/permissions';
import sharp from 'sharp';
if(process.env.APP_ENV!=='test'||!process.env.DATABASE_URL?.endsWith('/duindorp_test'))throw new Error('Integratietests vereisen de geïsoleerde duindorp_test database.');
const sql=sqlClient(),actor=await getAuth().api.createUser({body:{email:`integration-${crypto.randomUUID()}@example.invalid`,name:'Integratietest',password:crypto.randomUUID()+crypto.randomUUID(),role:'admin'}});
await sql`insert into cms_memberships(user_id,role_id) values (${actor.user.id},'admin')`;
const admin:Principal={id:actor.user.id,name:'Test',email:actor.user.email,roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:true};
const page=(id:string)=>({id,title:'Testpagina',slug:`club/${id}`,intro:'',bodyFormat:'page-layout-v2',body:{type:'doc',content:[row('full',[column([rich([{type:'paragraph',content:[{type:'text',text:'Live inhoud'}]}])])])]},parentId:'',menuGroup:'club',menuVisible:false,order:0,seo:{title:'',description:'',noIndex:false},useBuilder:true,status:'draft'});
test('DATA02 and PUB01/02: concurrent writes conflict, draft preserves live, slug publishes with redirect',async()=>{const id=`test-${crypto.randomUUID()}`,data=page(id);await mutate(admin,[{module:'pages',id,expectedVersion:0,action:'publish',data}],crypto.randomUUID(),crypto.randomUUID());const next={...data,title:'Concepttitel'};await mutate(admin,[{module:'pages',id,expectedVersion:1,action:'save',data:next}],crypto.randomUUID(),crypto.randomUUID());await assert.rejects(mutate(admin,[{module:'pages',id,expectedVersion:1,action:'save',data}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.status===409);const [record]=await sql`select live,draft from cms_records where id=${id}`;assert.equal(record.live.title,'Testpagina');assert.equal(record.draft.title,'Concepttitel');next.slug+= '-verplaatst';await mutate(admin,[{module:'pages',id,expectedVersion:2,action:'publish',data:next}],crypto.randomUUID(),crypto.randomUUID());const [alias]=await sql`select to_path from cms_redirects where from_path=${`/clubmuur/${data.slug}`}`;assert.equal(alias.to_path,`/clubmuur/${next.slug}`);const snapshots=await sql`select snapshot from cms_publications where record_id=${id}`;assert.equal(snapshots.length,2);});
test('AUTH02 and PB08: direct publication without rights and malformed layouts cannot mutate live',async()=>{const id=`guard-${crypto.randomUUID()}`,data=page(id);const editor={...admin,roleId:'editor',grants:[{module:'pages',action:'update'}]};await assert.rejects(mutate(editor,[{module:'pages',id,expectedVersion:0,action:'publish',data}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.status===403);const bad=structuredClone(data);bad.body.content[0].content!.push(column(),column());await assert.rejects(mutate(admin,[{module:'pages',id,expectedVersion:0,action:'save',data:bad}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.status===422);assert.equal((await sql`select id from cms_records where id=${id}`).length,0);});
test('FORM01/02/03: submissions freeze definition, deduplicate, queue reliably and keep streams separate',async()=>{const operationId=crypto.randomUUID(),input={operationId,answers:{name:'Testafzender',email:'test@example.invalid',message:'Integratietestbericht'}};const a=await receiveForm('contact',input,'integration-'+crypto.randomUUID());const b=await receiveForm('contact',input,'integration-'+crypto.randomUUID());assert.equal(a.id,b.id);const [s]=await sql`select * from cms_submissions where id=${a.id}`;assert.equal(s.kind,'contact');assert.equal(s.snapshot.formName,'Contact met de club');assert.equal(s.snapshot.definition.departmentName,'Secretariaat');const [{draft}]=await sql`select draft from cms_records where id='contact'`;const version=[...(await sql`select version from cms_records where id='contact'`)][0].version;await mutate(admin,[{module:'forms',id:'contact',expectedVersion:version,action:'save',data:{...draft,name:'Nieuwe formuliernaam'}}],crypto.randomUUID(),crypto.randomUUID());const [saved]=await sql`select snapshot from cms_submissions where id=${a.id}`;assert.equal(saved.snapshot.formName,'Contact met de club');const jobs=await sql`select id from cms_jobs where operation_id=${`notify:${operationId}`}`;assert.equal(jobs.length,1);await assert.rejects(receiveForm('contact',{...input,operationId:crypto.randomUUID(),kind:'registration'},'test'),(e:any)=>e.status===422);});
test('PUB03/04: worker publishes frozen planned revision while preserving later draft edits',async()=>{const id=`schedule-${crypto.randomUUID()}`,data=page(id);await mutate(admin,[{module:'pages',id,expectedVersion:0,action:'schedule',data,scheduledAt:new Date(Date.now()+100000).toISOString()}],crypto.randomUUID(),crypto.randomUUID());await mutate(admin,[{module:'pages',id,expectedVersion:1,action:'save',data:{...data,title:'Latere werkversie'}}],crypto.randomUUID(),crypto.randomUUID());await sql`update cms_jobs set run_at=now()-interval '1 second' where payload->>'id'=${id}`;for(let i=0;i<50;i++){await runOnce();const [r]=await sql`select live,draft from cms_records where id=${id}`;if(r.live){assert.equal(r.live.title,'Testpagina');assert.equal(r.draft.title,'Latere werkversie');return;}}assert.fail('Ingeplande publicatie niet uitgevoerd.');});
test('MEDIA01/04: true image decoding, private original, derivatives and durable upload',async()=>{await assert.rejects(uploadMedia(admin,new File(['<script>alert(1)</script>'],'fake.png',{type:'image/png'}),{teamId:'',season:'test',folderId:''}),(e:any)=>e.status===422);const bytes=await sharp({create:{width:100,height:80,channels:3,background:'#1474c4'}}).png().toBuffer();const record=await uploadMedia(admin,new File([bytes],'test.png',{type:'image/png'}),{teamId:'',season:'test',folderId:''});await assert.rejects(mediaResponse(record.id),(e:any)=>e.status===404);for(let i=0;i<50;i++){await runOnce();const [object]=await sql`select state from cms_media_objects where id=${record.id}`;if(object.state==='ready')break;}assert.equal((await mediaResponse(record.id,admin,true)).headers.get('Content-Disposition'),'attachment; filename="origineel"');await mutate(admin,[{module:'media',id:record.id,expectedVersion:1,action:'publish',data:{...record,alt:'Synthetisch blauw testvlak'}}],crypto.randomUUID(),crypto.randomUUID());assert.equal((await mediaResponse(record.id)).headers.get('Content-Type'),'image/webp');});
after(async()=>{await closeDb();});
test('AUTH04: blocking invalidates sessions and the last full administrator stays protected',async()=>{const all=await sql`select user_id,active from cms_memberships where role_id='admin'`;try{await sql`update cms_memberships set active=false where role_id='admin' and user_id!=${admin.id}`;await assert.rejects(changeAccount(admin,admin.id,{expectedVersion:1,active:false,roleId:'admin',teamIds:[],departments:[]}),(e:any)=>e.code==='last-admin');}finally{for(const row of all)await sql`update cms_memberships set active=${row.active} where user_id=${row.user_id}`;}
 const password=crypto.randomUUID()+crypto.randomUUID(),u=await getAuth().api.createUser({body:{email:`block-${crypto.randomUUID()}@example.invalid`,name:'Testredacteur',password}});await sql`insert into cms_memberships(user_id,role_id) values (${u.user.id},'editor')`;await getAuth().api.signInEmail({body:{email:u.user.email,password}});assert.ok((await sql`select id from auth_session where user_id=${u.user.id}`).length);await changeAccount(admin,u.user.id,{expectedVersion:1,active:false,roleId:'editor',teamIds:[],departments:[]});assert.equal((await sql`select id from auth_session where user_id=${u.user.id}`).length,0);
});
test('PUB02: parent path changes update child routes atomically and reject hierarchy cycles',async()=>{
 const parent=page('parent-'+crypto.randomUUID()),child={...page('child-'+crypto.randomUUID()),parentId:parent.id};child.slug=parent.slug+'/kind';
 await mutate(admin,[{module:'pages',id:parent.id,expectedVersion:0,action:'publish',data:parent},{module:'pages',id:child.id,expectedVersion:0,action:'publish',data:child}],crypto.randomUUID(),crypto.randomUUID());
 const moved={...parent,slug:parent.slug+'-nieuw'};
 await mutate(admin,[{module:'pages',id:parent.id,expectedVersion:1,action:'publish',data:moved}],crypto.randomUUID(),crypto.randomUUID());
 const [record]=await sql`select draft,live,parent_id from cms_records where id=${child.id}`;assert.equal(record.live.slug,moved.slug+'/kind');assert.equal(record.draft.slug,record.live.slug);assert.equal(record.parent_id,parent.id);
 const [redirect]=await sql`select to_path from cms_redirects where from_path=${'/clubmuur/'+child.slug}`;assert.equal(redirect.to_path,'/clubmuur/'+record.live.slug);
 await assert.rejects(mutate(admin,[{module:'pages',id:parent.id,expectedVersion:2,action:'save',data:{...moved,parentId:child.id}}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.code==='parent-cycle');
});
test('PUB04: invalid planned publication is refused before any job or draft is committed',async()=>{
 const invalid={...page('bad-plan-'+crypto.randomUUID()),title:''};
 await assert.rejects(mutate(admin,[{module:'pages',id:invalid.id,expectedVersion:0,action:'schedule',data:invalid,scheduledAt:new Date(Date.now()+60000).toISOString()}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.code==='publication-invalid');
 assert.equal((await sql`select id from cms_records where id=${invalid.id}`).length,0);
});
test('DATA03: imports require explicit versions, replay is idempotent, rollback preserves earlier live',async()=>{
 const {applyImport,rollbackImport,inspectImport}=await import('../../lib/server/imports');
 const {createCmsSeed}=await import('../../lib/cms/seed');const original=page('import-'+crypto.randomUUID());
 await mutate(admin,[{module:'pages',id:original.id,expectedVersion:0,action:'publish',data:original}],crypto.randomUUID(),crypto.randomUUID());
 const state=createCmsSeed();for(const module of ['articles','pages','people','media','folders','albums','forms','documents','departments','submissions'] as const)state[module]=[] as never;
 state.pages=[{...original,title:'Geïmporteerde titel',status:'published',updatedAt:new Date().toISOString(),live:{...original,title:'Geïmporteerde titel'},revisions:[]} as any];
 const backup={format:'duindorp-cms-backup-v1',state,blobs:[]};assert.ok((await inspectImport(admin,backup)).report.conflicts.some(c=>c.id===original.id));
 const skipped=await applyImport(admin,backup);assert.ok(skipped.skipped.includes(original.id));
 const explicit={...backup,exportedAt:new Date().toISOString()};const applied=await applyImport(admin,explicit,{[original.id]:1});assert.ok(applied.imported.includes(original.id));assert.equal((await applyImport(admin,explicit)).batch,applied.batch);
 assert.equal((await sql`select live from cms_records where id=${original.id}`)[0].live.title,'Geïmporteerde titel');
 await rollbackImport(admin,applied.batch);assert.equal((await sql`select live from cms_records where id=${original.id}`)[0].live.title,original.title);
});
test('NEWS01/02: news changes to story only on publication; homepage selection moves with the URL',async()=>{
 const {createCmsSeed}=await import('../../lib/cms/seed'),source=createCmsSeed().articles.find(a=>a.live&&a.contentType==='news')!;
 const id='news-story-'+crypto.randomUUID(),data={...source,id,slug:id,featured:true,title:'Synthetische redactieproef',status:'draft',revisions:[]};delete data.live;
 await mutate(admin,[{module:'articles',id,expectedVersion:0,action:'publish',data}],crypto.randomUUID(),crypto.randomUUID());
 const story={...data,contentType:'story',storyFormat:'column'};
 await mutate(admin,[{module:'articles',id,expectedVersion:1,action:'save',data:story}],crypto.randomUUID(),crypto.randomUUID());
 assert.equal((await sql`select live from cms_records where id=${id}`)[0].live.contentType,'news');
 await mutate(admin,[{module:'articles',id,expectedVersion:2,action:'publish',data:story}],crypto.randomUUID(),crypto.randomUUID());
 const [home]=await sql`select live from cms_records where id='settings'`;assert.ok(home.live.homepageStoryIds.includes(id));assert.ok(!home.live.homepageArticleIds.includes(id));
 const [redirect]=await sql`select to_path from cms_redirects where from_path=${'/clubmuur/nieuws/'+id}`;assert.equal(redirect.to_path,'/clubmuur/verhalen/'+id);
});
test('FORM03/06: simultaneous requests commit one intake; retention removes notes and pending notifications',async()=>{
 const {retain}=await import('../../lib/server/worker'),operationId=crypto.randomUUID();const body={operationId,answers:{name:'Retentieproef',email:'test@example.invalid',message:'Synthetisch'}};
 const [a,b]=await Promise.all([receiveForm('contact',body,'retention-'+operationId),receiveForm('contact',body,'retention-'+operationId)]);assert.equal(a.id,b.id);
 await sql`insert into cms_submission_notes(id,submission_id,actor_id,note) values (${crypto.randomUUID()},${a.id},${admin.id},'Private testnotitie')`;
 await sql`update cms_submissions set retain_until=now()-interval '1 day' where id=${a.id}`;await retain();
 assert.equal((await sql`select id from cms_submissions where id=${a.id}`).length,0);assert.equal((await sql`select id from cms_submission_notes where submission_id=${a.id}`).length,0);assert.equal((await sql`select id from cms_jobs where payload->>'submissionId'=${a.id}`).length,0);
});
test('AUTH05: maintained two-factor plugin activates TOTP and challenges a fresh login',async()=>{
 const password=crypto.randomUUID()+crypto.randomUUID(),auth=getAuth();const user=await auth.api.createUser({body:{email:'mfa-'+crypto.randomUUID()+'@example.invalid',name:'MFA test',password}});
 const login=await auth.api.signInEmail({body:{email:user.user.email,password},asResponse:true});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),headers=new Headers({cookie,origin:new URL(process.env.APP_BASE_URL!).origin});
 const enabled=await auth.api.enableTwoFactor({body:{password},headers});assert.equal(enabled.method,'totp');
 if(enabled.method!=='totp')throw new Error('TOTP niet beschikbaar.');const secret=new URL(enabled.totpURI).searchParams.get('secret')!;
 const {symmetricDecrypt}=await import('better-auth/crypto');const [factor]=await sql`select secret from auth_two_factor where user_id=${user.user.id}`;const context=await auth.$context;const decoded=await symmetricDecrypt({key:context.secretConfig,data:factor.secret});const generated=await auth.api.generateTOTP({body:{secret:decoded}});const verified=await auth.api.verifyTOTP({body:{code:generated.code},headers});assert.ok(verified);
 const [saved]=await sql`select two_factor_enabled from auth_user where id=${user.user.id}`;assert.equal(saved.two_factor_enabled,true);
 const challenge=await auth.api.signInEmail({body:{email:user.user.email,password}});assert.ok('twoFactorRedirect' in challenge);
});
test('NEWSLETTER01: opt-in and provider status are separate; asynchronous unsubscribe needs read-back proof',async()=>{
 const {requestNewsletter,confirmNewsletter,unsubscribeNewsletter,syncNewsletter}=await import('../../lib/server/newsletter');const operationId=crypto.randomUUID(),email='newsletter-'+crypto.randomUUID()+'@example.invalid';
 await requestNewsletter({operationId,email,name:'Synthetische opt-in',topics:['club'],consent:true},'test-'+operationId);const [job]=await sql`select payload from cms_jobs where operation_id=${'newsletter-confirm:'+operationId}`;const tokens=Array.from(String(job.payload.text).matchAll(/token=([0-9a-f]{64})/g),m=>m[1]);assert.equal(tokens.length,2);
 await confirmNewsletter(tokens[0]);const [subscription]=await sql`select id,status from cms_newsletter where email=${email}`;assert.equal(subscription.status,'confirmed');assert.equal(await syncNewsletter(subscription.id),false);
 const prior={provider:process.env.NEWSLETTER_PROVIDER,key:process.env.NEWSLETTER_API_KEY,list:process.env.NEWSLETTER_LIST_ID,fetch:globalThis.fetch};
 try{process.env.NEWSLETTER_PROVIDER='brevo';process.env.NEWSLETTER_API_KEY='synthetic-contract-fixture';process.env.NEWSLETTER_LIST_ID='123';globalThis.fetch=async()=>new Response('{}',{status:201});assert.equal(await syncNewsletter(subscription.id),true);assert.equal((await sql`select status from cms_newsletter where id=${subscription.id}`)[0].status,'active');
 await unsubscribeNewsletter(tokens[1]);let removed=false;globalThis.fetch=async(url,options)=>String(url).includes('/contacts/lists/')?new Response('{"processId":9}',{status:201}):new Response(JSON.stringify({listIds:removed?[]:[123]}));
 await assert.rejects(syncNewsletter(subscription.id,true),/unsubscribe-pending/);removed=true;assert.equal(await syncNewsletter(subscription.id,true),true);
 }finally{globalThis.fetch=prior.fetch;for(const [key,value] of [['NEWSLETTER_PROVIDER',prior.provider],['NEWSLETTER_API_KEY',prior.key],['NEWSLETTER_LIST_ID',prior.list]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('FORM01/04: all three intake streams remain distinct and membership awaits authorized processing',async()=>{
 const cases=[['contact',{name:'Synthetisch',email:'test@example.invalid',message:'Contact'}],['activity-signup',{name:'Synthetisch',email:'test@example.invalid',activity:'Testactiviteit'}],['volunteer-request',{name:'Synthetisch',email:'test@example.invalid',task:'Testtaak',message:'Aanvraag'}]] as const;
 for(const [index,[id,answers]] of cases.entries()){const received=await receiveForm(id,{operationId:crypto.randomUUID(),answers},'stream-'+crypto.randomUUID());const [saved]=await sql`select kind,integration_status from cms_submissions where id=${received.id}`;assert.equal(saved.kind,['contact','registration','request'][index]);assert.equal(saved.integration_status,'not-applicable');}
 const [base]=await sql`select live from cms_records where id='activity-signup'`,id='membership-'+crypto.randomUUID(),form={...base.live,id,name:'Synthetische ledenaanmelding',registrationPurpose:'membership',consentVersion:'test-v1'};
 await mutate(admin,[{module:'forms',id,expectedVersion:0,action:'publish',data:form}],crypto.randomUUID(),crypto.randomUUID());const received=await receiveForm(id,{operationId:crypto.randomUUID(),answers:{name:'Synthetisch',email:'test@example.invalid',activity:'Fixture'}},'membership-'+id);
 const [member]=await sql`select integration_status from cms_submissions where id=${received.id}`;assert.equal(member.integration_status,'waiting');assert.equal((await sql`select id from cms_jobs where kind='sportlink-registration' and payload->>'submissionId'=${received.id}`).length,1);
});
test('FORM03: unavailable mail transport leaves a retryable job and durable submission',async()=>{
 const previous=process.env.SMTP_HOST;process.env.SMTP_HOST='';
 try{const id=crypto.randomUUID();await sql`insert into cms_jobs(id,operation_id,kind,payload,run_at) values (${id},${'mail-outage:'+id},'mail',${sql.json({to:['test@example.invalid'],subject:'Synthetische storing',text:'Test',messageId:id})},'2000-01-01T00:00:00Z')`;
 await runOnce();const [job]=await sql`select status,attempts,last_error from cms_jobs where id=${id}`;assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.equal(job.last_error,'mail-unconfigured');
 }finally{if(previous===undefined)delete process.env.SMTP_HOST;else process.env.SMTP_HOST=previous;}
});
test('PUB03 and MEDIA03: scheduled publication indexes its frozen live references after a different draft',async()=>{
 const {createCmsSeed}=await import('../../lib/cms/seed'),mediaId=createCmsSeed().media.find(m=>m.published)!.id,id='frozen-ref-'+crypto.randomUUID(),data=page(id);
 data.body.content[0].content![0].content=[{type:'cmsWidget',attrs:{id:'image-'+id,kind:'image',data:{refId:mediaId}}}];
 await mutate(admin,[{module:'pages',id,expectedVersion:0,action:'schedule',data,scheduledAt:new Date(Date.now()+60000).toISOString()}],crypto.randomUUID(),crypto.randomUUID());
 await mutate(admin,[{module:'pages',id,expectedVersion:1,action:'save',data:page(id)}],crypto.randomUUID(),crypto.randomUUID());await sql`update cms_jobs set run_at='1999-01-01T00:00:00Z' where payload->>'id'=${id}`;await runOnce();
 assert.equal((await sql`select target_id from cms_references where record_id=${id} and snapshot='live'`)[0].target_id,mediaId);
 const [media]=await sql`select version from cms_records where id=${mediaId}`;await assert.rejects(mutate(admin,[{module:'media',id:mediaId,expectedVersion:media.version,action:'trash'}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.code==='in-use');
});
test('AUTH06: password-only production administrators cannot read CMS data, but can initialize MFA',async()=>{
 const {principal}=await import('../../lib/server/permissions'),password=crypto.randomUUID()+crypto.randomUUID(),user=await getAuth().api.createUser({body:{email:'mfa-gate-'+crypto.randomUUID()+'@example.invalid',name:'MFA gate fixture',password,role:'admin'}});await sql`insert into cms_memberships(user_id,role_id) values (${user.user.id},'admin')`;
 const response=await getAuth().api.signInEmail({body:{email:user.user.email,password},asResponse:true}),headers=new Headers({cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')});
 const keys=['APP_ENV','APP_BASE_URL','MEDIA_DRIVER','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'] as const,previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{Object.assign(process.env,{APP_ENV:'production',APP_BASE_URL:'https://club.example.invalid',MEDIA_DRIVER:'s3',S3_BUCKET:'synthetic',S3_ACCESS_KEY_ID:'synthetic',S3_SECRET_ACCESS_KEY:'synthetic'});await assert.rejects(principal(headers),(e:any)=>e.code==='mfa-required');assert.equal((await principal(headers,{allowMfaSetup:true})).id,user.user.id);
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('DATA04 and MEDIA04: browser blob URLs become durable mapped originals and repeat import stays idempotent',async()=>{
 const {createCmsSeed}=await import('../../lib/cms/seed'),{inspectImport,applyImport}=await import('../../lib/server/imports');const state=createCmsSeed();
 for(const key of ['articles','pages','people','media','folders','albums','forms','documents','departments','submissions'] as const)state[key]=[] as never;
 const id='browser-'+crypto.randomUUID(),blobKey='blob-'+id,source=createCmsSeed().media[0];state.media=[{...source,id,blobKey,src:'blob:http://localhost/synthetic',published:false,folderId:'',teamId:'',alt:'Synthetische importfoto'}];
 const image=await sharp({create:{width:64,height:48,channels:3,background:'#184f87'}}).png().toBuffer(),backup={format:'duindorp-cms-backup-v1',state,blobs:[{key:blobKey,data:'data:image/png;base64,'+image.toString('base64')}]};
 assert.equal((await inspectImport(admin,backup)).report.issues.length,0);const applied=await applyImport(admin,backup);assert.ok(applied.idMapping[id]);const replay=await applyImport(admin,backup);assert.equal(replay.batch,applied.batch);assert.equal(replay.idMapping[id],applied.idMapping[id]);
 const [object]=await sql`select state,variants from cms_media_objects where id=${applied.idMapping[id]}`;assert.equal(object.state,'ready');assert.equal(object.variants.length,3);assert.equal((await sql`select media_id from cms_import_media where checksum=${applied.checksum} and source_id=${id}`).length,1);
});

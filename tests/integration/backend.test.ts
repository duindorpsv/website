import {assertLocalSupabaseTests,authPost,authCookies,totp} from '../helpers/supabase-auth';
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
assertLocalSupabaseTests();
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
test('AUTH04: blocking invalidates sessions and the last full administrator stays protected',async()=>{const legacy='legacy-'+crypto.randomUUID();await sql`insert into auth_user(id,name,email,role) values (${legacy},'Unmapped historical fixture',${legacy+'@example.invalid'},'admin')`;await sql`insert into cms_memberships(user_id,role_id) values (${legacy},'admin')`;const all=await sql`select user_id,active from cms_memberships where role_id='admin'`;try{await sql`update cms_memberships set active=false where role_id='admin' and user_id!=${admin.id} and user_id!=${legacy}`;await assert.rejects(changeAccount(admin,admin.id,{expectedVersion:1,active:false,roleId:'admin',teamIds:[],departments:[]}),(e:any)=>e.code==='last-admin');await changeAccount(admin,legacy,{expectedVersion:1,active:false,roleId:'admin',teamIds:[],departments:[]});assert.equal((await sql`select active from cms_memberships where user_id=${legacy}`)[0].active,false);}finally{for(const row of all)await sql`update cms_memberships set active=${row.active} where user_id=${row.user_id}`;await sql`delete from auth_user where id=${legacy}`;}
 const password=crypto.randomUUID()+crypto.randomUUID(),u=await getAuth().api.createUser({body:{email:`block-${crypto.randomUUID()}@example.invalid`,name:'Testredacteur',password}});await sql`insert into cms_memberships(user_id,role_id) values (${u.user.id},'editor')`;const login=await authPost('sign-in/email',{email:u.user.email,password});assert.equal(login.status,200);const headers=new Headers({cookie:authCookies(login)});assert.ok(await getAuth().api.getSession({headers}));await changeAccount(admin,u.user.id,{expectedVersion:1,active:false,roleId:'editor',teamIds:[],departments:[]});assert.equal(await getAuth().api.getSession({headers}),null);await changeAccount(admin,u.user.id,{expectedVersion:2,active:true,roleId:'editor',teamIds:[],departments:[]});assert.equal(await getAuth().api.getSession({headers}),null);const next=await authPost('sign-in/email',{email:u.user.email,password});assert.equal(next.status,200);assert.ok(await getAuth().api.getSession({headers:new Headers({cookie:authCookies(next)})}));
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
test('AUTH05: Supabase TOTP enrolls, elevates AAL and challenges a fresh password login',async()=>{
 const password=crypto.randomUUID()+crypto.randomUUID(),user=await getAuth().api.createUser({body:{email:'mfa-'+crypto.randomUUID()+'@example.invalid',name:'MFA test',password}});
 await sql`insert into cms_memberships(user_id,role_id) values (${user.user.id},'editor')`;
 const login=await authPost('sign-in/email',{email:user.user.email,password});assert.equal(login.status,200);
 let cookie=authCookies(login);
 const enabled=await authPost('two-factor/enable',{},cookie);assert.equal(enabled.status,200);cookie=authCookies(enabled,cookie);
 const factor=await enabled.json();assert.equal(factor.method,'totp');const secret=new URL(factor.totpURI).searchParams.get('secret')!;
 const verified=await authPost('two-factor/verify-totp',{code:totp(secret)},cookie);assert.equal(verified.status,200);cookie=authCookies(verified,cookie);
 assert.equal((await getAuth().api.getSession({headers:new Headers({cookie})}))?.mfaVerified,true);
 const challenge=await authPost('sign-in/email',{email:user.user.email,password});assert.equal(challenge.status,200);assert.equal((await challenge.json()).twoFactorRedirect,true);
 assert.equal((await getAuth().api.getSession({headers:new Headers({cookie:authCookies(challenge)})}))?.mfaVerified,false);
 const requested=await authPost('request-password-reset',{email:user.user.email});assert.equal(requested.status,200);
 const [mail]=await sql`select payload from cms_jobs where kind='mail' and payload->'to' @> ${sql.json([user.user.email])}::jsonb order by created_at desc limit 1`;
 const token=new URL(String(mail.payload.text).split('via ')[1]).searchParams.get('token')!,newPassword=crypto.randomUUID()+crypto.randomUUID();
 const recovery=await authPost('reset-password',{token,newPassword});assert.equal(recovery.status,200);assert.equal((await recovery.json()).mfaRequired,true);
 const recoveryCookie=authCookies(recovery),wrong=await authPost('reset-password',{token,newPassword,code:'00000'},recoveryCookie);assert.equal(wrong.status,422);
 const completed=await authPost('reset-password',{token,newPassword,code:totp(secret,Date.now()+30000)},authCookies(wrong,recoveryCookie));assert.equal(completed.status,200);
 const fresh=await authPost('sign-in/email',{email:user.user.email,password:newPassword});assert.equal(fresh.status,200);assert.equal((await fresh.json()).twoFactorRedirect,true);
});
test('NEWSLETTER01: opt-in, duplicate requests, management and unsubscribe are fully local',async()=>{
 const {requestNewsletter,confirmNewsletter,unsubscribeNewsletter,listSubscribers,changeSubscriber}=await import('../../lib/server/newsletter');
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Newsletter management must stay local');};
 try{
 const operationId=crypto.randomUUID(),email='newsletter-'+crypto.randomUUID()+'@example.invalid',body={operationId,email,name:'Synthetische opt-in',topics:['club'],consent:true};
 await Promise.all([requestNewsletter(body,'test-'+operationId),requestNewsletter(body,'test-'+operationId)]);
 const jobs=await sql`select payload from cms_jobs where operation_id=${'newsletter-confirm:'+operationId}`;assert.equal(jobs.length,1);
 const tokens=Array.from(String(jobs[0].payload.text).matchAll(/token=([0-9a-f]{64})/g),m=>m[1]);assert.equal(tokens.length,2);
 assert.equal((await confirmNewsletter(tokens[0])).status,'active');
 const [subscription]=await sql`select id,status,version from cms_newsletter where email=${email}`;assert.equal(subscription.status,'active');
 assert.equal((await sql`select id from cms_jobs where payload->>'id'=${subscription.id} and kind like 'newsletter-%'`).length,0);
 const result=await listSubscribers(admin,{q:email,status:'active',topic:'club'});assert.equal(result.total,1);assert.ok(!('confirmation_hash' in result.items[0]));assert.ok(!('unsubscribe_hash' in result.items[0]));
 await changeSubscriber(admin,subscription.id,{expectedVersion:subscription.version,action:'update',name:'Beheerde abonnee',topics:['jeugd']});
 await assert.rejects(changeSubscriber(admin,subscription.id,{expectedVersion:subscription.version,action:'unsubscribe'}),(e:any)=>e.code==='conflict');
 await requestNewsletter({...body,operationId:crypto.randomUUID(),name:'Onbevestigde wijziging',topics:['ongewenst']},'other-'+operationId);
 const [preserved]=await sql`select name,topics from cms_newsletter where id=${subscription.id}`;assert.equal(preserved.name,'Beheerde abonnee');assert.deepEqual(preserved.topics,['jeugd']);
 await unsubscribeNewsletter(tokens[1]);assert.equal((await sql`select status from cms_newsletter where id=${subscription.id}`)[0].status,'unsubscribed');
 await assert.rejects(confirmNewsletter(tokens[0]),(e:any)=>e.code==='token');
 await assert.rejects(listSubscribers({...admin,grants:[{module:'settings',action:'read'}]},{}),(e:any)=>e.code==='forbidden');
 await assert.rejects(changeSubscriber({...admin,grants:[]},subscription.id,{expectedVersion:1,action:'unsubscribe'}),(e:any)=>e.code==='forbidden');
 }finally{globalThis.fetch=originalFetch;}
});
test('NEWSLETTER02: legacy synchronization never reactivates an unsubscribed contact',async()=>{
 const {requestNewsletter,confirmNewsletter,unsubscribeNewsletter,settleLegacyNewsletterJob,listSubscribers,changeSubscriber}=await import('../../lib/server/newsletter');
 const id=crypto.randomUUID(),email='newsletter-legacy-'+id+'@example.invalid';
 await requestNewsletter({operationId:id,email,name:'Legacy fixture',topics:['club'],consent:true},id);
 const [job]=await sql`select payload from cms_jobs where operation_id=${'newsletter-confirm:'+id}`;
 const tokens=Array.from(String(job.payload.text).matchAll(/token=([0-9a-f]{64})/g),m=>m[1]);await confirmNewsletter(tokens[0]);
 let [row]=await sql`select id,version from cms_newsletter where email=${email}`;
 await sql`update cms_newsletter set status='confirmed' where id=${row.id}`;await settleLegacyNewsletterJob(row.id);
 assert.equal((await listSubscribers(admin,{q:email,status:'active'})).total,1);
 [row]=await sql`select id,version from cms_newsletter where email=${email}`;
 const results=await Promise.allSettled([changeSubscriber(admin,row.id,{action:'update',expectedVersion:row.version,name:'First',topics:['one']}),changeSubscriber(admin,row.id,{action:'update',expectedVersion:row.version,name:'Second',topics:['two']})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 await unsubscribeNewsletter(tokens[1]);await settleLegacyNewsletterJob(row.id);assert.equal((await listSubscribers(admin,{q:email,status:'unsubscribed'})).total,1);
});
test('FORM01/04: all three intake streams remain distinct and membership awaits authorized processing',async()=>{
 const cases=[['contact',{name:'Synthetisch',email:'test@example.invalid',message:'Contact'}],['activity-signup',{name:'Synthetisch',email:'test@example.invalid',activity:'Testactiviteit'}],['volunteer-request',{name:'Synthetisch',email:'test@example.invalid',task:'Testtaak',message:'Aanvraag'}]] as const;
 for(const [index,[id,answers]] of cases.entries()){const received=await receiveForm(id,{operationId:crypto.randomUUID(),answers},'stream-'+crypto.randomUUID());const [saved]=await sql`select kind,integration_status from cms_submissions where id=${received.id}`;assert.equal(saved.kind,['contact','registration','request'][index]);assert.equal(saved.integration_status,'not-applicable');}
 const [base]=await sql`select live from cms_records where id='activity-signup'`,id='membership-'+crypto.randomUUID(),form={...base.live,id,name:'Synthetische ledenaanmelding',registrationPurpose:'membership',consentVersion:'test-v1'};
 await mutate(admin,[{module:'forms',id,expectedVersion:0,action:'publish',data:form}],crypto.randomUUID(),crypto.randomUUID());const received=await receiveForm(id,{operationId:crypto.randomUUID(),answers:{name:'Synthetisch',email:'test@example.invalid',activity:'Fixture'}},'membership-'+id);
 const [member]=await sql`select integration_status from cms_submissions where id=${received.id}`;assert.equal(member.integration_status,'waiting');assert.equal((await sql`select id from cms_jobs where kind='sportlink-registration' and payload->>'submissionId'=${received.id}`).length,1);
});
test('FORM03: unavailable mail transport leaves a retryable job and durable submission',async()=>{
 const previous=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='';
 try{const id=crypto.randomUUID();await sql`insert into cms_jobs(id,operation_id,kind,payload,run_at) values (${id},${'mail-outage:'+id},'mail',${sql.json({to:['test@example.invalid'],subject:'Synthetische storing',text:'Test',messageId:id})},'2000-01-01T00:00:00Z')`;
 await runOnce();const [job]=await sql`select status,attempts,last_error from cms_jobs where id=${id}`;assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.equal(job.last_error,'mail-unconfigured');
 }finally{if(previous===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous;}
});
test('Resend queue: a rejected API request retries the same durable operation and completes on a valid receipt',async()=>{
 const keys=['RESEND_API_KEY','MAIL_FROM','TEST_MAIL_TO'] as const,previous=Object.fromEntries(keys.map(key=>[key,process.env[key]])),originalFetch=globalThis.fetch;
 const id=crypto.randomUUID(),operation='resend-fixture:'+id,requests:any[]=[];
 try{
  Object.assign(process.env,{RESEND_API_KEY:'synthetic-resend-contract',MAIL_FROM:'cms@example.invalid',TEST_MAIL_TO:'test@example.invalid'});
  globalThis.fetch=async(url,options)=>{if(url!=='https://api.resend.com/emails')return originalFetch(url,options);requests.push(JSON.parse(String(options?.body)));return requests.length===1?new Response(null,{status:429}):Response.json({id:crypto.randomUUID()});};
  await sql`insert into cms_jobs(id,operation_id,kind,payload,run_at) values (${id},${operation},'mail',${sql.json({to:['original@example.invalid'],subject:'Synthetische Resend-proef',text:'Test'})},'1900-01-01T00:00:00Z')`;
  await runOnce();const [retry]=await sql`select status,attempts,last_error from cms_jobs where id=${id}`;
  assert.equal(retry.status,'pending');assert.equal(retry.attempts,1);assert.equal(retry.last_error,'mail-rejected');
  await sql`update cms_jobs set run_at='1900-01-01T00:00:00Z' where id=${id}`;
  await runOnce();const [done]=await sql`select status,attempts,last_error from cms_jobs where id=${id}`;
  assert.equal(done.status,'done');assert.equal(done.attempts,2);assert.equal(done.last_error,null);
  assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
  assert.match(requests[0].tags[0].value,/^[0-9a-f]{64}$/);
  assert.deepEqual(requests[0].to,['test@example.invalid']);
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('PUB03 and MEDIA03: scheduled publication indexes its frozen live references after a different draft',async()=>{
 const {createCmsSeed}=await import('../../lib/cms/seed'),mediaId=createCmsSeed().media.find(m=>m.published)!.id,id='frozen-ref-'+crypto.randomUUID(),data=page(id);
 data.body.content[0].content![0].content=[{type:'cmsWidget',attrs:{id:'image-'+id,kind:'image',data:{refId:mediaId}}}];
 await mutate(admin,[{module:'pages',id,expectedVersion:0,action:'schedule',data,scheduledAt:new Date(Date.now()+60000).toISOString()}],crypto.randomUUID(),crypto.randomUUID());
 await mutate(admin,[{module:'pages',id,expectedVersion:1,action:'save',data:page(id)}],crypto.randomUUID(),crypto.randomUUID());await sql`update cms_jobs set run_at='1999-01-01T00:00:00Z' where payload->>'id'=${id}`;for(let attempt=0;attempt<30;attempt++){await runOnce();if((await sql`select live from cms_records where id=${id}`)[0].live)break;}
 assert.equal((await sql`select target_id from cms_references where record_id=${id} and snapshot='live'`)[0].target_id,mediaId);
 const [media]=await sql`select version from cms_records where id=${mediaId}`;await assert.rejects(mutate(admin,[{module:'media',id:mediaId,expectedVersion:media.version,action:'trash'}],crypto.randomUUID(),crypto.randomUUID()),(e:any)=>e.code==='in-use');
});
test('AUTH06: an enrolled factor never grants CMS access to a password-only session',async()=>{
 const {principal}=await import('../../lib/server/permissions'),password=crypto.randomUUID()+crypto.randomUUID(),user=await getAuth().api.createUser({body:{email:'mfa-gate-'+crypto.randomUUID()+'@example.invalid',name:'MFA gate fixture',password,role:'admin'}});await sql`insert into cms_memberships(user_id,role_id) values (${user.user.id},'admin')`;
 let response=await authPost('sign-in/email',{email:user.user.email,password}),cookie=authCookies(response);
 assert.equal((await principal(new Headers({cookie}),{allowMfaSetup:true})).id,user.user.id);
 response=await authPost('two-factor/enable',{},cookie);assert.equal(response.status,200);cookie=authCookies(response,cookie);const secret=new URL((await response.json()).totpURI).searchParams.get('secret')!;
 response=await authPost('two-factor/verify-totp',{code:totp(secret)},cookie);assert.equal(response.status,200);cookie=authCookies(response,cookie);
 assert.equal((await principal(new Headers({cookie}))).mfa,true);
 response=await authPost('sign-in/email',{email:user.user.email,password});assert.equal(response.status,200);const headers=new Headers({cookie:authCookies(response)});
 await assert.rejects(principal(headers),(e:any)=>e.code==='mfa-required');await assert.rejects(principal(headers,{allowMfaSetup:true}),(e:any)=>e.code==='mfa-required');
});
test('DATA04 and MEDIA04: browser blob URLs become durable mapped originals and repeat import stays idempotent',async()=>{
 const {createCmsSeed}=await import('../../lib/cms/seed'),{inspectImport,applyImport}=await import('../../lib/server/imports');const state=createCmsSeed();
 for(const key of ['articles','pages','people','media','folders','albums','forms','documents','departments','submissions'] as const)state[key]=[] as never;
 const id='browser-'+crypto.randomUUID(),blobKey='blob-'+id,source=createCmsSeed().media[0];state.media=[{...source,id,blobKey,src:'blob:http://localhost/synthetic',published:false,folderId:'',teamId:'',alt:'Synthetische importfoto'}];
 const image=await sharp({create:{width:64,height:48,channels:3,background:'#184f87'}}).png().toBuffer(),backup={format:'duindorp-cms-backup-v1',state,blobs:[{key:blobKey,data:'data:image/png;base64,'+image.toString('base64')}]};
 assert.equal((await inspectImport(admin,backup)).report.issues.length,0);const applied=await applyImport(admin,backup);assert.ok(applied.idMapping[id]);const replay=await applyImport(admin,backup);assert.equal(replay.batch,applied.batch);assert.equal(replay.idMapping[id],applied.idMapping[id]);
 const [object]=await sql`select state,variants from cms_media_objects where id=${applied.idMapping[id]}`;assert.equal(object.state,'ready');assert.equal(object.variants.length,3);assert.equal((await sql`select media_id from cms_import_media where checksum=${applied.checksum} and source_id=${id}`).length,1);
});
test('AUTH07: recovery links use the Resend outbox, reset once and revoke old sessions',async()=>{
 const password=crypto.randomUUID()+crypto.randomUUID(),next=crypto.randomUUID()+crypto.randomUUID(),user=await getAuth().api.createUser({body:{email:'recover-'+crypto.randomUUID()+'@example.invalid',name:'Recovery fixture',password}});
 await sql`insert into cms_memberships(user_id,role_id) values (${user.user.id},'editor')`;
 const login=await authPost('sign-in/email',{email:user.user.email,password});assert.equal(login.status,200);const oldHeaders=new Headers({cookie:authCookies(login)});
 const request=await authPost('request-password-reset',{email:user.user.email,redirectTo:'/beheer/herstel'});assert.equal(request.status,200);
 const [mail]=await sql`select payload from cms_jobs where kind='mail' and payload->'to' @> ${sql.json([user.user.email])}::jsonb order by created_at desc limit 1`;
 assert.ok(mail);const token=new URL(String(mail.payload.text).split('via ')[1]).searchParams.get('token')!;
 const reset=await authPost('reset-password',{newPassword:next,token});assert.equal(reset.status,200);assert.equal(await getAuth().api.getSession({headers:oldHeaders}),null);
 assert.equal((await authPost('reset-password',{newPassword:password,token})).status,401);
 assert.equal((await authPost('sign-in/email',{email:user.user.email,password})).status,401);
 assert.equal((await authPost('sign-in/email',{email:user.user.email,password:next})).status,200);
 const unknown=await authPost('request-password-reset',{email:'unknown-'+crypto.randomUUID()+'@example.invalid'});assert.equal(unknown.status,200);assert.deepEqual(await unknown.json(),await request.json());
});
test('AUTH08: runtime SQL has RLS policies while public Supabase roles cannot access CMS data or Auth secrets',async()=>{
 const [result]=await sql`select current_user as runtime,row_security_active('public.cms_records') as rls,has_table_privilege('anon','public.cms_records','select') as anon,has_table_privilege('authenticated','public.cms_submissions','select') as authenticated,has_table_privilege('service_role','public.cms_newsletter','select') as service_role,has_schema_privilege('duindorp_app','auth','usage') as auth_schema,has_function_privilege('anon','public.cms_auth_session(uuid,uuid)','execute') as anon_rpc,has_function_privilege('authenticated','public.cms_auth_session(uuid,uuid)','execute') as authenticated_rpc,has_function_privilege('service_role','public.cms_auth_session(uuid,uuid)','execute') as server_rpc`;
 assert.equal(result.runtime,'duindorp_app');assert.equal(result.rls,true);assert.equal(result.anon,false);assert.equal(result.authenticated,false);assert.equal(result.service_role,false);assert.equal(result.auth_schema,false);assert.equal(result.anon_rpc,false);assert.equal(result.authenticated_rpc,false);assert.equal(result.server_rpc,true);
 const response=await fetch(process.env.SUPABASE_URL+'/rest/v1/cms_records?select=id&limit=1',{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY!}});assert.ok([401,403,404].includes(response.status));
});
test('MEDIA05: private S3 objects support signed reads and refuse unsigned downloads',async()=>{
 const {putObject,getObject,deleteObject}=await import('../../lib/server/storage');
 const key='originals/private-fixture-'+crypto.randomUUID()+'.txt';
 try{await putObject(key,new TextEncoder().encode('private fixture'),'text/plain');
 assert.equal(new TextDecoder().decode(await getObject(key)),'private fixture');
 const response=await fetch(process.env.S3_ENDPOINT!.replace(/\/$/,'')+'/'+process.env.S3_BUCKET+'/'+key);
 assert.ok([400,401,403,404].includes(response.status));assert.notEqual(await response.text(),'private fixture');
 }finally{await deleteObject(key);}
});
test('AUTH09: a verified non-TOTP factor also prevents password-only CMS access',async()=>{
 const {principal}=await import('../../lib/server/permissions'),password=crypto.randomUUID()+crypto.randomUUID(),user=await getAuth().api.createUser({body:{email:'other-factor-'+crypto.randomUUID()+'@example.invalid',name:'Provider-factor fixture',password}});
 await sql`insert into cms_memberships(user_id,role_id) values (${user.user.id},'editor')`;
 const login=await authPost('sign-in/email',{email:user.user.email,password});assert.equal(login.status,200);const headers=new Headers({cookie:authCookies(login)}),originalFetch=globalThis.fetch;
 try{
  // Model a factor newly enrolled at the provider after this real AAL1 token
  // was issued. This tests fail-closed behavior without sending an SMS.
  globalThis.fetch=async(input,init)=>{
   const response=await originalFetch(input,init);
   if(String(input).endsWith('/auth/v1/user')&&response.ok){const body=await response.json();body.factors=[{id:crypto.randomUUID(),factor_type:'phone',status:'verified',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];return Response.json(body,{status:response.status,headers:response.headers});}
   return response;
  };
  await assert.rejects(principal(headers),(error:any)=>error.code==='mfa-required');
 }finally{globalThis.fetch=originalFetch;}
});

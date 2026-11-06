import {createHash} from 'node:crypto';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertLocalSupabaseTests,authPost,authCookies} from '../helpers/supabase-auth';
import {capturedEmailCode} from '../helpers/email-code';
import {getAuth,deliverEmailCode} from '../../lib/server/auth';
import {sqlClient,closeDb} from '../../db';
import {workspaceCommands} from '../../lib/server/sponsor-commands';
import {workspaceRead} from '../../lib/server/sponsor-workspace';
import {deliverSponsorDocumentMail,queueSponsorDocumentMail} from '../../lib/server/sponsor-document-mail';
import {workspaceLocks} from '../../lib/server/sponsor-access';
import type {Sponsor,SponsorBusinessDetails} from '../../lib/cms/sponsorship-types';
assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);
const base=process.env.APP_BASE_URL!,agent='document-mail-test-'+crypto.randomUUID();
const request=(cookie:string,body?:unknown)=>new Request(new URL('/api/cms/sponsor-workspace?mode=sponsorship',base),{method:body?'POST':'GET',headers:{cookie,origin:new URL(base).origin,'content-type':'application/json','user-agent':agent},...(body?{body:JSON.stringify(body)}:{})});
async function isolatedLogin(email:string){
 const after=Date.now(),response=await authPost('email-code/request',{email});assert.equal(response.status,200);
 const cookie=authCookies(response),nonce=/duindorp-login=([a-f0-9]{64})/.exec(cookie)?.[1];assert.ok(nonce);
 const operation='login-'+createHash('sha256').update(nonce).digest('hex'),[job]=await sql`select id,payload from cms_jobs where operation_id=${operation}`;assert.ok(job);
 await deliverEmailCode(job.payload,`<${operation}@duindorp.invalid>`);await sql`update cms_jobs set status='done' where id=${job.id}`;
 const signed=await authPost('email-code/verify',{email,code:await capturedEmailCode(email,after)},cookie);assert.equal(signed.status,200);return signed;
}
async function fixture(role:string){const email='document-mail-'+crypto.randomUUID()+'@example.invalid';const {user}=await getAuth().api.createUser({body:{email,name:'Fictieve documentmail',password:crypto.randomUUID()+crypto.randomUUID()}});await sql`insert into cms_memberships(user_id,role_id) values (${user.id},${role})`;return {...user,cookie:authCookies(await isolatedLogin(email))};}
const company=(id:string,ownerId:string):Sponsor=>({id,name:'Fictieve documentmail BV',companyNumber:'12345678',vatNumber:'',address:'Teststraat 1',postalCode:'1234 AB',city:'Den Haag',email:'unlinked@example.invalid',phone:'',website:'',description:'',logoUrl:'',ownerId,stage:'lead',notes:'',publicProfile:{name:'Fictief',description:'',website:'',logoUrl:''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false});
const business:SponsorBusinessDetails={legalName:'Fictieve documentmail BV',companyNumber:'12345678',registrationExempt:false,registrationExemptionReason:'',vatNumber:'',vatStatus:'not-applicable',address:'Teststraat 1',postalCode:'1234 AB',city:'Den Haag',country:'NL',contactName:'Fictief',contactFunction:'Directeur',contactEmail:'unlinked@example.invalid',invoiceEmail:'unlinked@example.invalid',phone:'',confirmedAt:'',confirmedBy:'',updatedAt:''};
test('document mail: normal send actions queue atomically, failure, current recipient rights and permanent deduplication',async t=>{
 const staff=await fixture('sponsorcommissie'),admin=await fixture('admin'),signer=await fixture('sponsor'),other=await fixture('sponsor'),companyId=crypto.randomUUID();
 const read=()=>workspaceRead(request(staff.cookie));
 async function command(name:string,args:unknown[],operationId=crypto.randomUUID(),cookie=staff.cookie){const data=await read(),body={operationId,mode:'sponsorship',companyId:'',versions:data.versions,commands:[{name,args,offset:0}]};const result=await workspaceCommands(request(cookie,body),body);await sql`update cms_jobs set run_at='2200-01-01' where kind='sponsor-document-mail' and payload->>'deliveryId' in (select id from cms_sponsor_deliveries where sponsor_id=${companyId}) and status='pending'`;return {body,result};}
 await command('saveSponsor',[{...company(companyId,staff.id),email:other.email}]);await command('saveSponsorBusinessDetails',[companyId,{...business,contactEmail:other.email},true]);
 const itemId=crypto.randomUUID(),packageId=crypto.randomUUID();await command('saveSponsorItem',[{id:itemId,name:'Fictief bord',description:'Test',kind:'board',priceCents:10000,taxRate:'21',capacity:0,period:'season',active:true}]);await command('saveSponsorPackage',[{id:packageId,name:'Fictief pakket',description:'Test',itemIds:[itemId],priceCents:10000,taxRate:'21',active:true}]);await command('createSponsorProposal',[companyId,packageId]);const proposal=(await read()).state.sponsorship!.proposals.find(row=>row.sponsorId===companyId)!;
 await command('saveMembership',[{id:crypto.randomUUID(),sponsorId:companyId,userId:other.id,roles:['marketing']}],crypto.randomUUID(),admin.cookie);
 await command('saveMembership',[{id:crypto.randomUUID(),sponsorId:companyId,userId:signer.id,roles:['signer']}],crypto.randomUUID(),admin.cookie);
 let deliveryId='',cachedSend:any;
 await t.test('the normal proposal send queues exactly once; replay and the repair action never duplicate it',async()=>{
  const first=await command('sendSponsorProposal',[proposal.id]);cachedSend=first.body;assert.equal(first.result.mailStatus,'queued');
  assert.deepEqual(await workspaceCommands(request(staff.cookie,first.body),first.body),first.result);
  await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);
  const deliveries=await sql`select * from cms_sponsor_deliveries where reference_id=${proposal.id}`;assert.equal(deliveries.length,1);assert.equal(deliveries[0].user_id,signer.id);deliveryId=deliveries[0].id;
  assert.equal((await sql`select id from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${deliveryId}`).length,1);
  await assert.rejects(command('sendSponsorDocumentEmail',[proposal.id,'proposal'],crypto.randomUUID(),other.cookie),/geen rechten/);
 });
 const originalFetch=globalThis.fetch,requests:{key:string;body:any}[]=[];let fail=false;
 globalThis.fetch=async(input,init)=>{if(String(input).startsWith(process.env.TEST_MAIL_API_URL!)&&init?.method==='POST'){const body=JSON.parse(String(init.body));if(body.subject==='Je sponsorvoorstel bij Duindorp SV'){requests.push({key:new Headers(init.headers).get('Idempotency-Key')!,body});if(fail)return new Response('{}',{status:503});}}return originalFetch(input,init);};
 try{
  await t.test('provider rejection stays failed; queued is never reported as acceptance',async()=>{
   fail=true;await assert.rejects(deliverSponsorDocumentMail(deliveryId),/niet geaccepteerd/);
   const mail=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===proposal.id)!;assert.equal(mail.status,'failed');assert.equal(mail.accepted,0);assert.equal(mail.acceptedAt,'');
  });
  await t.test('real local Resend sink accepts retry with same idempotency key, then no resend',async()=>{
   fail=false;await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);await deliverSponsorDocumentMail(deliveryId);
   assert.equal(requests.length,2);assert.equal(requests[0].key,requests[1].key);assert.equal(requests[1].body.to[0],process.env.TEST_MAIL_TO);assert.match(requests[1].body.text,/sponsorportaal/);
   const rows=(await readFile('.runtime/mail-sink.jsonl','utf8')).trim().split('\n').map(row=>JSON.parse(row));assert.ok(rows.some(row=>row.subject==='Je sponsorvoorstel bij Duindorp SV'));
   const mail=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===proposal.id)!;assert.equal(mail.status,'accepted');assert.equal(mail.accepted,1);assert.ok(mail.acceptedAt);assert.ok(!JSON.stringify(mail).includes(signer.email));
   await deliverSponsorDocumentMail(deliveryId);const again=await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);assert.equal(again.result.mailStatus,'accepted');assert.equal(requests.length,2);
  });
 }finally{globalThis.fetch=originalFetch;}
 await t.test('mixed accepted and cancelled recipients retain explicit partial acceptance',async()=>{
  const membership=(await read()).state.sponsorship!.memberships.find(row=>row.userId===other.id&&row.sponsorId===companyId)!;
  await command('saveMembership',[{...membership,roles:['signer']}],crypto.randomUUID(),admin.cookie);
  await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);const [delivery]=await sql`select id from cms_sponsor_deliveries where reference_id=${proposal.id} and user_id=${other.id}`;
  await command('saveMembership',[{...membership,roles:['marketing']}],crypto.randomUUID(),admin.cookie);
  await deliverSponsorDocumentMail(delivery.id);
  const mail=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===proposal.id)!;assert.equal(mail.status,'partial');assert.equal(mail.accepted,1);assert.equal(mail.recipients,2);assert.ok(mail.acceptedAt);
  const replay=await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);assert.equal(replay.result.mailStatus,'partial');
 });
 const created=await command('createSponsorAgreement',[proposal.id]);assert.equal(created.result.mailStatus,'queued');const agreement=(await read()).state.sponsorship!.agreements.find(row=>row.proposalId===proposal.id)!;
 await t.test('creating an agreement queues automatically and replays once; revocation before worker cancels without provider call',async()=>{
  assert.deepEqual(await workspaceCommands(request(staff.cookie,created.body),created.body),created.result);
  assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id}`).length,1);
  await command('sendSponsorDocumentEmail',[agreement.id,'agreement']);const [delivery]=await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id}`;
  assert.equal((await sql`select id from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${delivery.id}`).length,1);
  await sql`update cms_sponsor_memberships set roles=array['billing']::text[] where sponsor_id=${companyId} and user_id=${signer.id}`;
  const saved=globalThis.fetch;globalThis.fetch=async(input,init)=>{if(String(input).startsWith(process.env.TEST_MAIL_API_URL!))throw new Error('Revoked recipient must not reach provider');return saved(input,init);};try{await deliverSponsorDocumentMail(delivery.id);}finally{globalThis.fetch=saved;}
  assert.equal((await sql`select status from cms_sponsor_deliveries where id=${delivery.id}`)[0].status,'cancelled');
  assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id} and user_id is null`).length,0,'Revoking a queued account recipient never silently switches to a business address');
 });
 await t.test('revoking the requesting staff member before worker execution cancels the queued message',async()=>{
  await sql`update cms_sponsor_memberships set roles=array['signer']::text[] where sponsor_id=${companyId} and user_id=${signer.id}`;
  await command('sendSponsorDocumentEmail',[agreement.id,'agreement']);const [delivery]=await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id}`;
  await sql`update cms_memberships set role_id='sponsor' where user_id=${staff.id}`;
  try{await assert.rejects(workspaceCommands(request(staff.cookie,cachedSend),cachedSend),/geen rechten/);await assert.rejects(workspaceCommands(request(staff.cookie,created.body),created.body),/geen rechten/);await deliverSponsorDocumentMail(delivery.id);}finally{await sql`update cms_memberships set role_id='sponsorcommissie' where user_id=${staff.id}`;}
  assert.equal((await sql`select status from cms_sponsor_deliveries where id=${delivery.id}`)[0].status,'cancelled');
 });
 await t.test('a queued proposal superseded by an agreement cancels instead of sending stale content',async()=>{
  await sql`update cms_sponsor_deliveries set status='queued',delivered_at=null where id=${deliveryId}`;await deliverSponsorDocumentMail(deliveryId);assert.equal((await sql`select status from cms_sponsor_deliveries where id=${deliveryId}`)[0].status,'cancelled');
 });
});
test('business document notification freezes the registered contact without granting an account or signing access',async t=>{
 const staff=await fixture('sponsorcommissie'),admin=await fixture('admin'),unlinked=await fixture('sponsor'),companyId=crypto.randomUUID();
 const ownedCompanies=[companyId];
 const details={...business,contactEmail:unlinked.email,invoiceEmail:'invoice-'+crypto.randomUUID()+'@example.invalid'};
 const read=()=>workspaceRead(request(staff.cookie));
 async function command(name:string,args:unknown[],operationId=crypto.randomUUID(),cookie=staff.cookie){const data=await read(),body={operationId,mode:'sponsorship',companyId:'',versions:data.versions,commands:[{name,args,offset:0}]};const result=await workspaceCommands(request(cookie,body),body);await sql`update cms_jobs set run_at='2200-01-01' where kind='sponsor-document-mail' and payload->>'deliveryId' in (select id from cms_sponsor_deliveries where sponsor_id in ${sql(ownedCompanies)}) and status='pending'`;return {body,result};}
 await command('saveSponsor',[{...company(companyId,staff.id),email:'general-'+crypto.randomUUID()+'@example.invalid'}]);await command('saveSponsorBusinessDetails',[companyId,details,true]);
 const itemId=crypto.randomUUID(),packageId=crypto.randomUUID();await command('saveSponsorItem',[{id:itemId,name:'Fictief bedrijfsbord',description:'Test',kind:'board',priceCents:10000,taxRate:'21',capacity:0,period:'season',active:true}]);await command('saveSponsorPackage',[{id:packageId,name:'Fictief bedrijfspakket',description:'Test',itemIds:[itemId],priceCents:10000,taxRate:'21',active:true}]);await command('createSponsorProposal',[companyId,packageId]);
 const proposal=(await read()).state.sponsorship!.proposals.find(row=>row.sponsorId===companyId)!;
 const [{n:accountsBefore}]=await sql`select count(*)::int as n from auth_user`;
 let proposalDelivery='',agreementId='',agreementDelivery='',frozenBytes='';
 const originalFetch=globalThis.fetch,requests:{key:string;body:any}[]=[];let fail=false;
 globalThis.fetch=async(input,init)=>{if(String(input).startsWith(process.env.TEST_MAIL_API_URL!)&&init?.method==='POST'){const body=JSON.parse(String(init.body));if(body.subject.startsWith('Je sponsor')){requests.push({key:new Headers(init.headers).get('Idempotency-Key')!,body});if(fail)return new Response('{}',{status:503});}}return originalFetch(input,init);};
 try{
  await t.test('normal send atomically freezes contact, replays once, and never matches an existing account by email',async()=>{
   const first=await command('sendSponsorProposal',[proposal.id]);assert.equal(first.result.mailStatus,'queued');assert.deepEqual(await workspaceCommands(request(staff.cookie,first.body),first.body),first.result);await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);
   const deliveries=await sql`select * from cms_sponsor_deliveries where reference_id=${proposal.id}`;assert.equal(deliveries.length,1);assert.equal(deliveries[0].user_id,null);proposalDelivery=deliveries[0].id;
   const jobs=await sql`select payload from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${proposalDelivery}`;assert.equal(jobs.length,1);
   const [record]=await sql`select snapshot_bytes from cms_sponsor_records where id=${proposal.id}`;const intent=jobs[0].payload.businessRecipient;
   assert.equal(intent.source,'snapshot.sponsorEmail');assert.equal(intent.email,unlinked.email);assert.notEqual(intent.email,details.invoiceEmail);assert.equal(intent.snapshotHash,createHash('sha256').update(record.snapshot_bytes).digest('hex'));assert.match(intent.fingerprint,/^[a-f0-9]{64}$/);
   assert.equal((await sql`select count(*)::int as n from auth_user`)[0].n,accountsBefore);assert.equal((await sql`select id from cms_sponsor_memberships where sponsor_id=${companyId}`).length,0);
   const state=await read(),mail=state.state.sponsorship!.documentMails!.find(row=>row.referenceId===proposal.id)!;for(const value of [unlinked.email,intent.fingerprint,'businessRecipient'])assert.ok(!JSON.stringify(mail).includes(value));
   const portalBody={operationId:crypto.randomUUID(),mode:'portal',companyId,versions:state.versions,commands:[{name:'acceptSponsorProposal',args:[proposal.id],offset:0}]};
   await assert.rejects(workspaceCommands(request(unlinked.cookie,portalBody),portalBody,true),(error:any)=>error.status===403);
  });
  await t.test('rejection remains failed; real local sink retry uses the same frozen recipient and provider key',async()=>{
   fail=true;await assert.rejects(deliverSponsorDocumentMail(proposalDelivery),/niet geaccepteerd/);let mail=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===proposal.id)!;assert.equal(mail.status,'failed');assert.equal(mail.acceptedAt,'');
   fail=false;await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);await deliverSponsorDocumentMail(proposalDelivery);
   assert.equal(requests.length,2);assert.equal(requests[0].key,requests[1].key);assert.deepEqual(requests[0].body,requests[1].body);assert.equal(requests[1].body.to[0],process.env.TEST_MAIL_TO);assert.match(requests[1].body.text,/persoonlijke toegang.*regelen/);assert.ok(!requests[1].body.html.includes('Sponsorportaal openen'));assert.equal(requests[1].body.attachments,undefined);
   mail=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===proposal.id)!;assert.equal(mail.status,'accepted');assert.equal(mail.accepted,1);assert.ok(mail.acceptedAt);await deliverSponsorDocumentMail(proposalDelivery);assert.equal((await command('sendSponsorDocumentEmail',[proposal.id,'proposal'])).result.mailStatus,'accepted');assert.equal(requests.length,2);
  });
  await t.test('creating an agreement without linked signers queues the frozen company notification, but never a signing code',async()=>{
   const created=await command('createSponsorAgreement',[proposal.id]);assert.equal(created.result.mailStatus,'queued');assert.deepEqual(await workspaceCommands(request(staff.cookie,created.body),created.body),created.result);
   const agreement=(await read()).state.sponsorship!.agreements.find(row=>row.proposalId===proposal.id)!;agreementId=agreement.id;
   const deliveries=await sql`select * from cms_sponsor_deliveries where reference_id=${agreementId}`;assert.equal(deliveries.length,1);assert.equal(deliveries[0].user_id,null);agreementDelivery=deliveries[0].id;
   frozenBytes=(await sql`select snapshot_bytes from cms_sponsor_records where id=${agreementId}`)[0].snapshot_bytes;
   assert.equal((await sql`select payload from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${agreementDelivery}`).length,1);
   const state=await read(),body={operationId:crypto.randomUUID(),mode:'portal',companyId,versions:state.versions,commands:[{name:'requestSponsorSigningCode',args:[agreementId,'sponsor'],offset:0}]};await assert.rejects(workspaceCommands(request(unlinked.cookie,body),body,true),(error:any)=>error.status===403);assert.equal((await sql`select id from cms_sponsor_signing_challenges where agreement_id=${agreementId}`).length,0);
  });
  await t.test('a changed registered contact cancels the queued intent without retargeting or using invoice/general email',async()=>{
   await command('saveSponsorBusinessDetails',[companyId,{...details,contactEmail:'changed-'+crypto.randomUUID()+'@example.invalid'},true]);await deliverSponsorDocumentMail(agreementDelivery);assert.equal(requests.length,2);assert.equal((await sql`select status from cms_sponsor_deliveries where id=${agreementDelivery}`)[0].status,'cancelled');
   const [{n:jobsBefore}]=await sql`select count(*)::int as n from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${agreementDelivery}`;
   await assert.rejects(command('sendSponsorDocumentEmail',[agreementId,'agreement']),(error:any)=>error.code==='document-mail-recipient'&&error.status===422);assert.equal((await sql`select count(*)::int as n from cms_jobs where kind='sponsor-document-mail' and payload->>'deliveryId'=${agreementDelivery}`)[0].n,jobsBefore);
   assert.equal((await sql`select payload from cms_jobs where payload->>'deliveryId'=${agreementDelivery} limit 1`)[0].payload.businessRecipient.email,unlinked.email);assert.equal((await sql`select snapshot_bytes from cms_sponsor_records where id=${agreementId}`)[0].snapshot_bytes,frozenBytes);
   await command('saveSponsorBusinessDetails',[companyId,details,true]);await command('sendSponsorDocumentEmail',[agreementId,'agreement']);assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${agreementId}`)[0].id,agreementDelivery);
  });
  await t.test('fresh actor permissions, malformed recipient intent, and changed fingerprint cancel before provider',async()=>{
   await sql`update cms_memberships set role_id='sponsor' where user_id=${staff.id}`;try{await deliverSponsorDocumentMail(agreementDelivery);}finally{await sql`update cms_memberships set role_id='sponsorcommissie' where user_id=${staff.id}`;}
   assert.equal((await sql`select status from cms_sponsor_deliveries where id=${agreementDelivery}`)[0].status,'cancelled');
   for(const field of ['source','snapshotHash','fingerprint']){await command('sendSponsorDocumentEmail',[agreementId,'agreement']);const [job]=await sql`select id,payload from cms_jobs where payload->>'deliveryId'=${agreementDelivery} order by created_at desc,id desc limit 1`;job.payload.businessRecipient[field]=field==='source'?'company.invoiceEmail':'0'.repeat(64);await sql`update cms_jobs set payload=${sql.json(job.payload)} where id=${job.id}`;await deliverSponsorDocumentMail(agreementDelivery);assert.equal((await sql`select status from cms_sponsor_deliveries where id=${agreementDelivery}`)[0].status,'cancelled');}
   assert.equal(requests.length,2);
  });
  await t.test('adding an explicit signer cancels company intent; a new staff send uses the established account delivery route',async()=>{
   await command('sendSponsorDocumentEmail',[agreementId,'agreement']);const membership={id:crypto.randomUUID(),sponsorId:companyId,userId:unlinked.id,roles:['signer']};await command('saveMembership',[membership],crypto.randomUUID(),admin.cookie);await deliverSponsorDocumentMail(agreementDelivery);assert.equal(requests.length,2);assert.equal((await sql`select status from cms_sponsor_deliveries where id=${agreementDelivery}`)[0].status,'cancelled');assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${agreementId} and user_id is not null`).length,0);
   await command('sendSponsorDocumentEmail',[agreementId,'agreement']);const [account]=await sql`select id,user_id from cms_sponsor_deliveries where reference_id=${agreementId} and user_id is not null`;assert.equal(account.user_id,unlinked.id);assert.equal(account.id,createHash('sha256').update('sponsor-document\0'+agreementId+'\0agreement\0'+unlinked.id).digest('hex'));
   await command('saveMembership',[{...membership,roles:['marketing']}],crypto.randomUUID(),admin.cookie);
  });
  await t.test('signed-phase notifications never fall back to company contact or attempt PDF/provider access',async()=>{
   await sql`update cms_sponsor_records set data=jsonb_set(data,'{status}','"signed"'::jsonb) where id=${agreementId}`;
   try{assert.deepEqual(await sql.begin(async tx=>{await workspaceLocks(tx);return queueSponsorDocumentMail(tx,agreementId,'signed',crypto.randomUUID(),staff.id,false);}),{queued:0,status:'cancelled'});await assert.rejects(sql.begin(async tx=>{await workspaceLocks(tx);return queueSponsorDocumentMail(tx,agreementId,'signed',crypto.randomUUID(),staff.id);}), (error:any)=>error.code==='document-mail-recipient');
    const id=crypto.randomUUID();await sql`insert into cms_sponsor_deliveries(id,sponsor_id,user_id,reference_id,kind) values (${id},${companyId},null,${agreementId},'document-signed')`;await sql`insert into cms_jobs(id,operation_id,kind,payload,run_at) values (${crypto.randomUUID()},${'fictitious-signed-guard-'+id},'sponsor-document-mail',${sql.json({deliveryId:id,actorId:staff.id})},'2200-01-01')`;await deliverSponsorDocumentMail(id);assert.equal((await sql`select status from cms_sponsor_deliveries where id=${id}`)[0].status,'cancelled');assert.equal(requests.length,2);
   }finally{await sql`update cms_sponsor_records set data=jsonb_set(data,'{status}','"awaiting-signature"'::jsonb) where id=${agreementId}`;}
  });
  await t.test('inconsistent frozen bytes fail atomically before queueing and leave no corrupt fixture',async()=>{
   const id=crypto.randomUUID(),rollback=new Error('rollback isolated invalid snapshot fixture');
   await assert.rejects(sql.begin(async tx=>{await workspaceLocks(tx);const [record]=await tx`select data,snapshot_bytes from cms_sponsor_records where id=${proposal.id}`;const snapshot=JSON.parse(record.snapshot_bytes);snapshot.sponsorEmail='tampered@example.invalid';await tx`insert into cms_sponsor_records(id,kind,sponsor_id,data,snapshot_bytes) values (${id},'proposals',${companyId},${tx.json({...record.data,id,status:'sent'})},${JSON.stringify(snapshot)})`;await assert.rejects(queueSponsorDocumentMail(tx,id,'proposal',crypto.randomUUID(),staff.id),(error:any)=>error.code==='document-integrity');assert.equal((await tx`select id from cms_sponsor_deliveries where reference_id=${id}`).length,0);throw rollback;}),(error:any)=>error===rollback);
   assert.equal((await sql`select id from cms_sponsor_records where id=${id}`).length,0);assert.equal(requests.length,2);
  });
  await t.test('a fresh agreement notification reaches the local provider using the original business intent without a PDF or portal grant',async()=>{
   await command('sendSponsorDocumentEmail',[agreementId,'agreement']);await deliverSponsorDocumentMail(agreementDelivery);assert.equal(requests.length,3);assert.equal(requests[2].body.subject,'Je sponsorovereenkomst staat klaar voor ondertekening');assert.match(requests[2].body.text,/persoonlijke toegang.*regelen/);assert.ok(!requests[2].body.html.includes('Sponsorportaal openen'));assert.equal(requests[2].body.attachments,undefined);
   const mail=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===agreementId&&row.phase==='agreement')!;assert.equal(mail.accepted,1);assert.equal(mail.recipients,2);assert.equal(mail.status,'queued');assert.ok(mail.acceptedAt);await deliverSponsorDocumentMail(agreementDelivery);assert.equal(requests.length,3);
  });
  await t.test('a company address with no auth account receives both ordinary notifications without creating an account or membership',async()=>{
   const id=crypto.randomUUID(),contact='no-account-'+crypto.randomUUID()+'@example.invalid',before=requests.length;ownedCompanies.push(id);
   assert.equal((await sql`select count(*)::int as n from auth_user where lower(email)=${contact}`)[0].n,0);
   await command('saveSponsor',[{...company(id,staff.id),email:'general-'+crypto.randomUUID()+'@example.invalid'}]);await command('saveSponsorBusinessDetails',[id,{...business,contactEmail:contact,invoiceEmail:'invoice-'+crypto.randomUUID()+'@example.invalid'},true]);await command('createSponsorProposal',[id,packageId]);
   const proposal=(await read()).state.sponsorship!.proposals.find(row=>row.sponsorId===id)!;await command('sendSponsorProposal',[proposal.id]);const [proposalMail]=await sql`select id,user_id from cms_sponsor_deliveries where reference_id=${proposal.id}`;assert.equal(proposalMail.user_id,null);await deliverSponsorDocumentMail(proposalMail.id);
   await command('createSponsorAgreement',[proposal.id]);const agreement=(await read()).state.sponsorship!.agreements.find(row=>row.proposalId===proposal.id)!;const [agreementMail]=await sql`select id,user_id from cms_sponsor_deliveries where reference_id=${agreement.id}`;assert.equal(agreementMail.user_id,null);await deliverSponsorDocumentMail(agreementMail.id);
   assert.equal(requests.length,before+2);const summary=(await read()).state.sponsorship!.documentMails!.find(row=>row.referenceId===agreement.id)!;assert.equal(summary.status,'accepted');assert.equal(summary.accepted,1);assert.equal(summary.recipients,1);
   assert.equal((await sql`select count(*)::int as n from auth_user where lower(email)=${contact}`)[0].n,0);assert.equal((await sql`select id from cms_sponsor_memberships where sponsor_id=${id}`).length,0);assert.equal((await sql`select id from cms_sponsor_signing_challenges where agreement_id=${agreement.id}`).length,0);assert.equal((await sql`select payload from cms_jobs where payload->>'deliveryId'=${agreementMail.id}`)[0].payload.businessRecipient.email,contact);
  });
 }finally{globalThis.fetch=originalFetch;}
});

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
import {deliverSponsorDocumentMail} from '../../lib/server/sponsor-document-mail';
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
 await t.test('sending without an active linked signer fails atomically; an email match and marketing role grant no delivery',async()=>{
  const before=await read(),operationId=crypto.randomUUID();
  await assert.rejects(command('sendSponsorProposal',[proposal.id],operationId),(error:any)=>error.code==='document-mail-recipient'&&error.status===422);
  const unchanged=await read(),current=unchanged.state.sponsorship!.proposals.find(row=>row.id===proposal.id)!;
  assert.equal(current.status,'draft');assert.equal(current.snapshot,undefined);assert.equal(unchanged.versions['record:'+proposal.id],before.versions['record:'+proposal.id]);
  assert.equal((await sql`select id from cms_domain_operations where id=${operationId}::uuid`).length,0);
  assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${proposal.id}`).length,0);
  await command('saveMembership',[{id:crypto.randomUUID(),sponsorId:companyId,userId:other.id,roles:['marketing']}],crypto.randomUUID(),admin.cookie);
  await assert.rejects(command('sendSponsorProposal',[proposal.id]),/Koppel eerst/);
  assert.equal((await read()).state.sponsorship!.proposals.find(row=>row.id===proposal.id)!.status,'draft');
 });
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
 await t.test('creating an agreement without a linked signer rolls back the agreement and proposal conversion',async()=>{
  await sql`update cms_sponsor_memberships set roles=array['billing']::text[] where sponsor_id=${companyId} and user_id=${signer.id}`;
  const before=await read(),operationId=crypto.randomUUID();
  try{await assert.rejects(command('createSponsorAgreement',[proposal.id],operationId),(error:any)=>error.code==='document-mail-recipient'&&error.status===422);
   const unchanged=await read();assert.ok(!unchanged.state.sponsorship!.agreements.some(row=>row.proposalId===proposal.id));assert.equal(unchanged.state.sponsorship!.proposals.find(row=>row.id===proposal.id)!.status,'sent');assert.equal(unchanged.versions['record:'+proposal.id],before.versions['record:'+proposal.id]);assert.equal((await sql`select id from cms_domain_operations where id=${operationId}::uuid`).length,0);
  }finally{await sql`update cms_sponsor_memberships set roles=array['signer']::text[] where sponsor_id=${companyId} and user_id=${signer.id}`;}
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
  await assert.rejects(command('sendSponsorDocumentEmail',[agreement.id,'agreement']),/Koppel eerst/);
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

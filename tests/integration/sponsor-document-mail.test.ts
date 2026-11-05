import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertLocalSupabaseTests,loginEmail,authCookies} from '../helpers/supabase-auth';
import {getAuth} from '../../lib/server/auth';
import {sqlClient,closeDb} from '../../db';
import {workspaceCommands} from '../../lib/server/sponsor-commands';
import {workspaceRead} from '../../lib/server/sponsor-workspace';
import {deliverSponsorDocumentMail} from '../../lib/server/sponsor-document-mail';
import type {Sponsor,SponsorBusinessDetails} from '../../lib/cms/sponsorship-types';
assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);
const base=process.env.APP_BASE_URL!,agent='document-mail-test-'+crypto.randomUUID();
const request=(cookie:string,body?:unknown)=>new Request(new URL('/api/cms/sponsor-workspace?mode=sponsorship',base),{method:body?'POST':'GET',headers:{cookie,origin:new URL(base).origin,'content-type':'application/json','user-agent':agent},...(body?{body:JSON.stringify(body)}:{})});
async function fixture(role:string){const email='document-mail-'+crypto.randomUUID()+'@example.invalid';const {user}=await getAuth().api.createUser({body:{email,name:'Fictieve documentmail',password:crypto.randomUUID()+crypto.randomUUID()}});await sql`insert into cms_memberships(user_id,role_id) values (${user.id},${role})`;return {...user,cookie:authCookies(await loginEmail(email))};}
const company=(id:string,ownerId:string):Sponsor=>({id,name:'Fictieve documentmail BV',companyNumber:'12345678',vatNumber:'',address:'Teststraat 1',postalCode:'1234 AB',city:'Den Haag',email:'unlinked@example.invalid',phone:'',website:'',description:'',logoUrl:'',ownerId,stage:'lead',notes:'',publicProfile:{name:'Fictief',description:'',website:'',logoUrl:''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false});
const business:SponsorBusinessDetails={legalName:'Fictieve documentmail BV',companyNumber:'12345678',registrationExempt:false,registrationExemptionReason:'',vatNumber:'',vatStatus:'not-applicable',address:'Teststraat 1',postalCode:'1234 AB',city:'Den Haag',country:'NL',contactName:'Fictief',contactFunction:'Directeur',contactEmail:'unlinked@example.invalid',invoiceEmail:'unlinked@example.invalid',phone:'',confirmedAt:'',confirmedBy:'',updatedAt:''};
test('document mail: explicit intent, real queued delivery, failure, current recipient rights and permanent deduplication',async t=>{
 const staff=await fixture('sponsorcommissie'),admin=await fixture('admin'),signer=await fixture('sponsor'),other=await fixture('sponsor'),companyId=crypto.randomUUID();
 const read=()=>workspaceRead(request(staff.cookie));
 async function command(name:string,args:unknown[],operationId=crypto.randomUUID(),cookie=staff.cookie){const data=await read(),body={operationId,mode:'sponsorship',companyId:'',versions:data.versions,commands:[{name,args,offset:0}]};const result=await workspaceCommands(request(cookie,body),body);await sql`update cms_jobs set run_at='2200-01-01' where kind='sponsor-document-mail' and payload->>'deliveryId' in (select id from cms_sponsor_deliveries where sponsor_id=${companyId}) and status='pending'`;return {body,result};}
 await command('saveSponsor',[company(companyId,staff.id)]);await command('saveSponsorBusinessDetails',[companyId,business,true]);
 const itemId=crypto.randomUUID(),packageId=crypto.randomUUID();await command('saveSponsorItem',[{id:itemId,name:'Fictief bord',description:'Test',kind:'board',priceCents:10000,taxRate:'21',capacity:0,period:'season',active:true}]);await command('saveSponsorPackage',[{id:packageId,name:'Fictief pakket',description:'Test',itemIds:[itemId],priceCents:10000,taxRate:'21',active:true}]);await command('createSponsorProposal',[companyId,packageId]);const proposal=(await read()).state.sponsorship!.proposals.find(row=>row.sponsorId===companyId)!;
 await command('sendSponsorProposal',[proposal.id]);
 await t.test('freezing is truthful: no document mail exists until explicit send; no account matching',async()=>{
  assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${proposal.id}`).length,0);
  await assert.rejects(command('sendSponsorDocumentEmail',[proposal.id,'proposal']),/Koppel eerst een actieve tekenbevoegde/);
  await command('saveMembership',[{id:crypto.randomUUID(),sponsorId:companyId,userId:other.id,roles:['marketing']}],crypto.randomUUID(),admin.cookie);
  await assert.rejects(command('sendSponsorDocumentEmail',[proposal.id,'proposal']),/Koppel eerst/);
 });
 await command('saveMembership',[{id:crypto.randomUUID(),sponsorId:companyId,userId:signer.id,roles:['signer']}],crypto.randomUUID(),admin.cookie);
 let deliveryId='',cachedSend:any;
 await t.test('explicit send queues exactly once across same/different operation IDs; unauthorized actor cannot send',async()=>{
  const first=await command('sendSponsorDocumentEmail',[proposal.id,'proposal']);cachedSend=first.body;assert.equal(first.result.mailStatus,'queued');
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
 await command('createSponsorAgreement',[proposal.id]);const agreement=(await read()).state.sponsorship!.agreements.find(row=>row.proposalId===proposal.id)!;
 await t.test('existing agreement can explicitly queue; revocation before worker cancels without provider call',async()=>{
  assert.equal((await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id}`).length,0);
  await command('sendSponsorDocumentEmail',[agreement.id,'agreement']);const [delivery]=await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id}`;
  await sql`update cms_sponsor_memberships set roles=array['billing']::text[] where sponsor_id=${companyId} and user_id=${signer.id}`;
  const saved=globalThis.fetch;globalThis.fetch=async(input,init)=>{if(String(input).startsWith(process.env.TEST_MAIL_API_URL!))throw new Error('Revoked recipient must not reach provider');return saved(input,init);};try{await deliverSponsorDocumentMail(delivery.id);}finally{globalThis.fetch=saved;}
  assert.equal((await sql`select status from cms_sponsor_deliveries where id=${delivery.id}`)[0].status,'cancelled');
  await assert.rejects(command('sendSponsorDocumentEmail',[agreement.id,'agreement']),/Koppel eerst/);
 });
 await t.test('revoking the requesting staff member before worker execution cancels the queued message',async()=>{
  await sql`update cms_sponsor_memberships set roles=array['signer']::text[] where sponsor_id=${companyId} and user_id=${signer.id}`;
  await command('sendSponsorDocumentEmail',[agreement.id,'agreement']);const [delivery]=await sql`select id from cms_sponsor_deliveries where reference_id=${agreement.id}`;
  await sql`update cms_memberships set role_id='sponsor' where user_id=${staff.id}`;
  try{await assert.rejects(workspaceCommands(request(staff.cookie,cachedSend),cachedSend),/geen rechten/);await deliverSponsorDocumentMail(delivery.id);}finally{await sql`update cms_memberships set role_id='sponsorcommissie' where user_id=${staff.id}`;}
  assert.equal((await sql`select status from cms_sponsor_deliveries where id=${delivery.id}`)[0].status,'cancelled');
 });
 await t.test('a queued proposal superseded by an agreement cancels instead of sending stale content',async()=>{
  await sql`update cms_sponsor_deliveries set status='queued',delivered_at=null where id=${deliveryId}`;await deliverSponsorDocumentMail(deliveryId);assert.equal((await sql`select status from cms_sponsor_deliveries where id=${deliveryId}`)[0].status,'cancelled');
 });
});

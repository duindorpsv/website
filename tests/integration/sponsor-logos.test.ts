import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {assertLocalSupabaseTests,loginEmail,authCookies} from '../helpers/supabase-auth';
import {getAuth} from '../../lib/server/auth';
import {sqlClient,closeDb} from '../../db';
import {workspaceCommands} from '../../lib/server/sponsor-commands';
import {workspaceRead} from '../../lib/server/sponsor-workspace';
import {sponsorLogoUpload,sponsorLogoPreview,cancelSponsorLogoUpload,cleanSponsorLogoUploads} from '../../lib/server/sponsor-logos';
import {sponsorDownload,publicSponsorLogo} from '../../lib/server/sponsor-files';
import {getObject} from '../../lib/server/storage';
import type {Sponsor} from '../../lib/cms/sponsorship-types';

assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);
const base=process.env.APP_BASE_URL!,origin=new URL(base).origin;
const request=(cookie:string,method='GET',body?:BodyInit)=>new Request(new URL('/api/sponsorship/test',base),{method,headers:{cookie,origin,'content-type':'image/png','x-file-name':'Fictief transparant logo.png'},...(body?{body}:{})});
async function fixture(){const email='logo-'+crypto.randomUUID()+'@example.invalid';const {user}=await getAuth().api.createUser({body:{email,name:'Fictieve logobeheerder',password:crypto.randomUUID()+crypto.randomUUID()}});await sql`insert into cms_memberships(user_id,role_id) values (${user.id},'sponsorcommissie')`;return {...user,cookie:authCookies(await loginEmail(email))};}
const company=(id:string,ownerId:string,logoUrl:string):Sponsor=>({id,name:'Fictief logotestbedrijf',companyNumber:'',vatNumber:'',address:'',postalCode:'',city:'',email:'',phone:'',website:'',description:'Fictief voor geïsoleerde tests',logoUrl,ownerId,stage:'lead',notes:'',publicProfile:{name:'Fictief logotestbedrijf',description:'',website:'',logoUrl:''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false});
async function save(cookie:string,value:Sponsor){
 const current=await workspaceRead(new Request(new URL('/workspace?mode=sponsorship',base),{headers:{cookie}}));
 const body={operationId:crypto.randomUUID(),mode:'sponsorship',companyId:'',versions:current.versions,commands:[{name:'saveSponsor',args:[value],offset:0}]};
 return workspaceCommands(new Request(new URL('/commands',base),{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}),body);
}

test('temporary sponsor logos remain context-bound until a successful relationship transaction, then retain their private stable file',async t=>{
 const actor=await fixture(),other=await fixture(),sponsorId=crypto.randomUUID();
 const png=await sharp({create:{width:1800,height:900,channels:4,background:{r:10,g:40,b:180,alpha:.25}}}).png().toBuffer();
 const uploaded=await sponsorLogoUpload(request(actor.cookie,'POST',png),sponsorId),[temporary]=await sql`select * from cms_sponsor_logo_uploads where id=${uploaded.id}`;
 assert.ok(temporary);assert.equal(temporary.sponsor_id,sponsorId);assert.equal((await sql`select id from cms_sponsor_companies where id=${sponsorId}`).length,0);assert.equal((await sql`select id from cms_sponsor_files where id=${uploaded.id}`).length,0);
 await t.test('preview is private, pixel-limited and unavailable to another staff account or a different session',async()=>{
  const preview=await sponsorLogoPreview(request(actor.cookie),uploaded.id),metadata=await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
  assert.equal(preview.headers.get('cache-control'),'private, no-store');assert.equal(metadata.width,640);assert.equal(metadata.height,320);assert.equal(metadata.hasAlpha,true);
  await assert.rejects(sponsorLogoPreview(request(other.cookie),uploaded.id),(error:any)=>error.status===404);
  const secondCookie=authCookies(await loginEmail(actor.email));await assert.rejects(sponsorLogoPreview(request(secondCookie),uploaded.id),(error:any)=>error.status===404);
  await assert.rejects(save(secondCookie,company(sponsorId,actor.id,uploaded.url)),(error:any)=>error.code==='file-scope');
 });
 await t.test('wrong company and failed validation leave both the unsaved relationship and the upload intact',async()=>{
  await assert.rejects(save(actor.cookie,company(crypto.randomUUID(),actor.id,uploaded.url)),(error:any)=>error.code==='file-scope');
  for(const url of [uploaded.url+'?download=1',new URL(uploaded.url,base).href,uploaded.url.replace('/logos/','/previews/'),uploaded.url.replace('/logos/','/files/')])await assert.rejects(save(actor.cookie,company(crypto.randomUUID(),actor.id,url)),(error:any)=>error.code==='file-scope');
  await assert.rejects(save(actor.cookie,company(sponsorId,actor.id,'DATA:image/png;base64,aGVsbG8=')),(error:any)=>error.code==='upload-required');
  await assert.rejects(save(actor.cookie,{...company(sponsorId,actor.id,uploaded.url),name:''}));
  assert.equal((await sql`select id from cms_sponsor_logo_uploads where id=${uploaded.id}`).length,1);assert.equal((await sql`select id from cms_sponsor_companies where id=${sponsorId}`).length,0);
 });
 await t.test('successful storage atomically claims the file without publication and cancellation cannot remove it',async()=>{
  await save(actor.cookie,company(sponsorId,actor.id,new URL(uploaded.url,base).href+'?preview=1'));assert.equal((await sql`select id from cms_sponsor_logo_uploads where id=${uploaded.id}`).length,0);
  const [file]=await sql`select * from cms_sponsor_files where id=${uploaded.id}`;assert.equal(file.kind,'logo');assert.equal(file.storage_key,temporary.storage_key);assert.equal(file.sponsor_id,sponsorId);
  assert.equal((await sql`select data->>'logoUrl' as url from cms_sponsor_companies where id=${sponsorId}`)[0].url,uploaded.url);
  assert.equal((await sql`select data->>'publicEnabled' as public from cms_sponsor_companies where id=${sponsorId}`)[0].public,'false');await assert.rejects(publicSponsorLogo(uploaded.id),(error:any)=>error.status===404);
  const response=await sponsorDownload(request(actor.cookie),uploaded.id,true);assert.equal(response.headers.get('content-type'),'image/webp');
  await cancelSponsorLogoUpload(request(actor.cookie,'DELETE'),uploaded.id);assert.ok((await getObject(file.storage_key)).length);assert.equal((await sql`select id from cms_sponsor_files where id=${uploaded.id}`).length,1);
 });
 await t.test('explicit cancellation and expiry remove only temporary objects, including a pending new relationship',async()=>{
  const cancelled=await sponsorLogoUpload(request(actor.cookie,'POST',png),crypto.randomUUID()),[cancelledRow]=await sql`select storage_key from cms_sponsor_logo_uploads where id=${cancelled.id}`;
  await cancelSponsorLogoUpload(request(other.cookie,'DELETE'),cancelled.id);assert.equal((await sql`select id from cms_sponsor_logo_uploads where id=${cancelled.id}`).length,1);
  await cancelSponsorLogoUpload(request(actor.cookie,'DELETE'),cancelled.id);await cancelSponsorLogoUpload(request(actor.cookie,'DELETE'),cancelled.id);assert.equal((await sql`select id from cms_sponsor_logo_uploads where id=${cancelled.id}`).length,0);await assert.rejects(getObject(cancelledRow.storage_key));
  const expired=await sponsorLogoUpload(request(actor.cookie,'POST',png),crypto.randomUUID()),[expiredRow]=await sql`select storage_key from cms_sponsor_logo_uploads where id=${expired.id}`;
  await sql`update cms_sponsor_logo_uploads set expires_at=now()-interval '1 second' where id=${expired.id}`;await assert.rejects(sponsorLogoPreview(request(actor.cookie),expired.id),(error:any)=>error.status===404);await cleanSponsorLogoUploads();assert.equal((await sql`select id from cms_sponsor_logo_uploads where id=${expired.id}`).length,0);await assert.rejects(getObject(expiredRow.storage_key));assert.ok((await getObject(temporary.storage_key)).length);
 });
 await t.test('server upload rejects disguised SVG and revoked write access',async()=>{
  await assert.rejects(sponsorLogoUpload(request(actor.cookie,'POST',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),sponsorId),(error:any)=>error.code==='upload-type');
  await sql`update cms_memberships set active=false where user_id=${other.id}`;
  await assert.rejects(sponsorLogoUpload(request(other.cookie,'POST',png),sponsorId),(error:any)=>error.status===403);
 });
 await t.test('a simultaneous relationship commit and cancellation cannot leave a stored logo pointing at deleted pixels',async()=>{
  const id=crypto.randomUUID(),pending=await sponsorLogoUpload(request(actor.cookie,'POST',png),id);
  const results=await Promise.allSettled([save(actor.cookie,company(id,actor.id,pending.url)),cancelSponsorLogoUpload(request(actor.cookie,'DELETE'),pending.id)]);
  assert.equal(results[1].status,'fulfilled');
  const [stored]=await sql`select data from cms_sponsor_companies where id=${id}`;
  if(stored){assert.equal(results[0].status,'fulfilled');const [file]=await sql`select storage_key from cms_sponsor_files where id=${pending.id}`;assert.ok(file);assert.ok((await getObject(file.storage_key)).length);}
  else{assert.equal(results[0].status,'rejected');assert.equal((await sql`select id from cms_sponsor_logo_uploads where id=${pending.id}`).length,0);assert.equal((await sql`select id from cms_sponsor_files where id=${pending.id}`).length,0);}
 });
});

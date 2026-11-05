import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {sqlClient} from '../../db';
import {bodyBytes,CmsError} from './errors';
import {workspaceActor,freshActor,workspaceLocks,workspaceRate,requireWrite,type WorkspaceActor} from './sponsor-access';
import {sponsorStaff} from './sponsor-store';
import {verifyOrigin,type Principal} from './permissions';
import {getObject,putObject,deleteObject,listObjects} from './storage';

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const sessionFingerprint=(actor:WorkspaceActor)=>sha(actor.session.session.id);
const logoId=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,190}$/;
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

async function logoAccess(tx:any,p:Principal,sponsorId:string){
 if(!logoId.test(sponsorId))throw new CmsError('validation','Deze relatie-identificatie is ongeldig.',422);
 if(sponsorStaff(p)){
  const [company]=await tx`select id from cms_sponsor_companies where id=${sponsorId}`;
  requireWrite(p,'sponsors',company?'update':'create');return;
 }
 const [link]=await tx`select roles from cms_sponsor_memberships where sponsor_id=${sponsorId} and user_id=${p.id}`;
 if(!link?.roles?.includes('marketing'))throw new CmsError('forbidden','Je hebt geen rechten om voor dit bedrijf een logo aan te leveren.',403);
}

/** Check both the claimed type and the actual signature before decoding pixels. */
export async function prepareSponsorLogo(bytes:Uint8Array,mime:string){
 if(!bytes.length)throw new CmsError('upload-empty','Kies een bestand.',422);
 if(bytes.length>8*1024*1024)throw new CmsError('too-large','Kies een logo van maximaal 8 MB.',413);
 const input=Buffer.from(bytes);
 const detected=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
  input[0]===0xff&&input[1]===0xd8&&input[2]===0xff?'image/jpeg':
  input.subarray(0,4).toString()==='RIFF'&&input.subarray(8,12).toString()==='WEBP'?'image/webp':'';
 if(!detected||mime!==detected)throw new CmsError('upload-type','Kies een geldig PNG-, JPG- of WebP-bestand.',422);
 try{
  const image=sharp(bytes,{limitInputPixels:48_000_000,failOn:'warning'}),metadata=await image.metadata();
  if(!metadata.width||!metadata.height||!['png','jpeg','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw new Error('Invalid image');
  // Pixel re-encoding drops source metadata and keeps supported transparency.
  return await image.rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
 }catch{throw new CmsError('upload-image','Dit logo kan niet veilig worden geopend. Kies een kleinere, geldige afbeelding.',422);}
}

export async function sponsorLogoUpload(request:Request,sponsorId:string){
 verifyOrigin(request);const actor=await workspaceActor(request.headers),sql=sqlClient();
 await logoAccess(sql,actor.p,sponsorId);await workspaceRate('sponsor:logo:'+actor.p.id,30,3600);
 const bytes=await bodyBytes(request,8*1024*1024),data=await prepareSponsorLogo(bytes,request.headers.get('content-type')?.split(';')[0].toLowerCase()||'');
 const id=randomUUID(),key='sponsorship/logos/'+id+'.webp';
 const name=(request.headers.get('x-file-name')||'bedrijfslogo').replace(/[^\p{L}\p{N} ._()-]/gu,'').slice(0,150)||'bedrijfslogo';
 await putObject(key,data,'image/webp');
 try{
  await sql.begin(async tx=>{
   await workspaceLocks(tx);const p=await freshActor(tx,actor);await logoAccess(tx,p,sponsorId);
   if(request.signal.aborted)throw new CmsError('upload-cancelled','De logoselectie is geannuleerd.',409);
   await tx`insert into cms_sponsor_logo_uploads(id,sponsor_id,storage_key,file_hash,bytes,name,created_by,session_fingerprint,expires_at) values (${id},${sponsorId},${key},${sha(data)},${data.length},${name},${p.id},${sessionFingerprint(actor)},clock_timestamp()+interval '1 hour')`;
  });
 }catch(error){await deleteObject(key);throw error;}
 return {id,url:'/api/sponsorship/logos/'+id,previewUrl:'/api/sponsorship/logo-uploads/'+id,name,mime:'image/webp'};
}

async function ownUpload(tx:any,actor:WorkspaceActor,id:string){
 const p=await freshActor(tx,actor);
 const [upload]=await tx`select * from cms_sponsor_logo_uploads where id=${id} and created_by=${p.id} and session_fingerprint=${sessionFingerprint(actor)} and expires_at>clock_timestamp() for update`;
 if(!upload)throw new CmsError('missing','De tijdelijke logoselectie is verlopen of niet beschikbaar.',404);
 await logoAccess(tx,p,upload.sponsor_id);return upload;
}

export async function sponsorLogoPreview(request:Request,id:string){
 const actor=await workspaceActor(request.headers),sql=sqlClient();
 const upload=await sql.begin(tx=>ownUpload(tx,actor,id)),bytes=await getObject(upload.storage_key);
 if(sha(bytes)!==upload.file_hash)throw new CmsError('file-integrity','Het logo kon niet worden gecontroleerd.',409);
 await sql.begin(tx=>ownUpload(tx,actor,id));
 return new Response(bytes as BodyInit,{headers:{...privateHeaders,'Content-Type':'image/webp','Content-Security-Policy':"sandbox; default-src 'none'"}});
}

export async function cancelSponsorLogoUpload(request:Request,id:string){
 verifyOrigin(request);const actor=await workspaceActor(request.headers);
 const key=await sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);
  const [upload]=await tx`select * from cms_sponsor_logo_uploads where id=${id} and created_by=${p.id} and session_fingerprint=${sessionFingerprint(actor)} for update`;
  // Successful relation saves claim the file first. Cancelling afterwards must
  // never delete the committed logo, and repeated cancellation is harmless.
  if(!upload)return null;
  // Commit the claim prohibition before removing pixels. A failed DB commit
  // must never leave a live selection pointing at an already-deleted object.
  await tx`update cms_sponsor_logo_uploads set expires_at=least(expires_at,clock_timestamp()) where id=${id}`;
  return upload.storage_key as string;
 });
 if(key){await deleteObject(key);await sqlClient()`delete from cms_sponsor_logo_uploads where id=${id} and expires_at<=clock_timestamp()`;}
 return {ok:true};
}

/** Called while the command holds the shared business transaction locks. */
export async function checkSponsorLogoReference(tx:any,actor:WorkspaceActor,p:Principal,id:string,sponsorId:string,allowTemporary:boolean){
 const [file]=await tx`select sponsor_id,mime,kind from cms_sponsor_files where id=${id}`;
 if(file){if(file.sponsor_id!==sponsorId||file.mime!=='image/webp'||!['logo','material'].includes(file.kind))throw new CmsError('file-scope','Dit logo hoort niet bij het gekozen bedrijf.',403);return false;}
 if(!allowTemporary)throw new CmsError('file-scope','Dit logo hoort niet bij het gekozen bedrijf.',403);
 const [upload]=await tx`select * from cms_sponsor_logo_uploads where id=${id} and sponsor_id=${sponsorId} and created_by=${p.id} and session_fingerprint=${sessionFingerprint(actor)} and expires_at>clock_timestamp() for update`;
 if(!upload)throw new CmsError('file-scope','Deze tijdelijke logoselectie hoort niet bij deze relatie en sessie, of is verlopen.',403);
 return true;
}

export async function claimSponsorLogoUploads(tx:any,actor:WorkspaceActor,ids:Set<string>){
 for(const id of ids){
  const [upload]=await tx`select * from cms_sponsor_logo_uploads where id=${id} and created_by=${actor.p.id} and session_fingerprint=${sessionFingerprint(actor)} and expires_at>clock_timestamp() for update`;
  if(!upload)throw new CmsError('upload-expired','De logoselectie is verlopen. Kies het logo opnieuw.',409);
  await tx`insert into cms_sponsor_files(id,sponsor_id,kind,storage_key,file_hash,bytes,mime,name,created_by) values (${id},${upload.sponsor_id},'logo',${upload.storage_key},${upload.file_hash},${upload.bytes},'image/webp',${upload.name},${actor.p.id})`;
  await tx`delete from cms_sponsor_logo_uploads where id=${id}`;
 }
}

/** Worker cleanup also covers interrupted requests between object and row writes. */
export async function cleanSponsorLogoUploads(){
 const sql=sqlClient();await sql.begin(async tx=>{
  await workspaceLocks(tx);
  const expired=await tx`select id,storage_key from cms_sponsor_logo_uploads where expires_at<=clock_timestamp() order by expires_at for update skip locked limit 100`;
  for(const upload of expired){await deleteObject(upload.storage_key);await tx`delete from cms_sponsor_logo_uploads where id=${upload.id}`;}
 });
 for(const object of await listObjects('sponsorship/logos/'))if(Date.now()-object.at.getTime()>48*3600000){
  const [registered]=await sql`select storage_key from cms_sponsor_files where storage_key=${object.key} union all select storage_key from cms_sponsor_logo_uploads where storage_key=${object.key} limit 1`;
  if(!registered)await deleteObject(object.key);
 }
}

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {sqlClient} from '../../db';
import {bodyBytes,CmsError} from './errors';
import {workspaceActor,freshActor,workspaceLocks,requireWrite,type WorkspaceActor} from './sponsor-access';
import {sponsorStaff,readDomainStore,digestText} from './sponsor-store';
import {getObject,putObject,deleteObject} from './storage';
import {buildSponsorAgreementPdf} from '../cms/sponsor-pdf';
import {actorPrincipal,verifyOrigin} from './permissions';
import type {Principal} from './permissions';
const binaryHash=(bytes:Uint8Array)=>requireHash(bytes);
import {createHash} from 'node:crypto';
function requireHash(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}
async function fileAccess(tx:any,p:Principal,sponsorId:string,kind:string){
 if(sponsorStaff(p))return;
 const [link]=await tx`select roles from cms_sponsor_memberships where sponsor_id=${sponsorId} and user_id=${p.id}`;
 const roles:string[]=link?.roles||[];
 const okay=kind.startsWith('agreement')?roles.some(r=>r==='signer'||r==='billing'):kind==='invoice'?roles.includes('billing'):roles.includes('marketing');
 if(!okay)throw new CmsError('forbidden','Dit bestand is niet beschikbaar voor jouw account.',403);
}
export async function sponsorUpload(request:Request,sponsorId:string){
 verifyOrigin(request);const actor=await workspaceActor(request.headers),p=actor.p;
 const sql=sqlClient();await fileAccess(sql,p,sponsorId,'material');if(sponsorStaff(p))requireWrite(p,'sponsors');
 const bytes=await bodyBytes(request,15*1024*1024);if(!bytes.length)throw new CmsError('upload-empty','Kies een bestand.',422);
 const mime=request.headers.get('content-type')?.split(';')[0]||'',name=(request.headers.get('x-file-name')||'materiaal').replace(/[^\p{L}\p{N} ._()-]/gu,'').slice(0,150)||'materiaal';
 let data:Uint8Array=bytes,type=mime;
 if(['image/png','image/jpeg','image/webp'].includes(mime)){
  try{data=await sharp(bytes,{limitInputPixels:30_000_000}).rotate().resize({width:2500,height:2500,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();type='image/webp';}catch{throw new CmsError('upload-image','Deze afbeelding kan niet veilig worden verwerkt.',422);}
 }else if(mime!=='application/pdf'||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')throw new CmsError('upload-type','Gebruik PNG, JPG, WebP of PDF.',422);
 const id=randomUUID(),key='sponsorship/'+digestText(sponsorId)+'/materials/'+id+(type==='image/webp'?'.webp':'.pdf');
 await putObject(key,data,type);
 try{await sql.begin(async tx=>{await workspaceLocks(tx);const current=await freshActor(tx,actor);await fileAccess(tx,current,sponsorId,'material');if(sponsorStaff(current))requireWrite(current,'sponsors');await tx`insert into cms_sponsor_files(id,sponsor_id,kind,storage_key,file_hash,bytes,mime,name,created_by) values (${id},${sponsorId},'material',${key},${binaryHash(data)},${data.length},${type},${name},${p.id})`;});}
 catch(error){await deleteObject(key);throw error;}
 return {id,url:'/api/sponsorship/files/'+id,name,mime:type};
}
async function authorizedFile(actor:WorkspaceActor,id:string){return sqlClient().begin(async tx=>{const p=await freshActor(tx,actor);const [file]=await tx`select * from cms_sponsor_files where id=${id}`;if(!file)throw new CmsError('missing','Bestand niet gevonden.',404);await fileAccess(tx,p,file.sponsor_id,file.kind);return file;});}
export async function sponsorDownload(request:Request,id:string,inline=false){
 const actor=await workspaceActor(request.headers),file=await authorizedFile(actor,id),bytes=await getObject(file.storage_key);
 if(binaryHash(bytes)!==file.file_hash)throw new CmsError('file-integrity','Het bestand kon niet worden gecontroleerd.',409);
 const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new CmsError('forbidden','Je toegang is gewijzigd.',403);await authorizedFile(current,id);
 return new Response(bytes as BodyInit,{headers:{'Content-Type':file.mime,'Content-Disposition':`${inline&&file.mime==='image/webp'?'inline':'attachment'}; filename="${file.mime==='application/pdf'?'Duindorp-SV-document.pdf':'Duindorp-SV-materiaal.webp'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
async function pdfAssets(){const root=join(process.cwd(),'public');const [logoPng,bodyFont,boldFont,headingFont,brushFont]=await Promise.all(['assets/logo.png','fonts/club-font-4.ttf','fonts/club-font-7.ttf','fonts/club-font-3.ttf','fonts/club-font-9.ttf'].map(path=>readFile(join(root,path))));return {logoPng,bodyFont,boldFont,headingFont,brushFont};}
async function agreementContext(p:Principal,id:string){return sqlClient().begin(async tx=>{
 const [record]=await tx`select sponsor_id from cms_sponsor_records where id=${id} and kind='agreements'`;if(!record)throw new CmsError('missing','Overeenkomst niet gevonden.',404);
 await fileAccess(tx,p,record.sponsor_id,'agreement');const store=await readDomainStore(tx,p,{portal:!sponsorStaff(p),companyId:record.sponsor_id});return store;
});}
export async function sponsorAgreementDownload(request:Request,id:string){
 const actor=await workspaceActor(request.headers),store=await agreementContext(actor.p,id),agreement=store.state.sponsorship!.agreements.find(a=>a.id===id)!;
 if(agreement.status==='signed'&&agreement.signingMode==='dual-email-otp'){
  const [file]=await sqlClient()`select id from cms_sponsor_files where agreement_id=${id} and kind='agreement-final'`;
  if(!file)throw new CmsError('pdf-pending','De definitieve PDF wordt veilig gearchiveerd. Probeer het over enkele ogenblikken opnieuw.',409);
  return sponsorDownload(request,file.id);
 }
 const bytes=await buildSponsorAgreementPdf(store.state,actor.p.id,id,{assets:await pdfAssets()});
 const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new CmsError('forbidden','Je toegang is gewijzigd.',403);await agreementContext(current.p,id);
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Duindorp-SV-Overeenkomst.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
/** A signed immutable document is archived once, independent of portal activity. */
export async function archiveSponsorAgreement(id:string,actorId:string){
 const sql=sqlClient();const [existing]=await sql`select id from cms_sponsor_files where agreement_id=${id} and kind='agreement-final'`;if(existing)return;
 // This internal worker job was queued by the second verified signature. The
 // worker renders the sealed record, without granting any human extra access.
 const system:Principal={id:actorId,name:'Documentarchief',email:'',roleId:'archive-worker',teamScoped:false,teams:[],departments:[],grants:[{module:'sponsors',action:'*'}],mfa:false};
 const store=await readDomainStore(sql,system);const agreement=store.state.sponsorship!.agreements.find(a=>a.id===id);
 if(!agreement||agreement.status!=='signed'||agreement.signatures.length!==2||agreement.signatures.some(s=>s.verification!=='email-otp'||s.demo))throw new CmsError('pdf-not-signed','De overeenkomst heeft nog geen twee geldige ondertekeningen.',409);
 const roleId='archive-renderer';store.state.roles.push({id:roleId,name:'Interne documentverwerking',permissions:['sponsors'],teamScoped:false,description:''});store.state.members=store.state.members.filter(m=>m.id!==actorId);store.state.members.push({id:actorId,name:'Documentarchief',email:'',roleId,teamIds:[],active:true});
 const bytes=await buildSponsorAgreementPdf(store.state,actorId,id,{assets:await pdfAssets()}),fileId=randomUUID(),key='sponsorship/'+digestText(agreement.sponsorId)+'/agreements/'+digestText(id)+'/'+fileId+'.pdf';
 await putObject(key,bytes,'application/pdf');
 try{const inserted=await sql.begin(async tx=>{await workspaceLocks(tx);const [current]=await tx`select data,snapshot_bytes from cms_sponsor_records where id=${id}`;
  if(current?.data.status!=='signed'||digestText(current.snapshot_bytes)!==agreement.documentHash)throw new CmsError('document-integrity','Het vaste document is niet intact.',409);
  return tx`insert into cms_sponsor_files(id,sponsor_id,agreement_id,kind,storage_key,file_hash,bytes,mime,name,document_hash,created_by) values (${fileId},${agreement.sponsorId},${id},'agreement-final',${key},${binaryHash(bytes)},${bytes.length},'application/pdf',${agreement.number+'.pdf'},${agreement.documentHash},${actorId}) on conflict do nothing returning id`;
 });if(!inserted.length)await deleteObject(key);}catch(error){await deleteObject(key);throw error;}
}
export async function publicSponsorLogo(id:string){
 const [file]=await sqlClient()`select f.* from cms_sponsor_files f join cms_sponsor_companies c on c.id=f.sponsor_id where f.id=${id} and f.mime='image/webp' and f.kind='material' and c.data->>'publicEnabled'='true' and c.data#>>'{publicProfile,logoUrl}'=${'/api/sponsorship/logos/'+id} and (coalesce(c.data->>'publicFrom','')='' or (c.data->>'publicFrom')::date<=current_date) and (coalesce(c.data->>'publicUntil','')='' or (c.data->>'publicUntil')::date>=current_date)`;
 if(!file)throw new CmsError('missing','Logo niet beschikbaar.',404);const bytes=await getObject(file.storage_key);if(binaryHash(bytes)!==file.file_hash)throw new CmsError('file-integrity','Logo niet beschikbaar.',409);
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}

export async function sponsorInvoiceDownload(request:Request,id:string){
 const actor=await workspaceActor(request.headers);
 const [record]=await sqlClient()`select sponsor_id,data from cms_sponsor_records where id=${id} and kind='invoices'`;
 if(!record)throw new CmsError('missing','Factuur niet gevonden.',404);await fileAccess(sqlClient(),actor.p,record.sponsor_id,'invoice');
 const store=await agreementContext(actor.p,record.data.agreementId),invoice=store.state.sponsorship!.invoices.find(i=>i.id===id),agreement=store.state.sponsorship!.agreements.find(a=>a.id===record.data.agreementId);
 if(!invoice||!agreement)throw new CmsError('missing','Factuur niet beschikbaar.',404);
 const {buildSponsorInvoicePdf}=await import('../cms/sponsor-pdf'),bytes=await buildSponsorInvoicePdf(invoice,agreement,{assets:await pdfAssets()});
 const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new CmsError('forbidden','Je toegang is gewijzigd.',403);await fileAccess(sqlClient(),current.p,record.sponsor_id,'invoice');
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Duindorp-SV-Factuur.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

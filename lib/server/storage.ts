import {S3Client,PutObjectCommand,GetObjectCommand,HeadBucketCommand,GetBucketAclCommand,GetBucketPolicyCommand,DeleteObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {mkdir,writeFile,readFile,unlink,access,readdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {env} from './env';
function file(key:string){if(!/^[a-zA-Z0-9/_\-.]+$/.test(key)||key.split('/').includes('..'))throw new Error('Ongeldige opslagsleutel.');const root=resolve(env().MEDIA_ROOT),path=resolve(root,key);if(!path.startsWith(root+'/'))throw new Error('Ongeldige opslagsleutel.');return path;}
function s3(){const c=env();return new S3Client({region:c.S3_REGION,endpoint:c.S3_ENDPOINT,forcePathStyle:!!c.S3_ENDPOINT,credentials:{accessKeyId:c.S3_ACCESS_KEY_ID!,secretAccessKey:c.S3_SECRET_ACCESS_KEY!}});}
export async function putObject(key:string,bytes:Uint8Array,mime:string){const c=env();if(c.MEDIA_DRIVER==='s3')await s3().send(new PutObjectCommand({Bucket:c.S3_BUCKET,Key:key,Body:bytes,ContentType:mime}));else{const path=file(key);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{mode:0o600});}}
export async function getObject(key:string):Promise<Uint8Array>{if(env().MEDIA_DRIVER==='s3'){const response=await s3().send(new GetObjectCommand({Bucket:env().S3_BUCKET,Key:key}));if(!response.Body)throw new Error('Bestand ontbreekt.');return response.Body.transformToByteArray();}return readFile(file(key));}
export async function deleteObject(key:string){if(env().MEDIA_DRIVER==='s3')await s3().send(new DeleteObjectCommand({Bucket:env().S3_BUCKET,Key:key}));else await unlink(file(key)).catch(()=>{});}
export async function storageReady(){
 const c=env();
 if(c.MEDIA_DRIVER==='s3'){
  const client=s3(),Bucket=c.S3_BUCKET;
  await client.send(new HeadBucketCommand({Bucket}));
  // Production uses Hetzner. Its visibility is controlled by both ACLs and
  // bucket policies; HeadBucket alone also succeeds for a public bucket.
  if(c.APP_ENV==='production'){
   const acl=await client.send(new GetBucketAclCommand({Bucket}));
   if(!acl.Grants?.length||acl.Grants.some(grant=>grant.Grantee?.Type!=='CanonicalUser'||!grant.Grantee.ID))throw new Error('S3 vereist een privébucket zonder publieke ACL.');
   let policy:string|undefined;
   try{policy=(await client.send(new GetBucketPolicyCommand({Bucket}))).Policy;}
   catch(error){if((error as {name?:string}).name!=='NoSuchBucketPolicy')throw error;return;}
   const statements=JSON.parse(policy||'null')?.Statement;
   const rules=Array.isArray(statements)?statements:statements?[statements]:null;
   // Conservatively reject wildcard grants, including conditional public
   // access. Keep permission errors and malformed policies fail-closed.
   if(!rules||rules.some(rule=>!['Allow','Deny'].includes(rule?.Effect)||(rule.Effect==='Allow'&&(!rule.Principal||rule.NotPrincipal||JSON.stringify(rule.Principal).includes('*')))))throw new Error('S3 vereist een privébucket zonder publieke policy.');
  }
 }else{await mkdir(resolve(c.MEDIA_ROOT),{recursive:true});await access(resolve(c.MEDIA_ROOT));}
}
export async function listObjects(prefix:string):Promise<{key:string;at:Date}[]> {
  if(!['originals/','variants/','documents/','archive/'].includes(prefix))throw new Error('Ongeldig opruimprefix.');
  if(env().MEDIA_DRIVER==='s3'){
    const result:{key:string;at:Date}[]=[];let cursor:string|undefined;
    do{const page=await s3().send(new ListObjectsV2Command({Bucket:env().S3_BUCKET,Prefix:prefix,ContinuationToken:cursor,MaxKeys:1000}));for(const item of page.Contents||[])if(item.Key&&item.LastModified)result.push({key:item.Key,at:item.LastModified});cursor=page.IsTruncated?page.NextContinuationToken:undefined;}while(cursor);
    return result;
  }
  const result:{key:string;at:Date}[]=[];
  async function walk(key:string){const entries=await readdir(file(key),{withFileTypes:true}).catch(()=>[]);for(const entry of entries){const child=key.replace(/\/$/,'')+'/'+entry.name;if(entry.isDirectory())await walk(child);else if(entry.isFile())result.push({key:child,at:(await stat(file(child))).mtime});}}
  await walk(prefix);return result;
}

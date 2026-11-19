import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import type {MollieCredential} from './mollie-provider';
import type {MollieMode} from '../cms/mollie-types';
import {CmsError} from './errors';

const storedBinding=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),clubId:z.literal('duindorpsv'),organizationId:z.literal(''),mode:z.enum(['test','live']),authMode:z.literal('profile-api-key'),credentialKind:z.literal('profile-api-key'),currentProfileId:z.string().regex(/^pfl_[A-Za-z0-9]+$/),scopes:z.array(z.enum(['payments.read','payments.write'])),testmodeParameter:z.literal(false)}).strict();
function encryptionKey(){
 const secret=process.env.SUPABASE_SECRET_KEY;
 if(!secret)throw new CmsError('mollie-encryption-unavailable','De beveiligde sleutelopslag is niet beschikbaar.',503);
 return createHmac('sha256',secret).update('duindorpsv:mollie:credential-encryption:v1').digest();
}
function aad(mode:MollieMode,binding:unknown,keyPreview:string){return Buffer.from(JSON.stringify({version:1,mode,binding,keyPreview}));}
export function sealMollieCredential(credential:MollieCredential){
 const binding=storedBinding.parse(credential.binding),keyPreview=binding.mode+'_••••'+credential.token.slice(-4),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(aad(binding.mode,binding,keyPreview));
 const ciphertext=Buffer.concat([cipher.update(credential.token,'utf8'),cipher.final()]);
 return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64'),binding,keyPreview};
}
export function unsealMollieCredential(row:{mode:string;binding_id:string;binding:unknown;key_preview:string;ciphertext:string;iv:string;auth_tag:string}):MollieCredential{
 try{
  const binding=storedBinding.parse(row.binding);
  if(binding.mode!==row.mode||binding.id!==row.binding_id)throw Error('binding');
  const iv=Buffer.from(row.iv,'base64'),tag=Buffer.from(row.auth_tag,'base64');if(iv.length!==12||tag.length!==16)throw Error('cipher');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAAD(aad(binding.mode,binding,row.key_preview));decipher.setAuthTag(tag);
  const token=Buffer.concat([decipher.update(Buffer.from(row.ciphertext,'base64')),decipher.final()]).toString('utf8');
  if(!new RegExp('^'+binding.mode+'_[A-Za-z0-9]{20,120}$').test(token))throw Error('credential');
  const {id,...metadata}=binding;
  if(createHmac('sha256',token).update(JSON.stringify(metadata)).digest('hex')!==id)throw Error('binding');
  return {token,binding,source:'stored-api-key',keyPreview:row.key_preview};
 }catch{
  throw new CmsError('mollie-credential-unavailable','De opgeslagen Mollie-sleutel kan niet veilig worden gelezen. Voeg de sleutel opnieuw toe.',503);
 }
}
export async function readStoredMollieCredential(mode:MollieMode,expectedBindingId?:string,transaction?:any){
 const tx=transaction||sqlClient();
 const [row]=expectedBindingId?await tx`select * from cms_mollie_credentials where mode=${mode} and binding_id=${expectedBindingId}`:await tx`select * from cms_mollie_credentials where mode=${mode} and active=true`;
 return row?unsealMollieCredential(row):null;
}
/** Call only inside the versioned settings transaction, after provider validation. */
export async function saveMollieCredential(tx:any,credential:MollieCredential,actorId:string){
 const sealed=sealMollieCredential(credential),binding=sealed.binding;
 await tx`update cms_mollie_credentials set active=false,updated_at=now() where mode=${binding.mode} and active=true`;
 await tx`insert into cms_mollie_credentials(binding_id,mode,ciphertext,iv,auth_tag,binding,key_preview,created_by) values (${binding.id},${binding.mode},${sealed.ciphertext},${sealed.iv},${sealed.authTag},${tx.json(binding)},${sealed.keyPreview},${actorId}) on conflict(binding_id) do update set active=true,ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,updated_at=now()`;
}
export async function retireMollieCredential(tx:any,mode:MollieMode){
 await tx`update cms_mollie_credentials set active=false,updated_at=now() where mode=${mode} and active=true`;
}

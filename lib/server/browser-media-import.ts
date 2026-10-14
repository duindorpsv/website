import {sqlClient} from '../../db';
import {uploadMedia,processImage} from './media';
import {mutate} from './records';
import type {Principal} from './permissions';
import type {CmsState} from '../cms/types';
import {CmsError} from './errors';
export async function mapBrowserMedia(p:Principal,state:CmsState,blobs:any[],checksum:string){const mapping:Record<string,string>={},sql=sqlClient();
 for(const media of state.media){if(!media.blobKey)continue;const [existing]=await sql`select media_id from cms_import_media where checksum=${checksum} and source_id=${media.id}`;let id=existing?.media_id as string|undefined;
  if(!id){const blob=blobs.find(b=>b.key===media.blobKey);const match=/^data:(image\/(?:jpeg|png|webp|avif));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(blob?.data||'');if(!match)throw new CmsError('blob','Een upload heeft geen ondersteund afbeeldingsformaat.',422,{id:media.id});const bytes=Buffer.from(match[2],'base64');const created=await uploadMedia(p,new File([bytes],media.name,{type:match[1]}),{teamId:media.teamId,season:media.season,folderId:media.folderId});id=created.id;await processImage(id);const data={...media,id,src:`/api/media/${id}`};delete data.blobKey;await mutate(p,[{module:'media',id,expectedVersion:1,action:media.deletedAt?'trash':media.published?'publish':'save',data}],crypto.randomUUID(),crypto.randomUUID());await sql`insert into cms_import_media(checksum,source_id,media_id) values (${checksum},${media.id},${id})`;}
  mapping[media.id]=id;
 }
 function rewrite(v:any):any{if(Array.isArray(v))return v.map(rewrite);if(!v||typeof v!=='object')return v;const copy:any={};for(const [key,value] of Object.entries(v)){if(['refId','coverId','mediaId'].includes(key)&&typeof value==='string')copy[key]=mapping[value]||value;else if(['ids','mediaIds','homepagePhotoIds'].includes(key)&&Array.isArray(value))copy[key]=value.map(id=>mapping[id as string]||id);else copy[key]=rewrite(value);}if(v.type==='image'&&copy.attrs?.mediaId&&Object.values(mapping).includes(copy.attrs.mediaId))copy.attrs.src=`/api/media/${copy.attrs.mediaId}`;return copy;}
 const next=rewrite(state) as CmsState;next.media=next.media.map(m=>{if(!mapping[m.id])return m;const data={...m,id:mapping[m.id],src:`/api/media/${mapping[m.id]}`};delete data.blobKey;return data;});return {state:next,mapping};}

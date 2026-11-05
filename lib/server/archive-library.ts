import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sqlClient} from '../../db';
import {getObject,putObject} from './storage';
import {requireArchive,archiveMediaPath} from './club-archive';
import {prepareArchiveFile} from './archive-uploads';
import {CmsError} from './errors';
import type {Principal} from './permissions';
export async function archiveLibraryImage(p:Principal,id:string){
 requireArchive(p,true);const sql=sqlClient(),[row]=await sql`select r.live,o.storage_key from cms_records r left join cms_media_objects o on o.id=r.id where r.id=${id} and r.module='media' and r.live is not null and r.deleted_at is null`;
 if(!row)throw new CmsError('missing','Kies een gepubliceerde afbeelding uit de mediabibliotheek.',404);let bytes:Uint8Array;
 if(row.storage_key)bytes=await getObject(row.storage_key);else{const src=row.live.src||'';if(!/^\/assets\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpe?g|avif|gif)$/.test(src)||src.includes('..'))throw new CmsError('media','Deze bron heeft geen beschikbaar lokaal origineel.',422);bytes=await readFile(resolve(process.cwd(),'public','.'+src));}
 const checksum=createHash('sha256').update(bytes).digest('hex'),mediaId='library-'+id+'-'+checksum.slice(0,12),[existing]=await sql`select id from cms_archive_media where id=${mediaId}`;
 if(!existing){const image=await prepareArchiveFile(bytes,'image/webp'),originalKey=`archive/${mediaId}/original`,safeKey=`archive/${mediaId}/safe.webp`;await putObject(originalKey,bytes,'application/octet-stream');await putObject(safeKey,image.safe,'image/webp');await sql`insert into cms_archive_media(id,operation_id,original_key,safe_key,name,kind,mime,bytes,checksum,state,metadata) values (${mediaId},${'library:'+mediaId},${originalKey},${safeKey},${row.live.name},'image','image/webp',${bytes.length},${checksum},'ready',${sql.json({...image.metadata,cmsMediaId:id,credit:row.live.credit||'',caption:row.live.caption||''})}) on conflict do nothing`;}
 return {id:mediaId,kind:'image',src:archiveMediaPath(mediaId),name:row.live.name,caption:row.live.caption||row.live.alt||'',credit:row.live.credit||'',approved:true};
}

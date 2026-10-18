import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {crc32} from 'node:zlib';
import {RandomAccessReader,fromRandomAccessReaderPromise,type Entry,type ZipFile} from 'yauzl';
import {getObject} from './storage';
import {CmsError} from './errors';
import {NEWS_IMPORT_CHUNK_BYTES} from '../cms/news-import';

export function newsImportLimits(){
 const bounded=(key:string,fallback:number,min:number,max:number)=>{const value=Number(process.env[key]||fallback);return Number.isSafeInteger(value)&&value>=min&&value<=max?value:fallback;};
 return {uploadBytes:bounded('NEWS_IMPORT_MAX_MB',512,32,2048)*1024*1024,jsonBytes:32*1024*1024,unpackedBytes:bounded('NEWS_IMPORT_MAX_UNPACKED_MB',2048,512,4096)*1024*1024,entries:bounded('NEWS_IMPORT_MAX_ENTRIES',10000,100,50000),articles:10000,chunkBytes:NEWS_IMPORT_CHUNK_BYTES,lifetimeDays:7};
}
export type ArchivePart={part:number;storage_key:string;bytes:number;checksum?:string};
export type ArchiveSource={bytes:number;filename:string;parts:ArchivePart[]};
export function safeArchivePath(path:unknown):path is string{return typeof path==='string'&&path.isWellFormed()&&!!path&&path.length<=600&&path===path.normalize('NFC')&&!/[\u0000-\u001f\u007f\\:]/.test(path)&&!path.startsWith('/')&&!path.split('/').some(s=>s==='..'||s==='.')&&!path.includes('//');}
class ArchiveStorageError extends Error{constructor(){super('news-archive-storage-unavailable');this.name='ArchiveStorageError';}}
class UploadReader extends RandomAccessReader{
 private cache=new Map<number,Buffer>();
 constructor(private source:ArchiveSource){super();}
 _readStreamForRange(start:number,end:number){const self=this;return Readable.from((async function*(){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>self.source.bytes)throw new Error('archive-range');
  let offset=start;while(offset<end){const index=Math.floor(offset/NEWS_IMPORT_CHUNK_BYTES),part=self.source.parts[index];if(!part||part.part!==index)throw new Error('archive-part-missing');let bytes=self.cache.get(index);if(!bytes){try{bytes=Buffer.from(await getObject(part.storage_key));}catch{throw new ArchiveStorageError();}if(bytes.length!==part.bytes||(part.checksum&&createHash('sha256').update(bytes).digest('hex')!==part.checksum))throw new CmsError('news-part-corrupt','Een opgeslagen uploaddeel is beschadigd. Upload het oorspronkelijke bestand opnieuw.',422);self.cache.set(index,bytes);while(self.cache.size>2)self.cache.delete(self.cache.keys().next().value!);}const from=offset-index*NEWS_IMPORT_CHUNK_BYTES,take=Math.min(bytes.length-from,end-offset);if(take<=0)throw new Error('archive-range');yield bytes.subarray(from,from+take);offset+=take;}
 })());}
}
export class NewsArchive{
 private zip:ZipFile|null=null;
 readonly entries=new Map<string,Entry>();
 constructor(readonly source:ArchiveSource){}
 async open(){
  if(!this.source.filename.toLowerCase().endsWith('.zip'))return this;
  try{
   this.zip=await fromRandomAccessReaderPromise(new UploadReader(this.source),this.source.bytes,{lazyEntries:true,autoClose:false,strictFileNames:true,validateEntrySizes:true});
   if(this.zip.entryCount>newsImportLimits().entries)throw new Error('too-many-entries');
   let expanded=0;const names=new Set<string>();
   for await(const entry of this.zip.eachEntry()){
    const name=entry.fileName,canonical=name.toLocaleLowerCase('en-US'),kind=(entry.externalFileAttributes>>>16)&0xf000;
    if(!safeArchivePath(name)||names.has(canonical)||kind===0xa000||(kind!==0&&kind!==0x8000&&kind!==0x4000)||entry.isEncrypted()||![0,8].includes(entry.compressionMethod))throw new Error('unsafe-entry');
    names.add(canonical);expanded+=entry.uncompressedSize;
    if(!Number.isSafeInteger(expanded)||expanded>newsImportLimits().unpackedBytes||!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize<0||(entry.uncompressedSize>1_000_000&&entry.uncompressedSize>Math.max(1,entry.compressedSize)*200))throw new Error('archive-limits');
    if(!name.endsWith('/'))this.entries.set(name,entry);
   }
   if(!this.entries.has('nieuws.json'))throw new Error('manifest-missing');
   return this;
  }catch(error){this.close();if(error instanceof ArchiveStorageError||error instanceof CmsError)throw error;throw new CmsError('news-zip','Dit ZIP-bestand is beschadigd, onveilig of overschrijdt de limieten. Verwacht nieuws.json in de hoofdmap.',422);}
 }
 has(path:string){return this.entries.has(path);}
 async read(path:string,max:number){
  if(!this.zip){if(path!=='nieuws.json'||this.source.bytes>max)throw new CmsError('news-json-size','Het JSON-bestand mag maximaal 32 MB zijn.',413);const reader=new UploadReader(this.source);return collect(reader._readStreamForRange(0,this.source.bytes),max);}
  const entry=this.entries.get(path);if(!entry)throw new CmsError('news-file-missing','Het bestand ontbreekt in het pakket.',422);
  if(entry.uncompressedSize>max)throw new CmsError('news-file-size','Dit bestand overschrijdt de toegestane omvang.',413);
  const bytes=await collect(await this.zip.openReadStreamPromise(entry),max);
  if(crc32(bytes)!==entry.crc32)throw new CmsError('news-file-corrupt','Dit bestand is beschadigd.',422);
  return bytes;
 }
 close(){this.zip?.close();this.zip=null;}
}
async function collect(stream:Readable,max:number){const parts:Buffer[]=[];let length=0;try{for await(const part of stream){const bytes=Buffer.from(part);length+=bytes.length;if(length>max)throw new CmsError('news-file-size','Dit bestand overschrijdt de toegestane omvang.',413);parts.push(bytes);}return Buffer.concat(parts,length);}finally{stream.destroy();}}

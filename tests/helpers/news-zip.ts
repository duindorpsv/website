import {crc32} from 'node:zlib';
import {open} from 'node:fs/promises';
/** Stored ZIP fixtures; sizes and CRCs are real, manifest can be the last entry. */
export function zipParts(entries:{name:string;bytes:Buffer;mode?:number}[]){
 const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const entry of entries){const name=Buffer.from(entry.name),checksum=crc32(entry.bytes),head=Buffer.alloc(30),dir=Buffer.alloc(46);
  head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt32LE(checksum,14);head.writeUInt32LE(entry.bytes.length,18);head.writeUInt32LE(entry.bytes.length,22);head.writeUInt16LE(name.length,26);
  dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(0x0314,4);dir.writeUInt16LE(20,6);dir.writeUInt32LE(checksum,16);dir.writeUInt32LE(entry.bytes.length,20);dir.writeUInt32LE(entry.bytes.length,24);dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(((entry.mode??0x81a4)*65536)>>>0,38);dir.writeUInt32LE(offset,42);
  local.push(head,name,entry.bytes);central.push(dir,name);offset+=head.length+name.length+entry.bytes.length;
 }
 const size=central.reduce((sum,b)=>sum+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);return [...local,...central,end];
}
export const zipBytes=(entries:Parameters<typeof zipParts>[0])=>Buffer.concat(zipParts(entries));
export async function writeZip(path:string,entries:Parameters<typeof zipParts>[0]){const file=await open(path,'w',0o600);try{for(const bytes of zipParts(entries))await file.write(bytes);}finally{await file.close();}}

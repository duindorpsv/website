import {createHash} from 'node:crypto';

/** Stable server-side encoding: object keys are sorted; sequence and exact text are retained. */
export function boardCanonical(value:unknown):string {
 const sort=(item:unknown):unknown=>Array.isArray(item)?item.map(sort):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,v])=>[key,sort(v)])):item;
 return JSON.stringify(sort(value));
}
export function boardDigest(value:string):string{return createHash('sha256').update(value,'utf8').digest('hex');}
export function boardSnapshotHash(value:unknown):string{return boardDigest(boardCanonical(value));}

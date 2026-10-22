import {sqlClient} from '../../db';
import {loadState} from './records';
import {readArchive} from './club-archive';
import {RevisionMemo} from './revision-memo';
import type {ArchiveState} from '../club-archive-types';

type PublicState=Awaited<ReturnType<typeof loadState>>;
const runtime=globalThis as typeof globalThis&{__duindorpPublicContent?:{
 website:RevisionMemo<PublicState>;archive:RevisionMemo<ArchiveState>;
}};
function caches(){return runtime.__duindorpPublicContent??={website:new RevisionMemo<PublicState>(30_000),archive:new RevisionMemo<ArchiveState>(30_000)};}
// All dependencies bump this revision in their write transaction. A version
// check transfers a few bytes, instead of the entire CMS for every visit. The
// short upper bound also refreshes time-based pins, dates and sponsor periods.
async function readPublic<T>(memo:RevisionMemo<T>,load:(tx:any)=>Promise<T>){
 return sqlClient().begin('isolation level repeatable read read only',async tx=>{
  const [row]=await tx`select version::text as version from cms_domain_revision where id=true`;
  if(!row)throw new Error('De publicatieversie ontbreekt.');
  return memo.read(row.version,()=>load(tx));
 });
}
export function loadPublicState(){return readPublic(caches().website,tx=>loadState(true,undefined,tx));}
export function loadPublicArchive(){return readPublic(caches().archive,async tx=>(await readArchive(tx)).state);}
/** Server-side diagnostics contain counters only, never content or credentials. */
export function publicReadStats(){return {website:{...caches().website.stats},archive:{...caches().archive.stats}};}

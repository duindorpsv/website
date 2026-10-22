import {sqlClient} from '../../db';
import {loadState} from './records';
import {readArchive} from './club-archive';
import {RevisionMemo} from './revision-memo';
import {publicContentLifetime} from './public-content-clock';
import type {ArchiveState} from '../club-archive-types';

type PublicState=Awaited<ReturnType<typeof loadState>>;
const runtime=globalThis as typeof globalThis&{__duindorpPublicContent?:{
 website:RevisionMemo<PublicState>;archive:RevisionMemo<ArchiveState>;
}};
function caches(){return runtime.__duindorpPublicContent??={website:new RevisionMemo<PublicState>((value,now)=>publicContentLifetime(value.state.articles,now)),archive:new RevisionMemo<ArchiveState>(6*3600000)};}
// All dependencies bump this revision in their write transaction. A version
// check transfers a few bytes, instead of the entire CMS for every visit. The
// Date keys and the next pin expiry also refresh time-based visibility, without
// downloading the CMS every few seconds when no content has changed.
async function readPublic<T>(memo:RevisionMemo<T>,load:(tx:any)=>Promise<T>){
 return sqlClient().begin('isolation level repeatable read read only',async tx=>{
  const [row]=await tx`select version::text||'|'||current_date::text||'|'||(now() at time zone 'Europe/Amsterdam')::date::text as version from cms_domain_revision where id=true`;
  if(!row)throw new Error('De publicatieversie ontbreekt.');
  return memo.read(row.version,()=>load(tx));
 });
}
export function loadPublicState(){return readPublic(caches().website,tx=>loadState(true,undefined,tx));}
export function loadPublicArchive(){return readPublic(caches().archive,async tx=>(await readArchive(tx)).state);}
/** Server-side diagnostics contain counters only, never content or credentials. */
export function publicReadStats(){return {website:{...caches().website.stats},archive:{...caches().archive.stats}};}

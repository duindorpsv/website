import {articleContent} from '../cms/model';
import {equalContent} from '../cms/compare';
import type {CmsArticle} from '../cms/types';
import {sqlClient} from '../../db';
import {mutate,type Change} from './records';
import {authorize,type Principal} from './permissions';
import {CmsError} from './errors';

export async function publishImportedNews(p:Principal,onProgress?:(value:unknown)=>void) {
  if(p.roleId!=='admin'||p.teamScoped)throw new CmsError('forbidden','Deze archiefactie vereist een volledige beheerder.',403);
  authorize(p,'news','publish');
  const sql=sqlClient();
  // Capture the requested archive once: later imports and unrelated manual drafts
  // never enter this operation. Unchanged publications retain their live copy.
  const targets=await sql<{id:string;version:number;live:Record<string,any>|null;draft:Record<string,any>}[]>`select r.id,r.version,r.live,r.draft from cms_records r join cms_news_import_identities i on i.record_id=r.id where r.module='articles' and r.draft->>'contentType'='news' and r.deleted_at is null order by r.id`;
  const pending=targets.filter(row=>!row.live||!equalContent(articleContent(row.draft as CmsArticle),articleContent(row.live as CmsArticle))),failed:{id:string;code:string;reason:string}[]=[];
  let publishedNow=0;
  const publish=async(rows:readonly {id:string;version:number}[])=>{
    const changes:Change[]=rows.map(row=>({module:'articles',id:row.id,expectedVersion:row.version,action:'publish'}));
    await mutate(p,changes,crypto.randomUUID(),'publish-imported-news');
    publishedNow+=rows.length;
  };
  for(let at=0;at<pending.length;at+=50){
    const group=pending.slice(at,at+50);
    try {await publish(group);}
    catch {
      // One incomplete record must not prevent the rest of an archive going live.
      // The failed group was atomic; retry its records with the captured versions.
      for(const row of group)try{await publish([row]);}catch(error){failed.push({id:row.id,code:error instanceof CmsError?error.code:'publication-failed',reason:error instanceof CmsError?error.message:'Publicatie kon niet worden bevestigd.'});}
    }
    onProgress?.({total:targets.length,publishedNow,remaining:pending.length-at-group.length,failed:failed.length});
  }
  const live=targets.length?await sql`select id from cms_records where id in ${sql(targets.map(row=>row.id))} and live is not null and deleted_at is null`:[];
  const liveIds=new Set(live.map(row=>row.id));
  const result={total:targets.length,alreadyPublished:targets.length-pending.length,publishedNow,published:live.length,failed:failed.filter(row=>!liveIds.has(row.id))};
  await sql`insert into cms_audit(id,actor_id,action,request_id,metadata) values (${crypto.randomUUID()},${p.id},'publish-imported-archive',${crypto.randomUUID()},${sql.json(result)})`;
  return result;
}

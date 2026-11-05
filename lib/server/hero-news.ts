import {referencesIn} from '../cms/layout/document';
import {publicRecordColumns} from './public-record-columns';

// Archive imports can exceed the general bootstrap limit. Always include the
// newest news and active pins, even when older records were edited more recently.
export async function heroNewsRows(sql:any){
  const rows=await sql`
    (select ${publicRecordColumns(sql)} from cms_records where module='articles' and live is not null
      and deleted_at is null and coalesce(live->>'contentType','news')='news'
      order by nullif(live->>'publishedAt','')::timestamptz desc nulls last,id limit 10)
    union all
    (select ${publicRecordColumns(sql)} from cms_records where module='articles' and live is not null
      and deleted_at is null and coalesce(live->>'contentType','news')='news'
      and live->>'featured'='true'
      and coalesce(nullif(live->>'featuredUntil','')::timestamptz,
        nullif(live->>'publishedAt','')::timestamptz+interval '168 hours')>now()
      order by nullif(live->>'publishedAt','')::timestamptz desc nulls last,id limit 3)`;
  const references=[...new Set<string>(rows.flatMap((row:any)=>referencesIn(row.live)))];
  const media=references.length?await sql`select ${publicRecordColumns(sql)} from cms_records where module='media'
    and id in ${sql(references)} and live is not null and deleted_at is null`:[];
  return [...rows,...media];
}

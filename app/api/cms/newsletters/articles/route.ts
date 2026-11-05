import {sqlClient} from '@/db';
import {principal} from '@/lib/server/permissions';
import {requireNewsletter} from '@/lib/server/newsletter-workspace';
import {listPagination} from '@/lib/server/pagination';
import {errorResponse} from '@/lib/server/errors';
export async function GET(request:Request){try{
 requireNewsletter(await principal(request.headers));const url=new URL(request.url),{limit,offset}=listPagination(url),query=(url.searchParams.get('q')||'').trim().slice(0,200),sql=sqlClient();
 const visible=sql`module='articles' and live is not null and deleted_at is null and live->>'contentType'='news' and ${query?sql`strpos(lower(live->>'title'),lower(${query}))>0`:sql`true`}`;
 const [items,[count]]=await Promise.all([sql`select id,live->>'title' as title,live->>'intro' as intro from cms_records where ${visible} order by live->>'publishedAt' desc nulls last,id limit ${limit} offset ${offset}`,sql`select count(*)::int as total from cms_records where ${visible}`]);
 return Response.json({items,total:count.total,limit,offset},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return errorResponse(e);}}

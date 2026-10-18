import {sqlClient} from '@/db';
export const dynamic='force-dynamic';
export async function GET(request:Request){const path=new URL(request.url).pathname;const [row]=await sqlClient()`select d.to_path from cms_redirects d join cms_records r on r.id=d.record_id where d.from_path=${path} and r.module='articles' and r.live->>'contentType'='news' and r.deleted_at is null`;if(row&&String(row.to_path).startsWith('/clubmuur/nieuws/'))return Response.redirect(new URL(row.to_path,request.url),308);return new Response('Bericht niet gevonden',{status:404});}

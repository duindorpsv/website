import {sqlClient} from '@/db';
export const dynamic='force-dynamic';
export async function GET(){const rows=await sqlClient()`select id,module,live from cms_records where module in ('hero','navigation','narrowcasting') and live is not null and deleted_at is null`;return Response.json(Object.fromEntries(rows.map(r=>[r.module,r.live])),{headers:{'Cache-Control':'no-store'}});}

import {currentClubLinks} from '@/lib/current-club-links';
import {sqlClient} from '@/db';
export const dynamic='force-dynamic';
export async function GET(){const rows=await sqlClient()`select id,module,live from cms_records where module in ('hero','navigation','heroPhotos','agenda','narrowcasting') and live is not null and deleted_at is null`;return Response.json(currentClubLinks(Object.fromEntries(rows.map(r=>[r.module,r.live]))),{headers:{'Cache-Control':'no-store'}});}

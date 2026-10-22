import {sqlClient} from '../../db';
import {workspaceActor} from './sponsor-access';
import {fullDirectory} from './sponsor-store';
import {CmsError} from './errors';
export async function directoryLookup(request:Request){const actor=await workspaceActor(request.headers);if(!fullDirectory(actor.p))throw new CmsError('forbidden','Geen toegang tot het ledenregister.',403);const url=new URL(request.url),search=(url.searchParams.get('search')||'').slice(0,150),id=(url.searchParams.get('id')||'').slice(0,191),sql=sqlClient();return sql`select id,draft->>'name' as name from cms_records where module='people' and deleted_at is null and ${id?sql`id=${id}`:sql`draft->>'name' ilike ${'%'+search.replace(/[\\%_]/g,'\\$&')+'%'}`} order by lower(draft->>'name'),id limit 25`;}

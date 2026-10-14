import {sqlClient} from '@/db';
import {storageReady} from '@/lib/server/storage';
import journal from '@/db/migrations/meta/_journal.json';
export const dynamic='force-dynamic';
export async function GET(){try{const check=async()=>{const sql=sqlClient();const [[settings],[migrations],[worker]]=await Promise.all([sql`select id from cms_records where id='settings'`,sql`select count(*)::int as count from drizzle.__drizzle_migrations`,sql`select at from cms_heartbeats where id='worker'`]);await storageReady();const fresh=worker&&Date.now()-new Date(worker.at).getTime()<120000;return !!settings&&migrations.count>=journal.entries.length&&fresh;};const ready=await Promise.race([check(),new Promise(resolve=>setTimeout(()=>resolve(false),4000))]);return Response.json({status:ready?'ready':'waiting',release:process.env.RELEASE_DIGEST||'development'},{status:ready?200:503});}catch{return Response.json({status:'unavailable'},{status:503});}}

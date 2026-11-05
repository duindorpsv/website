import {sqlClient,closeDb} from '../db';
import {actorPrincipal} from '../lib/server/permissions';
import {publishImportedNews} from '../lib/server/publish-imported-news';

try {
  if(process.env.APP_ENV!=='production'||process.env.GITHUB_REPOSITORY!=='duindorpsv/website'||process.env.GITHUB_REF!=='refs/heads/main')throw new Error('Verified production maintenance only');
  const sql=sqlClient();
  const [owner]=await sql`select m.user_id from cms_memberships m join auth_user u on u.id=m.user_id where m.role_id='admin' and m.active=true and u.supabase_user_id is not null and coalesce(u.banned,false)=false order by m.user_id limit 1`;
  if(!owner)throw new Error('No active owner');
  const result=await publishImportedNews(await actorPrincipal(owner.user_id),progress=>console.log(JSON.stringify(progress)));
  console.log(JSON.stringify(result));
  if(result.failed.length)process.exitCode=1;
} catch {
  // PostgreSQL exceptions can include connection details. Only emit a safe error.
  console.error('Publicatie van het geïmporteerde archief kon niet volledig worden afgerond.');process.exitCode=1;
} finally {await closeDb();}

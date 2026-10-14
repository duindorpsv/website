import type {MetadataRoute} from 'next';
import {sqlClient} from '@/db';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{if(process.env.APP_ENV!=='production')return [];const rows=await sqlClient()`select p.path,r.updated_at from cms_paths p join cms_records r on r.id=p.record_id where p.kind='live' and r.live is not null and r.deleted_at is null and coalesce(r.live->'seo'->>'noIndex','false')!='true'`;return rows.map(r=>({url:new URL(r.path,process.env.APP_BASE_URL).href,lastModified:new Date(r.updated_at)}));}

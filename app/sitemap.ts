import type {MetadataRoute} from 'next';
import {sqlClient} from '@/db';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 if(process.env.APP_ENV!=='production')return [];
 const sql=sqlClient(),rows=await sql`select p.path,r.updated_at from cms_paths p join cms_records r on r.id=p.record_id where p.kind='live' and r.live is not null and r.deleted_at is null and coalesce(r.live->'seo'->>'noIndex','false')!='true'`,archive=await sql`select kind,live->>'slug' as slug,updated_at from cms_archive_catalog where kind in ('moment','object') and live is not null`;
 const entries=[...rows,...archive.map(r=>({path:`/clubmuur/club/${r.kind==='moment'?'tijdlijn':'museum'}/${r.slug}`,updated_at:r.updated_at})),...['tijdlijn','museum'].map(path=>({path:`/clubmuur/club/${path}`,updated_at:new Date()}))];
 return [...new Map(entries.map(r=>[r.path,{url:new URL(r.path,process.env.APP_BASE_URL).href,lastModified:new Date(r.updated_at)}])).values()];
}

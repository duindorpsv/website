import type {MetadataRoute} from 'next';
export const dynamic='force-dynamic';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',disallow:process.env.APP_ENV==='production'?['/beheer','/api','/preview','/narrowcasting']:['/']},sitemap:process.env.APP_ENV==='production'?new URL('/sitemap.xml',process.env.APP_BASE_URL).href:undefined};}

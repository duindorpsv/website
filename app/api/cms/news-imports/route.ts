import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {createNewsSession,listNewsSessions,newsProvenance} from '@/lib/server/news-imports';
import {newsImportLimits} from '@/lib/server/news-archive';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=await principal(request.headers),url=new URL(request.url);if(url.searchParams.has('recordId'))return Response.json(await newsProvenance(p,url.searchParams.get('recordId')!),{headers:{'Cache-Control':'no-store'}});return Response.json({sessions:await listNewsSessions(p),limits:newsImportLimits()},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await createNewsSession(await principal(request.headers),await bodyJson(request,10000)),{status:201});}catch(e){return errorResponse(e);}}

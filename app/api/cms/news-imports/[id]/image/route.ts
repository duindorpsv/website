import {principal} from '@/lib/server/permissions';
import {errorResponse} from '@/lib/server/errors';
import {newsImagePreview} from '@/lib/server/news-imports';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await newsImagePreview(await principal(request.headers),(await params).id,new URL(request.url).searchParams.get('path')||'');}catch(e){return errorResponse(e);}}

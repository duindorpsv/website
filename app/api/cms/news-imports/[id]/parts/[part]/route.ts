import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyBytes,errorResponse} from '@/lib/server/errors';
import {uploadNewsPart,newsSession} from '@/lib/server/news-imports';
import {NEWS_IMPORT_CHUNK_BYTES} from '@/lib/cms/news-import';
export const runtime='nodejs';
export async function PUT(request:Request,{params}:{params:Promise<{id:string;part:string}>}){try{verifyOrigin(request);const p=await principal(request.headers),{id,part}=await params;await newsSession(p,id);return Response.json(await uploadNewsPart(p,id,Number(part),await bodyBytes(request,NEWS_IMPORT_CHUNK_BYTES)));}catch(e){return errorResponse(e);}}

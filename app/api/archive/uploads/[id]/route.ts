import {verifyOrigin} from '@/lib/server/permissions';
import {retryArchiveMedia,archiveUploadStatus} from '@/lib/server/archive-uploads';
import {errorResponse} from '@/lib/server/errors';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await archiveUploadStatus(request.headers,(await params).id),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{verifyOrigin(request);return Response.json(await retryArchiveMedia(request.headers,(await params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}

import {archiveFileResponse} from '@/lib/server/archive-uploads';
import {errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await archiveFileResponse(request,(await params).id);}catch(e){return errorResponse(e);}}

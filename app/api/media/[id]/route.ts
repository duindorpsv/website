import {mediaResponse} from '@/lib/server/media';
import {errorResponse} from '@/lib/server/errors';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await mediaResponse((await params).id);}catch(e){return errorResponse(e);}}

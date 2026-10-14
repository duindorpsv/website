import {mediaResponse} from '@/lib/server/media';
import {principal} from '@/lib/server/permissions';
import {errorResponse} from '@/lib/server/errors';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await mediaResponse((await params).id,await principal(request.headers),new URL(request.url).searchParams.get('original')==='true');}catch(e){return errorResponse(e);}}

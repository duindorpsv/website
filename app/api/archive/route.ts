import {readArchive} from '@/lib/server/club-archive';
import {errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json((await readArchive()).state,{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

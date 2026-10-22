import {loadPublicArchive} from '@/lib/server/public-content';
import {errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await loadPublicArchive(),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

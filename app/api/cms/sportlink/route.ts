import {principal} from '@/lib/server/permissions';
import {errorResponse} from '@/lib/server/errors';
import {sportlinkStatus} from '@/lib/server/sportlink-sync';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await sportlinkStatus(await principal(request.headers)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

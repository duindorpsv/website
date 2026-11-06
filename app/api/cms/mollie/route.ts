import {readMollieWorkspace,commandMollieWorkspace} from '@/lib/server/mollie-settings';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {verifyOrigin} from '@/lib/server/permissions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await readMollieWorkspace(request),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await commandMollieWorkspace(request,await bodyJson(request,100000)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

import {workspaceRead} from '@/lib/server/sponsor-workspace';
import {workspaceCommands} from '@/lib/server/sponsor-commands';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {verifyOrigin} from '@/lib/server/permissions';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await workspaceRead(request),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await workspaceCommands(request,await bodyJson(request)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

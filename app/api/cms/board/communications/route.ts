import {saveBoardCommunication} from '@/lib/server/board-integrations';
import {bodyJson,errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{return Response.json(await saveBoardCommunication(request,await bodyJson(request)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

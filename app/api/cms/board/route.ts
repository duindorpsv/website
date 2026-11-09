import {readBoard,writeBoard} from '@/lib/server/board-workspace';
import {bodyJson,errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{return Response.json(await readBoard(request),{headers});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{return Response.json(await writeBoard(request,await bodyJson(request)),{headers});}catch(error){return errorResponse(error);}}

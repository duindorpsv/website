import {z} from 'zod';
import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {previewSportlinkPeople,importSportlinkPeople} from '@/lib/server/sportlink-sync';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await previewSportlinkPeople(await principal(request.headers)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{verifyOrigin(request);const actor=await principal(request.headers),input=z.object({operationId:z.string().uuid(),sourceIds:z.array(z.string().min(3).max(80)).min(1).max(50)}).strict().parse(await bodyJson(request));return Response.json(await importSportlinkPeople(actor,input.sourceIds,input.operationId));}catch(error){return errorResponse(error);}}

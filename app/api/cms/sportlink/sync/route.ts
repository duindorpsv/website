import {z} from 'zod';
import {SPORTLINK_DATASETS} from '@/lib/cms/sportlink-settings';
import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {queueSportlinkSync} from '@/lib/server/sportlink-sync';
export async function POST(request:Request){try{verifyOrigin(request);const actor=await principal(request.headers),input=z.object({operationId:z.string().uuid(),dataset:z.enum(SPORTLINK_DATASETS)}).strict().parse(await bodyJson(request));return Response.json(await queueSportlinkSync(actor,input.dataset,input.operationId),{status:202});}catch(error){return errorResponse(error);}}

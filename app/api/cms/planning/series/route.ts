import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {createPlanningSeries,planningSeriesSchema,deletePlanningSeries,deletePlanningSeriesSchema} from '@/lib/server/planning-series';
export async function DELETE(request:Request){try{verifyOrigin(request);const p=await principal(request.headers),input=deletePlanningSeriesSchema.parse(await bodyJson(request));return Response.json(await deletePlanningSeries(p,input));}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{verifyOrigin(request);const p=await principal(request.headers),input=planningSeriesSchema.parse(await bodyJson(request));return Response.json(await createPlanningSeries(p,input));}catch(error){return errorResponse(error);}}

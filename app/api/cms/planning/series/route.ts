import {z} from 'zod';
import {sqlClient} from '@/db';
import {loadState,mutate} from '@/lib/server/records';
import {activitySchema} from '@/lib/cms/planning';
import {planningPreview,activityAuthorization} from '@/lib/server/planning';
import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,CmsError,errorResponse} from '@/lib/server/errors';
import {deletePlanningSeries,deletePlanningSeriesSchema} from '@/lib/server/planning-series';
const schema=z.object({mode:z.enum(['preview','apply']),activity:activitySchema,until:z.string(),weekdays:z.array(z.number().int().min(0).max(6)).min(1),operationId:z.string().uuid()}).strict();
export async function DELETE(request:Request){try{verifyOrigin(request);const p=await principal(request.headers),input=deletePlanningSeriesSchema.parse(await bodyJson(request));return Response.json(await deletePlanningSeries(p,input));}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{verifyOrigin(request);const p=await principal(request.headers),input=schema.parse(await bodyJson(request));activityAuthorization(p,'create',input.activity);if(input.activity.source!=='manual')throw new CmsError('source-locked','Een trainingsreeks wordt handmatig beheerd.',422);const sql=sqlClient();return Response.json(await sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(736402)`;const {state}=await loadState(false,undefined,tx),preview=planningPreview(state,input.activity,input.until,input.weekdays);if(input.mode==='preview')return preview;if(preview.conflicts.length)throw new CmsError('series-conflict','De trainingsreeks is niet opgeslagen. Los eerst alle conflicten op.',409,preview.conflicts);const changes=preview.activities.map(activity=>({module:'activities' as const,id:activity.id,expectedVersion:0,action:'save' as const,data:activity}));const versions=await mutate(p,changes,input.operationId,crypto.randomUUID(),tx);return {...preview,...versions};}));}catch(error){return errorResponse(error);}}

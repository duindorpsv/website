import {z} from 'zod';
import {sqlClient} from '@/db';
import {sportlinkSettingsSchema} from '@/lib/cms/sportlink-settings';
import {principal,authorize,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,CmsError,errorResponse} from '@/lib/server/errors';
import {mutate} from '@/lib/server/records';
import {rescheduleSportlink,sportlinkStatus} from '@/lib/server/sportlink-sync';
export async function POST(request:Request){try{
 verifyOrigin(request);const actor=await principal(request.headers);authorize(actor,'settings','manage');
 const input=z.object({operationId:z.string().uuid(),expectedVersion:z.number().int().min(0),settings:sportlinkSettingsSchema}).strict().parse(await bodyJson(request));
 const sql=sqlClient();for(const mapping of input.settings.teamMappings)if(!(await sql`select id from cms_teams where id=${mapping.cmsTeamId}`).length)throw new CmsError('sportlink-team-mapping','Kies een bestaand CMS-team.',422);
 for(const mapping of input.settings.locationMappings)if(!(await sql`select id from cms_records where id=${mapping.locationId} and module='locations' and deleted_at is null and draft->>'type'=${mapping.sourceType} and (draft->>'active')::boolean=true`).length)throw new CmsError('sportlink-location-mapping','Kies een actieve locatie van het juiste type.',422);
 await mutate(actor,[{module:'sportlinkSettings',id:'site-sportlink',action:'save',expectedVersion:input.expectedVersion,data:input.settings}],input.operationId,crypto.randomUUID());
 await rescheduleSportlink(input.settings);return Response.json(await sportlinkStatus(actor),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}}

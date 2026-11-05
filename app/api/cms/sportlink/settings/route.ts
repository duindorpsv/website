import {verifiedSportlinkCatalog} from '@/lib/server/sportlink-identity';
import {readSportlinkSettings} from '@/lib/server/sportlink-config';
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
 const sql=sqlClient(),previous=await readSportlinkSettings();
 const newMappings=input.settings.teamMappings.filter(mapping=>!previous.settings.teamMappings.some(row=>row.cmsTeamId===mapping.cmsTeamId&&row.teamId===mapping.teamId));
 if(newMappings.length&&!input.settings.clubCode)throw new CmsError('sportlink-club-mapping','Bevestig eerst de geautoriseerde clubidentiteit.',422);
 if(input.settings.clubCode&&(input.settings.clubCode!==previous.settings.clubCode||newMappings.length)){const catalog=await verifiedSportlinkCatalog(input.settings);for(const mapping of input.settings.teamMappings)if(!catalog.teams.some(team=>team.id===mapping.teamId)&&!previous.settings.teamMappings.some(row=>row.cmsTeamId===mapping.cmsTeamId&&row.teamId===mapping.teamId))throw new CmsError('sportlink-team-mapping','Dit team staat niet in de geautoriseerde eigen teamlijst.',422);}
 const [reviewRow]=await sql`select payload_json from sportlink_cache where cache_key='sportlink-planning-review-v1'`;
 const review=reviewRow?.payload_json?JSON.parse(reviewRow.payload_json).items||[]:[];
 for(const confirmation of input.settings.parkConfirmations){
  if(confirmation.accommodationId!==input.settings.ownPark?.id)throw new CmsError('sportlink-park-mapping','Bevestig uitsluitend de geverifieerde eigen accommodatie.',422);
  if(!previous.settings.parkConfirmations.some(row=>JSON.stringify(row)===JSON.stringify(confirmation))&&!review.some((item:any)=>item.matchId===confirmation.matchId&&item.sourceFingerprint===confirmation.sourceFingerprint))throw new CmsError('sportlink-park-mapping','Haal de bron opnieuw op en bevestig de actuele wedstrijdaccommodatie.',409);
 }
 for(const mapping of input.settings.locationMappings)if(mapping.confirmed&&(!input.settings.clubCode||mapping.clubCode!==input.settings.clubCode||!input.settings.ownPark||mapping.accommodationId!==input.settings.ownPark.id))throw new CmsError('sportlink-location-mapping','Een bevestigde resourcekoppeling vereist de eigen club en het eigen park.',422);
 for(const mapping of input.settings.teamMappings)if(!(await sql`select id from cms_teams where id=${mapping.cmsTeamId}`).length)throw new CmsError('sportlink-team-mapping','Kies een bestaand CMS-team.',422);
 for(const mapping of input.settings.locationMappings)if(!(await sql`select id from cms_records where id=${mapping.locationId} and module='locations' and deleted_at is null and draft->>'type'=${mapping.sourceType} and (draft->>'active')::boolean=true`).length)throw new CmsError('sportlink-location-mapping','Kies een actieve locatie van het juiste type.',422);
 await mutate(actor,[{module:'sportlinkSettings',id:'site-sportlink',action:'save',expectedVersion:input.expectedVersion,data:input.settings}],input.operationId,crypto.randomUUID());
 await rescheduleSportlink(input.settings);return Response.json(await sportlinkStatus(actor),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}}

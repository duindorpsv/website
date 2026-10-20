import {z} from 'zod';
import {sqlClient} from '../../db';
import {mutate} from './records';
import {activityAuthorization} from './planning';
import {CmsError} from './errors';
import type {Principal} from './permissions';

export const deletePlanningSeriesSchema=z.object({seriesId:z.string().min(1).max(150),expectedVersions:z.record(z.number().int().positive()).refine(value=>Object.keys(value).length>0&&Object.keys(value).length<=1000,'Kies een reeks met maximaal 1000 momenten.'),operationId:z.string().uuid()}).strict();
export async function deletePlanningSeries(p:Principal,input:z.infer<typeof deletePlanningSeriesSchema>,transaction?:any){
 const perform=async(tx:any)=>{
  await tx`select pg_advisory_xact_lock(736402)`;
  const [replay]=await tx`select response from cms_operations where id=${input.operationId} and actor_id=${p.id}`;
  if(replay)return {versions:replay.response};
  const rows=await tx`select id,version,draft from cms_records where module='activities' and deleted_at is null and draft->>'seriesId'=${input.seriesId} order by id for update`;
  if(!rows.length)throw new CmsError('series-missing','Deze reeks bestaat niet meer. Laad de planning opnieuw.',404);
  // Require the complete versioned set: never delete unseen, new or stale moments.
  if(rows.length!==Object.keys(input.expectedVersions).length||rows.some((row:any)=>input.expectedVersions[row.id]!==row.version))throw new CmsError('conflict','De reeks is ondertussen gewijzigd. Laad de planning opnieuw voordat je de hele reeks verwijdert.',409);
  for(const row of rows){activityAuthorization(p,'delete',row.draft);if(row.draft.source!=='manual'||row.draft.type!=='training')throw new CmsError('source-locked','Alleen een handmatig beheerde trainingsreeks kan zo worden verwijderd.',422);}
  const versions=await mutate(p,rows.map((row:any)=>({module:'activities' as const,id:row.id,action:'trash' as const,expectedVersion:row.version})),input.operationId,crypto.randomUUID(),tx);
  return {versions};
 };
 return transaction?perform(transaction):sqlClient().begin(perform);
}

import {sqlClient} from '../../db';
import {readSportlinkSettings} from './sportlink-config';
export const PLANNING_REVISION_KEY='cms-planning-revision-v1';
export type PlanningSyncStatus={revision:string;status:'never'|'running'|'success'|'failed';lastSuccessAt?:string;message?:string;counts?:Record<string,number>;configured?:boolean;credentialConfigured?:boolean};
/** Called inside the same transaction as the activity and reservation indexes. */
export async function bumpPlanningRevision(tx:any,patch:Partial<PlanningSyncStatus>={}){
 const [old]=await tx`select payload_json from sportlink_cache where cache_key=${PLANNING_REVISION_KEY} for update`;
 const previous=old?.payload_json?JSON.parse(old.payload_json):{status:'never'};
 const state={...previous,...patch,revision:patch.revision||crypto.randomUUID()};
 await tx`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values (${PLANNING_REVISION_KEY},${JSON.stringify(state)},${Date.now()},0,0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at`;
 return state as PlanningSyncStatus;
}
export async function planningSyncStatus():Promise<PlanningSyncStatus>{
 const sql=sqlClient(),[row]=await sql`select payload_json from sportlink_cache where cache_key=${PLANNING_REVISION_KEY}`;
 const config=await readSportlinkSettings();return {...(row?.payload_json?JSON.parse(row.payload_json):{revision:'initial',status:'never'}),configured:config.configured&&!!config.settings.clubCode,credentialConfigured:!!process.env.SPORTLINK_CLIENT_ID};
}

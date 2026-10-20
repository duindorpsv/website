import {sqlClient} from '../../db';
import {defaultSportlinkSettings,sportlinkSettingsSchema,type SportlinkSettings} from '../cms/sportlink-settings';
import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage<SportlinkSettings>();
/** A queued, explicit refresh can run while visitor-triggered refreshes are paused. */
export function withSportlinkSettings<T>(settings:SportlinkSettings,run:()=>Promise<T>){return context.run(settings,run);}

export async function readSportlinkSettings(transaction?:any,storedOnly=false):Promise<{settings:SportlinkSettings;version:number;configured:boolean;actorId:string|null}>{
 const sql=transaction||sqlClient(),[row]=await sql`select version,draft from cms_records where id='site-sportlink' and module='sportlinkSettings' and deleted_at is null`;
 const parsed=sportlinkSettingsSchema.safeParse(row?.draft);
 const [actor]=row?await sql`select actor_id from cms_audit where record_id='site-sportlink' and actor_id is not null order by created_at desc,id desc limit 1`:[];
 return {settings:(!storedOnly&&context.getStore())||(parsed.success?parsed.data:defaultSportlinkSettings()),version:row?.version||0,configured:!!row&&parsed.success,actorId:actor?.actor_id||null};
}

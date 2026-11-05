import {sqlClient} from '../../db';
type Row={payload_json:string|null;updated_at:number;expires_at:number;refresh_after:number};
const pending=new Map<string,Promise<unknown>>();
/** Optional datasets commit their privacy-filtered payload before returning it.
 * Fenced leases and request-start versions also fence failures/backoff. */
export function matchSourceCache<T>(key:string,loader:()=>Promise<T>,empty:T):Promise<{value:T;stale:boolean;updatedAt:number}>{
 const existing=pending.get(key);if(existing)return existing as ReturnType<typeof matchSourceCache<T>>;
 const run=async()=>{
  const sql=sqlClient();let started=0,lease=0;
  const read=async()=>{const [row]=await sql<Row[]>`select payload_json,updated_at,expires_at,refresh_after from sportlink_cache where cache_key=${key}`;return row;};
  const result=(row:Row|undefined,failed=false)=>({value:row?.payload_json?JSON.parse(row.payload_json) as T:empty,updatedAt:Number(row?.updated_at||0),stale:!row?.payload_json||Number(row.expires_at)<=Date.now()||failed});
  try{
   await sql`insert into sportlink_cache(cache_key) values (${key}) on conflict do nothing`;
   const row=await read();started=Date.now();
   if(row?.payload_json&&Number(row.expires_at)>started)return result(row);
   lease=started+15000;
   const claimed=await sql`update sportlink_cache set refresh_after=${lease} where cache_key=${key} and refresh_after<=${started} returning cache_key`;
   if(!claimed.length)return result(await read(),true);
   const value=await loader();
   await sql`update sportlink_cache set payload_json=${JSON.stringify(value)},updated_at=${started},expires_at=${started+60000},refresh_after=0 where cache_key=${key} and refresh_after=${lease} and updated_at<=${started}`;
   return result(await read());
  }catch{
   if(lease)await sql`update sportlink_cache set refresh_after=${Date.now()+120000} where cache_key=${key} and refresh_after=${lease} and updated_at<=${started}`;
   const row=await read();return result(row,Number(row?.updated_at||0)<=started);
  }
 };
 const task=run().finally(()=>pending.delete(key));pending.set(key,task);return task;
}

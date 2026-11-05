import assert from 'node:assert/strict';
/** Archive only committed UUID-owned fixtures; immutable history remains intact. */
export async function cleanupPlanningFixtures(sql:any,ownedRecords:Set<string>){
 const ids=[...ownedRecords];if(!ids.length)return;
 await sql.begin(async(tx:any)=>{
  await tx`select pg_advisory_xact_lock(736402)`;
  await tx`delete from cms_jobs where payload->>'id' in ${tx(ids)}`;
  await tx`delete from cms_activity_reservations where activity_id in ${tx(ids)} or location_id in ${tx(ids)}`;
  await tx`select set_config('duindorp.canonical_account_write','register',true)`;
  await tx`delete from cms_person_accounts where person_id in ${tx(ids)}`;
  await tx`update cms_records set live=null,live_id=null,status='archived',deleted_at=now() where id in ${tx(ids)}`;
 });
 assert.equal((await sql`select id from cms_records where id in ${sql(ids)} and (live is not null or deleted_at is null)`).length,0,'all committed planning fixtures must be inactive and unpublished');
}

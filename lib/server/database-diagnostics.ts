/** Only operational metadata: never select query text, payloads or client names. */
export async function inspectDatabase(sql:any){
  const check=async(run:(tx:any)=>Promise<any>)=>{
    try {return await sql.begin('read only',async(tx:any)=>{
      await tx`set local statement_timeout='10s'`;
      await tx`set local lock_timeout='2s'`;
      return run(tx);
    });} catch(error){return {error_code:safeDatabaseCode(error)};}
  };
  // Keep the blocker snapshot available even when a health table is locked.
  const connections=await check(tx=>tx`select pid,usename as role,state,wait_event_type,wait_event,
    round(extract(epoch from now()-xact_start))::int as transaction_seconds,
    round(extract(epoch from now()-query_start))::int as query_seconds,
    pg_blocking_pids(pid) as blockers
    from pg_stat_activity where datname=current_database()
    and usename in ('duindorp_app','postgres') and pid<>pg_backend_pid()
    order by xact_start nulls last,pid limit 100`);
  const health=await check(async tx=>{
    const [row]=await tx`select
      exists(select 1 from cms_records where id='settings') as settings,
      (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
      (select round(extract(epoch from now()-at))::int from cms_heartbeats where id='worker') as worker_age_seconds,
      has_schema_privilege('duindorp_app','auth','usage') as runtime_auth_schema_access`;
    return row;
  });
  const jobs=await check(tx=>tx`select kind,status,count(*)::int as count from cms_jobs group by kind,status order by kind,status`);
  const security=await check(async tx=>{
    const [row]=await tx`select count(*)::int as tables,
      count(*) filter(where c.relrowsecurity)::int as rls_enabled,
      count(*) filter(where exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='duindorp_backend'))::int as runtime_policies
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname ~ '^(cms_|auth_|sportlink_)'`;
    return row;
  });
  const sportlink=await check(async tx=>{
    const datasets=['teams','players','matches','assignments','results','standings','teamInfo'];
    const rows=await tx`select cache_key,payload_json from sportlink_cache where cache_key in ${tx(datasets.map(name=>'sportlink-sync-v1:'+name))} order by cache_key`;
    const statuses=new Set(['never','queued','running','success','partial','failed','paused']);
    const timestamp=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
    return rows.map((row:any)=>{
      const state=JSON.parse(row.payload_json||'{}');
      const counts=Object.fromEntries(['selected','teams','failed','players','updated','active','skipped','importable'].filter(key=>Number.isSafeInteger(state.counts?.[key])&&state.counts[key]>=0).map(key=>[key,state.counts[key]]));
      return {dataset:row.cache_key.slice('sportlink-sync-v1:'.length),status:statuses.has(state.status)?state.status:'unknown',lastAttemptAt:timestamp(state.lastAttemptAt),lastSuccessAt:timestamp(state.lastSuccessAt),nextRunAt:timestamp(state.nextRunAt),counts};
    });
  });
  return {health,connections,jobs,security,sportlink};
}

/** Explicit PIDs only; never stop another role or a recent application query. */
export async function resetStalledConnections(sql:any,pids:number[],minimumAgeSeconds=600){
  if(!pids.length||pids.length>20||pids.some(pid=>!Number.isSafeInteger(pid)||pid<1||pid>2147483647))throw new Error('Invalid application connection IDs');
  const stopped=await sql`select pid,pg_terminate_backend(pid) as terminated from pg_stat_activity
    where pid in ${sql(pids)} and usename='duindorp_app' and datname=current_database()
    and pid<>pg_backend_pid() and (
      (state='active' and query_start<now()-make_interval(secs=>${minimumAgeSeconds}))
      or (state in ('idle in transaction','idle in transaction (aborted)') and xact_start<now()-make_interval(secs=>${minimumAgeSeconds}))
    )`;
  await sql`insert into cms_audit(id,action,request_id,metadata) values (${crypto.randomUUID()},'production-stalled-connection-reset',${crypto.randomUUID()},${sql.json({requested:pids,stopped})})`;
  return stopped;
}

export function safeDatabaseCode(error:unknown){
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
  return /^[0-9A-Z]{5}$/.test(code)||['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','CONNECT_TIMEOUT'].includes(code)?code:'unavailable';
}

const mailJobKinds=['auth-code-mail','mail','submission-mail','sponsor-concept-mail','sponsor-document-mail','sponsor-notification','donor-invoice-mail','newsletter-delivery','newsletter-dispatch','newsletter-provider','newsletter-unsubscribe'];
const jobKinds=[...mailJobKinds,'sponsor-enquiry','sponsor-final-pdf','mollie-payment-verify','archive-media','sportlink-sync','news-analyze','news-import','image','sportlink-registration','publish','cache'];
const jobStatuses=['pending','processing','done','failed','cancelled'];
// last_error is untrusted: drivers/providers may include addresses or secrets.
// Only these application-owned classifications may leave the database.
const mailErrorCodes=['auth-identity','auth-otp-configuration','mail-unconfigured','mail-invalid','mail-sender-changed','mail-unavailable','mail-rejected','processing-failed','document-integrity','document-mail-kind','document-mail-recipient','document-mail-status','document-pdf-pending','file-integrity','invoice-integrity','concept-conflict','concept-document','concept-manual-check','concept-retry','newsletter-retry','forbidden','missing','validation','operation-conflict',
  '42501','42P01','42703','23505','23503','23514','22P02','57014','53300','55P03','40001','40P01','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','CONNECT_TIMEOUT'];

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
  const jobs=await check(tx=>tx`with classified as (
    select case when kind in ${tx(jobKinds)} then kind else 'unknown' end as kind,
      case when status in ${tx(jobStatuses)} then status else 'unknown' end as status from cms_jobs
    ) select kind,status,count(*)::int as count from classified group by kind,status order by kind,status`);
  const mail=await check(async tx=>{
    const groups=await tx`with classified as (
      select kind,case when status in ${tx(jobStatuses)} then status else 'unknown' end as status,
        case when coalesce(last_error,'')='' then 'none' when last_error in ${tx(mailErrorCodes)} then last_error else 'other' end as error_code,
        created_at,run_at from cms_jobs where kind in ${tx(mailJobKinds)}
        and (created_at>=now()-interval '24 hours' or status in ('pending','processing'))
      ) select kind,status,error_code,count(*)::int as count,
        count(*) filter(where status in ('pending','processing') and run_at<=now())::int as due_count,
        min(created_at) as oldest_created_at,max(created_at) as newest_created_at,
        min(run_at) as oldest_run_at,max(run_at) as newest_run_at,
        round(extract(epoch from now()-min(created_at)))::double precision as oldest_age_seconds
      from classified group by kind,status,error_code order by kind,status,error_code`;
    // The single worker can hold a general task while OTP work is queued. Show
    // its operational timing without the task ID, lease owner or payload.
    const processing=await tx`select case when kind in ${tx(jobKinds)} then kind else 'unknown' end as kind,
      attempts,max_attempts,created_at,run_at,lease_until,
      round(extract(epoch from now()-created_at))::double precision as created_age_seconds,
      round(extract(epoch from now()-run_at))::double precision as due_seconds,
      round(extract(epoch from lease_until-now()))::double precision as lease_seconds_remaining,
      lease_until<now() as lease_expired,
      case when coalesce(last_error,'')='' then 'none' when last_error in ${tx(mailErrorCodes)} then last_error else 'other' end as error_code
      from cms_jobs where status='processing' order by created_at,kind limit 25`;
    // Signing codes are sent synchronously, so their mail state is independent
    // of the login worker queue. Aggregate only; never read identities/hashes.
    const signing_challenges=await tx`with classified as (
      select case when party in ('sponsor','club') then party else 'unknown' end as party,
        case when status in ('pending','consumed','revoked') then status else 'unknown' end as status,
        case when mail_status in ('prepared','accepted','failed') then mail_status else 'unknown' end as mail_status,
        created_at,issued_at from cms_sponsor_signing_challenges where created_at>=now()-interval '24 hours'
      ) select party,status,mail_status,count(*)::int as count,
        min(created_at) as oldest_created_at,max(created_at) as newest_created_at,
        min(issued_at) as oldest_issued_at,max(issued_at) as newest_issued_at
      from classified group by party,status,mail_status order by party,status,mail_status`;
    return {window_hours:24,groups,processing,processing_limit:25,signing_challenges};
  });
  // Current mapping state only: a historical job cannot reconstruct an old
  // provider response. Keep auth-schema access isolated from other diagnostics.
  const auth_identity=await check(async tx=>{
    const [active_accounts]=await tx`select count(*)::int as total,
      count(*) filter(where a.supabase_user_id is not null)::int as mapped,
      count(*) filter(where a.supabase_user_id is null)::int as unmapped,
      count(*) filter(where p.id is not null)::int as provider_found,
      count(*) filter(where a.supabase_user_id is not null and p.id is null)::int as provider_missing,
      count(*) filter(where p.id is not null and p.email is null)::int as provider_email_missing,
      count(*) filter(where p.id is not null and lower(p.email)=lower(a.email))::int as provider_email_matches,
      count(*) filter(where p.id is not null and p.email is not null and lower(p.email)<>lower(a.email))::int as provider_email_mismatch
      from auth_user a left join auth.users p on p.id=a.supabase_user_id
      where coalesce(a.banned,false)=false and exists(select 1 from cms_memberships m where m.user_id=a.id and m.active=true)`;
    const failed_login_jobs=await tx`with failed as (
      select payload->>'email' as address,payload->>'nonceHash' as nonce_hash,created_at from cms_jobs
      where kind='auth-code-mail' and status='failed' and last_error='auth-identity' and created_at>=now()-interval '24 hours'
      ), classified as (
      select f.created_at,
        exists(select 1 from cms_auth_login_challenges c where c.nonce_hash=f.nonce_hash) as challenge_present,
        case when x.profiles=0 then 'current_profile_missing' when x.profiles>1 then 'current_profile_ambiguous'
          when x.enabled=0 then 'profile_inactive' when x.mapped=0 then 'mapping_missing'
          when x.provider_found=0 then 'provider_missing' when x.provider_email_missing>0 then 'provider_email_missing'
          when x.provider_email_matches=1 then 'provider_matches' else 'provider_email_mismatch' end as current_state
      from failed f cross join lateral (
        select count(*) as profiles,
          count(*) filter(where coalesce(a.banned,false)=false and exists(select 1 from cms_memberships m where m.user_id=a.id and m.active=true)) as enabled,
          count(*) filter(where a.supabase_user_id is not null) as mapped,
          count(*) filter(where p.id is not null) as provider_found,
          count(*) filter(where p.id is not null and p.email is null) as provider_email_missing,
          count(*) filter(where p.id is not null and lower(p.email)=lower(a.email)) as provider_email_matches
        from (select id,email,banned,supabase_user_id,count(*) over() as profile_count from auth_user where lower(email)=f.address) a
        left join auth.users p on p.id=a.supabase_user_id and a.profile_count=1
      ) x
      ) select current_state,challenge_present,count(*)::int as count,
        min(created_at) as oldest_created_at,max(created_at) as newest_created_at
      from classified group by current_state,challenge_present order by current_state,challenge_present`;
    return {window_hours:24,state_basis:'current_mapping',active_accounts,failed_login_jobs};
  });
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
  return {health,connections,jobs,mail,auth_identity,security,sportlink};
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

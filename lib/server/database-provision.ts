export type ProvisionStage='configuration'|'role'|'grants'|'policies'|'auth-scope'|'audit';

/** Repeatable provisioning while the previous web/worker release is still serving. */
export async function provisionDatabase(sql:any,password:string,onStage:(stage:ProvisionStage)=>void=()=>{}){
  onStage('configuration');
  if(!password||password.length<24)throw new Error('APP_DATABASE_PASSWORD moet minimaal 24 tekens bevatten.');
  // Session settings: never leave a deployment waiting behind a busy table.
  await sql`set lock_timeout='5s'`;
  await sql`set statement_timeout='30s'`;
  onStage('role');
  const [existing]=await sql`select rolname from pg_roles where rolname='duindorp_app'`;
  if(!existing){
    const [statement]=await sql`select format('CREATE ROLE duindorp_app LOGIN PASSWORD %L',${password}::text) as command`;
    await sql.unsafe(statement.command);
  }
  onStage('grants');
  await sql`grant usage on schema public,drizzle to duindorp_app`;
  await sql`grant select,insert,update,delete on all tables in schema public to duindorp_app`;
  await sql`grant usage,select on all sequences in schema public to duindorp_app`;
  await sql`alter default privileges in schema public grant select,insert,update,delete on tables to duindorp_app`;
  await sql`alter default privileges in schema public grant usage,select on sequences to duindorp_app`;
  await sql`grant select on all tables in schema drizzle to duindorp_app`;
  onStage('policies');
  const tables=await sql`select c.relname as name,c.relrowsecurity as rls,
    coalesce(p.polpermissive and p.polcmd='*'
      and p.polroles=array[(select oid from pg_roles where rolname='duindorp_app')]
      and pg_get_expr(p.polqual,p.polrelid)='true'
      and pg_get_expr(p.polwithcheck,p.polrelid)='true',false) as policy_matches,
    p.oid is not null as policy_exists
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    left join pg_policy p on p.polrelid=c.oid and p.polname='duindorp_backend'
    where n.nspname='public' and c.relkind='r' and c.relname ~ '^(cms_|auth_|sportlink_)'
    order by c.relname`;
  for(const table of tables){
    // ENABLE RLS and policy replacement acquire table locks even when the
    // resulting definition is identical. Leave already-correct policies alone.
    if(!table.rls||!table.policy_matches)await sql.begin(async(tx:any)=>{
      const name=tx('public.'+table.name);
      if(!table.rls)await tx`alter table ${name} enable row level security`;
      if(!table.policy_matches){
        if(table.policy_exists)await tx`drop policy duindorp_backend on ${name}`;
        await tx`create policy duindorp_backend on ${name} to duindorp_app using(true) with check(true)`;
      }
      await tx`revoke all on ${name} from anon,authenticated,service_role`;
    });
    else await sql`revoke all on ${sql('public.'+table.name)} from anon,authenticated,service_role`;
  }
  onStage('auth-scope');
  const [scope]=await sql`select has_schema_privilege('duindorp_app','auth','usage') as auth_access`;
  if(scope.auth_access)throw new Error('Het runtime-account heeft onverwachte toegang tot het beheerde Auth-schema.');
  onStage('audit');
  await sql`revoke update,delete on cms_audit,cms_revisions,cms_publications from duindorp_app`;
}

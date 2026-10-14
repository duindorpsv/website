import postgres from 'postgres';
// Operator command: a protected env file supplies the migration connection and
// APP_DATABASE_PASSWORD; neither a shell argument nor stdout contains secrets.
const password=process.env.APP_DATABASE_PASSWORD;if(!password||password.length<24)throw new Error('APP_DATABASE_PASSWORD moet minimaal 24 tekens bevatten.');
const sql=postgres(process.env.MIGRATION_DATABASE_URL||'',{max:1});try{
 const [statement]=await sql`select format('CREATE ROLE duindorp_app LOGIN PASSWORD %L',${password}::text) as command`;
 const [existing]=await sql`select rolname from pg_roles where rolname='duindorp_app'`;
 if(!existing)await sql.unsafe(statement.command);
 await sql`grant usage on schema public,drizzle to duindorp_app`;
 await sql`grant select,insert,update,delete on all tables in schema public to duindorp_app`;
 await sql`grant usage,select on all sequences in schema public to duindorp_app`;
 await sql`alter default privileges in schema public grant select,insert,update,delete on tables to duindorp_app`;
 await sql`alter default privileges in schema public grant usage,select on sequences to duindorp_app`;
 await sql`grant select on all tables in schema drizzle to duindorp_app`;
 await sql`revoke update,delete on cms_audit,cms_revisions,cms_publications from duindorp_app`;
 console.log('Beperkt runtime-account ingericht. Migratie-account blijft gescheiden.');
}catch(error){console.error(JSON.stringify({code:'database-provision-failed',reason:error instanceof Error&&'code' in error?String(error.code):'unknown'}));process.exitCode=1;}finally{await sql.end();}

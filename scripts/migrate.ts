import postgres from 'postgres';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {drizzle} from 'drizzle-orm/postgres-js';
import {databaseOptions} from '../lib/server/database-config';
const client=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL||'',databaseOptions(1));
try {const [provider]=await client`select to_regclass('auth.users') as users`;if(!provider.users)throw new Error('Deze release vereist de eigen Supabase-projectdatabase.');const foreign=await client`select tablename from pg_tables where schemaname='public' and tablename !~ '^(cms_|auth_|sportlink_)'`;if(foreign.length)throw new Error('De doel-database bevat andere applicatietabellen; wijs een eigen Duindorp Supabase-project aan.');await client`select pg_advisory_lock(736401)`;await migrate(drizzle(client),{migrationsFolder:'db/migrations'});}finally{await client`select pg_advisory_unlock(736401)`;await client.end();}

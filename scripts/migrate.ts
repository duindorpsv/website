import postgres from 'postgres';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {drizzle} from 'drizzle-orm/postgres-js';
const client=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL||'',{max:1});
try {await client`select pg_advisory_lock(736401)`;await migrate(drizzle(client),{migrationsFolder:'db/migrations'});}finally{await client`select pg_advisory_unlock(736401)`;await client.end();}

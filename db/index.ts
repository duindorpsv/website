import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import {databaseOptions} from '../lib/server/database-config';
let connection:ReturnType<typeof postgres>|undefined;
let ormConnection:ReturnType<typeof postgres>|undefined;
let database:ReturnType<typeof makeDb>|undefined;
function createConnection(max:number){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL ontbreekt.');return postgres(process.env.DATABASE_URL,databaseOptions(max));}
export function sqlClient(){return connection??=createConnection(8);}
// Drizzle intentionally replaces JSON/date serializers on its client. Keep its
// bounded pool separate from the raw PostgreSQL repository/queue connection.
function makeDb(){return drizzle(ormConnection??=createConnection(4),{schema});}
export function getDb(){return database??=makeDb();}
export async function closeDb(){await Promise.all([connection?.end(),ormConnection?.end()]);}

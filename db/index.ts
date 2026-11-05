import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import {databaseOptions} from '../lib/server/database-config';
type Connection=ReturnType<typeof postgres>;
type DatabaseState={raw?:Connection;orm?:Connection;database?:ReturnType<typeof makeDb>;closing?:Promise<void>};
// Next's page and route bundles can evaluate this module independently. Share
// clients across those bundles, not just across imports within one module graph.
const runtime=globalThis as typeof globalThis & {__duindorpsvDatabase?:DatabaseState};
function shared(){return runtime.__duindorpsvDatabase??={};}
function createConnection(max:number){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL ontbreekt.');return postgres(process.env.DATABASE_URL,databaseOptions(max));}
// Production has a 15-session Supabase pool. Web + worker use at most 8;
// a replacing process can overlap during deployment while keeping headroom.
export function sqlClient(){return shared().raw??=createConnection(3);}
// Drizzle intentionally replaces JSON/date serializers on its client. Keep its
// bounded pool separate from the raw PostgreSQL repository/queue connection.
function makeDb(connection:Connection){return drizzle(connection,{schema});}
export function getDb(){const state=shared();return state.database??=makeDb(state.orm??=createConnection(1));}
export async function closeDb(){
 const state=runtime.__duindorpsvDatabase;if(!state)return;
 await(state.closing??=Promise.all([state.raw?.end({timeout:5}),state.orm?.end({timeout:5})]).then(()=>{
  if(runtime.__duindorpsvDatabase===state)delete runtime.__duindorpsvDatabase;
 }));
}

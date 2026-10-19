import postgres from 'postgres';
import {databaseOptions} from '../lib/server/database-config';
import {inspectDatabase,resetStalledConnections,safeDatabaseCode} from '../lib/server/database-diagnostics';

let sql:ReturnType<typeof postgres>|undefined;
try {
  if(process.env.APP_ENV!=='production'||process.env.GITHUB_REPOSITORY!=='duindorpsv/website'||process.env.GITHUB_REF!=='refs/heads/main')throw new Error('Verified production maintenance only');
  if(!process.env.MIGRATION_DATABASE_URL)throw new Error('Missing migration connection');
  sql=postgres(process.env.MIGRATION_DATABASE_URL,{...databaseOptions(1),connection:{application_name:'duindorp-production-diagnostics'}});
  console.log(JSON.stringify(await inspectDatabase(sql)));
  const requested=process.env.RESET_STALLED_PIDS?.trim();
  if(requested){
    if(!/^[1-9][0-9]{0,9}(,[1-9][0-9]{0,9}){0,19}$/.test(requested))throw new Error('Invalid application connection IDs');
    console.log(JSON.stringify({reset:await resetStalledConnections(sql,requested.split(',').map(Number))}));
    console.log(JSON.stringify(await inspectDatabase(sql)));
  }
} catch(error) {
  console.error(JSON.stringify({code:'database-diagnostics-failed',reason:safeDatabaseCode(error)}));
  process.exitCode=1;
} finally {await sql?.end({timeout:2});}

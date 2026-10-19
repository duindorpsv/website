import postgres from 'postgres';
import {databaseOptions} from '../lib/server/database-config';
import {provisionDatabase,type ProvisionStage} from '../lib/server/database-provision';
import {safeDatabaseCode} from '../lib/server/database-diagnostics';
// Operator command: a protected env file supplies the migration connection and
// APP_DATABASE_PASSWORD; neither a shell argument nor stdout contains secrets.
let sql:ReturnType<typeof postgres>|undefined,stage:ProvisionStage='configuration';
try{
 sql=postgres(process.env.MIGRATION_DATABASE_URL||'',{...databaseOptions(1),connection:{application_name:'duindorp-database-provision'}});
 await provisionDatabase(sql,process.env.APP_DATABASE_PASSWORD||'',value=>{stage=value;});
 console.log('Beperkt runtime-account ingericht. Migratie-account blijft gescheiden.');
}catch(error){console.error(JSON.stringify({code:'database-provision-failed',stage,reason:safeDatabaseCode(error)}));process.exitCode=1;}finally{await sql?.end({timeout:2});}

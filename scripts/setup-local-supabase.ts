import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.APP_ENV!=='test'||!process.env.GITHUB_ENV)throw new Error('Alleen toegestaan in de geïsoleerde CI-testjob.');
const status=JSON.parse(await readFile('.runtime/supabase-status.json','utf8'));
function setting(...names:string[]){for(const name of names)if(typeof status[name]==='string'&&status[name])return status[name] as string;throw new Error('Supabase-testinstelling ontbreekt: '+names.join('/'));}
const api=setting('API_URL'),database=setting('DB_URL');
if(new URL(api).hostname!=='127.0.0.1'||new URL(database).hostname!=='127.0.0.1')throw new Error('Supabase-verificatie mag uitsluitend de lokale CI-stack gebruiken.');
const adminKey=setting('SECRET_KEY','SERVICE_ROLE_KEY');
const values={SUPABASE_URL:api,SUPABASE_PUBLISHABLE_KEY:setting('PUBLISHABLE_KEY','ANON_KEY'),SUPABASE_SECRET_KEY:adminKey,
  MIGRATION_DATABASE_URL:database,APP_DATABASE_PASSWORD:randomBytes(24).toString('hex'),
  S3_ENDPOINT:api+'/storage/v1/s3',S3_REGION:'local',S3_BUCKET:'duindorp-test',
  S3_ACCESS_KEY_ID:setting('S3_PROTOCOL_ACCESS_KEY_ID'),S3_SECRET_ACCESS_KEY:setting('S3_PROTOCOL_ACCESS_KEY_SECRET','S3_PROTOCOL_SECRET_ACCESS_KEY'),
  SUPABASE_LOCAL_TESTS:'true',MEDIA_DRIVER:'s3',DATABASE_URL:'',
  TEST_MAIL_API_URL:'http://127.0.0.1:62623',RESEND_API_KEY:'synthetic-ci-resend-key',MAIL_FROM:'club@example.invalid'};
const runtime=new URL(database);runtime.username='duindorp_app';runtime.password=values.APP_DATABASE_PASSWORD;values.DATABASE_URL=runtime.href;
const client=createClient(api,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=await client.storage.getBucket(values.S3_BUCKET);
if(bucket.error){if((await client.storage.createBucket(values.S3_BUCKET,{public:false,fileSizeLimit:536870912})).error)throw new Error('Privétestbucket kon niet worden aangemaakt.');}
else if(bucket.data.public)throw new Error('De Supabase-testbucket moet privé zijn.');
for(const [key,value] of Object.entries(values)){
  if(/[\r\n]/.test(value))throw new Error('Ongeldige testconfiguratie: '+key);
  if(/KEY|PASSWORD|DATABASE_URL/.test(key))console.log('::add-mask::'+value);
}
await mkdir('.runtime',{recursive:true});
const body=Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n';
await writeFile('.runtime/local-supabase.env',body,{mode:0o600});
await appendFile(process.env.GITHUB_ENV,body);
console.log('Geïsoleerde Supabase Auth/Database/Storage-verificatie voorbereid.');

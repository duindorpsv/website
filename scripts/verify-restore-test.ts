import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
if(!['development','test'].includes(process.env.APP_ENV||''))throw new Error('Alleen een geïsoleerde developmentrestore is toegestaan.');
const url=new URL(process.env.DATABASE_URL||'');url.pathname='/duindorp_restore_test';process.env.DATABASE_URL=url.href;
process.env.MEDIA_ROOT=resolve('.runtime/restore/media');process.env.APP_ENV='test';
const {sqlClient,closeDb}=await import('../db');
try{
 const {getAuth}=await import('../lib/server/auth'),{mediaResponse}=await import('../lib/server/media'),sql=sqlClient();
 const owner=JSON.parse(await readFile('.runtime/e2e-account.json','utf8')),fixtures=JSON.parse(await readFile('.runtime/restore-fixtures.json','utf8'));
 const response=await getAuth().api.signInEmail({body:{email:owner.email,password:owner.password},asResponse:true});assert.equal(response.status,200,'Login in herstelde database');
 const [page]=await sql`select live from cms_records where module='pages' and live->>'slug'='club/ons-verhaal'`;assert.ok(page.live.title);
 const media=await mediaResponse(fixtures.mediaId);assert.equal(media.status,200);assert.ok((await media.arrayBuffer()).byteLength>0);
 const [submission]=await sql`select snapshot from cms_submissions where id=${fixtures.submissionId}`;assert.equal(submission.snapshot.name,'Synthetische restoreproef');assert.equal(submission.snapshot.definition.name,'Contact met de club');
 const result={at:new Date().toISOString(),environment:'isolated-development-restore',database:'duindorp_restore_test',checks:{login:true,page:true,media:true,formHistory:true},externalBackup:false};
 await writeFile('.runtime/restore/evidence.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}finally{await closeDb();}

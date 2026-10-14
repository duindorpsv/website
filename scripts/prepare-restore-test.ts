import {readFile,writeFile} from 'node:fs/promises';
import {sqlClient,closeDb} from '../db';
import {uploadMedia,processImage} from '../lib/server/media';
import {receiveForm} from '../lib/server/forms';
import {mutate} from '../lib/server/records';
import type {Principal} from '../lib/server/permissions';
import sharp from 'sharp';
if(process.env.APP_ENV!=='development'||!process.env.DATABASE_URL?.endsWith('/duindorp'))throw new Error('Restorefixtures vereisen de afzonderlijke developmentdatabase.');
try{
 const sql=sqlClient(),owner=JSON.parse(await readFile('.runtime/e2e-account.json','utf8'));
 const [member]=await sql`select user_id from cms_memberships where user_id=${owner.id} and role_id='admin' and active=true`;
 if(!member)throw new Error('Geïsoleerd testaccount ontbreekt.');
 const p:Principal={id:owner.id,name:'Restore test',email:owner.email,roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:true};
 const image=await sharp({create:{width:80,height:60,channels:3,background:'#1563a7'}}).png().toBuffer();
 const media=await uploadMedia(p,new File([image],'Synthetische restoreproef.png',{type:'image/png'}),{teamId:'',season:'restore-test',folderId:''});await processImage(media.id);
 await mutate(p,[{module:'media',id:media.id,expectedVersion:1,action:'publish',data:{...media,alt:'Synthetisch vlak voor herstelcontrole'}}],crypto.randomUUID(),crypto.randomUUID());
 const submission=await receiveForm('contact',{operationId:crypto.randomUUID(),answers:{name:'Synthetische restoreproef',email:'restore@example.invalid',message:'Historische snapshot voor herstelcontrole.'}},'restore-'+crypto.randomUUID());
 await writeFile('.runtime/restore-fixtures.json',JSON.stringify({mediaId:media.id,submissionId:submission.id}),{mode:0o600});
 console.log('Afzonderlijke synthetische media- en ontvangstfixtures voorbereid.');
}finally{await closeDb();}

import {getAuth} from '../lib/server/auth';
import {sqlClient,closeDb} from '../db/index';
import {writeFile,readFile} from 'node:fs/promises';
if(!['development','test'].includes(process.env.APP_ENV||''))throw new Error('Testaccounts zijn alleen toegestaan in development/test.');
const sql=sqlClient();try{
 const email='cms-e2e@example.invalid',password=crypto.randomUUID()+crypto.randomUUID();const [existing]=await sql`select id from auth_user where email=${email}`;
 if(existing){const saved=JSON.parse(await readFile('.runtime/e2e-account.json','utf8'));if(saved.id!==existing.id)throw new Error('Bestaand testaccount past niet bij het private fixturebestand.');console.log('Bestaand privaat testaccount hergebruikt.');process.exitCode=0;}else{
 const result=await getAuth().api.createUser({body:{email,name:'CMS testbeheerder',password,role:'admin'}});await sql`insert into cms_memberships(user_id,role_id) values (${result.user.id},'admin')`;
 await writeFile('.runtime/e2e-account.json',JSON.stringify({email,id:result.user.id}),{mode:0o600});console.log('Privaat developmenttestaccount voorbereid.');}
}finally{await closeDb();}

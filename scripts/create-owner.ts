import {getAuth} from '../lib/server/auth';
import {sqlClient,closeDb} from '../db/index';
import {createInterface} from 'node:readline/promises';
const input=createInterface({input:process.stdin,output:process.stdout});
const email=process.env.OWNER_EMAIL||await input.question('E-mailadres eigenaar: '),name=process.env.OWNER_NAME||await input.question('Naam eigenaar: ');input.close();
const sql=sqlClient();try{
 const [existing]=await sql`select m.user_id from cms_memberships m join auth_user u on u.id=m.user_id where m.role_id='admin' and m.active=true and u.supabase_user_id is not null and coalesce(u.banned,false)=false`;if(existing)throw new Error('Er is al een beheerder. Gebruik het uitnodigingsproces.');
 const password=crypto.randomUUID()+crypto.randomUUID();const result=await getAuth().api.createUser({body:{email,name,password,role:'admin'}});
 await sql`insert into cms_memberships(user_id,role_id) values (${result.user.id},'admin')`;
 await getAuth().api.notifyAccountAccess({body:{email}});
 console.log('Account aangemaakt. De welkommail staat in de Resend-verzendqueue. Log in met de achtcijferige e-mailcode; er is geen wachtwoord nodig.');
}finally{await closeDb();}

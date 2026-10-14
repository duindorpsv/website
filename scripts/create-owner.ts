import {getAuth} from '../lib/server/auth';
import {sqlClient,closeDb} from '../db/index';
import {createInterface} from 'node:readline/promises';
const input=createInterface({input:process.stdin,output:process.stdout});
const email=process.env.OWNER_EMAIL||await input.question('E-mailadres eigenaar: '),name=process.env.OWNER_NAME||await input.question('Naam eigenaar: ');input.close();
const sql=sqlClient();try{
 const [existing]=await sql`select user_id from cms_memberships where role_id='admin' and active=true`;if(existing)throw new Error('Er is al een beheerder. Gebruik het uitnodigingsproces.');
 const password=crypto.randomUUID()+crypto.randomUUID();const result=await getAuth().api.createUser({body:{email,name,password,role:'admin'}});
 await sql`insert into cms_memberships(user_id,role_id) values (${result.user.id},'admin')`;
 await getAuth().api.requestPasswordReset({body:{email,redirectTo:'/beheer/herstel'}});
 console.log('Account aangemaakt. Activatie-e-mail staat in de verzendqueue; SMTP moet aangesloten zijn. Geen standaardwachtwoord aangemaakt.');
}finally{await closeDb();}

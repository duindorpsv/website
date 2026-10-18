import {supabaseAdmin} from '../lib/server/supabase';
import {sqlClient,closeDb} from '../db';
import {getAuth} from '../lib/server/auth';
const flags=new Set(process.argv.slice(2));
if([...flags].some(flag=>!['--apply','--queue-activation'].includes(flag))||(flags.has('--queue-activation')&&!flags.has('--apply')))throw new Error('Gebruik --apply, eventueel met --queue-activation. Zonder --apply wordt alleen geteld.');
const sql=sqlClient();
try{
 const profiles=await sql`select u.id,u.name,u.email from auth_user u join cms_memberships m on m.user_id=u.id where u.supabase_user_id is null and m.active=true and coalesce(u.banned,false)=false order by u.id`;
 if(!flags.has('--apply'))console.log(JSON.stringify({pendingAccounts:profiles.length,applied:false}));
 else{
  const admin=supabaseAdmin();let migrated=0;
  for(const profile of profiles){
   // createUser must fail on an existing provider email. Never automatically
   // attach a CMS identity to an unrelated account based on email alone.
   const result=await admin.auth.admin.createUser({email:profile.email,password:crypto.randomUUID()+crypto.randomUUID(),email_confirm:true,user_metadata:{name:profile.name}});
   if(result.error||!result.data.user)throw new Error('Supabase-accountmigratie vereist controle voor CMS-id '+profile.id);
   const updated=await sql`update auth_user set supabase_user_id=${result.data.user.id}::uuid,two_factor_enabled=false,updated_at=now() where id=${profile.id} and supabase_user_id is null returning id`;
   if(updated.length!==1){await admin.auth.admin.deleteUser(result.data.user.id);throw new Error('CMS-profiel is ondertussen gewijzigd.');}
   if(flags.has('--queue-activation'))await getAuth().api.requestPasswordReset({body:{email:profile.email}});
   migrated++;
  }
  console.log(JSON.stringify({migratedAccounts:migrated,activationQueued:flags.has('--queue-activation')}));
 }
}finally{await closeDb();}

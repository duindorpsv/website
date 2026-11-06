import {z} from 'zod';
const mode=z.enum(['test','live']);
const id=z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const optionalId=z.union([z.literal(''),id]);
const timestamp=z.string().datetime({offset:true});
export const mollieStreamSchema=z.object({id,code:z.string().min(1).max(40).regex(/^[a-z][a-z0-9-]*$/),label:z.string().trim().min(1).max(100),enabled:z.boolean(),profileId:optionalId,referencePrefix:z.string().max(30).regex(/^[A-Za-z0-9._-]*$/)}).strict();
const profile=z.object({id,name:z.string().min(1).max(300),website:z.string().max(1000),status:z.enum(['verified','unverified','blocked']),canReceivePayments:z.boolean(),mode,readinessCheckedAt:timestamp}).strict();
const balance=z.object({id,description:z.string().min(1).max(300),currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(['active','inactive']),mode}).strict();
const link=z.object({profileId:id,balanceId:id,verifiedBy:z.enum(['manual','provider']),verifiedAt:timestamp,evidence:z.string().trim().min(1).max(500)}).strict();
const catalog=z.object({source:z.enum(['none','provider']),organizationId:z.string().max(120),bindingId:z.string().max(120),fetchedAt:z.union([z.literal(''),timestamp]),profiles:z.array(profile).max(10000),balances:z.array(balance).max(10000),links:z.array(link).max(10000)}).strict();
const environment=z.object({authMode:z.enum(['advanced-token','profile-api-key']),credentialReference:z.enum(['','MOLLIE_TEST_TOKEN','MOLLIE_LIVE_TOKEN']),currentProfileId:optionalId,paymentsEnabled:z.literal(false),catalog,streams:z.array(mollieStreamSchema).max(100)}).strict();
export const mollieSettingsSchema=z.object({mode,environments:z.object({test:environment,live:environment}).strict()}).strict().superRefine((value,ctx)=>{
 for(const name of ['test','live'] as const){
  const env=value.environments[name],c=env.catalog,fail=(message:string)=>ctx.addIssue({code:'custom',path:['environments',name],message});
  if(env.credentialReference&&env.credentialReference!==`MOLLIE_${name.toUpperCase()}_TOKEN`)fail('Gebruik de beheerde toegang voor dezelfde omgeving.');
  for(const rows of [env.streams,c.profiles,c.balances])if(new Set(rows.map(row=>row.id)).size!==rows.length)fail('Dubbele referentie in de inrichting.');
  if(new Set(env.streams.map(row=>row.code)).size!==env.streams.length)fail('Elke geldstroom heeft een unieke code.');
  for(const code of ['sponsors','donations','webshop'])if(!env.streams.some(row=>row.code===code))fail('Behoud de drie vaste geldstromen.');
  if(c.source==='none'&&(c.profiles.length||c.balances.length||c.links.length||c.organizationId||c.bindingId||c.fetchedAt))fail('Een niet opgehaalde catalogus bevat geen accountgegevens.');
  if(c.source==='provider'&&(!c.organizationId||!c.bindingId||!c.fetchedAt))fail('De catalogus mist zijn accountbinding of ophaaldatum.');
  if(c.profiles.some(row=>row.mode!==name)||c.balances.some(row=>row.mode!==name))fail('Test en live blijven gescheiden.');
  if(new Set(c.links.map(row=>row.profileId)).size!==c.links.length)fail('Een profiel heeft één geregistreerde balans.');
  if(c.links.some(row=>!c.profiles.some(p=>p.id===row.profileId)||!c.balances.some(b=>b.id===row.balanceId)))fail('Een registratie moet naar deze catalogus verwijzen.');
  if(env.authMode==='profile-api-key'&&c.profiles.length&&(c.profiles.length!==1||c.profiles[0].id!==env.currentProfileId))fail('Een profielsleutel hoort bij één vast profiel.');
  if(env.streams.some(row=>row.profileId&&!c.profiles.some(p=>p.id===row.profileId)||row.enabled&&!row.profileId))fail('Kies een bekend profiel voor elke ingerichte geldstroom.');
 }
});

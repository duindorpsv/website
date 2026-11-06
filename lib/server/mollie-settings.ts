import {createHash} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {buildMolliePaymentPreview,createMollieSettings,emptyMollieCatalog,getMollieStreamRoute,mollieCatalogFresh,MOLLIE_BUILTIN_CODES} from '../cms/mollie';
import {mollieSettingsSchema,mollieStreamSchema} from '../cms/mollie-schema';
import type {MollieMode,MollieSettings,MollieStream} from '../cms/mollie-types';
import {CmsError} from './errors';
import {has,type Principal} from './permissions';
import {workspaceActor,freshActor,workspaceRate,donorRight} from './sponsor-access';
import {fetchMollieCatalog,resolveMollieCredential,requireMollieScopes} from './mollie-provider';

const RECORD_ID='site-mollie';
const modes=['test','live'] as const;
export function canManageMollieServer(p:Principal){return !p.teamScoped&&(p.roleId==='admin'||['manage','update','create'].some(action=>has(p,'settings',action)));}
function requireManage(p:Principal){if(!canManageMollieServer(p))throw new CmsError('forbidden','Voor Mollie zijn clubbrede instellingenrechten nodig.',403);}
function clearCatalog(settings:MollieSettings,mode:MollieMode){const env=settings.environments[mode];env.catalog=emptyMollieCatalog();env.streams=env.streams.map(row=>({...row,enabled:false,profileId:''}));}
function assertConnection(settings:MollieSettings,mode:MollieMode){
 const env=settings.environments[mode],credential=resolveMollieCredential(mode);
 if(credential.binding.authMode==='advanced-token')requireMollieScopes(credential,['organizations.read','profiles.read','balances.read','payments.read']);
 if(env.credentialReference!==`MOLLIE_${mode.toUpperCase()}_TOKEN`||env.authMode!==credential.binding.authMode||env.currentProfileId!==credential.binding.currentProfileId)throw new CmsError('mollie-binding','De opgeslagen verbinding past niet bij de beheerde toegang.',409);
 return credential;
}
export async function readMollieConfiguration(transaction?:any):Promise<{settings:MollieSettings;version:number;configHash:string}>{
 const tx=transaction||sqlClient(),[row]=await tx`select draft,version from cms_records where id=${RECORD_ID} and module='mollieSettings' and deleted_at is null`;
 let settings=createMollieSettings();
 if(row){const parsed=mollieSettingsSchema.safeParse(row.draft);if(!parsed.success)throw new CmsError('mollie-configuration','De opgeslagen betaalinrichting vereist controle door een beheerder.',503);settings=parsed.data;}
 for(const mode of modes){const catalog=settings.environments[mode].catalog;if(catalog.source==='none')continue;try{const credential=assertConnection(settings,mode);if(catalog.bindingId!==credential.binding.id||catalog.organizationId!==credential.binding.organizationId)clearCatalog(settings,mode);}catch{clearCatalog(settings,mode);}}
 const configHash=createHash('sha256').update(JSON.stringify(settings)).digest('hex');return {settings,version:Number(row?.version||0),configHash};
}
export async function resolveMollieServerRoute(streamCode:string,selectedMode?:MollieMode,transaction?:any){
 const config=await readMollieConfiguration(transaction),mode=selectedMode||config.settings.mode,credential=assertConnection(config.settings,mode),catalog=config.settings.environments[mode].catalog;
 if(catalog.bindingId!==credential.binding.id||catalog.organizationId!==credential.binding.organizationId)throw new CmsError('mollie-binding-changed','Vernieuw de Mollie-catalogus en controleer de accountbinding.',409);
 const route=getMollieStreamRoute(config.settings,streamCode,mode);if(!route.available)throw new CmsError('mollie-route-unavailable',route.reason,409);
 return {...config,route,credential};
}
function status(settings:MollieSettings){return Object.fromEntries(modes.map(mode=>{try{const credential=resolveMollieCredential(mode),{binding}=credential;if(binding.authMode==='advanced-token')requireMollieScopes(credential,['organizations.read','profiles.read','balances.read','payments.read']);const env=settings.environments[mode],configured=env.credentialReference===`MOLLIE_${mode.toUpperCase()}_TOKEN`&&env.authMode===binding.authMode&&env.currentProfileId===binding.currentProfileId;return [mode,{configured,organizationId:binding.organizationId,bindingId:binding.id,currentProfileId:binding.currentProfileId,authMode:binding.authMode,reason:configured?'':'Bewaar de koppelinstellingen die bij de beheerde toegang horen.'}];}catch(error){return [mode,{configured:false,organizationId:'',bindingId:'',currentProfileId:'',authMode:settings.environments[mode].authMode,reason:error instanceof CmsError?error.message:'De accountbinding vereist controle.'}];}}));}
function project(config:Awaited<ReturnType<typeof readMollieConfiguration>>){return {...config,connections:status(config.settings),paymentsEnabled:false as const,executionAllowed:false as const};}
export async function readMollieWorkspace(request:Request){
 const actor=await workspaceActor(request.headers),url=new URL(request.url),summary=url.searchParams.get('stream');
 return sqlClient().begin('isolation level repeatable read read only',async tx=>{
  const p=await freshActor(tx,actor);
  if(summary){
   const allowed=!p.teamScoped&&(summary==='sponsors'?has(p,'sponsors','read')||has(p,'sponsors','manage'):summary==='donations'?donorRight(p):false);
   if(!allowed&&!canManageMollieServer(p))throw new CmsError('forbidden','Je hebt geen toegang tot deze betaalstroom.',403);
   const {settings}=await readMollieConfiguration(tx),route=getMollieStreamRoute(settings,summary);
   return {mode:route.mode,available:route.available,reason:route.reason,profileName:route.profile?.name||'',balanceDescription:route.balance?.description||'',referencePrefix:route.stream?.referencePrefix||'',classificationLabel:route.classificationLabel,paymentsEnabled:false};
  }
  requireManage(p);return project(await readMollieConfiguration(tx));
 });
}
const mode=z.enum(modes),version=z.number().int().min(0),reference=z.enum(['','MOLLIE_TEST_TOKEN','MOLLIE_LIVE_TOKEN']);
const commandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('mode'),expectedVersion:version,mode}).strict(),
 z.object({action:z.literal('connection'),expectedVersion:version,mode,authMode:z.enum(['advanced-token','profile-api-key']),credentialReference:reference,currentProfileId:z.string().max(120)}).strict(),
 z.object({action:z.literal('sync'),expectedVersion:version,mode}).strict(),
 z.object({action:z.literal('streams'),expectedVersion:version,mode,streams:z.array(mollieStreamSchema).max(100)}).strict(),
 z.object({action:z.literal('remove-stream'),expectedVersion:version,mode,id:z.string().max(120)}).strict(),
 z.object({action:z.literal('confirm-link'),expectedVersion:version,mode,profileId:z.string().max(120),balanceId:z.string().max(120),confirmed:z.literal(true),evidence:z.string().trim().min(1).max(500)}).strict(),
 z.object({action:z.literal('preview'),expectedVersion:version,mode,streamCode:z.string().max(40),reference:z.string().trim().min(1).max(140),amountCents:z.number().int().positive().max(100000000)}).strict()
]);
function validateStreams(settings:MollieSettings,mode:MollieMode,next:MollieStream[]){
 const env=settings.environments[mode];
 for(const old of env.streams){const row=next.find(value=>value.id===old.id);if(MOLLIE_BUILTIN_CODES.includes(old.code as any)&&(!row||row.code!==old.code))throw new CmsError('mollie-builtin','Behoud de vaste geldstromen. Deze kunnen alleen worden uitgeschakeld.',422);if(row&&row.code!==old.code)throw new CmsError('mollie-code','De code van een bestaande geldstroom blijft behouden.',422);}
 env.streams=next;
 for(const row of next){if(row.profileId&&!env.catalog.profiles.some(p=>p.id===row.profileId))throw new CmsError('mollie-profile','Kies een profiel uit de huidige catalogus.',422);if(row.enabled){assertConnection(settings,mode);const route=getMollieStreamRoute(settings,row.code,mode);if(!route.available)throw new CmsError('mollie-route-unavailable',route.reason,422);}}
}
export async function commandMollieWorkspace(request:Request,input:unknown){
 const command=commandSchema.parse(input),actor=await workspaceActor(request.headers);
 requireManage(actor.p);
 let catalog:Awaited<ReturnType<typeof fetchMollieCatalog>>|undefined,bindingId='';
 if(command.action==='sync'){
  await sqlClient().begin(async tx=>{requireManage(await freshActor(tx,actor));await workspaceRate('mollie-sync:'+actor.p.id,5,60,tx);});
  const current=await readMollieConfiguration();if(current.version!==command.expectedVersion)throw new CmsError('conflict','De betaalinstellingen zijn gewijzigd. Herlaad het scherm.',409);
  const credential=assertConnection(current.settings,command.mode);bindingId=credential.binding.id;catalog=await fetchMollieCatalog(credential);
 }
 return sqlClient().begin(async tx=>{
  await tx`select pg_advisory_xact_lock(736497)`;
  const p=await freshActor(tx,actor);requireManage(p);
  const current=await readMollieConfiguration(tx);
  if(current.version!==command.expectedVersion)throw new CmsError('conflict','De betaalinstellingen zijn ondertussen gewijzigd. Herlaad het scherm.',409);
  const settings=structuredClone(current.settings),env=settings.environments[command.mode];
  if(command.action==='preview'){
   const credential=assertConnection(settings,command.mode),route=await resolveMollieServerRoute(command.streamCode,command.mode,tx),preview=buildMolliePaymentPreview(settings,command.streamCode,command,command.mode);
   if(credential.binding.authMode==='advanced-token'){preview.body.profileId=route.route.profile!.id;if(credential.binding.testmodeParameter)preview.body.testmode=command.mode==='test';}
   return {preview};
  }
  if(command.action==='mode')settings.mode=command.mode;
  if(command.action==='connection'){
   if(command.credentialReference&&command.credentialReference!==`MOLLIE_${command.mode.toUpperCase()}_TOKEN`)throw new CmsError('mollie-binding','Kies de beheerde toegang voor dezelfde omgeving.',422);
   // An empty/unprovisioned connection can be prepared, but is never connected.
   if(command.credentialReference){try{const credential=resolveMollieCredential(command.mode);if(credential.binding.authMode!==command.authMode||credential.binding.currentProfileId!==command.currentProfileId)throw new CmsError('mollie-binding','De profielkeuze moet overeenkomen met de beheerde servertoegang.',422);}catch(error){if(!(error instanceof CmsError)||error.code!=='mollie-not-configured')throw error;}}
   if(env.authMode!==command.authMode||env.credentialReference!==command.credentialReference||env.currentProfileId!==command.currentProfileId)clearCatalog(settings,command.mode);
   env.authMode=command.authMode;env.credentialReference=command.credentialReference;env.currentProfileId=command.currentProfileId;
  }
  if(command.action==='sync'){
   const credential=assertConnection(settings,command.mode);if(!catalog||credential.binding.id!==bindingId)throw new CmsError('mollie-binding-changed','De toegang is tijdens het ophalen gewijzigd. Probeer opnieuw.',409);
   catalog.links=env.catalog.bindingId===catalog.bindingId?env.catalog.links.filter(link=>catalog!.profiles.some(row=>row.id===link.profileId)&&catalog!.balances.some(row=>row.id===link.balanceId)):[];
   env.catalog=catalog;env.streams=env.streams.map(row=>catalog!.profiles.some(profile=>profile.id===row.profileId)?row:{...row,enabled:false,profileId:''});
  }
  if(command.action==='confirm-link'){
   assertConnection(settings,command.mode);
   if(!mollieCatalogFresh(env.catalog)||!env.catalog.profiles.some(row=>row.id===command.profileId)||!env.catalog.balances.some(row=>row.id===command.balanceId&&row.status==='active'&&row.currency==='EUR'))throw new CmsError('mollie-link','Vernieuw de catalogus en kies een bekend profiel met een actieve EUR-balans.',422);
   env.catalog.links=env.catalog.links.filter(row=>row.profileId!==command.profileId);env.catalog.links.push({profileId:command.profileId,balanceId:command.balanceId,verifiedBy:'manual',verifiedAt:new Date().toISOString(),evidence:command.evidence});
  }
  if(command.action==='streams')validateStreams(settings,command.mode,command.streams);
  if(command.action==='remove-stream'){const target=env.streams.find(row=>row.id===command.id);if(!target)throw new CmsError('missing','Deze geldstroom bestaat niet.',404);if(MOLLIE_BUILTIN_CODES.includes(target.code as any))throw new CmsError('mollie-builtin','Een vaste geldstroom kan alleen worden uitgeschakeld.',422);env.streams=env.streams.filter(row=>row.id!==command.id);}
  const validated=mollieSettingsSchema.parse(settings),next=current.version+1;
  await tx`insert into cms_records(id,module,title,status,version,draft,live) values (${RECORD_ID},'mollieSettings','Mollie · betalingen','draft',${next},${tx.json(validated as any)},null) on conflict(id) do update set draft=excluded.draft,version=excluded.version,live=null,updated_at=now()`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${p.id},${'mollie-'+command.action},${RECORD_ID},${crypto.randomUUID()},${tx.json({mode:command.mode,version:next,...(command.action==='confirm-link'?{profileId:command.profileId,balanceId:command.balanceId,verification:'manual'}:{})})})`;
  return project(await readMollieConfiguration(tx));
 });
}

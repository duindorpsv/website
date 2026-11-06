import {createHmac} from 'node:crypto';
import {z} from 'zod';
import type {MollieAuthMode,MollieBalance,MollieCatalog,MollieMode,MollieProfile} from '../cms/mollie-types';
import {CmsError} from './errors';

export type MollieCredentialBinding={id:string;clubId:'duindorpsv';organizationId:string;mode:MollieMode;authMode:MollieAuthMode;credentialKind:'advanced-access-token'|'oauth'|'profile-api-key';currentProfileId:string;scopes:string[];testmodeParameter:boolean};
export type MollieCredential={token:string;binding:MollieCredentialBinding};
const bindingSchema=z.object({clubId:z.literal('duindorpsv'),organizationId:z.string().regex(/^org_[A-Za-z0-9]+$/),mode:z.enum(['test','live']),authMode:z.enum(['advanced-token','profile-api-key']),credentialKind:z.enum(['advanced-access-token','oauth','profile-api-key']),currentProfileId:z.string().regex(/^pfl_[A-Za-z0-9]+$/).or(z.literal('')),scopes:z.array(z.enum(['profiles.read','balances.read','payments.read','payments.write'])).max(4),testmodeParameter:z.boolean()}).strict();
/** The browser cannot choose a process variable or supply token/binding claims. */
export function resolveMollieCredential(mode:MollieMode,expectedBindingId?:string):MollieCredential{
 if(mode!=='test'&&mode!=='live')throw new CmsError('mollie-mode','Kies test of live.',422);
 const token=mode==='test'?process.env.MOLLIE_TEST_TOKEN:process.env.MOLLIE_LIVE_TOKEN;
 const encoded=mode==='test'?process.env.MOLLIE_TEST_BINDING:process.env.MOLLIE_LIVE_BINDING;
 if(!token||!encoded)throw new CmsError('mollie-not-configured','De beheerde Mollie-toegang voor deze omgeving is nog niet ingesteld.',503);
 let value:unknown;try{value=JSON.parse(encoded);}catch{throw new CmsError('mollie-binding','De beheerde accountbinding is niet geldig.',503);}
 const parsed=bindingSchema.safeParse(value);
 if(!parsed.success||parsed.data.mode!==mode||/\s/.test(token)||token.length<20)throw new CmsError('mollie-binding','De beheerde toegang past niet bij deze omgeving.',503);
 const data=parsed.data;
 if(data.credentialKind==='profile-api-key'){
  if(data.authMode!=='profile-api-key'||!data.currentProfileId||data.testmodeParameter||!token.startsWith(mode+'_'))throw new CmsError('mollie-binding','De profielsleutel past niet bij de vastgelegde modus en het profiel.',503);
 }else if(data.authMode!=='advanced-token'||data.credentialKind==='oauth'&&!data.testmodeParameter)throw new CmsError('mollie-binding','Controleer het bereik en de modus van de organisatietoegang.',503);
 const id=createHmac('sha256',token).update(JSON.stringify(data)).digest('hex');
 if(expectedBindingId&&id!==expectedBindingId)throw new CmsError('mollie-binding-changed','De Mollie-toegang is gewijzigd. Vernieuw de accountcatalogus en controleer de registraties.',409);
 return {token,binding:{...data,id}};
}
export function requireMollieScopes(credential:MollieCredential,scopes:string[]){
 if(scopes.some(scope=>!credential.binding.scopes.includes(scope)))throw new CmsError('mollie-scope','De beheerde Mollie-toegang mist de vereiste lees- of betaalrechten.',503);
}
export type MollieFetcher=typeof fetch;
const API='https://api.mollie.com';
/** Fixed origin and rejected redirects keep the bearer token on Mollie's API. */
export async function mollieRequest(credential:MollieCredential,path:string,fetcher:MollieFetcher=fetch):Promise<any>{
 const url=new URL(path,API);
 if(url.origin!==API||url.username||url.password||!url.pathname.startsWith('/v2/'))throw new CmsError('mollie-pagination','Mollie gaf een ongeldige paginaverwijzing terug.',502);
 let response:Response;
 try{response=await fetcher(url,{method:'GET',headers:{Authorization:`Bearer ${credential.token}`,Accept:'application/hal+json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new CmsError('mollie-unreachable','Mollie is tijdelijk niet bereikbaar. De bestaande catalogus is behouden.',502);}
 if(!response.ok){const status=response.status;throw new CmsError(status===401?'mollie-unauthorized':status===403?'mollie-scope':status===429?'mollie-rate-limit':'mollie-provider',status===401?'Mollie accepteert de beheerde toegang niet.':status===403?'Mollie weigert deze gegevens. Controleer de scopes en het accountbereik.':status===429?'Mollie vraagt om later opnieuw te proberen.':'De Mollie-gegevens konden niet volledig worden opgehaald.',status===429?429:502);}
 let text:string;try{text=await response.text();}catch{throw new CmsError('mollie-response','Het Mollie-antwoord kon niet volledig worden gelezen.',502);}
 if(text.length>8000000)throw new CmsError('mollie-response','De Mollie-pagina overschrijdt de veilige omvang. De catalogus is behouden.',502);
 try{return JSON.parse(text);}catch{throw new CmsError('mollie-response','Mollie gaf geen geldig gegevensantwoord.',502);}
}
function expect(value:unknown,message='Mollie gaf onvolledige of afwijkende catalogusgegevens terug.'):asserts value{if(!value)throw new CmsError('mollie-response',message,502);}
function queryMode(credential:MollieCredential){return credential.binding.testmodeParameter?`testmode=${credential.binding.mode==='test'?'true':'false'}`:'';}
function withQuery(path:string,query:string){return path+(query?'?'+query:'');}
/** Stops explicitly at a large operational bound; never publishes a partial list. */
async function list(credential:MollieCredential,kind:'profiles'|'balances',fetcher:MollieFetcher){
 const pathname=`/v2/${kind}`,modeQuery=kind==='balances'?queryMode(credential):'',initial=new URL(withQuery(pathname,'limit=250'+(modeQuery?'&'+modeQuery:'')),API),rows:any[]=[],ids=new Set<string>(),seen=new Set<string>();let next:URL|null=initial;
 while(next){
  expect(next.origin===API&&next.pathname===pathname&&!next.username&&!next.password&&!next.hash,'Mollie gaf een ongeldige cataloguspagina terug.');
  expect([...next.searchParams.keys()].every(key=>['from','limit',...(kind==='balances'?['testmode']:[])].includes(key)),'De cataloguspagina bevat onverwachte parameters.');
  if(kind==='balances')expect(next.searchParams.get('testmode')===(credential.binding.testmodeParameter?String(credential.binding.mode==='test'):null),'De cataloguspagina wisselt van betaalomgeving.');
  expect(!seen.has(next.href),'Mollie herhaalt dezelfde cataloguspagina.');seen.add(next.href);
  expect(seen.size<=1000,'De Mollie-catalogus heeft te veel pagina’s; de vorige catalogus blijft behouden.');
  const page=await mollieRequest(credential,next.href,fetcher),items=page?._embedded?.[kind];
  expect(Array.isArray(items));
  for(const row of items){expect(typeof row?.id==='string'&&!ids.has(row.id),'Mollie gaf dubbele of ongeldige catalogusreferenties terug.');ids.add(row.id);rows.push(row);}
  expect(rows.length<=10000,'Meer dan 10.000 Mollie-records vereist een grotere gecontroleerde synchronisatie. De catalogus is behouden.');
  const href=page?._links?.next?.href;expect(href===undefined||href===null||typeof href==='string');try{next=href?new URL(href,API):null;}catch{throw new CmsError('mollie-pagination','Mollie gaf een ongeldige paginaverwijzing terug.',502);}
 }
 return rows;
}
const profileSchema=z.object({resource:z.literal('profile'),id:z.string().regex(/^pfl_[A-Za-z0-9]+$/),name:z.string().min(1).max(300),website:z.string().max(1000).default(''),status:z.enum(['verified','unverified','blocked']),mode:z.enum(['test','live'])}).passthrough();
const balanceSchema=z.object({resource:z.literal('balance'),id:z.string().regex(/^bal_[A-Za-z0-9]+$/),description:z.string().min(1).max(300),currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(['active','inactive']),mode:z.enum(['test','live'])}).passthrough();
async function normalizeProfile(raw:unknown,credential:MollieCredential,fetchedAt:string,fetcher:MollieFetcher):Promise<MollieProfile>{
 const parsed=profileSchema.safeParse(raw);expect(parsed.success);
 const p=parsed.data;expect(p.mode===credential.binding.mode,'Het Mollie-profiel is afkomstig uit een andere betaalomgeving.');
 if(credential.binding.currentProfileId)expect(p.id===credential.binding.currentProfileId,'Mollie gaf een ander profiel terug dan de vastgelegde toegang.');
 // Status alone is not receiving capability: independently read activated methods.
 requireMollieScopes(credential,['payments.read']);
 const parameters=new URLSearchParams();if(credential.binding.authMode==='advanced-token')parameters.set('profileId',p.id);if(credential.binding.testmodeParameter)parameters.set('testmode',String(credential.binding.mode==='test'));
 const methods=await mollieRequest(credential,'/v2/methods?'+parameters,fetcher),items=methods?._embedded?.methods;expect(Array.isArray(items));
 expect(items.every((row:any)=>typeof row?.id==='string'&&(row.status===null||['activated','pending-boarding','pending-review','pending-external','rejected'].includes(row.status))));
 const canReceivePayments=p.status==='verified'&&items.some((row:any)=>row.status==='activated');
 return {id:p.id,name:p.name,website:p.website,status:p.status,mode:p.mode,canReceivePayments,readinessCheckedAt:fetchedAt};
}
/** Both independent inventories finish before the caller can atomically publish. */
export async function fetchMollieCatalog(credential:MollieCredential,fetcher:MollieFetcher=fetch):Promise<MollieCatalog>{
 const {binding}=credential,fetchedAt=new Date().toISOString();
 if(binding.authMode==='profile-api-key'){
  const raw=await mollieRequest(credential,'/v2/profiles/me',fetcher),profile=await normalizeProfile(raw,credential,fetchedAt,fetcher);
  // Ordinary profile keys cannot invent an organization-wide balances inventory.
  return {source:'provider',organizationId:binding.organizationId,bindingId:binding.id,fetchedAt,profiles:[profile],balances:[],links:[]};
 }
 requireMollieScopes(credential,['profiles.read','balances.read','payments.read']);
 const rawProfiles=binding.currentProfileId?[await mollieRequest(credential,withQuery('/v2/profiles/'+binding.currentProfileId,queryMode(credential)),fetcher)]:await list(credential,'profiles',fetcher);
 const rawBalances=await list(credential,'balances',fetcher),profiles:MollieProfile[]=[];
 for(const raw of rawProfiles){
  // /profiles lists has no documented testmode parameter. Read each profile through
  // the mode-aware detail endpoint before normalizing an organization test route.
  const selected=binding.mode==='test'&&binding.testmodeParameter&&!binding.currentProfileId?await mollieRequest(credential,withQuery('/v2/profiles/'+encodeURIComponent(raw.id),queryMode(credential)),fetcher):raw;
  const profile=await normalizeProfile(selected,credential,fetchedAt,fetcher);expect(profile.id===raw.id,'Het opgehaalde profiel wijkt af van de catalogusreferentie.');profiles.push(profile);
 }
 const balances:MollieBalance[]=rawBalances.map(raw=>{const parsed=balanceSchema.safeParse(raw);expect(parsed.success);const b=parsed.data;expect(b.mode===binding.mode,'Mollie gaf een balans uit een andere betaalomgeving terug.');return {id:b.id,description:b.description,currency:b.currency,status:b.status,mode:b.mode};});
 return {source:'provider',organizationId:binding.organizationId,bindingId:binding.id,fetchedAt,profiles,balances,links:[]};
}

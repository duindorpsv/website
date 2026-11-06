import type {CmsState} from './types';
import type {MollieCatalog,MollieEnvironment,MollieMode,MolliePaymentPreview,MollieRoute,MollieSettings,MollieStream} from './mollie-types';
export type * from './mollie-types';
export const MOLLIE_CATALOG_MAX_AGE_MS=24*60*60*1000;
export const MOLLIE_BUILTIN_CODES=['sponsors','donations','webshop'] as const;
export function emptyMollieCatalog():MollieCatalog{return {source:'none',organizationId:'',bindingId:'',fetchedAt:'',profiles:[],balances:[],links:[]};}
function streams():MollieStream[]{return [{id:'stream-sponsors',code:'sponsors',label:'Sponsoring',enabled:false,profileId:'',referencePrefix:'SP'},{id:'stream-donations',code:'donations',label:'Donateurs',enabled:false,profileId:'',referencePrefix:'DON'},{id:'stream-webshop',code:'webshop',label:'Webshop',enabled:false,profileId:'',referencePrefix:'SHOP'}];}
export function createMollieSettings():MollieSettings{const environment=():MollieEnvironment=>({authMode:'advanced-token',credentialReference:'',currentProfileId:'',paymentsEnabled:false,catalog:emptyMollieCatalog(),streams:streams()});return {mode:'test',environments:{test:environment(),live:environment()}};}
type Input=MollieSettings|{settings:{mollie?:MollieSettings}};
export function readMollieSettings(input:Input):MollieSettings{return structuredClone('environments' in input?input:input.settings.mollie||createMollieSettings());}
export function mollieCatalogFresh(catalog:MollieCatalog,now=Date.now()){const stamp=Date.parse(catalog.fetchedAt),age=now-stamp;return Number.isFinite(stamp)&&age>=-300000&&age<=MOLLIE_CATALOG_MAX_AGE_MS;}
function destination(env:MollieEnvironment,mode:MollieMode,stream:MollieStream):Pick<MollieRoute,'available'|'reason'|'profile'|'balance'|'link'>{
 if(!stream.enabled)return {available:false,reason:'Deze betaalstroom is uitgeschakeld.'};
 const profile=env.catalog.profiles.find(row=>row.id===stream.profileId);
 if(!profile||profile.mode!==mode)return {available:false,reason:'Kies een profiel uit de catalogus van deze omgeving.'};
 if(env.catalog.source!=='provider'||!env.catalog.bindingId||!mollieCatalogFresh(env.catalog))return {available:false,reason:'Vernieuw eerst de profiel- en balanscatalogus.',profile};
 if(profile.status!=='verified'||!profile.canReceivePayments)return {available:false,reason:'Dit betaalprofiel is nog niet gereed om betalingen te ontvangen.',profile};
 if(env.authMode==='profile-api-key'&&env.currentProfileId!==profile.id)return {available:false,reason:'De toegang hoort bij een ander profiel.',profile};
 const link=env.catalog.links.find(row=>row.profileId===profile.id),balance=env.catalog.balances.find(row=>row.id===link?.balanceId);
 if(!link||!balance)return {available:false,reason:'Bevestig eerst welke balans bij dit profiel hoort in Mollie.',profile};
 const verified=Date.parse(link.verifiedAt),age=Date.now()-verified;
 if(!Number.isFinite(verified)||age < -300000||balance.mode!==mode||balance.status!=='active'||balance.currency!=='EUR')return {available:false,reason:'Controleer de geregistreerde actieve EUR-balans in dezelfde omgeving.',profile,balance,link};
 return {available:true,reason:'Geregistreerde route. Betalingen zijn uitgeschakeld.',profile,balance,link};
}
export function getMollieStreamRoute(input:Input,streamCode:string,selectedMode?:MollieMode):MollieRoute{
 const settings=readMollieSettings(input),mode=selectedMode||settings.mode,env=settings.environments[mode],stream=env.streams.find(row=>row.code===streamCode),base={mode,classification:'unverified' as const,classificationLabel:'Nog niet gekoppeld',demo:false as const};
 if(!stream)return {...base,available:false,reason:'Deze betaalstroom is niet ingericht.'};
 const route=destination(env,mode,stream);if(!route.available)return {...base,...route,stream};
 const peers=env.streams.filter(row=>row.enabled).map(row=>({stream:row,route:destination(env,mode,row)})).filter(row=>row.route.available),separate=peers.length>1&&peers.every(peer=>peer.stream.code===stream.code||peer.route.profile?.id!==route.profile?.id&&peer.route.balance?.id!==route.balance?.id);
 return {...base,...route,stream,classification:separate?'separate-balances':'administrative',classificationLabel:separate?route.link?.verifiedBy==='manual'?'Aparte balans volgens registratie':'Aparte bevestigde balans':peers.length<=1?'Eén gekoppelde betaalstroom':'Administratieve indeling · gedeelde bestemming'};
}
/** An illustration only; the server separately verifies binding and capability. */
export function buildMolliePaymentPreview(input:Input,streamCode:string,value:{reference:string;amountCents:number},selectedMode?:MollieMode):MolliePaymentPreview{
 const settings=readMollieSettings(input),mode=selectedMode||settings.mode,route=getMollieStreamRoute(settings,streamCode,mode);
 if(!route.available||!route.stream||!route.profile||!route.balance||!route.link)throw Error(route.reason);
 if(!value.reference.trim()||value.reference.length>140||!Number.isSafeInteger(value.amountCents)||value.amountCents<=0||value.amountCents>100000000)throw Error('Vul een geldige referentie en een positief bedrag tot €1.000.000 in.');
 const reference=value.reference.trim(),body:MolliePaymentPreview['body']={amount:{currency:'EUR',value:`${Math.floor(value.amountCents/100)}.${String(value.amountCents%100).padStart(2,'0')}`},description:[route.stream.referencePrefix,reference].filter(Boolean).join(' · '),metadata:{streamCode:route.stream.code,reference,mode}};
 return {method:'POST',path:'/v2/payments',body,routingSnapshot:{mode,streamCode:route.stream.code,streamLabel:route.stream.label,profileId:route.profile.id,profileName:route.profile.name,balanceId:route.balance.id,balanceDescription:route.balance.description,linkVerification:route.link.verifiedBy,linkVerifiedAt:route.link.verifiedAt,catalogFetchedAt:settings.environments[mode].catalog.fetchedAt,preparedAt:new Date().toISOString()},demo:false,executionAllowed:false};
}
export function canManageMollie(state:CmsState,actorId:string){const member=state.members.find(row=>row.id===actorId&&row.active),role=state.roles.find(row=>row.id===member?.roleId);return !!role&&!role.teamScoped&&(role.id==='admin'||role.permissions.includes('settings'));}

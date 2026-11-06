import {CmsError} from './errors';
import type {MollieCredential} from './mollie-provider';

export type MollieFinancialSource={kind:'donors'|'sponsors';id:string;number:string;amountCents:number};
export type MollieAttemptSnapshot={
 id:string;source:MollieFinancialSource;clubId:string;organizationId:string;mode:'test'|'live';
 streamCode:'donations'|'sponsors';profileId:string;expectedBalanceId:string;
 linkVerification:'manual'|'provider';linkVerifiedAt:string;catalogFetchedAt:string;
 configVersion:number;configHash:string;credentialBindingId:string;idempotencyKey:string;
 reference:string;createdAt:string;request:Record<string,unknown>;
};
export function mollieAmount(cents:number){
 if(!Number.isSafeInteger(cents)||cents<=0)throw new CmsError('payment-amount','Het factuurbedrag is ongeldig.',422);
 return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;
}
export function sourceStream(kind:MollieFinancialSource['kind']){return kind==='donors'?'donations':'sponsors';}
export function mollieCreateBody(snapshot:Omit<MollieAttemptSnapshot,'request'>,credential:MollieCredential,baseUrl:string){
 const {binding}=credential;
 if(binding.id!==snapshot.credentialBindingId||binding.organizationId!==snapshot.organizationId||binding.clubId!==snapshot.clubId||binding.mode!==snapshot.mode)throw new CmsError('payment-binding','De betaalverbinding is gewijzigd.',409);
 const origin=new URL(baseUrl);
 if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)))throw new CmsError('payment-origin','Een veilige betaalretour is vereist.',503);
 const body:Record<string,unknown>={amount:{currency:'EUR',value:mollieAmount(snapshot.source.amountCents)},description:snapshot.reference,
  metadata:{streamCode:snapshot.streamCode,reference:snapshot.reference,mode:snapshot.mode,attemptId:snapshot.id,sourceId:snapshot.source.id},
  redirectUrl:new URL('/clubmuur',origin).href,webhookUrl:new URL('/api/sponsorship/payments/webhook',origin).href};
 if(binding.authMode==='profile-api-key'){
  if(binding.currentProfileId!==snapshot.profileId)throw new CmsError('payment-binding','De sleutel hoort bij een ander betaalprofiel.',409);
 }else{
  body.profileId=snapshot.profileId;
  if(binding.testmodeParameter)body.testmode=snapshot.mode==='test';
 }
 return body;
}
export async function molliePaymentRequest(credential:MollieCredential,path:string,init:RequestInit={},transport:typeof fetch=fetch){
 if(!/^\/v2\/payments(?:\/tr_[a-zA-Z0-9]+)?(?:\?embed=refunds,chargebacks(?:&testmode=true)?)?$/.test(path))throw new CmsError('payment-path','Ongeldige betaalroute.',422);
 const scope=init.method==='POST'?'payments.write':'payments.read';
 if(credential.binding.authMode==='advanced-token'&&!credential.binding.scopes.includes(scope))throw new CmsError('payment-scope','De verbinding mist de vereiste betaalrechten.',403);
 let response:Response;
 try{response=await transport('https://api.mollie.com'+path,{...init,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+credential.token,'Content-Type':'application/json',...init.headers}});}
 catch{throw new CmsError('payment-uncertain','De provider heeft de aanvraag nog niet bevestigd. Herstel dezelfde betaalpoging.',503);}
 if(!response.ok)throw new CmsError(response.status>=500||response.status===429?'payment-uncertain':'payment-rejected',response.status===403?'Mollie mist de vereiste betaalrechten.':'Mollie heeft de aanvraag niet bevestigd.',response.status>=500||response.status===429?503:422);
 try{return await response.json() as Record<string,any>;}catch{throw new CmsError('payment-uncertain','De providerbevestiging kon niet worden gelezen. Herstel dezelfde betaalpoging.',503);}
}
/** Only called after the immutable attempt has committed. Retries use its exact body/key. */
export async function performMollieCreate(snapshot:MollieAttemptSnapshot,credential:MollieCredential,transport:typeof fetch=fetch){
 if(credential.binding.id!==snapshot.credentialBindingId)throw new CmsError('payment-binding','De oorspronkelijke betaalverbinding is niet beschikbaar.',409);
 // Mollie retains credential-bound idempotency keys for one hour. Preparation
 // commits before the first call, so its timestamp is a conservative lower bound.
 const age=Date.now()-Date.parse(snapshot.createdAt);
 if(!Number.isFinite(age)||age< -5*60_000||age>55*60_000)throw new CmsError('payment-reconciliation','De veilige herhaaltermijn is voorbij. Controleer de bestaande betaling bij Mollie voordat je verdergaat.',409);
 return molliePaymentRequest(credential,'/v2/payments',{method:'POST',headers:{'Idempotency-Key':snapshot.idempotencyKey},body:JSON.stringify(snapshot.request)},transport);
}
/** A webhook is a hint; only a freshly retrieved provider record may pass this comparison. */
export function verifyMolliePayment(snapshot:MollieAttemptSnapshot,credential:MollieCredential,payment:Record<string,any>,providerId:string){
 const b=credential.binding,m=payment.metadata,amount=payment.amount;
 if(b.id!==snapshot.credentialBindingId||b.organizationId!==snapshot.organizationId||b.clubId!==snapshot.clubId||b.mode!==snapshot.mode||payment.id!==providerId||payment.profileId!==snapshot.profileId||payment.mode!==snapshot.mode||amount?.currency!=='EUR'||amount.value!==mollieAmount(snapshot.source.amountCents)||m?.attemptId!==snapshot.id||m?.sourceId!==snapshot.source.id||m?.streamCode!==snapshot.streamCode||m?.reference!==snapshot.reference||m?.mode!==snapshot.mode)throw new CmsError('payment-mismatch','De providerbetaling wijkt af van de vastgelegde betaalpoging.',409);
 if(!['open','pending','authorized','paid','failed','canceled','expired'].includes(payment.status))throw new CmsError('payment-mismatch','De providerstatus wordt niet herkend.',409);
 const reversal=[payment.amountRefunded,payment.amountChargedBack].some(value=>value&&(value.currency!=='EUR'||value.value!=='0.00'));
 const embedded=payment._embedded;
 if(payment.status==='paid'&&(reversal||!embedded||!Array.isArray(embedded.refunds)||!Array.isArray(embedded.chargebacks)||embedded.refunds.length||embedded.chargebacks.length))return {status:payment.status as string,settle:false,review:true};
 return {status:payment.status as string,settle:payment.status==='paid',review:false};
}

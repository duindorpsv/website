/** A confirmed queue receipt survives refresh failures and cannot become a new send. */
export type SponsorConceptIntent={body:string;id:string;deliveryId?:string};
export function prepareSponsorConceptIntent(previous:SponsorConceptIntent|undefined,payload:unknown,newId:()=>string=()=>crypto.randomUUID()):SponsorConceptIntent{
 if(previous?.deliveryId)throw new Error('Het conceptvoorstel staat al in de verzendwachtrij. Vernieuw de verzendstatus voordat je een nieuwe verzending voorbereidt.');
 const body=JSON.stringify(payload);return previous?.body===body?previous:{body,id:newId()};
}
export function confirmSponsorConceptIntent(intent:SponsorConceptIntent,deliveryId:string):SponsorConceptIntent{return {...intent,deliveryId};}
export function refreshSponsorConceptIntent(intent:SponsorConceptIntent|undefined,deliveryIds:string[]):SponsorConceptIntent|undefined{return intent?.deliveryId&&deliveryIds.includes(intent.deliveryId)?undefined:intent;}

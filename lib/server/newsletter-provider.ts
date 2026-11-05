import {setTimeout as pause} from 'node:timers/promises';
import {z} from 'zod';
import {env} from './env';
import {mailApiEndpoint} from './mail';
import {CmsError} from './errors';
const events=['email.delivered','email.bounced','email.complained','email.failed','email.suppressed'];
/** Explicit administrator action; reuses the existing GitHub-managed Resend key. */
export async function connectNewsletterProvider(){
 const config=env(),endpoint=new URL('/api/webhooks/resend',config.APP_BASE_URL).href,base=mailApiEndpoint(config);
 if(!config.RESEND_API_KEY)throw new CmsError('provider-config','De bestaande Resend-sleutel is nog niet ingesteld.',503);
 const call=async(path:string,method='GET',body?:unknown)=>{let response:Response;try{response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new CmsError('provider-unavailable','De Resend-koppeling is tijdelijk niet bereikbaar.',503);}
  if(!response.ok){await response.body?.cancel();throw new CmsError('provider-setup',response.status===401||response.status===403?'De Resend-sleutel heeft geen webhookbeheerrechten. Pas de sleutel in GitHub aan of gebruik de handmatige koppeling.':'Resend kon de bezorgkoppeling niet instellen. Probeer opnieuw.',503);}
  const value=await response.json();await pause(600);return value;};
 let found:any=null,cursor='';
 for(let page=0;page<20;page++){
  const list=z.object({data:z.array(z.object({id:z.string().uuid(),endpoint:z.string().url()}).passthrough()),has_more:z.boolean().optional()}).parse(await call('/webhooks?limit=100'+(cursor?'&after='+encodeURIComponent(cursor):'')));
  found=list.data.find(row=>row.endpoint===endpoint);if(found||!list.has_more||!list.data.length)break;cursor=list.data[list.data.length-1].id;
  if(page===19)throw new CmsError('provider-pagination','Controleer de bestaande webhook in Resend handmatig.',422);
 }
 let detail=found?await call('/webhooks/'+found.id):await call('/webhooks','POST',{endpoint,events});
 if(found){await call('/webhooks/'+found.id,'PATCH',{status:'enabled',events});}
 return z.object({id:z.string().uuid(),signing_secret:z.string().regex(/^whsec_[A-Za-z0-9+/=_-]{20,500}$/)}).parse(detail);
}

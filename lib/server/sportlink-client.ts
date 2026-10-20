import {createHash} from 'node:crypto';
import {sqlClient} from '../../db';
import {nextSportlinkRun,sportlinkArticleDataset,type SportlinkDataset,type SportlinkSettings} from '../cms/sportlink-settings';
import {readSportlinkSettings} from './sportlink-config';

const allowed=new Set(['clubgegevens','wedstrijd-accommodatie','teams','team-indeling','team-gegevens','programma','uitslagen','poulestand','poule-programma','pouleuitslagen','wedstrijd-informatie','wedstrijd-kleedkamers','afgelastingen']);
export class SportlinkSourceError extends Error{readonly code='sportlink-source-unavailable';}
/** Fixed provider URL. Credentials and upstream response bodies never enter error messages. */
export async function fetchSportlinkArticle(name:string,params:Record<string,string>={},settings?:SportlinkSettings):Promise<unknown>{
 if(!allowed.has(name))throw new SportlinkSourceError('Deze Sportlink-bron wordt niet ondersteund.');
 const clientId=process.env.SPORTLINK_CLIENT_ID;if(!clientId)throw new SportlinkSourceError('De Sportlink-sleutel is nog niet ingesteld in GitHub production.');
 const config=settings||(await readSportlinkSettings()).settings,url=new URL('https://data.sportlink.com/'+name);url.search=new URLSearchParams({...params,client_id:clientId}).toString();
 try{const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(config.requestTimeoutSeconds*1000),cache:'no-store'});if(!response.ok)throw Error();const body=await response.text();if(body.length>32*1024*1024)throw Error();const value=JSON.parse(body);if(!value||typeof value!=='object')throw Error();return value;}
 catch{throw new SportlinkSourceError('Sportlink levert dit onderdeel momenteel niet. De laatst geslaagde gegevens blijven bewaard.');}
}
/** Do not retain personal roster/contact payloads in the generic article cache. */
function publicArticle(name:string,value:unknown):unknown{
 if(name==='clubgegevens'){const row=value as any;return {gegevens:{clubcode:row?.gegevens?.clubcode,clubnaam:row?.gegevens?.clubnaam}};}
 if(name==='wedstrijd-informatie'){const row=value as any;return {wedstrijdinformatie:Object.fromEntries(['duur','veldnaam','veldlocatie','wedstrijddatetime','wedstrijddatum','aanvangstijd','thuisteamid','uitteamid'].filter(key=>row?.wedstrijdinformatie&&Object.hasOwn(row.wedstrijdinformatie,key)).map(key=>[key,row.wedstrijdinformatie[key]])),kleedkamers:Object.fromEntries(['thuis','uit','official'].filter(key=>row?.kleedkamers&&Object.hasOwn(row.kleedkamers,key)).map(key=>[key,row.kleedkamers[key]])),accommodatie:{naam:row?.accommodatie?.naam||'',straat:row?.accommodatie?.straat||'',plaats:row?.accommodatie?.plaats||''}};}
 if(name==='team-indeling')throw new SportlinkSourceError('Spelersgegevens worden uitsluitend via de privacyfilter verwerkt.');
 const excluded=/^(?:email|e-mail|email2|telefoon|telefoon2|mobiel|adres|straat|postcode|plaats|rijders?|scheidsrechters?|foto|relatiecode)$/i;
 const clean=(input:unknown):unknown=>Array.isArray(input)?input.map(clean):input&&typeof input==='object'?Object.fromEntries(Object.entries(input).filter(([key])=>!excluded.test(key)).map(([key,item])=>[key,clean(item)])):input;
 return clean(value);
}
export type SportlinkArticleResult={value:unknown;stale:boolean;updatedAt:number};
export async function cachedSportlinkArticle(name:string,params:Record<string,string>={},options:{dataset?:SportlinkDataset;force?:boolean;settings?:SportlinkSettings;planning?:false}={}):Promise<SportlinkArticleResult>{
 const settings=options.settings||(await readSportlinkSettings()).settings,dataset=options.dataset||sportlinkArticleDataset(name),sql=sqlClient();
 const hash=createHash('sha256').update(JSON.stringify([process.env.SPORTLINK_CLIENT_ID||'',name,Object.entries(params).sort()])).digest('hex');const key=`sportlink-article-v2:${dataset}:${hash}`;
 await sql`insert into sportlink_cache(cache_key) values (${key}) on conflict do nothing`;
 const [row]=await sql`select * from sportlink_cache where cache_key=${key}`,now=Date.now();
 const previous=()=>({value:JSON.parse(row.payload_json),stale:true,updatedAt:Number(row.updated_at)});
 if(row.payload_json&&!options.force&&Number(row.expires_at)>now)return {...previous(),stale:false};
 // Turning scheduled synchronization off keeps the last observed public data.
 if((!settings.enabled||!settings.schedules[dataset].enabled)&&!options.force){if(row.payload_json)return previous();throw new SportlinkSourceError('Dit Sportlink-onderdeel is gepauzeerd.');}
 const lease=now+10*60000;
 const claimed=await sql`update sportlink_cache set refresh_after=${lease} where cache_key=${key} and refresh_after<=${now} returning cache_key`;
 if(!claimed.length){if(row.payload_json)return previous();throw new SportlinkSourceError('Dit Sportlink-onderdeel wordt bijgewerkt.');}
 try{const value=publicArticle(name,await fetchSportlinkArticle(name,params,settings)),updatedAt=Date.now();
  const write=async(tx:any)=>{const written=await tx`update sportlink_cache set payload_json=${JSON.stringify(value)},updated_at=${updatedAt},expires_at=${nextSportlinkRun(settings.schedules[dataset],updatedAt)},refresh_after=0 where cache_key=${key} and refresh_after=${lease} returning cache_key`;
   if(!written.length)throw new SportlinkSourceError('De bronlease is verlopen. Een nieuwere response blijft behouden.');};
  if(options.planning!==false&&(name==='programma'||name==='wedstrijd-informatie')){const {processFreshPlanningArticle}=await import('./sportlink-planning');await processFreshPlanningArticle(name,params,value,now,settings,write);}
  else await sql.begin(write);
  return {value,updatedAt,stale:false};
 }catch(error){await sql`update sportlink_cache set refresh_after=${Date.now()+settings.retryMinutes*60000} where cache_key=${key} and refresh_after=${lease}`;const [latest]=await sql`select payload_json,updated_at from sportlink_cache where cache_key=${key}`;if(latest?.payload_json)return {value:JSON.parse(latest.payload_json),stale:true,updatedAt:Number(latest.updated_at)};throw error;}
}

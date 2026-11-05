import {fetchSportlinkArticle} from './server/sportlink-client';
import {readSportlinkSettings} from './server/sportlink-config';
import {matchSourceCache} from './server/match-source-cache';
import {supportsPublicMatchResults} from './match-dossier';
import type {SportlinkMatch} from './sportlink-types';
export async function getSportlinkHistoricalSource(match:SportlinkMatch){
 if(!supportsPublicMatchResults(match.home)||!supportsPublicMatchResults(match.away)||!/^\d{1,12}$/.test(match.id))return {rows:[] as unknown[],stale:false,warning:null};
 const warning='De historische ontmoetingen kunnen nu niet worden ververst. De laatst opgeslagen gegevens blijven zichtbaar.';
 try{
  const key=`match-h2h-v2:${match.id}:${match.home.id}:${match.away.id}:${match.home.name}:${match.away.name}`;
  const result=await matchSourceCache(key,async()=>{
   const settings=(await readSportlinkSettings()).settings;if(!settings.enabled)throw Error('Source paused');
   const value=await fetchSportlinkArticle('wedstrijd-historische-resultaten',{wedstrijdcode:match.id},{...settings,requestTimeoutSeconds:8});
   if(!Array.isArray(value))throw Error('Invalid source');
   return value.slice(0,2000).filter(row=>row&&typeof row==='object').map(row=>Object.fromEntries(['seizoen','wedstrijd','datum','wedstrijddatum','wedstrijddatetime','uitslag','wedstrijdcode','status'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
  },[] as unknown[]);
  return {rows:result.value,stale:result.stale,warning:result.stale?warning:null};
 }catch{return {rows:[] as unknown[],stale:true,warning};}
}

import {fetchSportlinkArticle} from './server/sportlink-client';
import {readSportlinkSettings} from './server/sportlink-config';
import {matchSourceCache} from './server/match-source-cache';
import {publicMatchHeadCoach} from './sportlink-match-coaches';
import type {SportlinkMatch} from './sportlink-types';
export async function getSportlinkMatchHeadCoaches(match:SportlinkMatch){
 const source=async(side:'home'|'away')=>{
  try{
   const team=match[side],key=`match-head-coach-v2:${match.id}:${side}:${team.id}:${team.clubCode}:${team.name}`;
   return await matchSourceCache(key,async()=>{
    const settings=(await readSportlinkSettings()).settings;
    if(!settings.enabled)throw Error('Source paused');
    const rows=await fetchSportlinkArticle(side==='home'?'wedstrijd-thuisteam':'wedstrijd-uitteam',{wedstrijdcode:match.id,toonlidfoto:'NEE'},{...settings,requestTimeoutSeconds:8});
    if(!Array.isArray(rows))throw Error('Invalid source');
    return {name:publicMatchHeadCoach(rows)};
   },{name:null as string|null});
  }catch{return {value:{name:null},stale:true};}
 };
 if(!/^\d{1,12}$/.test(match.id))return {homeHeadCoach:null,awayHeadCoach:null,headCoachesStale:false};
 const [home,away]=await Promise.all([source('home'),source('away')]);
 return {homeHeadCoach:home.value.name,awayHeadCoach:away.value.name,headCoachesStale:home.stale||away.stale};
}

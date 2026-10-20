'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useSportlink} from '@/hooks/use-sportlink';
import type {MatchPreviewContent} from '@/lib/cms/types';
import type {SportlinkMatch,SportlinkStanding} from '@/lib/sportlink-types';
import type {SportlinkHistoricalResult} from '@/lib/sportlink-history';

export type MatchDossierContext={teamId?:string;season?:string;pool?:string};
export type MatchDossierResponse={
 preview?:MatchPreviewContent|null;firstTeamMatch?:boolean;match:SportlinkMatch;updatedAt:string;stale:boolean;warning?:string|null;
 comparisonMatches?:SportlinkMatch[];standings?:SportlinkStanding[];
 headToHead?:SportlinkHistoricalResult[];headToHeadStale?:boolean;headToHeadWarning?:string|null;
 homeHeadCoach?:string|null;awayHeadCoach?:string|null;headCoachesStale?:boolean;
 contextTeamId?:string;contextPoolId?:string;contextSeasonId?:string;
};
const normalized=(value:string)=>value.toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim();

/** The open dossier revalidates the shared database, including after resuming a tab. */
export function useMatchDossier(seed:SportlinkMatch,context:MatchDossierContext={}){
 const {data:club,acceptMatch}=useSportlink();
 const explicitTeam=context.teamId;
 const ownTeam=club?.teams.find(team=>[seed.home,seed.away].some(side=>side.own&&(
  team.id===side.id||team.teamCode===side.id||normalized(team.name)===normalized(side.name)
 )));
 const teamId=explicitTeam||ownTeam?.id||club?.teams.find(team=>team.competitions.some(pool=>pool.id===seed.competitionId))?.id||'';
 const pool=context.pool||seed.competitionId;
 const key=JSON.stringify([seed.id,teamId,pool,context.season||'']);
 const [state,setState]=useState<{key:string;data:MatchDossierResponse|null;loading:boolean;error:string}>({key:'',data:null,loading:true,error:''});
 const [attempt,setAttempt]=useState(0);
 const seedRef=useRef(seed);seedRef.current=seed;
 const refresh=useCallback(()=>setAttempt(value=>value+1),[]);
 useEffect(()=>{
  const controller=new AbortController();let running=false;
  const load=async()=>{
   if(running||controller.signal.aborted)return;
   running=true;
   setState(previous=>({key,data:previous.key===key?previous.data:null,loading:true,error:''}));
   try{
    const params=new URLSearchParams({id:seedRef.current.id});
    if(teamId)params.set('team',teamId);
    if(pool)params.set('pool',pool);
    if(context.season)params.set('season',context.season);
    const response=await fetch(`/api/sportlink/match?${params}`,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('De wedstrijd kan nu niet worden ververst. Je ziet de laatst ontvangen gegevens.');
    const data=await response.json() as MatchDossierResponse;
    if(data.match?.id!==seedRef.current.id||!data.match.home||!data.match.away)throw new Error('De wedstrijdgegevens konden niet worden gelezen.');
    if(!controller.signal.aborted){
     setState({key,data,loading:false,error:''});
     acceptMatch(data.match,data.updatedAt);
    }
   }catch(error){
    if(!controller.signal.aborted)setState(previous=>({key,data:previous.key===key?previous.data:null,loading:false,error:error instanceof Error?error.message:'De wedstrijd kan nu niet worden ververst.'}));
   }finally{running=false;}
  };
  const visible=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void load();};
  void load();
  const timer=window.setInterval(visible,60_000);
  window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);};
 },[key,teamId,pool,context.season,attempt,acceptMatch]);
 const current=state.key===key?state:null;
 return {match:current?.data?.match||seed,data:current?.data||null,loading:!current||current.loading,error:current?.error||'',refresh};
}

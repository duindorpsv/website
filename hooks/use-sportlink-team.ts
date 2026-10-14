'use client';

import {useCallback,useEffect,useState} from 'react';
import type {SportlinkTeamDetail} from '@/lib/sportlink-team-types';

/** A selection owns its request: a slow previous pool can never replace the current one. */
export function useSportlinkTeam(teamId:string,season:string,pool:string){
 const [state,setState]=useState<{key:string;data:SportlinkTeamDetail|null;loading:boolean;error:string|null}>({key:'',data:null,loading:true,error:null});
 const [attempt,setAttempt]=useState(0);
 const key=JSON.stringify([teamId,season,pool]);
 const reload=useCallback(()=>setAttempt(value=>value+1),[]);
 useEffect(()=>{
  const controller=new AbortController();
  let running=false;
  async function refresh(){
   if(running)return;
   running=true;
   setState(previous=>({key,data:previous.key===key?previous.data:null,loading:true,error:null}));
   try{
    const query=new URLSearchParams({team:teamId});
    if(season)query.set('season',season);
    if(pool)query.set('pool',pool);
    const response=await fetch(`/api/sportlink/team?${query}`,{signal:controller.signal});
    if(!response.ok)throw new Error('De teamgegevens zijn tijdelijk niet beschikbaar. Probeer het nog eens.');
    const data=await response.json() as SportlinkTeamDetail;
    if(data.team?.id!==teamId||!Array.isArray(data.pools)||!Array.isArray(data.standings)||!Array.isArray(data.players))throw new Error('De teamgegevens konden niet worden gelezen.');
    if(!controller.signal.aborted)setState({key,data,loading:false,error:null});
   }catch(error){
    if(!controller.signal.aborted)setState(previous=>({key,data:previous.key===key?previous.data:null,loading:false,error:error instanceof Error?error.message:'Probeer het opnieuw.'}));
   }finally{running=false;}
  }
  void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15*60*1000);
  return()=>{controller.abort();window.clearInterval(timer);};
 },[key,teamId,season,pool,attempt]);
 return {data:state.key===key?state.data:null,loading:state.key!==key||state.loading,error:state.key===key?state.error:null,reload};
}

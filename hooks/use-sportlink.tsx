'use client';

import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import type {SportlinkSnapshot} from '@/lib/sportlink-types';

type State={data:SportlinkSnapshot|null;loading:boolean;error:string|null;reload:()=>void};
const SportlinkContext=createContext<State>({data:null,loading:true,error:null,reload:()=>{}});

export function SportlinkProvider({children,enabled=true}:{children:ReactNode;enabled?:boolean}){
 const [data,setData]=useState<SportlinkSnapshot|null>(null);
 const [loading,setLoading]=useState(enabled);
 const [error,setError]=useState<string|null>(null);
 const [attempt,setAttempt]=useState(0);
 const reload=useCallback(()=>setAttempt(n=>n+1),[]);
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  let running=false;
  const refresh=async()=>{
   if(running)return;
   running=true;
   setLoading(true);
   try{
    const response=await fetch('/api/sportlink',{signal:controller.signal});
    if(!response.ok)throw new Error('De competitiegegevens zijn tijdelijk niet bereikbaar.');
    const snapshot=await response.json() as SportlinkSnapshot;
    if(!Array.isArray(snapshot.teams)||!Array.isArray(snapshot.standings))throw new Error('De competitiegegevens zijn tijdelijk niet bereikbaar.');
    setData(snapshot);setError(null);
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Probeer het opnieuw.');}
   finally{running=false;if(!controller.signal.aborted)setLoading(false);}
  };
  void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15*60*1000);
  return()=>{controller.abort();clearInterval(timer);};
 },[enabled,attempt]);
 return <SportlinkContext.Provider value={{data,loading,error,reload}}>{children}</SportlinkContext.Provider>;
}

export function useSportlink(){return useContext(SportlinkContext);}

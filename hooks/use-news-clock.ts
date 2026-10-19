'use client';
import {useEffect,useState} from 'react';

// Re-evaluate dated selections on pages that remain open across their expiry.
export function useNewsClock(nextExpiry?:number){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setNow(Date.now());
    const delay=nextExpiry&&nextExpiry>now?Math.min(30000,nextExpiry-now+1):30000;
    const timer=setTimeout(update,delay);
    document.addEventListener('visibilitychange',update);
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',update);};
  },[now,nextExpiry]);
  return now;
}

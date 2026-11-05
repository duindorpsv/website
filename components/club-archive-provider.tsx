'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {ArchiveState} from '@/lib/club-archive-types';
const empty:ArchiveState={version:1,moments:[],objects:[],contributions:[],collections:[],widgetEnabled:false,featuredMomentId:'',featuredObjectId:''};
type Value={state:ArchiveState;ready:boolean;error:string;workspace:any;reload:()=>Promise<any>;mutate:(input:any)=>Promise<any>};
const Context=createContext<Value|null>(null);
export function ArchiveProvider({children,admin=false,initialState,enabled=true}:{children:ReactNode;admin?:boolean;initialState?:ArchiveState;enabled?:boolean}){
 const [state,setState]=useState(initialState||empty),[ready,setReady]=useState(!!initialState),[error,setError]=useState(''),[workspace,setWorkspace]=useState<any>(null),pending=useRef<{fingerprint:string;id:string}|null>(null);
 const endpoint=admin?'/api/cms/archive':'/api/archive';
 async function reload(){const r=await fetch(endpoint,{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.message||'Het archief kan niet worden geladen.');setState(admin?data.state:data);setWorkspace(admin?data:null);setReady(true);return data;}
 useEffect(()=>{if(!enabled)return;let alive=true;const refresh=()=>{if(document.visibilityState==='hidden')return;void reload().catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setReady(true);});};refresh();const interval=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{alive=false;clearInterval(interval);window.removeEventListener('focus',refresh);};},[endpoint,enabled]);
 async function mutate(input:any){const fingerprint=JSON.stringify(input);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,id:crypto.randomUUID()};try{const r=await fetch('/api/cms/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,operationId:pending.current.id})}),result=await r.json();if(!r.ok){pending.current=null;throw Error(Array.isArray(result.details)&&result.details.length?result.details.map((d:any)=>d.message).join(' '):result.message||'Opslaan mislukt. Je invoer blijft open.');}const fresh=await reload();pending.current=null;setError('');return {result,workspace:fresh};}catch(e){setError(e instanceof Error?e.message:'Geen verbinding. Je invoer blijft open.');throw e;}}
 return <Context.Provider value={{state,ready,error,workspace,reload,mutate}}>{children}</Context.Provider>;
}
export function useArchive(){const v=useContext(Context);if(!v)throw Error('Archiefcontext ontbreekt.');return v;}

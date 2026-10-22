'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {CmsState,CmsMember,Permission} from '@/lib/cms/types';
import {captureDomainCommands,domainCommandVersionKey} from '@/lib/cms/domain-commands';
import type {WorkspaceQuery} from '@/lib/server/sponsor-store';
import type {DirectoryPortalProjection} from '@/lib/cms/directory-types';
type Listing={listingIds:string[];total:number;page:number;pageSize:number;stats:{total:number;active:number;pending:number;without_account:number}};
type Data={abilities?:Record<string,boolean>;notificationReadIds?:string[];state:CmsState;versions:Record<string,number>;userId:string;currentUser:CmsMember;context:string;revision:string;listing?:Listing;personal?:DirectoryPortalProjection;staffOptions:{id:string;name:string;active:boolean}[]};
type Context=Data&{beginEdit:(keys:string|string[])=>void;ready:boolean;saving:boolean;notice:string;storageError:string;roleId:string;setUserId:(id:string)=>void;setRoleId:(id:string)=>void;can:(p:Permission)=>boolean;notify:(s:string)=>void;update:(recipe:(state:CmsState)=>void,message?:string)=>Promise<boolean>;reload:()=>Promise<void>;query:WorkspaceQuery;setQuery:(patch:Partial<WorkspaceQuery>)=>void;contextSignal:()=>AbortSignal;request:<T=any>(url:string,body:unknown)=>Promise<T>};
const Context=createContext<Context|null>(null);
const defaults:WorkspaceQuery={mode:'directory',companyId:'',personId:'',search:'',feature:'all',source:'all',account:'all',page:1,pageSize:25};
export function SponsorWorkspaceProvider({children,mode='directory',companyId='',personId=''}:{children:ReactNode;mode?:WorkspaceQuery['mode'];companyId?:string;personId?:string}){
 const [query,changeQuery]=useState<WorkspaceQuery>({...defaults,mode,companyId,personId}),queryRef=useRef(query);queryRef.current=query;
 const [data,setData]=useState<Data|null>(null),current=useRef<Data|null>(null),[notice,notify]=useState(''),[storageError,setError]=useState(''),[saving,setSaving]=useState(false),busy=useRef(false),editVersions=useRef<Record<string,number>>({}),epoch=useRef(0),[generation,setGeneration]=useState(0),contextController=useRef(new AbortController());
 const endpoint=mode==='portal'?'/api/portal/workspace':'/api/cms/sponsor-workspace';
 const clear=useCallback(()=>{epoch.current++;editVersions.current={};contextController.current.abort();contextController.current=new AbortController();current.current=null;setData(null);setGeneration(n=>n+1);},[]);
 const scopeProps=useRef({mode,companyId,personId});
 useEffect(()=>{const old=scopeProps.current;if(old.mode!==mode||old.companyId!==companyId||old.personId!==personId){scopeProps.current={mode,companyId,personId};clear();changeQuery({...defaults,mode,companyId,personId});}},[mode,companyId,personId,clear]);
 const setQuery=useCallback((patch:Partial<WorkspaceQuery>)=>{if(patch.companyId!==undefined&&patch.companyId!==queryRef.current.companyId){clear();}changeQuery(previous=>({...previous,...patch}));},[clear]);
 const reload=useCallback(async()=>{
  const sequence=++epoch.current,params=new URLSearchParams(Object.entries(queryRef.current).map(([k,v])=>[k,String(v)]));
  const response=await fetch(endpoint+'?'+params,{cache:'no-store'}),next=await response.json();
  if(sequence!==epoch.current)return;
  if(!response.ok){if(response.status===401||response.status===403)clear();throw new Error(next.message||'De werkplek kon niet worden geladen.');}
  if(mode==='portal'&&!queryRef.current.companyId&&next.state.sponsorship?.sponsors.length){setQuery({companyId:next.state.sponsorship.sponsors[0].id});return;}
  if(current.current&&current.current.context!==next.context){editVersions.current={};contextController.current.abort();contextController.current=new AbortController();setGeneration(n=>n+1);}
  next.state.sponsorStaffOptions=next.staffOptions;
  current.current=next;setData(next);
 },[endpoint,clear,mode,setQuery]);
 useEffect(()=>{void reload().catch(e=>setError(e.message));},[query,reload]);
 useEffect(()=>{const focus=()=>void reload().catch(e=>setError(e.message));window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[reload]);
 useEffect(()=>{const stream=new EventSource('/api/sponsorship/events');stream.onmessage=event=>{try{const value=JSON.parse(event.data);if(current.current&&value.revision!==current.current.revision&&!busy.current)void reload().catch(e=>setError(e.message));}catch{}};stream.addEventListener('access-changed',()=>{clear();setError('Je toegang is gewijzigd. Log opnieuw in.');stream.close();});return()=>stream.close();},[reload,clear]);
 const update=useCallback(async(recipe:(draft:CmsState)=>void,message?:string)=>{
  if(busy.current||!current.current)return false;busy.current=true;setSaving(true);setError('');const operationId=crypto.randomUUID(),start=current.current,signal=contextController.current.signal;
  try{
   const {commands}=captureDomainCommands(operationId,()=>recipe(structuredClone(start.state)));
   if(!commands.length)throw new Error('Deze wijziging bevat geen ondersteunde serverhandeling.');
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({operationId,mode:queryRef.current.mode,companyId:queryRef.current.companyId,versions:{...start.versions,...editVersions.current},commands})}),result=await response.json();
   if(!response.ok||result.ok===false)throw new Error(result.message||'Opslaan is mislukt.');if(signal.aborted)return false;
   await reload();if(signal.aborted)return false;
   // Re-arm only this save's edited resources at their committed version. Other
   // open drafts keep their original anchors and still detect external edits.
   for(const command of commands){const key=domainCommandVersionKey(command.name,command.args);if(key)editVersions.current[key]=current.current?.versions[key]||0;if(command.name==='saveDirectoryPerson'){const profileKey='profile:'+(command.args[0] as {person:{id:string}}).person.id;editVersions.current[profileKey]=current.current?.versions[profileKey]||0;}}
   if(message)notify(message);return true;
  }catch(e){if(!signal.aborted){const message=e instanceof Error?e.message:'Opslaan is mislukt.';setError(message);notify(message);}return false;}finally{busy.current=false;setSaving(false);}
 },[endpoint,reload]);
 const beginEdit=useCallback((keys:string|string[])=>{for(const key of typeof keys==='string'?[keys]:keys)editVersions.current[key]=current.current?.versions[key]||0;},[]);
 const request=useCallback(async<T,>(url:string,body:unknown):Promise<T>=>{const signal=contextController.current.signal;const response=await fetch(url,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw new Error(result.message||'De handeling is mislukt.');if(signal.aborted)throw new Error('Je toegang is gewijzigd.');return result;},[]);
 useEffect(()=>{if(notice){const timer=setTimeout(()=>notify(''),7000);return()=>clearTimeout(timer);}},[notice]);
 if(!data)return <div className="cms-panel" aria-live="polite">{storageError?<><p role="alert">{storageError}</p><a href={mode==='portal'?'/portaal/inloggen':'/beheer/login'}>Opnieuw inloggen</a></>:<p>Je werkplek wordt geladen…</p>}</div>;
 const can=(permission:Permission)=>data.abilities?.[permission]??data.state.roles.find(r=>r.id===data.currentUser.roleId)?.permissions.includes(permission)??false;
 return <Context.Provider value={{...data,ready:true,beginEdit,saving,notice,storageError,roleId:data.currentUser.roleId,setRoleId:()=>{},setUserId:()=>{},can,notify,update,reload,query,setQuery,contextSignal:()=>contextController.current.signal,request}}><div key={generation} aria-busy={saving}>{storageError&&<p className="sponsor-workspace-error" role="alert">{storageError}</p>}{children}</div>{notice&&<div className="sponsor-workspace-notice" role="status">{notice}</div>}</Context.Provider>;
}
export function useCMS(){const value=useContext(Context);if(!value)throw new Error('De persoonlijke werkplek ontbreekt.');return value;}

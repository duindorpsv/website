'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createCmsSeed} from '@/lib/cms/seed';
import type {CmsState,CmsUpdate,Permission} from '@/lib/cms/types';
export {parseCmsState} from '@/lib/cms/validation';
type User={id:string;roleId:string;teamScoped:boolean;teams:string[];grants:{module:string;action:string}[];name:string};
type Context={state:CmsState;ready:boolean;update:CmsUpdate;can:(permission:Permission,teamId?:string,module?:string)=>boolean;roleId:string;setRoleId:(id:string)=>void;notify:(message:string)=>void;notice:string;storageError:string;saving:boolean;preview:boolean;reload:()=>Promise<void>;loadMoreMedia:()=>Promise<void>};
const CmsContext=createContext<Context|null>(null);
function empty(){const s=createCmsSeed();for(const k of ['articles','pages','people','media','folders','albums','departments','forms','submissions','roles','members','documents','redirects','audit'] as const)s[k]=[] as never;return s;}
const modules=['articles','pages','people','media','folders','albums','forms','documents','settings'] as const;
export function CmsProvider({children,initialState,preview=false}:{children:ReactNode;initialState?:CmsState;preview?:boolean}){
 const [state,setState]=useState<CmsState>(initialState||empty),current=useRef(state),versions=useRef<Record<string,number>>({}),user=useRef<User|null>(null),[ready,setReady]=useState(!!initialState),[roleId,setRoleId]=useState(''),[notice,notify]=useState(''),[storageError,setStorageError]=useState(''),[saving,setSaving]=useState(false),chain=useRef(Promise.resolve());
 const reload=useCallback(async()=>{if(initialState)return;const response=await fetch('/api/cms/bootstrap',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'Clubbeheer laden is mislukt.');for(const record of current.current.media)if(!data.state.media.some((m:any)=>m.id===record.id)){data.state.media.push(record);data.versions[record.id]=versions.current[record.id];}current.current=data.state;versions.current=data.versions;user.current=data.principal;setRoleId(data.principal.roleId);setState(data.state);setReady(true);},[initialState]);
 useEffect(()=>{if(initialState)return;reload().catch(e=>{setStorageError(e.message);setReady(true);});},[initialState,reload]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>notify(''),6000);return()=>clearTimeout(t);},[notice]);
 const mediaOffset=useRef(100);
 const loadMoreMedia=useCallback(async()=>{const response=await fetch(`/api/cms/media?limit=100&offset=${mediaOffset.current}`);const data=await response.json();if(!response.ok){setStorageError(data.message);return;}const next=structuredClone(current.current);for(const record of data.items||[]){const at=next.media.findIndex(m=>m.id===record.id);if(at<0)next.media.push(record);else next.media[at]=record;versions.current[record.id]=record.version;}mediaOffset.current+=100;current.current=next;setState(next);notify(data.items?.length?'Volgende foto’s geladen.':'Er zijn geen volgende foto’s.');},[]);
 const update=useCallback<CmsUpdate>(async(recipe,action)=>{
  if(initialState||preview)return false;
  const perform=async()=>{setSaving(true);
  const recipeState=structuredClone(current.current);recipe(recipeState);
  // Recipes are converted to per-resource commands. Live snapshots, routing and
  // audit are always produced by the server and cannot be sent as writable state.
  const changes:any[]=[];
  for(const module of modules){const before=module==='settings'?[{...current.current.settings,id:'settings'}]:current.current[module];const after=module==='settings'?[{...recipeState.settings,id:'settings'}]:recipeState[module];
   for(const record of after as any[]){const old=before.find((r:any)=>r.id===record.id) as any;if(JSON.stringify(old)===JSON.stringify(record))continue;let verb='save';if(record.deletedAt&&!old?.deletedAt)verb='trash';else if(old?.deletedAt&&!record.deletedAt)verb='restore';else if(['articles','pages'].includes(module)){if(record.live&&JSON.stringify(record.live)!==JSON.stringify(old?.live))verb='publish';else if(old?.live&&!record.live)verb='unpublish';else if((record as any).status==='scheduled'&&((record as any).scheduledAt!==old?.scheduledAt||old?.status!=='scheduled'))verb='schedule';}else if((record as any).published&&!old?.published)verb='publish';else if(old?.published&&!(record as any).published)verb='unpublish';
    const data=structuredClone(record) as any;delete data.live;delete data.revisions;delete data.version;
    changes.push({module,id:record.id,expectedVersion:versions.current[record.id]||0,action:verb,data,...(verb==='schedule'?{scheduledAt:(record as any).scheduledAt}:{})});
   }
  }
  if(!changes.length){setSaving(false);notify('Geen inhoudswijziging. Account- en afdelingsbeheer hebben eigen serveracties.');return false;}
  const operationId=crypto.randomUUID();
  try{const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId,changes})});const data=await response.json();if(!response.ok)throw new Error(data.message||'Opslaan mislukt.');for(const change of changes)if(change.module==='media'){const saved=await fetch(`/api/cms/media/${change.id}`).then(r=>r.json());const index=current.current.media.findIndex(m=>m.id===change.id);if(saved.id&&index>=0){current.current.media[index]=saved;versions.current[change.id]=saved.version;}}await reload();setStorageError('');notify(action||'Opgeslagen op de server.');return true;}catch(e){const message=e instanceof Error?e.message:'Opslaan mislukt.';try{sessionStorage.setItem('duindorp-unsaved-recovery',JSON.stringify({at:new Date().toISOString(),changes}));}catch{}setStorageError(message);notify(message);return false;}finally{setSaving(false);}};
  const next=chain.current.then(perform);chain.current=next.then(()=>undefined);return next;
 },[initialState,preview,reload]);
 const can=useCallback((permission:Permission,teamId?:string,module?:string)=>{const p=user.current;if(!p)return false;if(p.teamScoped&&(!teamId||!p.teams.includes(teamId)))return false;return p.grants.some(g=>permission==='publish'?(!module||g.module===module||g.module==='*')&&['publish','*'].includes(g.action):(g.module==='*'||g.module===permission)&&['update','create','manage','*'].includes(g.action));},[state]);
 return <CmsContext.Provider value={{state,ready,update,can,roleId,setRoleId:()=>{},notify,notice,storageError,saving,preview,reload,loadMoreMedia}}>{children}</CmsContext.Provider>;
}
export function useCMS(){const value=useContext(CmsContext);if(!value)throw new Error('CMS-component vereist CmsProvider.');return value;}

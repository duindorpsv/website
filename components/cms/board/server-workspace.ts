'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {BoardActor,BoardPageProps,BoardPerson,BoardState} from '@/lib/cms/board';

export type BoardWorkspaceData={
  board:BoardState;actor:BoardActor|null;people:BoardPerson[];
  committees:{id:string;name:string}[];version:number;
  permissions:{configure:boolean;planning:boolean;communications:boolean};
  planning:{id:string;title:string;date:string;status:string}[];
};
type Request={path:string;body:Record<string,unknown>};

export function useBoardServer(){
  const [data,setData]=useState<BoardWorkspaceData|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [retryAvailable,setRetryAvailable]=useState(false),[conflict,setConflict]=useState(false);
  const current=useRef(data),busy=useRef(false),pending=useRef<Request|null>(null),mounted=useRef(false);
  const awaitingAck=useRef<((value:BoardWorkspaceData|null)=>void)|null>(null);
  current.current=data;

  const reload=useCallback(async()=>{
    if(busy.current)return;
    busy.current=true;setLoading(true);
    try{
      const response=await fetch('/api/cms/board',{cache:'no-store'});
      const value=await response.json();
      if(!response.ok){if(response.status===401||response.status===403)setData(null);throw Error(value.message||'Bestuur kon niet worden geladen.');}
      if(!mounted.current)return;
      current.current=value;setData(value);pending.current=null;awaitingAck.current?.(null);awaitingAck.current=null;setRetryAvailable(false);setConflict(false);setError('');
    }catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'Bestuur kon niet worden geladen.');}
    finally{busy.current=false;if(mounted.current)setLoading(false);}
  },[]);

  useEffect(()=>{mounted.current=true;void reload();return()=>{mounted.current=false;awaitingAck.current?.(null);awaitingAck.current=null;};},[reload]);

  async function send(request:Request,message?:string):Promise<BoardWorkspaceData|null>{
    if(busy.current)return null;
    busy.current=true;setSaving(true);setError('');setNotice('');
    pending.current=request;
    try{
      const response=await fetch(request.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request.body),signal:AbortSignal.timeout(30000)});
      const value=await response.json();
      if(!response.ok){
        if(response.status===401||response.status===403){current.current=null;setData(null);}
        if(response.status===409){
          setConflict(true);pending.current=null;setRetryAvailable(false);
          throw Error(`${value.message||'Een andere gebruiker heeft deze gegevens gewijzigd.'} Je invoer is bewaard. Haal de actuele serverversie${Number.isInteger(value.details?.version)?` (${value.details.version})`:''} op voordat je opnieuw opslaat.`);
        }
        if(response.status<500){pending.current=null;setRetryAvailable(false);}
        else setRetryAvailable(true);
        throw Error(value.message||'Opslaan is niet gelukt. Je invoer is bewaard.');
      }
      if(!mounted.current)return null;
      current.current=value;setData(value);pending.current=null;setRetryAvailable(false);setConflict(false);
      if(message)setNotice(message);
      return value;
    }catch(reason){
      if(mounted.current){
        const connectionError=reason instanceof Error&&['AbortError','TimeoutError','TypeError','SyntaxError'].includes(reason.name);
        setError(reason instanceof Error&&!connectionError?reason.message:'Geen serverantwoord ontvangen. Je invoer is bewaard. Probeer dezelfde wijziging opnieuw.');
        if(pending.current)setRetryAvailable(true);
      }
      return null;
    }finally{busy.current=false;if(mounted.current)setSaving(false);}
  }

  async function acknowledged(request:Request,message:string|undefined){
    const result=await send(request,message);
    // Keep the original form continuation until the exact ambiguous request is
    // acknowledged. A retry must close/select that same saved record, rather
    // than leaving a new-record form able to create a second object.
    if(!result&&pending.current===request)return new Promise<BoardWorkspaceData|null>(resolve=>{awaitingAck.current=resolve;});
    return result;
  }

  const change:BoardPageProps['change']=async(recipe,message)=>{
    const value=current.current;
    if(!value?.actor||busy.current||pending.current||conflict)return false;
    const next=structuredClone(value.board);
    try{recipe(next);}catch(reason){setError(reason instanceof Error?reason.message:'Controleer je invoer.');return false;}
    return !!await acknowledged({path:'/api/cms/board',body:{operationId:crypto.randomUUID(),expectedVersion:value.version,board:next}},message);
  };

  async function command(path:string,fields:Record<string,unknown>,message:string){
    const value=current.current;
    if(!value?.actor||busy.current||pending.current||conflict)return null;
    return acknowledged({path,body:{operationId:crypto.randomUUID(),expectedVersion:value.version,...fields}},message);
  }

  async function retry(){
    const request=pending.current;
    if(!request)return;
    const result=await send(request,'Wijziging op de server bewaard.');
    if(result||!pending.current){awaitingAck.current?.(result);awaitingAck.current=null;}
  }
  return {data,loading,saving,error,notice,retryAvailable,conflict,reload,retry,change,command};
}

export async function downloadBoardPdf(kind:'minutes'|'alv-package'|'alv-minutes',id:string){
  const response=await fetch(`/api/cms/board/pdf?${new URLSearchParams({kind,id})}`,{cache:'no-store'});
  if(!response.ok){const value=await response.json().catch(()=>null);throw Error(value?.message||'De PDF kon niet worden gedownload. Probeer opnieuw.');}
  const blob=await response.blob();
  if(!response.headers.get('content-type')?.includes('application/pdf'))throw Error('De server heeft geen PDF teruggegeven.');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`bestuur-${kind}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

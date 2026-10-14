'use client';
import {useEffect,useState} from 'react';
import type {Revision} from '@/lib/cms/types';
export function useRevisions<T>(module:'pages'|'articles',id?:string,version?:number) {
  const [items,setItems]=useState<Revision<T>[]>([]),[error,setError]=useState('');
  useEffect(()=>{setItems([]);setError('');if(!id)return;const controller=new AbortController();
    void fetch(`/api/cms/${module}/${encodeURIComponent(id)}/revisions`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message);setItems(data.items||[]);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>controller.abort();
  },[module,id,version]);
  return {items,error};
}

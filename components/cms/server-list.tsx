'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {Pagination,usePageState} from './pagination';

export function ServerList({label,endpoint,render,revision=0}:{label:string;endpoint:string;render:(item:any)=>ReactNode;revision?:number}){
 const [items,setItems]=useState<any[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const pagination=usePageState(total,endpoint);
 useEffect(()=>{const controller=new AbortController();setLoading(true);const params=new URLSearchParams({limit:String(pagination.pageSize),offset:String((pagination.page-1)*pagination.pageSize)});
 void fetch(endpoint+(endpoint.includes('?')?'&':'?')+params,{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.message||'Overzicht laden is mislukt.');setItems(data.items);setTotal(data.total);setError('');}).catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[endpoint,pagination.page,pagination.pageSize,revision]);
 return <section aria-label={label} aria-busy={loading}>{error&&<p role="alert">{error}</p>}{items.map(render)}{!loading&&!items.length&&!error&&<p>Geen resultaten.</p>}<Pagination label={label} {...pagination} disabled={loading}/></section>;
}

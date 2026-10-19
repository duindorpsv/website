'use client';
import {useEffect,useState} from 'react';
import styles from './pagination.module.css';

export const pageSizes=[25,50,100] as const;
export function usePageState(total:number,resetKey=''){
 const [requestedPage,setPage]=useState(1),[pageSize,setPageSize]=useState<number>(25);
 const pageCount=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requestedPage,pageCount);
 useEffect(()=>setPage(1),[resetKey]);
 useEffect(()=>{if(requestedPage>pageCount)setPage(pageCount);},[requestedPage,pageCount]);
 return {total,page,pageSize,pageCount,onPageChange:(next:number)=>{if(Number.isSafeInteger(next)&&next>0)setPage(next);},onPageSizeChange:(size:number)=>{if(pageSizes.includes(size as 25|50|100)){setPageSize(size);setPage(1);}}};
}
export function usePagination<T>(items:readonly T[],resetKey=''){
 const state=usePageState(items.length,resetKey);
 return {...state,items:items.slice((state.page-1)*state.pageSize,state.page*state.pageSize)};
}
export function Pagination({label,total,page,pageSize,onPageChange,onPageSizeChange,disabled=false}:{label:string;total:number;page:number;pageSize:number;onPageChange:(page:number)=>void;onPageSizeChange:(size:number)=>void;disabled?:boolean}){
 const pages=Math.max(1,Math.ceil(total/pageSize));const numbers=[...new Set([1,...Array.from({length:5},(_,index)=>page+index-2).filter(value=>value>1&&value<pages),pages])].sort((a,b)=>a-b);
 return <nav className={styles.pagination} aria-label={`Paginering ${label}`}><span>{total?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} van ${total}`:'0 resultaten'}</span><label>Per pagina<select aria-label={`${label}: items per pagina`} value={pageSize} disabled={disabled} onChange={event=>onPageSizeChange(Number(event.target.value))}>{pageSizes.map(size=><option key={size} value={size}>{size}</option>)}</select></label><div className={styles.pages}><button type="button" disabled={disabled||page===1} onClick={()=>onPageChange(page-1)} aria-label={`${label}: vorige pagina`}>Vorige</button>{numbers.map((number,index)=><span key={number}>{index>0&&number>numbers[index-1]+1&&<span aria-hidden="true"> … </span>}<button type="button" disabled={disabled} aria-label={`${label}: pagina ${number}`} aria-current={number===page?'page':undefined} onClick={()=>onPageChange(number)}>{number}</button></span>)}<button type="button" disabled={disabled||page===pages} onClick={()=>onPageChange(page+1)} aria-label={`${label}: volgende pagina`}>Volgende</button></div></nav>;
}

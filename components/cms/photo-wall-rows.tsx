'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,Camera,Pause,Play} from 'lucide-react';
import type {CmsMedia} from '@/lib/cms/types';

export function PhotoWallRows({photos,suspended,renderPhoto}:{photos:CmsMedia[];suspended:boolean;renderPhoto:(photo:CmsMedia,index:number)=>ReactNode}){
 const container=useRef<HTMLDivElement>(null);
 const [paused,setPaused]=useState(false),[reducedMotion,setReducedMotion]=useState(false);
 const playback=useRef({paused,suspended});
 useEffect(()=>{playback.current={paused,suspended};},[paused,suspended]);
 const midpoint=Math.ceil(photos.length/2);
 const rows=[photos.slice(0,midpoint),photos.slice(midpoint)].filter(row=>row.length);

 useEffect(()=>{
  const root=container.current;if(!root)return;
  const rails=Array.from(root.querySelectorAll<HTMLElement>('.cm-life-rail'));
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  let reduced=preference.matches,visible=false,hovered=false,focused=false,frame=0,lastTime=0;
  const positions=rails.map(()=>0),maximum=rails.map(()=>0),initialized=rails.map(()=>false);
  const measure=()=>rails.forEach((rail,index)=>{
   maximum[index]=Math.max(0,rail.scrollWidth-rail.clientWidth);
   if(!initialized[index]){if(index===1&&!reduced)rail.scrollLeft=maximum[index];initialized[index]=true;}
   positions[index]=Math.min(rail.scrollLeft,maximum[index]);
  });
  const motion=()=>{reduced=preference.matches;setReducedMotion(reduced);};
  const enter=(event:PointerEvent)=>{if(event.pointerType==='mouse')hovered=true;};
  const leave=()=>{hovered=false;};
  const focus=()=>{focused=true;};
  const blur=(event:FocusEvent)=>{if(!root.contains(event.relatedTarget as Node|null))focused=false;};
  const visibility=()=>{lastTime=0;};
  const tick=(time:number)=>{
   const elapsed=lastTime?Math.min(time-lastTime,50):0;lastTime=time;
   rails.forEach((rail,index)=>{
    if(visible&&document.visibilityState==='visible'&&!reduced&&!playback.current.paused&&!playback.current.suspended&&!hovered&&!focused&&maximum[index]>2){
     const direction=index===0?1:-1;
     positions[index]+=direction*24*elapsed/1000;
     if(positions[index]>maximum[index])positions[index]=0;
     else if(positions[index]<0)positions[index]=maximum[index];
     rail.scrollLeft=positions[index];
    }else positions[index]=rail.scrollLeft;
   });
   frame=requestAnimationFrame(tick);
  };
  motion();measure();
  const resize=new ResizeObserver(measure);rails.forEach(rail=>resize.observe(rail));
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;lastTime=0;});observer.observe(root);
  root.addEventListener('pointerenter',enter);root.addEventListener('pointerleave',leave);
  root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);
  document.addEventListener('visibilitychange',visibility);preference.addEventListener('change',motion);
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();root.removeEventListener('pointerenter',enter);root.removeEventListener('pointerleave',leave);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',motion);};
 },[photos.length]);

 const scroll=(direction:number)=>{
  setPaused(true);
  container.current?.querySelectorAll<HTMLElement>('.cm-life-rail').forEach(rail=>rail.scrollBy({left:direction*rail.clientWidth*.75,behavior:reducedMotion?'auto':'smooth'}));
 };
 return <>
  <div className="cm-life-rows" ref={container} onPointerDown={()=>setPaused(true)} onWheel={event=>{if(event.deltaX||event.shiftKey)setPaused(true);}}>
   {rows.map((row,rowIndex)=><div className="cm-life-rail" key={rowIndex} role="region" aria-label={`Fotomuur rij ${rowIndex+1}`} tabIndex={0}>{row.map((photo,index)=>renderPhoto(photo,rowIndex*midpoint+index))}</div>)}
  </div>
  <div className="cm-life-caption"><span><Camera size={15}/><span>{photos.length} momenten. <strong>Eén Duindorp.</strong></span></span><div className="cm-life-rail-controls">
   {!reducedMotion&&<button type="button" onClick={()=>setPaused(value=>!value)} aria-pressed={paused} aria-label={paused?'Fotomuur automatisch scrollen hervatten':'Fotomuur automatisch scrollen pauzeren'}>{paused?<Play size={16}/>:<Pause size={16}/>}</button>}
   <button type="button" onClick={()=>scroll(-1)} aria-label="Vorige foto’s in fotomuur"><ArrowLeft size={17}/></button><button type="button" onClick={()=>scroll(1)} aria-label="Volgende foto’s in fotomuur"><ArrowRight size={17}/></button>
  </div></div>
 </>;
}

'use client';

import {useCallback,useEffect,useRef,useState} from 'react';

const SPEED=13; // Pixels per second: roughly five seconds per team.
const END_PAUSE=2400;
const INPUT_PAUSE=8000;

/** Native scrolling keeps touch, keyboard and sticky table cells working together. */
export function useStandingsScroll(rowKey:string,animate:boolean){
 const viewport=useRef<HTMLDivElement>(null);
 const motion=useRef({position:0,direction:-1,holdUntil:0,lastFrame:0});
 const [visible,setVisible]=useState(false);
 const [paused,setPaused]=useState(false);
 const [hovered,setHovered]=useState(false);
 const [keyboardFocus,setKeyboardFocus]=useState(false);
 const reset=useCallback(()=>{
  const element=viewport.current;
  if(!element)return;
  const rows=Array.from(element.querySelectorAll<HTMLTableRowElement>('tbody tr'));
  const ownIndex=rows.findIndex(row=>row.dataset.own==='true');
  const rowHeight=rows[0]?.getBoundingClientRect().height||64;
  const max=Math.max(0,element.scrollHeight-element.clientHeight);
  const position=Math.min(max,Math.max(0,ownIndex-2)*rowHeight);
  element.scrollTop=position;
  Object.assign(motion.current,{position,direction:position>0?-1:1,holdUntil:performance.now()+END_PAUSE,lastFrame:0});
 },[]);
 const interact=useCallback(()=>{
  motion.current.holdUntil=performance.now()+INPUT_PAUSE;
  motion.current.lastFrame=0;
  if(viewport.current)motion.current.position=viewport.current.scrollTop;
 },[]);
 useEffect(()=>{
  const element=viewport.current;
  if(!element)return;
  reset();
  const resize=new ResizeObserver(reset);
  resize.observe(element);
  const intersection=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});
  intersection.observe(element);
  return()=>{resize.disconnect();intersection.disconnect();};
 },[rowKey,reset]);
 useEffect(()=>{
  const element=viewport.current;
  if(!element||!animate||paused||hovered||keyboardFocus||!visible)return;
  let frame=0;
  const state=motion.current;
  state.lastFrame=0;
  state.position=element.scrollTop;
  const tick=(now:number)=>{
   const elapsed=state.lastFrame?Math.min(50,now-state.lastFrame):0;
   state.lastFrame=now;
   const max=Math.max(0,element.scrollHeight-element.clientHeight);
   if(document.visibilityState!=='visible'||now<state.holdUntil||max===0){
    state.position=element.scrollTop;
   }else{
    state.position=Math.max(0,Math.min(max,state.position+state.direction*SPEED*elapsed/1000));
    element.scrollTop=state.position;
    if(state.position===0||state.position===max){
     state.direction=state.position===0?1:-1;
     state.holdUntil=now+END_PAUSE;
    }
   }
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[animate,paused,hovered,keyboardFocus,visible,rowKey]);
 return {viewport,reset,paused,setPaused,interact,setHovered,setKeyboardFocus};
}

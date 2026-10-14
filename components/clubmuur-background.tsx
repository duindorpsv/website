'use client';

import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';

const scenes=[
  {id:'houtrust',label:'Onze kantine op Houtrust'},
  {id:'de-wijk',label:'Het Meeuwenhof en de kerk'},
  {id:'aan-zee',label:'Het havenhoofd en de wijk'},
] as const;
const INTERVAL=10000;
const base='/assets/clubmuur-brush-v25';
const sourceSet=(id:string,shape:'wide'|'portrait',format:'avif'|'webp')=>
  (shape==='wide'?[960,1280,1672]:[480,800,941]).map(w=>`${base}/${id}-${shape}-${w}.${format} ${w}w`).join(', ');

/** Only the first picture is requested during initial rendering. The next one
 * is warmed after it decodes; a transition never exposes an undecoded image. */
export function ClubmuurBackground(){
  const surface=useRef<HTMLDivElement>(null);
  const [active,setActive]=useState(0);
  const [requested,setRequested]=useState([true,false,false]);
  const [ready,setReady]=useState([false,false,false]);
  const [failed,setFailed]=useState([false,false,false]);
  const [pending,setPending]=useState<{index:number;automatic:boolean}|null>(null);
  const [paused,setPaused]=useState(false);
  const [reduced,setReduced]=useState(true);
  const [saveData,setSaveData]=useState(false);
  const [visible,setVisible]=useState(true);
  const [inView,setInView]=useState(true);
  const [focused,setFocused]=useState(false);
  const [hovered,setHovered]=useState(false);
  const [announcement,setAnnouncement]=useState('');
  const activeReady=ready[active];
  const next=[1,2].map(offset=>(active+offset)%scenes.length).find(i=>!failed[i]);
  const playing=!paused&&!reduced&&!saveData&&visible&&inView&&!focused&&!hovered&&activeReady&&next!==undefined;

  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const connection=(navigator as Navigator & {connection?:EventTarget & {saveData?:boolean}}).connection;
    const preferences=()=>{setReduced(media.matches);setSaveData(!!connection?.saveData);};
    const visibility=()=>setVisible(document.visibilityState==='visible');
    preferences();visibility();
    media.addEventListener('change',preferences);
    connection?.addEventListener('change',preferences);
    document.addEventListener('visibilitychange',visibility);
    const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.05});
    if(surface.current)observer.observe(surface.current);
    return()=>{media.removeEventListener('change',preferences);connection?.removeEventListener('change',preferences);document.removeEventListener('visibilitychange',visibility);observer.disconnect();};
  },[]);

  useEffect(()=>{
    if(!playing||next===undefined)return;
    const timer=window.setTimeout(()=>setRequested(current=>current.map((value,i)=>value||i===next)),1800);
    return()=>window.clearTimeout(timer);
  },[playing,next]);

  useEffect(()=>{
    if(!playing||next===undefined)return;
    const timer=window.setTimeout(()=>{
      setRequested(current=>current.map((value,i)=>value||i===next));
      setPending({index:next,automatic:true});
    },INTERVAL);
    return()=>window.clearTimeout(timer);
  },[playing,active,next]);

  useEffect(()=>{
    if(pending===null)return;
    if(pending.automatic&&!playing){setPending(null);return;}
    if(!ready[pending.index])return;
    setActive(pending.index);setPending(null);
  },[pending,ready,playing]);

  function choose(index:number){
    setPaused(true);
    if(failed[index])return;
    setRequested(current=>current.map((value,i)=>value||i===index));
    setPending({index,automatic:false});
    setAnnouncement(`Achtergrond ${index+1} van 3: ${scenes[index].label}.`);
  }

  async function loaded(index:number,img:HTMLImageElement){
    try{await img.decode();}catch{if(!img.naturalWidth)return;}
    setReady(current=>current.map((value,i)=>value||i===index));
  }

  function imageFailed(index:number){
    setFailed(current=>current.map((value,i)=>value||i===index));
    setPending(current=>current?.index===index?null:current);
    if(index===active)setReady(current=>current.map((value,i)=>value||i===index));
  }

  return <>
    <div className="cm-background" ref={surface} aria-hidden="true" data-active-scene={scenes[active].id} data-motion={reduced?'reduced':'full'}>
      {requested.map((shouldRender,index)=>shouldRender&&<picture key={scenes[index].id} className={`cm-background-picture ${active===index?'is-active':''}`}>
        {!failed[index]&&<>
          <source media="(max-width: 999px)" type="image/avif" srcSet={sourceSet(scenes[index].id,'portrait','avif')} sizes="100vw"/>
          <source media="(max-width: 999px)" type="image/webp" srcSet={sourceSet(scenes[index].id,'portrait','webp')} sizes="100vw"/>
          <source type="image/avif" srcSet={sourceSet(scenes[index].id,'wide','avif')} sizes="100vw"/>
          <source type="image/webp" srcSet={sourceSet(scenes[index].id,'wide','webp')} sizes="100vw"/>
        </>}
        <img src={failed[index]?'/assets/clubmuur-wall.webp':`${base}/${scenes[index].id}-wide-1672.webp`} alt="" width={1672} height={941} fetchPriority={index===0?'high':'low'} decoding="async" onLoad={event=>void loaded(index,event.currentTarget)} onError={()=>imageFailed(index)}/>
      </picture>)}
    </div>
    <div className="cm-scene-controls" role="group" aria-label="Achtergronden van Duindorp"
      onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}
      onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}>
      {scenes.map((scene,index)=><button type="button" key={scene.id} className="cm-scene-choice" aria-label={`Toon achtergrond ${index+1}: ${scene.label}`} aria-pressed={active===index} aria-busy={pending?.index===index&&!ready[index]} title={scene.label} disabled={failed[index]} onClick={()=>choose(index)}><span className="cm-scene-dot" aria-hidden="true"/></button>)}
      <button type="button" className="cm-scene-play" disabled={reduced||saveData} aria-label={reduced?'Automatisch wisselen uit: verminderde beweging':saveData?'Automatisch wisselen uit: databesparing':paused?'Achtergronden automatisch afspelen':'Achtergronden pauzeren'} onClick={()=>setPaused(value=>!value)} title={paused?'Afspelen':'Pauzeren'}>{paused||reduced||saveData?<Play size={10} fill="currentColor"/>:<Pause size={10} fill="currentColor"/>}</button>
      <span className="sr-only" role="status">{announcement}</span>
    </div>
  </>;
}

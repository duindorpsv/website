'use client';

import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Pause,Play} from 'lucide-react';
import {useCMS} from './cms/provider';
import {createDefaultHeroSlider,heroBackgroundImageSrc,heroBackgroundSourceSet,resolveHeroSlides,type ResolvedHeroSlide} from '@/lib/cms/hero-slider';
import type {CmsMedia} from '@/lib/cms/types';
import type {CmsHeroSlider} from '@/lib/cms/hero-slider';

type Props={settings?:CmsHeroSlider;media?:CmsMedia[];preview?:boolean;previewDevice?:'desktop'|'mobile'};

/** Saved CMS choices are resolved before rendering any background, so an
 * excluded photo cannot flash during hydration. Draft previews use the same player. */
export function ClubmuurBackground({settings,media,preview=false,previewDevice='desktop'}:Props={}){
  const cms=useCMS();
  const configuration=settings??cms.state.appearance?.heroSlider??createDefaultHeroSlider();
  const slides=(settings||cms.ready&&!cms.storageError)?resolveHeroSlides(configuration,media??cms.state.media):[];
  const key=JSON.stringify([configuration,slides.map(slide=>[slide.id,slide.src]),preview,previewDevice]);
  if(!slides.length)return <div className="cm-background" aria-hidden="true" data-active-scene="none" data-motion="none"/>;
  return <BackgroundPlayer key={key} settings={configuration} slides={slides} preview={preview} previewDevice={previewDevice}/>;
}

/** Only the initial image is requested immediately; all later transitions wait
 * for decode. Configuration/media changes create a fresh, consistent playlist. */
function BackgroundPlayer({settings,slides,preview,previewDevice}:{settings:CmsHeroSlider;slides:ResolvedHeroSlide[];preview:boolean;previewDevice:'desktop'|'mobile'}){
  const surface=useRef<HTMLDivElement>(null);
  const [active,setActive]=useState(0);
  const [requested,setRequested]=useState(()=>slides.map((_,index)=>index===0));
  const [ready,setReady]=useState(()=>slides.map(()=>false));
  const [failed,setFailed]=useState(()=>slides.map(()=>false));
  const [fallbackFailed,setFallbackFailed]=useState(false);
  const [pending,setPending]=useState<{index:number;automatic:boolean}|null>(null);
  const [paused,setPaused]=useState(!settings.autoplay);
  const [reduced,setReduced]=useState(true);
  const [saveData,setSaveData]=useState(false);
  const [visible,setVisible]=useState(true);
  const [inView,setInView]=useState(true);
  const [focused,setFocused]=useState(false);
  const [hovered,setHovered]=useState(false);
  const [announcement,setAnnouncement]=useState('');
  const next=slides.map((_,offset)=>(active+offset+1)%slides.length).find(index=>index!==active&&!failed[index]);
  const playing=!paused&&!reduced&&!saveData&&visible&&inView&&!focused&&!hovered&&ready[active]&&!failed[active]&&next!==undefined;
  const duration=reduced||settings.transition==='none'?0:settings.transitionMs;
  const style={
    '--cm-background-fade':`${duration}ms`,
    '--cm-background-duration':`${settings.intervalMs+duration}ms`,
    '--cm-background-scale':settings.zoom==='cinematic'?1.065:settings.zoom==='subtle'?1.018:1,
    '--cm-background-play-state':playing?'running':'paused',
  } as CSSProperties;

  useEffect(()=>{
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const connection=(navigator as Navigator & {connection?:EventTarget & {saveData?:boolean}}).connection;
    const preferences=()=>{setReduced(preference.matches);setSaveData(!!connection?.saveData);};
    const visibility=()=>setVisible(document.visibilityState==='visible');
    preferences();visibility();
    preference.addEventListener('change',preferences);
    connection?.addEventListener('change',preferences);
    document.addEventListener('visibilitychange',visibility);
    const observer=typeof globalThis.IntersectionObserver==='function'?new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.05}):null;
    if(surface.current)observer?.observe(surface.current);
    return()=>{preference.removeEventListener('change',preferences);connection?.removeEventListener('change',preferences);document.removeEventListener('visibilitychange',visibility);observer?.disconnect();};
  },[]);

  useEffect(()=>{
    if(!playing||next===undefined)return;
    const timer=window.setTimeout(()=>setRequested(current=>current.map((value,index)=>value||index===next)),Math.min(1800,settings.intervalMs/3));
    return()=>window.clearTimeout(timer);
  },[playing,next,settings.intervalMs]);

  useEffect(()=>{
    if(!playing||next===undefined)return;
    const timer=window.setTimeout(()=>{
      setRequested(current=>current.map((value,index)=>value||index===next));
      setPending({index:next,automatic:true});
    },settings.intervalMs);
    return()=>window.clearTimeout(timer);
  },[playing,active,next,settings.intervalMs]);

  useEffect(()=>{
    if(pending===null)return;
    if(failed[pending.index]||pending.automatic&&!playing){setPending(null);return;}
    if(!ready[pending.index])return;
    setActive(pending.index);setPending(null);
  },[pending,ready,playing,failed]);

  // A broken first/active photo must not strand an otherwise valid playlist,
  // including when automatic playback is disabled in CMS or by accessibility.
  useEffect(()=>{
    if(!failed[active]||next===undefined)return;
    setRequested(current=>current.map((value,index)=>value||index===next));
    setPending({index:next,automatic:false});
  },[failed,active,next]);

  function choose(index:number){
    if(failed[index])return;
    setPaused(true);
    setRequested(current=>current.map((value,i)=>value||i===index));
    setPending({index,automatic:false});
    setAnnouncement(`Achtergrond ${index+1} van ${slides.length}: ${slides[index].label}.`);
  }

  async function loaded(index:number,img:HTMLImageElement){
    try{await img.decode();}catch{if(!img.naturalWidth)return;}
    setReady(current=>current.map((value,i)=>value||i===index));
  }

  function imageFailed(index:number){
    setFailed(current=>current.map((value,i)=>value||i===index));
    setPending(current=>current?.index===index?null:current);
  }

  const showControls=slides.length>1&&(settings.showIndicators||settings.autoplay);
  const allFailed=failed.every(Boolean);
  const previewShape=previewDevice==='mobile'?'portrait':'wide';
  const previewSizes=previewDevice==='mobile'?'320px':'600px';
  const position=(slide:ResolvedHeroSlide):CSSProperties|undefined=>{
    // The bundled artwork was composed with a top-aligned mobile crop. Keep it
    // until an editor deliberately changes the focal coordinates.
    if(slide.presetId&&slide.focusX===50&&slide.focusY===50)return preview?{objectPosition:previewDevice==='mobile'?'center top':'center'}:undefined;
    return {objectPosition:`${slide.focusX}% ${slide.focusY}%`};
  };
  return <>
    <div className="cm-background" ref={surface} style={style} aria-hidden="true" data-active-scene={allFailed?'fallback':slides[active].sourceId} data-motion={reduced||saveData?'reduced':settings.zoom} data-preview={preview||undefined}>
      {allFailed&&!fallbackFailed&&<picture className="cm-background-picture is-active"><img src="/assets/clubmuur-wall.webp" alt="" width={1672} height={941} style={{animation:'none',transform:'none'}} onError={()=>setFallbackFailed(true)}/></picture>}
      {requested.map((shouldRender,index)=>shouldRender&&!failed[index]&&<picture key={slides[index].id} className={`cm-background-picture ${active===index?'is-active':''}`}>
        {slides[index].presetId&&(preview?<>
          <source type="image/avif" srcSet={heroBackgroundSourceSet(slides[index].presetId!,previewShape,'avif')} sizes={previewSizes}/>
          <source type="image/webp" srcSet={heroBackgroundSourceSet(slides[index].presetId!,previewShape,'webp')} sizes={previewSizes}/>
        </>:<>
          <source media="(max-width: 999px)" type="image/avif" srcSet={heroBackgroundSourceSet(slides[index].presetId!,'portrait','avif')} sizes="100vw"/>
          <source media="(max-width: 999px)" type="image/webp" srcSet={heroBackgroundSourceSet(slides[index].presetId!,'portrait','webp')} sizes="100vw"/>
          <source type="image/avif" srcSet={heroBackgroundSourceSet(slides[index].presetId!,'wide','avif')} sizes="100vw"/>
          <source type="image/webp" srcSet={heroBackgroundSourceSet(slides[index].presetId!,'wide','webp')} sizes="100vw"/>
        </>)}
        <img src={preview&&slides[index].presetId?heroBackgroundImageSrc(slides[index].presetId!,previewShape):slides[index].src} alt="" width={preview&&previewDevice==='mobile'?941:1672} height={preview&&previewDevice==='mobile'?1672:941} style={position(slides[index])} fetchPriority={index===0?'high':'low'} decoding="async" onLoad={event=>void loaded(index,event.currentTarget)} onError={()=>imageFailed(index)}/>
      </picture>)}
    </div>
    {showControls&&<div className="cm-scene-controls" role="group" aria-label="Achtergronden van Duindorp"
      onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}
      onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}>
      {settings.showIndicators&&slides.map((slide,index)=><button type="button" key={slide.id} className="cm-scene-choice" aria-label={`Toon achtergrond ${index+1}: ${slide.label}`} aria-pressed={active===index} aria-busy={pending?.index===index&&!ready[index]} title={slide.label} disabled={failed[index]} onClick={()=>choose(index)}><span className="cm-scene-dot" aria-hidden="true"/></button>)}
      {settings.autoplay&&<button type="button" className="cm-scene-play" disabled={reduced||saveData||next===undefined} aria-label={reduced?'Automatisch wisselen uit: verminderde beweging':saveData?'Automatisch wisselen uit: databesparing':paused?'Achtergronden automatisch afspelen':'Achtergronden pauzeren'} onClick={()=>setPaused(value=>!value)} title={paused?'Afspelen':'Pauzeren'}>{paused||reduced||saveData?<Play size={10} fill="currentColor"/>:<Pause size={10} fill="currentColor"/>}</button>}
      <span className="sr-only" role="status">{announcement}</span>
    </div>}
  </>;
}

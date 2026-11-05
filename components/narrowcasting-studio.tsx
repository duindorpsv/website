'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, Copy, HeartHandshake, Maximize2, Monitor, Newspaper, Pause, Play, Plus, Smartphone, Trash2, Trophy, Users, X } from 'lucide-react';
import { SportsScreen } from './narrowcasting-sports';
import { ClubScreen } from './narrowcasting-club';
import { NarrowcastingWizard } from './narrowcasting-wizard';
import { SportlinkProvider } from '@/hooks/use-sportlink';
import { initialGroups, kindTitles, parseGroups, type NarrowcastGroup, type NarrowcastKind, type NarrowcastSlide } from '@/lib/narrowcasting-config';
import '../app/narrowcasting-wizard.css';

const STORE = 'duindorp-narrowcasting-v2';
const icons = {wedstrijd:Trophy,programma:CalendarDays,uitslagen:Check,stand:Trophy,kantine:Coffee,clubnieuws:Newspaper,partners:HeartHandshake,welkom:Users};
const sports = new Set<NarrowcastKind>(['wedstrijd','programma','uitslagen','stand']);

function Broadcast({ slide, portrait, time, playing }: { slide:NarrowcastSlide; portrait:boolean; time:string; playing:boolean }) {
  return <article className={`nc-screen ${portrait ? 'nc-portrait' : ''} nc-template-${slide.kind}`} aria-label={`${slide.title} · ${portrait ? '9:16' : '16:9'}`}>
    <header className="nc-broadcast-header">
      <div className="nc-broadcast-brand"><img src="/assets/logo.png" alt="Duindorp SV" /><div><strong>DUINDORP SV</strong><span>Onze Club. Onze Trots.</span></div></div>
      {slide.kind !== 'wedstrijd' && <div className="nc-broadcast-category"><span className="nc-broadcast-dot" />{kindTitles[slide.kind]}</div>}
      <time className="nc-clock" aria-label="Tijd in Nederland">{time}</time>
    </header>
    <div className="nc-screen-body" key={slide.id}>
      {sports.has(slide.kind) ? <SportsScreen kind={slide.kind} portrait={portrait} config={slide.config} playing={playing} /> : <ClubScreen kind={slide.kind} portrait={portrait} />}
    </div>
    <footer className="nc-broadcast-footer"><div className="nc-footer-copy"><span>Onze Wijk. Onze Club. Onze Trots.</span><small>{sports.has(slide.kind) ? 'WEDSTRIJDGEGEVENS VIA SPORTLINK' : slide.kind === 'kantine' ? 'KANTINE' : slide.kind === 'clubnieuws' ? 'CLUBNIEUWS' : 'DUINDORP SV'}</small></div><div className="nc-brush-wordmark" aria-label="OnzeTrots" /></footer>
  </article>;
}

export function NarrowcastingStudio() {
  return <SportlinkProvider><Studio /></SportlinkProvider>;
}

function Studio() {
  const serverVersion=useRef(0),saveChain=useRef(Promise.resolve()),screenOnly=useRef(false);
  const [groups,setGroups] = useState<NarrowcastGroup[]>(initialGroups);
  const [groupId,setGroupId] = useState('clubmuur');
  const [selected,setSelected] = useState('wedstrijd');
  const [playing,setPlaying] = useState(false);
  const [seconds,setSeconds] = useState(20);
  const [enabled,setEnabled] = useState<string[]>(initialGroups()[0].slides.map(s=>s.id));
  const [player,setPlayer] = useState(false);
  const [wizard,setWizard] = useState(false);
  const [time,setTime] = useState('--:--');
  const [ready,setReady] = useState(false);
  const [progress,setProgress] = useState(0);
  const [status,setStatus] = useState('');
  const [scale,setScale] = useState(.5);
  const [controlsVisible,setControlsVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tickStart = useRef(0);
  const enabledByGroup = useRef<Record<string,string[]>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const group = groups.find(g=>g.id===groupId) || groups[0];
  const slides = group.slides;
  const active = slides.find(s=>s.id===selected) || slides[0];
  const portrait = group.portrait;
  const width = portrait ? 1080 : 1920;
  const height = portrait ? 1920 : 1080;

  useEffect(()=>{
   const load=async()=>{
    const query = new URLSearchParams(window.location.search);screenOnly.current=query.get('tv')==='1';
    const serverResponse=screenOnly.current?await fetch('/api/site/config'):await fetch('/api/cms/narrowcasting/studio');
    const serverData=serverResponse.ok?await serverResponse.json():null;const serverSaved=screenOnly.current?serverData?.narrowcasting:serverData;serverVersion.current=serverSaved?.version||0;
    let loaded = initialGroups(); let chosen = loaded[0]; let activeId = chosen.slides[0].id;
    let included = chosen.slides.map(s=>s.id);
    try {
      const saved = serverSaved||JSON.parse(localStorage.getItem(STORE)||'{}');
      const valid = parseGroups(saved.groups);
      if(valid.length){loaded=valid;chosen=loaded.find(g=>g.id===(query.get('groep')||saved.groupId))||loaded[0];}
      for(const item of loaded){
        const remembered=saved.enabledByGroup?.[item.id];
        if(Array.isArray(remembered)){const ids=item.slides.filter(s=>remembered.includes(s.id)).map(s=>s.id);if(ids.length)enabledByGroup.current[item.id]=ids;}
      }
      activeId = chosen.slides.some(s=>s.id===saved.selected)?saved.selected:chosen.slides[0].id;
      included = enabledByGroup.current[chosen.id] || (Array.isArray(saved.enabled)?chosen.slides.filter(s=>saved.enabled.includes(s.id)).map(s=>s.id):chosen.slides.map(s=>s.id));
      if([10,15,20,30,45,60].includes(saved.seconds))setSeconds(saved.seconds);
    } catch { /* A fresh studio works when browser storage is unavailable. */ }
    // The complete group is carried in the link, so another screen needs no local setup.
    try {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const packed=hash.get('groep');
      if(packed&&packed.length<200000){
        const imported=parseGroups([JSON.parse(packed)])[0];
        if(imported){loaded=[...loaded.filter(g=>g.id!==imported.id),imported];chosen=imported;activeId=imported.slides[0].id;included=imported.slides.map(s=>s.id);}
      }
    } catch { /* Ignore malformed shared configuration. */ }
    if(query.has('formaat')){chosen={...chosen,portrait:query.get('formaat')==='staand'};loaded=loaded.map(g=>g.id===chosen.id?chosen:g);}
    if(chosen.slides.some(s=>s.id===query.get('scherm')))activeId=query.get('scherm')!;
    if(query.has('lijst'))included=chosen.slides.filter(s=>query.get('lijst')!.split(',').includes(s.id)).map(s=>s.id);
    if(!included.length)included=chosen.slides.map(s=>s.id);
    setGroups(loaded);setGroupId(chosen.id);setSelected(activeId);setEnabled(included);
    const duration=Number(query.get('duur'));if([10,15,20,30,45,60].includes(duration))setSeconds(duration);
    if(query.get('afspelen')==='1')setPlaying(true);
    if(query.get('tv')==='1')setPlayer(true);
    else if(window.location.hash){const clean=new URL(window.location.href);clean.hash='';window.history.replaceState(null,'',clean);}
    setReady(true);
   };void load().catch(()=>{setReady(true);setStatus('Schermconfiguratie kon niet worden geladen.');});
  },[]);

  useEffect(()=>{
    if(!ready)return;
    enabledByGroup.current[groupId]=enabled;
    if(screenOnly.current)return;
    const configuration={groups,groupId,selected,seconds,enabled,enabledByGroup:enabledByGroup.current};
    const timer=setTimeout(()=>{saveChain.current=saveChain.current.then(async()=>{const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),changes:[{module:'narrowcasting',id:'studio',expectedVersion:serverVersion.current,action:'save',data:configuration}]})});const data=await response.json();if(response.ok){serverVersion.current=data.versions.studio;setStatus('Schermconfiguratie opgeslagen als concept.');}else setStatus(data.message||'Opslaan mislukt.');});},650);return()=>clearTimeout(timer);
  },[groups,groupId,selected,seconds,enabled,ready]);

  useEffect(()=>{
    const update=()=>setTime(new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date()));
    update();const timer=setInterval(update,15000);return()=>clearInterval(timer);
  },[]);

  useEffect(()=>{
    const element=stage.current;if(!element)return;
    const fit=()=>{const bounds=element.getBoundingClientRect();const padding=player?0:44;setScale(Math.max(.02,Math.min((bounds.width-padding)/width,(bounds.height-padding)/height)));};
    const observer=new ResizeObserver(fit);observer.observe(element);fit();return()=>observer.disconnect();
  },[width,height,player]);

  const move=useCallback((direction:number)=>{
    const index=enabled.indexOf(selected);
    const next=index<0?(direction>0?0:enabled.length-1):(index+direction+enabled.length)%enabled.length;
    setSelected(enabled[next]);setProgress(0);tickStart.current=performance.now();
  },[selected,enabled]);
  useEffect(()=>{if(playing&&!enabled.includes(selected))setSelected(enabled[0]);},[playing,selected,enabled]);
  const revealControls=useCallback(()=>{
    if(!player)return;setControlsVisible(true);
    if(idleTimer.current)clearTimeout(idleTimer.current);
    idleTimer.current=setTimeout(()=>setControlsVisible(false),2200);
  },[player]);
  useEffect(()=>{revealControls();return()=>{if(idleTimer.current)clearTimeout(idleTimer.current);};},[revealControls]);
  useEffect(()=>{
    setProgress(0);tickStart.current=performance.now();if(!playing||wizard)return;
    const timer=setInterval(()=>{
      const elapsed=performance.now()-tickStart.current;
      if(elapsed>=seconds*1000){tickStart.current=performance.now();move(1);}else setProgress(elapsed/(seconds*1000));
    },100);return()=>clearInterval(timer);
  },[playing,selected,seconds,move,wizard]);

  const exitPlayer=useCallback(async()=>{
    if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
    setPlayer(false);const url=new URL(window.location.href);url.searchParams.delete('tv');url.hash='';window.history.replaceState(null,'',url);
  },[]);
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      if(wizard||(event.target as HTMLElement).closest('input,select,textarea,button,a,[role=dialog]'))return;
      if(event.code==='Space'){event.preventDefault();setPlaying(v=>!v);}
      if(event.key==='ArrowRight'){event.preventDefault();move(1);}
      if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
      if(event.key==='Escape'&&player)void exitPlayer();
    };
    const fullscreenChange=()=>{if(!document.fullscreenElement)setPlayer(false);};
    window.addEventListener('keydown',handle);document.addEventListener('fullscreenchange',fullscreenChange);
    return()=>{window.removeEventListener('keydown',handle);document.removeEventListener('fullscreenchange',fullscreenChange);};
  },[move,player,exitPlayer,wizard]);
  useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),6000);return()=>clearTimeout(timer);},[status]);

  async function openPlayer(){setPlayer(true);setPlaying(true);try{await root.current?.requestFullscreen();}catch{/* Fitted view remains available. */}}
  function playerUrl(){
    const url=new URL('/narrowcasting',window.location.origin);
    url.searchParams.set('formaat',portrait?'staand':'liggend');url.searchParams.set('scherm',selected);url.searchParams.set('tv','1');
    url.searchParams.set('afspelen','1');url.searchParams.set('duur',String(seconds));
    url.searchParams.set('lijst',enabled.join(','));
    url.hash=new URLSearchParams({groep:JSON.stringify(group)}).toString();
    return url.toString();
  }
  async function copyLink(){try{await navigator.clipboard.writeText(playerUrl());setStatus('Schermlink gekopieerd, inclusief deze groep en je teamselecties.');}catch{setStatus('Gebruik ‘Open scherm’ en kopieer de adresbalk.');}}
  function chooseGroup(next:NarrowcastGroup){
    enabledByGroup.current[group.id]=enabled;
    const remembered=next.slides.filter(s=>enabledByGroup.current[next.id]?.includes(s.id)).map(s=>s.id);
    const included=remembered.length?remembered:next.slides.map(s=>s.id);
    setGroupId(next.id);setSelected(included[0]);setEnabled(included);setProgress(0);
  }
  function createGroup(next:NarrowcastGroup){setGroups(current=>[...current,next]);chooseGroup(next);setWizard(false);setStatus(`Groep ‘${next.name}’ aangemaakt met ${next.slides.length} slides.`);}
  function setPortrait(value:boolean){setGroups(current=>current.map(g=>g.id===group.id?{...g,portrait:value}:g));}
  function toggleScreen(id:string){
    if(enabled.includes(id)){if(enabled.length===1){setStatus('Laat minimaal één slide in de afspeellijst staan.');return;}const next=enabled.filter(v=>v!==id);setEnabled(next);if(selected===id)setSelected(next[0]);}
    else setEnabled(slides.filter(s=>s.id===id||enabled.includes(s.id)).map(s=>s.id));
  }
  function reorder(id:string,direction:number){
    const copy=[...slides];const index=copy.findIndex(s=>s.id===id);const target=index+direction;if(target<0||target>=copy.length)return;
    [copy[index],copy[target]]=[copy[target],copy[index]];setGroups(current=>current.map(g=>g.id===group.id?{...g,slides:copy}:g));setEnabled(copy.filter(s=>enabled.includes(s.id)).map(s=>s.id));
  }
  function removeGroup(){if(groups.length<2)return;const remaining=groups.filter(g=>g.id!==group.id);setGroups(remaining);chooseGroup(remaining[0]);setStatus(`Groep ‘${group.name}’ verwijderd uit het concept.`);}

  return <div className={`nc-studio ${player?'nc-player-mode':''} ${controlsVisible?'nc-player-controls-visible':''}`} ref={root} data-theme="light" onPointerMove={revealControls} onPointerDown={revealControls}>
    <header className="nc-topbar"><a href="/clubmuur" className="nc-studio-brand"><img src="/assets/logo.png" alt="Duindorp SV"/><span>ONZETROTS<span className="nc-tv-label">TV</span><small>DUINDORP SV · NARROWCASTING</small></span></a><a className="nc-back" href="/clubmuur"><ArrowLeft size={15}/>Terug naar Clubmuur</a><span className="nc-concept-label">SCHERMSTUDIO</span></header>
    <main className="nc-workspace">
      <div className="nc-intro"><div><span className="nc-eyebrow">Onze Club. Onze Trots.</span><h1>Jouw <span>clubschermen.</span></h1><p>Maak een groep met teams, overzichten en een indeling voor jouw scherm.</p></div><div className="nc-format-switch" role="group" aria-label="Schermformaat"><button aria-pressed={!portrait} onClick={()=>setPortrait(false)}><Monitor size={19}/><span>Liggend<b>16:9</b></span></button><button aria-pressed={portrait} onClick={()=>setPortrait(true)}><Smartphone size={19}/><span>Staand<b>9:16</b></span></button></div></div>
      <div className="nc-group-bar"><label>Schermgroep<select value={group.id} onChange={e=>{const next=groups.find(g=>g.id===e.target.value);if(next)chooseGroup(next);}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name} · {g.slides.length} slides</option>)}</select></label><button className="nc-new-group" disabled={groups.length>=30} onClick={()=>setWizard(true)}><Plus size={17}/>Groep maken</button>{groups.length>1&&<button className="nc-delete-group" onClick={removeGroup} aria-label={`Groep ${group.name} verwijderen`}><Trash2 size={16}/></button>}<span>Schermgroepen worden centraal als concept bewaard.</span><button onClick={async()=>{await saveChain.current;const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),changes:[{module:'narrowcasting',id:'studio',expectedVersion:serverVersion.current,action:'publish',data:{groups,groupId,selected,seconds,enabled,enabledByGroup:enabledByGroup.current}}]})});const data=await response.json();if(response.ok){serverVersion.current=data.versions.studio;setStatus('Schermconfiguratie gepubliceerd.');}else setStatus(data.message);}}>Schermen publiceren</button></div>
      <div className="nc-main-grid">
        <aside className="nc-playlist"><div className="nc-playlist-heading"><span>JOUW AFSPEELLIJST</span><b>{String(enabled.length).padStart(2,'0')}</b></div><p>Kies, verplaats of pauzeer een slide.</p><div className="nc-screen-list">{slides.map((slide,index)=>{const Icon=icons[slide.kind];return <div className={`nc-screen-option ${active.id===slide.id?'nc-selected':''}`} key={slide.id}><button className="nc-option-main" aria-pressed={active.id===slide.id} onClick={()=>{setSelected(slide.id);setProgress(0);tickStart.current=performance.now();}}><span className="nc-option-icon"><Icon size={19}/></span><span><strong>{slide.title}</strong><small>{kindTitles[slide.kind]}</small></span></button><div className="nc-order-buttons"><button disabled={index===0} aria-label={`${slide.title} omhoog`} onClick={()=>reorder(slide.id,-1)}><ArrowUp size={11}/></button><button disabled={index===slides.length-1} aria-label={`${slide.title} omlaag`} onClick={()=>reorder(slide.id,1)}><ArrowDown size={11}/></button></div><button className="nc-include" aria-label={`${slide.title} ${enabled.includes(slide.id)?'uit':'in'} de afspeellijst`} aria-pressed={enabled.includes(slide.id)} onClick={()=>toggleScreen(slide.id)}>{enabled.includes(slide.id)&&<Check size={12}/>}</button></div>;})}</div><div className="nc-playlist-note"><span className="nc-small-line"/><strong>Programma, uitslagen en standen</strong><p>Dezelfde Sportlink-bron als de website. Tijdens afspelen wisselen overzichten automatisch door alle beschikbare rijen.</p></div></aside>
        <section className="nc-preview-panel" aria-label="Voorbeeld van het scherm">
          <div className="nc-preview-top"><div><i/><span>{active.title}</span><b>{portrait?'1080 × 1920':'1920 × 1080'}</b></div><button onClick={openPlayer}><Maximize2 size={15}/>Volledig scherm</button></div>
          <div className={`nc-stage ${portrait?'nc-stage-portrait':''}`} ref={stage}><div className="nc-canvas-frame" style={{width:width*scale,height:height*scale}}><div className="nc-canvas-scale" style={{width,height,transform:`scale(${scale})`}}><Broadcast slide={active} portrait={portrait} time={time} playing={playing&&!wizard}/></div></div></div>
          <div className="nc-player-overlay"><button onClick={()=>setPlaying(v=>!v)} aria-label={playing?'Pauzeren':'Afspelen'}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><button onClick={exitPlayer}><X size={20}/>Terug naar studio</button></div>
          <div className="nc-progress-track"><span style={{width:`${progress*100}%`}}/></div>
          <div className="nc-controls"><div className="nc-play-controls"><button className="nc-step" aria-label="Vorig scherm" onClick={()=>move(-1)}><ChevronLeft size={20}/></button><button className="nc-play-button" aria-pressed={playing} onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={16} fill="currentColor"/>:<Play size={16} fill="currentColor"/>}{playing?'Pauzeren':'Afspeellijst starten'}</button><button className="nc-step" aria-label="Volgend scherm" onClick={()=>move(1)}><ChevronRight size={20}/></button></div><span className="nc-screen-count">{slides.findIndex(s=>s.id===active.id)+1} <span>/ {slides.length}</span></span><label className="nc-duration">Per slide<select aria-label="Duur per slide" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}>{[10,15,20,30,45,60].map(value=><option key={value} value={value}>{value} sec</option>)}</select></label></div>
        </section>
      </div>
      <div className="nc-bottom"><p><span>SPORTLINK</span>Sportoverzichten verversen elke 15 minuten. De schermlink bevat de geselecteerde groep.</p><div><button onClick={copyLink}><Copy size={15}/>Kopieer schermlink</button><button onClick={()=>window.open(playerUrl(),'_blank','noopener,noreferrer')}>Open scherm<ArrowUpRight size={16}/></button></div></div>
    </main>
    <footer className="nc-studio-footer"><strong>Onze Club. Onze Trots.</strong><span>OnzeTrots TV<i/>Clubmuur</span></footer>
    {wizard&&<NarrowcastingWizard portrait={portrait} onCreate={createGroup} onClose={()=>setWizard(false)}/>}
    {status&&<div className="nc-toast" role="status">{status}</div>}
  </div>;
}

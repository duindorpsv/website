'use client';

import {useEffect,useRef,useState,type DragEvent} from 'react';
import {ArrowDown,ArrowUp,Check,GripVertical,ImagePlus,Monitor,RotateCcw,Save,Search,Settings2,Smartphone,Trash2,Upload,X} from 'lucide-react';
import {useCMS} from './provider';
import {ClubmuurBackground} from '../clubmuur-background';
import {createDefaultHeroSlider,HERO_BACKGROUND_PRESETS,publicSliderMediaSource,resolveHeroSlides,validateHeroSlider,type CmsHeroSlide,type CmsHeroSlider} from '@/lib/cms/hero-slider';
import {validateImageFile} from '@/lib/cms/media-storage';
import {uid} from '@/lib/cms/model';
import {Pagination,usePagination} from './pagination';
import type {CmsMedia} from '@/lib/cms/types';
import './hero-slider-manager.css';

const sliderKeys=['slides','autoplay','intervalMs','transition','transitionMs','zoom','parallax','showIndicators'] as const;
export function HeroSliderManager(){
  const {state,can,update,notify,recordVersion,reload,storageConflictId,clearStorageError,ready,loadMoreMedia,mediaLoading}=useCMS();
  const current=JSON.stringify(state.appearance?.heroSlider??createDefaultHeroSlider());
  const [draft,setDraft]=useState<CmsHeroSlider>(()=>structuredClone(state.appearance?.heroSlider??createDefaultHeroSlider()));
  const [baseline,setBaseline]=useState(current),[baseVersion,setBaseVersion]=useState(recordVersion('site-hero-slider'));
  const [expanded,setExpanded]=useState<string|null>(null),[dragging,setDragging]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<string|null>(null);
  const [addMode,setAddMode]=useState<'presets'|'library'|'upload'|null>(null),[query,setQuery]=useState('');
  const [mobile,setMobile]=useState(false),[previewKey,setPreviewKey]=useState(0);
  const [file,setFile]=useState<File|null>(null),[filePreview,setFilePreview]=useState(''),[name,setName]=useState(''),[alt,setAlt]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const addPanel=useRef<HTMLElement>(null),mutation=useRef(false),uploaded=useRef<CmsMedia|null>(null),uploadAbort=useRef<AbortController|null>(null);
  const editable=ready&&can('pages'),canPublish=editable&&can('publish',undefined,'pages'),canUpload=editable&&can('media')&&can('publish',undefined,'media');
  const locked=!editable||busy;
  const dirty=JSON.stringify(draft)!==baseline,conflict=current!==baseline||recordVersion('site-hero-slider')!==baseVersion||storageConflictId==='site-hero-slider';
  const resolved=resolveHeroSlides(draft,state.media);
  const availablePresets=HERO_BACKGROUND_PRESETS.filter(preset=>!draft.slides.some(slide=>slide.source==='builtin'&&slide.sourceId===preset.id));
  const library=state.media.filter(media=>publicSliderMediaSource(media)&&!draft.slides.some(slide=>slide.source==='media'&&slide.sourceId===media.id));
  const matching=library.filter(media=>`${media.name} ${media.alt}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl')));
  const libraryPage=usePagination(matching,query);
  const missing=draft.slides.filter(slide=>slide.enabled&&!resolved.some(item=>item.id===slide.id)).length;
  const limited=draft.slides.length>=20;

  useEffect(()=>{if(!file){setFilePreview('');return;}const src=URL.createObjectURL(file);setFilePreview(src);return()=>URL.revokeObjectURL(src);},[file]);
  useEffect(()=>{if(addMode)addPanel.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});},[addMode]);
  useEffect(()=>()=>uploadAbort.current?.abort(),[]);
  const patch=(value:Partial<CmsHeroSlider>)=>{if(locked)return;setDraft(current=>({...current,...value}));setError('');setNotice('');};
  const patchSlide=(id:string,value:Partial<CmsHeroSlide>)=>patch({slides:draft.slides.map(slide=>slide.id===id?{...slide,...value}:slide)});
  function reset(){if(dirty&&!window.confirm('Je niet-opgeslagen sliderwijzigingen vervangen door de opgeslagen werkversie?'))return;setDraft(JSON.parse(current));setBaseline(current);setBaseVersion(recordVersion('site-hero-slider'));clearStorageError();setError('');setNotice('');setExpanded(null);}
  async function reloadCurrent(){
    if(dirty&&!window.confirm('Je sliderwijzigingen vervangen door de serverversie?'))return;
    if(mutation.current)return;mutation.current=true;setBusy(true);setError('');
    try{
      await reload();const response=await fetch('/api/cms/heroSlider/site-hero-slider',{cache:'no-store'}),record=await response.json();
      if(!response.ok&&response.status!==404)throw new Error(record.message||'De slider kon niet opnieuw worden geladen.');
      const next=response.ok?Object.fromEntries(sliderKeys.map(key=>[key,record[key]])) as CmsHeroSlider:createDefaultHeroSlider();
      const errors=validateHeroSlider(next);if(errors.length)throw new Error(errors.join(' '));
      setDraft(structuredClone(next));setBaseline(JSON.stringify(next));setBaseVersion(response.ok?record.version:0);setExpanded(null);setError('');setNotice('De serverversie is geladen.');clearStorageError();
    }catch(problem){setError(problem instanceof Error?problem.message:'De slider kon niet opnieuw worden geladen.');}
    finally{mutation.current=false;setBusy(false);}
  }
  function add(source:CmsHeroSlide['source'],sourceId:string,label:string){
    if(!editable||draft.slides.length>=20||draft.slides.some(slide=>slide.source===source&&slide.sourceId===sourceId))return;
    const id=uid('hero-slide');
    setDraft(current=>({...current,slides:[...current.slides,{id,source,sourceId,label:label.slice(0,160),enabled:true,focusX:50,focusY:50}]}));setExpanded(id);setAddMode(null);setFile(null);uploaded.current=null;setError('');setNotice('');
  }
  function move(id:string,target:number){
    if(locked)return;const slides=[...draft.slides],index=slides.findIndex(slide=>slide.id===id);
    if(index<0||target<0||target>=slides.length||target===index)return;
    slides.splice(target,0,slides.splice(index,1)[0]);patch({slides});
  }
  function drop(event:DragEvent,id:string){event.preventDefault();if(dragging)move(dragging,draft.slides.findIndex(slide=>slide.id===id));setDragging(null);setDropTarget(null);}
  function sourceFor(slide:CmsHeroSlide){return slide.source==='builtin'?HERO_BACKGROUND_PRESETS.find(preset=>preset.id===slide.sourceId)?.src:state.media.find(media=>media.id===slide.sourceId)&&publicSliderMediaSource(state.media.find(media=>media.id===slide.sourceId)!);}
  async function upload(){
    if(!canUpload||mutation.current||!file||limited)return;
    if(!name.trim()||!alt.trim()){setError('Vul een fotonaam en beschrijving in.');return;}
    mutation.current=true;setBusy(true);setError('');const controller=new AbortController();uploadAbort.current=controller;
    try{
      if(file.type==='image/gif')throw new Error('Gebruik JPG, PNG, WebP of AVIF. De bestaande serververwerking ondersteunt geen GIF.');
      const invalid=await validateImageFile(file);if(invalid)throw new Error(`Kies een andere afbeelding: ${invalid}.`);
      let media=uploaded.current;
      if(!media){const body=new FormData();body.append('file',file);body.append('teamId','');body.append('season',state.settings.season);body.append('folderId','');const response=await fetch('/api/cms/media/uploads',{method:'POST',body,signal:controller.signal}),result=await response.json();if(!response.ok)throw new Error(result.message||'De foto kon niet worden geüpload.');media=result as CmsMedia;uploaded.current=media;}
      let processed=false;
      for(let attempt=0;attempt<45;attempt++){
        const response=await fetch(`/api/cms/media/${encodeURIComponent(media.id)}/file`,{cache:'no-store',signal:controller.signal});await response.body?.cancel();
        if(response.ok){processed=true;break;}if(response.status!==503)throw new Error('De geüploade foto kan niet worden geopend. Controleer je mediarechten.');
        await new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},1000);function abort(){window.clearTimeout(timer);reject(new Error('Upload geannuleerd.'));}controller.signal.addEventListener('abort',abort,{once:true});});
      }
      await reload();if(!processed)throw new Error('De foto is als concept opgeslagen en wordt nog verwerkt. Probeer opnieuw; hetzelfde bestand wordt niet nogmaals geüpload.');
      const mediaId=media.id;
      const saved=await update(next=>{const photo=next.media.find(photo=>photo.id===mediaId);if(photo){photo.name=name.trim();photo.alt=alt.trim();photo.published=true;}},'Achtergrond opgeslagen in de mediabibliotheek.',{[mediaId]:{action:'publish',expectedVersion:recordVersion(mediaId)}});
      if(!saved)throw new Error('De foto kon niet worden gepubliceerd. Je sliderwerkversie blijft behouden.');
      add('media',mediaId,name.trim());setName('');setAlt('');notify('Foto toegevoegd aan je werkversie. De homepage verandert pas nadat je de slider publiceert.');
    }catch(problem){if(!controller.signal.aborted)setError(problem instanceof Error?problem.message:'Uploaden is niet gelukt.');}
    finally{mutation.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  async function save(action:'save'|'publish'){
    if(locked||mutation.current||action==='publish'&&!canPublish)return;
    if(conflict){setError('De opgeslagen slider is intussen gewijzigd. Laad de actuele instellingen voordat je opnieuw opslaat.');return;}
    const errors=validateHeroSlider(draft);if(errors.length){setError(errors.join(' '));return;}
    mutation.current=true;setBusy(true);setError('');setNotice('');
    try{
      const saved=await update(next=>{next.appearance||={};next.appearance.heroSlider=structuredClone(draft);},action==='publish'?'Hero-slider gepubliceerd.':'Werkversie van de hero-slider opgeslagen.',{'site-hero-slider':{action,expectedVersion:baseVersion}});
      if(saved){setBaseline(JSON.stringify(draft));setBaseVersion(recordVersion('site-hero-slider'));setError('');setNotice(action==='publish'?'De hero-slider is gepubliceerd op de homepage.':'De werkversie is opgeslagen. De openbare homepage verandert pas na publicatie.');}
    }finally{mutation.current=false;setBusy(false);}
  }
  return <div className="hsm">

    {!editable&&<div className="cms-status">Je kunt de slider bekijken. Voor aanpassen zijn paginarechten nodig. Publiceren vereist daarnaast publicatierechten.</div>}
    {conflict&&<div className="hsm-notice" role="alert">Er is een nieuwere opgeslagen versie van deze slider. <button type="button" onClick={()=>void reloadCurrent()} disabled={busy}>Actuele instellingen laden</button></div>}
    <div className="hsm-layout">
      <div className="hsm-main"><section className="hsm-panel"><div className="hsm-section-head"><div><span className="hsm-step">01</span><h3>Achtergrondafbeeldingen</h3><p>Sleep in de gewenste volgorde of gebruik de pijlen.</p></div><span className="hsm-count">{resolved.length} actief</span></div>
        <div className="hsm-slide-list">{draft.slides.map((slide,index)=>{const src=sourceFor(slide);return <article className={`hsm-slide${!slide.enabled?' is-disabled':''}${dragging===slide.id?' is-dragging':''}${dropTarget===slide.id?' is-drop-target':''}`} key={slide.id} onDragOver={e=>{if(dragging&&!locked){e.preventDefault();e.dataTransfer.dropEffect='move';setDropTarget(slide.id);}}} onDrop={e=>drop(e,slide.id)}>
          <div className="hsm-slide-row"><button className="hsm-drag hsm-icon" type="button" disabled={locked} draggable={!locked} onDragStart={e=>{e.dataTransfer.setData('text/plain',slide.id);e.dataTransfer.effectAllowed='move';setDragging(slide.id);}} onDragEnd={()=>{setDragging(null);setDropTarget(null);}} aria-label={`${slide.label} verslepen`} title="Sleep om te rangschikken"><GripVertical size={17}/></button><div className="hsm-thumb">{src?<img src={src} alt="" loading="lazy" style={{objectPosition:`${slide.focusX}% ${slide.focusY}%`}}/>:<ImagePlus size={24}/>}<span>{String(index+1).padStart(2,'0')}</span></div><div className="hsm-slide-copy"><strong>{slide.label||'Naamloze achtergrond'}</strong><small>{slide.source==='builtin'?'OnzeTrots-collectie':'Eigen afbeelding'}{!src?' · Niet beschikbaar':''}</small><label className="hsm-toggle"><input type="checkbox" aria-label={`${slide.label} actief`} checked={slide.enabled} disabled={locked} onChange={e=>patchSlide(slide.id,{enabled:e.target.checked})}/><span aria-hidden="true"/><b>{slide.enabled?'Doet mee':'Uitgeschakeld'}</b></label></div><div className="hsm-row-actions"><button type="button" className="hsm-icon" disabled={locked||index===0} aria-label={`${slide.label} eerder`} onClick={()=>move(slide.id,index-1)}><ArrowUp size={14}/></button><button type="button" className="hsm-icon" disabled={locked||index===draft.slides.length-1} aria-label={`${slide.label} later`} onClick={()=>move(slide.id,index+1)}><ArrowDown size={14}/></button><button type="button" className="hsm-icon" aria-label={`${slide.label} instellingen`} aria-expanded={expanded===slide.id} onClick={()=>setExpanded(expanded===slide.id?null:slide.id)}><Settings2 size={15}/></button><button type="button" className="hsm-icon danger" disabled={locked} aria-label={`${slide.label} uit slider verwijderen`} onClick={()=>{patch({slides:draft.slides.filter(s=>s.id!==slide.id)});if(expanded===slide.id)setExpanded(null);}}><Trash2 size={14}/></button></div></div>
          {expanded===slide.id&&<div className="hsm-slide-settings"><label className="cms-field">Naam van deze achtergrond<input aria-label="Naam van deze achtergrond" maxLength={160} value={slide.label} disabled={locked} onChange={e=>patchSlide(slide.id,{label:e.target.value})}/></label><div className="hsm-crop"><label>Horizontale uitsnede <span>{slide.focusX}%</span><input type="range" aria-label="Horizontale uitsnede" min={0} max={100} step={1} value={slide.focusX} disabled={locked} onChange={e=>patchSlide(slide.id,{focusX:Number(e.target.value)})}/></label><label>Verticale uitsnede <span>{slide.focusY}%</span><input type="range" aria-label="Verticale uitsnede" min={0} max={100} step={1} value={slide.focusY} disabled={locked} onChange={e=>patchSlide(slide.id,{focusY:Number(e.target.value)})}/></label></div><small>Verschuif het onderwerp binnen het beeld. Controleer ook het mobiele voorbeeld.</small></div>}
        </article>;})}</div>
        {!draft.slides.length&&<div className="hsm-empty"><ImagePlus size={30}/><strong>Ruimte voor een nieuw clubbeeld.</strong><p>Voeg een achtergrond toe. Zonder actieve foto blijft de hero rustig en effen.</p></div>}
        {!!missing&&<p className="hsm-inline-note">{missing} gekozen afbeelding{missing===1?' is':'en zijn'} niet beschikbaar en {missing===1?'wordt':'worden'} overgeslagen.</p>}
        <button type="button" className="hsm-add-button" disabled={locked||limited} onClick={()=>{setAddMode(availablePresets.length?'presets':'library');setError('');}}><ImagePlus size={18}/>{limited?'Maximum van 20 achtergronden bereikt':'Achtergrond toevoegen'}</button><p className="hsm-footnote">Verwijderen uit de slider laat de afbeelding in je mediabibliotheek staan.</p>
      </section>
      {addMode&&<section className="hsm-panel hsm-add-panel" ref={addPanel} aria-label="Achtergrond toevoegen"><div className="hsm-section-head"><div><h3>Een nieuw clubbeeld</h3><p>Kies een bestaande foto of upload je eigen achtergrond.</p></div><button type="button" className="hsm-icon" disabled={busy} aria-label="Afbeelding toevoegen sluiten" onClick={()=>{setAddMode(null);setFile(null);}}><X size={18}/></button></div><div className="hsm-tabs" role="group" aria-label="Afbeeldingsbron"><button type="button" disabled={busy} aria-pressed={addMode==='presets'} onClick={()=>setAddMode('presets')}>Clubcollectie</button><button type="button" disabled={busy} aria-pressed={addMode==='library'} onClick={()=>setAddMode('library')}>Mediabibliotheek</button><button type="button" disabled={!canUpload||busy} aria-pressed={addMode==='upload'} onClick={()=>setAddMode('upload')}><Upload size={13}/>Uploaden</button></div>
        {addMode==='presets'?<><div className="hsm-library">{availablePresets.map(p=><button type="button" disabled={locked||limited} key={p.id} onClick={()=>add('builtin',p.id,p.label)}><img src={p.src} alt="" loading="lazy"/><span>{p.label}<ImagePlus size={14}/></span></button>)}</div>{!availablePresets.length&&<p className="hsm-inline-note">Alle achtergronden uit de clubcollectie staan al in je slider.</p>}</>:addMode==='library'?<><label className="hsm-search"><Search size={16}/><input aria-label="Zoek een achtergrond in de mediabibliotheek" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Zoek op fotonaam of beschrijving…"/></label><div className="hsm-library">{libraryPage.items.map(m=><button type="button" disabled={locked||limited} key={m.id} onClick={()=>add('media',m.id,m.name)}><img src={m.src} alt="" loading="lazy"/><span>{m.name}<ImagePlus size={14}/></span></button>)}</div>{!matching.length&&<p className="hsm-inline-note">Geen beschikbare foto’s gevonden. Kies een andere zoekterm of upload een afbeelding.</p>}<Pagination label="Sliderachtergronden kiezen" {...libraryPage} disabled={busy}/><button type="button" className="cms-button" disabled={busy||mediaLoading} onClick={()=>void loadMoreMedia()}>{mediaLoading?'Bibliotheek laden…':'Mediabibliotheek vernieuwen'}</button></>:<div className="hsm-upload"><label className="hsm-upload-drop"><Upload size={24}/><strong>Kies je achtergrondafbeelding</strong><span>JPG, PNG, WebP of AVIF · maximaal 8 MB</span><input type="file" disabled={busy||!canUpload} accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>{const next=e.target.files?.[0]??null;setFile(next);uploaded.current=null;setError('');if(next)setName(next.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' '));}}/></label>{filePreview&&<img className="hsm-upload-preview" src={filePreview} alt="Voorbeeld van je upload"/>}<label className="cms-field">Fotonaam<input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="Bijvoorbeeld: een zaterdag op Houtrust"/></label><label className="cms-field">Beschrijving<input value={alt} maxLength={300} disabled={busy} onChange={e=>setAlt(e.target.value)} placeholder="Wat is er op de foto te zien?"/></label><button type="button" className="cms-button primary" disabled={!canUpload||busy||!file||!name.trim()||!alt.trim()} onClick={()=>void upload()}><Upload size={15}/>{busy?'Afbeelding wordt toegevoegd…':'Uploaden en toevoegen'}</button></div>}
      </section>}
      </div>
      <aside className="hsm-side"><section className="hsm-panel hsm-preview-panel"><div className="hsm-section-head"><div><span className="hsm-step">LIVE PREVIEW</span><h3>Zo beweegt je achtergrond</h3></div><div className="hsm-device" role="group" aria-label="Formaat van het voorbeeld"><button type="button" aria-label="Desktopvoorbeeld" aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={16}/></button><button type="button" aria-label="Mobiel voorbeeld" aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={16}/></button></div></div><div className={`hsm-preview${mobile?' is-mobile':''}`}><ClubmuurBackground key={previewKey} settings={draft} media={state.media} preview previewDevice={mobile?'mobile':'desktop'}/><div className="hsm-preview-mark" aria-hidden="true"><img src="/assets/logo.png" alt=""/><span>ONZE CLUB.<br/>ONZE TROTS.</span></div></div><div className="hsm-preview-caption"><span>{resolved.length} achtergrond{resolved.length===1?'':'en'} · {draft.autoplay?'automatisch':'handmatig'}</span><button type="button" onClick={()=>setPreviewKey(n=>n+1)} aria-label="Voorbeeld opnieuw afspelen"><RotateCcw size={12}/>Opnieuw</button></div><p className="hsm-footnote">Voorbeeld van je huidige keuzes. De homepage verandert pas na publicatie.</p></section>
      <section className="hsm-panel hsm-motion"><div className="hsm-section-head"><div><span className="hsm-step">02</span><h3>Ritme & beweging</h3><p>Van een rustig stilstaand beeld tot een zachte overgang.</p></div></div><fieldset disabled={locked}>
        <label className="hsm-setting-switch"><span><strong>Automatisch wisselen</strong><small>Speel de actieve achtergronden op volgorde af.</small></span><input type="checkbox" aria-label="Automatisch wisselen" checked={draft.autoplay} onChange={e=>patch({autoplay:e.target.checked})}/></label>
        <label className="hsm-range-label">Wisseltijd <strong>{draft.intervalMs/1000} sec</strong><input type="range" aria-label="Wisseltijd" min={4} max={60} step={1} value={draft.intervalMs/1000} disabled={!draft.autoplay} onChange={e=>patch({intervalMs:Number(e.target.value)*1000})}/><small>Tijd tussen twee achtergronden.</small></label>
        <div className="hsm-motion-grid"><label className="cms-field">Overgang<select aria-label="Overgang" value={draft.transition} onChange={e=>patch({transition:e.target.value as CmsHeroSlider['transition']})}><option value="fade">Zacht vervagen</option><option value="none">Direct wisselen</option></select></label><label className="cms-field">Duur<select aria-label="Duur" value={draft.transitionMs} disabled={draft.transition==='none'} onChange={e=>patch({transitionMs:Number(e.target.value)})}><option value={0}>Geen</option><option value={400}>0,4 seconde</option><option value={800}>0,8 seconde</option><option value={1200}>1,2 seconde</option><option value={1600}>1,6 seconde</option><option value={2000}>2 seconden</option><option value={3000}>3 seconden</option>{![0,400,800,1200,1600,2000,3000].includes(draft.transitionMs)&&<option value={draft.transitionMs}>{draft.transitionMs/1000} seconde</option>}</select></label></div>
        <label className="cms-field">Zoom in de achtergrond<select aria-label="Zoom in de achtergrond" value={draft.zoom} onChange={e=>patch({zoom:e.target.value as CmsHeroSlider['zoom']})}><option value="none">Geen zoom</option><option value="subtle">Subtiel</option><option value="cinematic">Meer beweging</option></select></label>
        <label className="hsm-setting-switch"><span><strong>Bewegen met de muis</strong><small>Spelers en titel bewegen zacht mee op desktop. Bekijk dit op de homepage.</small></span><input type="checkbox" aria-label="Bewegen met de muis" checked={draft.parallax} onChange={e=>patch({parallax:e.target.checked})}/></label>
        <label className="hsm-setting-switch"><span><strong>Positiebolletjes tonen</strong><small>Bezoekers kunnen zelf een achtergrond kiezen.</small></span><input type="checkbox" aria-label="Positiebolletjes tonen" checked={draft.showIndicators} onChange={e=>patch({showIndicators:e.target.checked})}/></label>
      </fieldset>{!draft.autoplay&&!draft.showIndicators&&resolved.length>1&&<p className="hsm-inline-note">Automatisch wisselen en de bolletjes staan uit. Alleen de eerste actieve achtergrond wordt getoond.</p>}<div className="hsm-motion-note"><Check size={15}/><p>De voorkeur voor minder beweging wordt altijd gerespecteerd. Automatisch afspelen heeft een pauzeknop.</p></div></section></aside>
    </div>
    {error&&<div className="cms-status error" role="alert">{error}</div>}{notice&&<div className="cms-status success" role="status">{notice}</div>}
    <div className="hsm-savebar"><div><span className={`hsm-save-dot${dirty?' dirty':''}`}/><span><strong>{dirty?'Niet-opgeslagen wijzigingen':'Alle instellingen opgeslagen'}</strong><small>{resolved.length} actieve achtergrond{resolved.length===1?'':'en'} · {draft.autoplay?`wisselt iedere ${draft.intervalMs/1000} seconden`:'handmatig afspelen'}</small></span></div><div><button className="cms-button" type="button" disabled={locked||(!dirty&&!conflict)} onClick={reset}><RotateCcw size={14}/>Wijzigingen terugzetten</button><button className="cms-button primary" type="button" disabled={locked||!dirty||conflict} onClick={()=>void save('save')}><Save size={15}/>{busy?'Opslaan…':'Hero-slider opslaan'}</button><button className="cms-button primary" type="button" disabled={!canPublish||busy||conflict} onClick={()=>void save('publish')}><Check size={15}/>Slider publiceren</button></div></div>
  </div>;
}

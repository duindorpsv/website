'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,ExternalLink,ImagePlus,Pencil,Save,Search,Trash2,Upload,X} from 'lucide-react';
import {defaultHeroPhotoIds,heroPhotoSource,type HeroPhotoId} from '@/lib/clubmuur-layouts';
import {getHeroPhotoCatalog,heroPortraitKinds,validHeroPortraits,type HeroPortrait,type HeroPortraitKind} from '@/lib/cms/hero-portraits';
import type {CmsMedia} from '@/lib/cms/types';
import {validateImageFile} from '@/lib/cms/media-storage';
import {useCMS} from './provider';
import {MediaPicker} from './media-picker';
import {Pagination,usePagination} from './pagination';
import styles from './hero-photos-manager.module.css';

type Selection={items:HeroPhotoId[];portraits:HeroPortrait[]};
type Editor={id?:HeroPortrait['id'];media?:CmsMedia;name:string;kind:HeroPortraitKind;uploaded:boolean};
const emptyEditor=():Editor=>({name:'',kind:'solo',uploaded:false});

export function HeroPhotosManager(){
 const {state,can,update,recordVersion,reload,storageConflictId,clearStorageError,ready}=useCMS();
 const stored=useMemo<Selection>(()=>({items:state.appearance?.heroPhotos||defaultHeroPhotoIds,portraits:state.appearance?.heroPortraits||[]}),[state.appearance?.heroPhotos,state.appearance?.heroPortraits]);
 const [draft,setDraft]=useState<Selection>(stored),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[editor,setEditor]=useState<Editor|null>(null),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[processing,setProcessing]=useState(false);
 const version=useRef(recordVersion('site-hero-photos')),fileInput=useRef<HTMLInputElement>(null),uploadAbort=useRef<AbortController|null>(null),mutation=useRef(false);
 const editable=ready&&can('pages')&&can('publish',undefined,'pages'),uploadAllowed=editable&&can('media')&&can('publish',undefined,'media');
 useEffect(()=>{if(!dirty){setDraft(stored);version.current=recordVersion('site-hero-photos');}},[stored,dirty,recordVersion]);
 useEffect(()=>()=>uploadAbort.current?.abort(),[]);
 const catalog=useMemo(()=>getHeroPhotoCatalog(draft.portraits,state.media),[draft.portraits,state.media]);
 const photos=catalog.filter(photo=>photo.name.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl')));
 const pagination=usePagination(photos,query);
 function change(next:Selection){setDraft(next);setDirty(true);setError('');}
 function toggle(id:HeroPhotoId,checked:boolean){change({...draft,items:checked?[...draft.items,id]:draft.items.filter(item=>item!==id)});}
 async function publish(){
  if(mutation.current||!editable||!draft.items.length)return;
  mutation.current=true;setBusy(true);setError('');
  try{
   const saved=await update(next=>{next.appearance||={};next.appearance.heroPhotos=draft.items;next.appearance.heroPortraits=draft.portraits;},'Spelersfoto’s gepubliceerd op de homepage.',{'site-hero-photos':{action:'publish',expectedVersion:version.current}});
   if(saved)setDirty(false);
  }finally{mutation.current=false;setBusy(false);}
 }
 async function waitForImage(mediaId:string,signal:AbortSignal){
  for(let attempt=0;attempt<45;attempt++){
   if(signal.aborted)throw new Error('Upload geannuleerd.');
   const response=await fetch(`/api/cms/media/${encodeURIComponent(mediaId)}/file`,{cache:'no-store',signal});
   await response.body?.cancel();
   if(response.ok)return true;
   if(response.status!==503)throw new Error('De geüploade foto kan niet worden geopend. Controleer je mediarechten.');
   await new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1000);function abort(){window.clearTimeout(timer);reject(new Error('Upload geannuleerd.'));}signal.addEventListener('abort',abort,{once:true});});
  }
  return false;
 }
 async function upload(file:File|undefined){
  if(!file||!uploadAllowed||uploading)return;
  const invalid=await validateImageFile(file);if(invalid){setError(invalid);return;}
  setUploading(true);setProcessing(true);setError('');const controller=new AbortController();uploadAbort.current=controller;
  try{
   const form=new FormData();form.append('file',file);form.append('teamId','');form.append('season',state.settings.season);form.append('folderId','');
   const response=await fetch('/api/cms/media/uploads',{method:'POST',body:form,signal:controller.signal}),result=await response.json();
   if(!response.ok)throw new Error(result.message||'De foto kon niet worden geüpload.');
   setEditor(current=>({...current||emptyEditor(),media:{...result,src:`/api/cms/media/${result.id}/file`},name:current?.name||file.name.replace(/\.[^.]+$/,''),uploaded:true}));
   const done=await waitForImage(result.id,controller.signal);setProcessing(!done);await reload();
   if(!done)setError('De foto wordt nog verwerkt. Controleer de verwerking voordat je de foto toevoegt.');
  }catch(problem){if(!controller.signal.aborted)setError(problem instanceof Error?problem.message:'Uploaden is mislukt.');}
  finally{if(!controller.signal.aborted)setUploading(false);if(fileInput.current)fileInput.current.value='';}
 }
 async function checkProcessing(){
  if(!editor?.media||uploading)return;const controller=new AbortController();uploadAbort.current=controller;setUploading(true);setError('');
  try{const done=await waitForImage(editor.media.id,controller.signal);setProcessing(!done);if(!done)setError('De foto wordt nog verwerkt. Probeer het over een ogenblik opnieuw.');}
  catch(problem){if(!controller.signal.aborted)setError(problem instanceof Error?problem.message:'Controleren is mislukt.');}
  finally{if(!controller.signal.aborted)setUploading(false);}
 }
 async function savePortrait(){
  if(!editor||!editable||mutation.current||uploading||processing)return;
  const name=editor.name.trim(),media=editor.media;
  if(!name||!media){setError('Kies een foto en geef het portret een naam.');return;}
  const portrait:HeroPortrait={id:editor.id||`portrait-${crypto.randomUUID()}`,mediaId:media.id,name,kind:editor.kind};
  if(!validHeroPortraits([portrait])){setError('Controleer de naam en indeling van het portret.');return;}
  mutation.current=true;setBusy(true);setError('');
  try{
   if(!media.published){
    if(!editor.uploaded||!uploadAllowed){setError('Publiceer deze foto eerst in de mediabibliotheek.');return;}
    const saved=await update(next=>{const item=next.media.find(item=>item.id===media.id);if(item){item.alt=name;item.published=true;}},'De nieuwe spelersfoto is opgeslagen in de mediabibliotheek.',{[media.id]:{action:'publish',expectedVersion:recordVersion(media.id)}});
    if(!saved)return;
   }
   change({items:draft.items.includes(portrait.id)?draft.items:[...draft.items,portrait.id],portraits:editor.id?draft.portraits.map(item=>item.id===editor.id?portrait:item):[...draft.portraits,portrait]});
   setEditor(null);setQuery('');pagination.onPageChange(Math.ceil((catalog.length+(editor.id?0:1))/pagination.pageSize));
  }finally{mutation.current=false;setBusy(false);}
 }
 function editPortrait(id:string){const portrait=draft.portraits.find(item=>item.id===id);if(!portrait)return;setEditor({...portrait,media:state.media.find(item=>item.id===portrait.mediaId),uploaded:false});setProcessing(false);setError('');}
 const missing=draft.portraits.filter(item=>!catalog.some(photo=>photo.id===item.id));
 return <div className={styles.workspace}>
  <section className={`cms-panel ${styles.panel}`}>
   <div className={styles.heading}><div><span className={styles.eyebrow}>De gezichten van Duindorp</span><h3>Jij kiest wie er bovenaan staat.</h3><p>Voeg spelersfoto’s toe en kies welke portretten op de homepage mogen wisselen. Gebruik bij voorkeur een vrijstaande PNG of WebP met transparante achtergrond.</p></div><a className="cms-button" href="/clubmuur" target="_blank" rel="noreferrer"><ExternalLink size={16}/>Bekijk homepage</a></div>
   <div className={styles.summary}><strong>{draft.items.length} {draft.items.length===1?'foto doet':'foto’s doen'} mee</strong><span>De homepage kiest een foto en een passende indeling. Uitgevinkte foto’s blijven bewaard.</span></div>
   <div className={styles.toolbar}><button type="button" className="cms-button primary" disabled={!editable||busy||uploading||draft.portraits.length>=200} onClick={()=>{setEditor(emptyEditor());setProcessing(false);setError('');}}><ImagePlus size={17}/>Foto toevoegen</button><label className={styles.search}><Search size={17}/><input aria-label="Spelersfoto’s zoeken" placeholder="Zoek een spelersfoto…" value={query} onChange={event=>setQuery(event.target.value)}/></label><button type="button" className="cms-button" disabled={!editable||busy} onClick={()=>change({...draft,items:catalog.map(photo=>photo.id)})}>Alles selecteren</button><button type="button" className="cms-button" disabled={!editable||busy} onClick={()=>change({...draft,items:[]})}>Alles uitsluiten</button></div>
   <div className={styles.grid}>{pagination.items.map(photo=><article key={photo.id} className={`${styles.card} ${draft.items.includes(photo.id)?styles.selected:''}`}>
    <label className={styles.selectPhoto}><div className={styles.image}><img src={heroPhotoSource(photo)} alt="" loading="lazy"/><span className={styles.badge}>{draft.items.includes(photo.id)?<><Check size={13}/>Doet mee</>:'Uitgesloten'}</span></div><div className={styles.caption}><input type="checkbox" aria-label={`${photo.name} opnemen in de hero`} checked={draft.items.includes(photo.id)} disabled={!editable||busy} onChange={event=>toggle(photo.id,event.target.checked)}/><div><strong>{photo.name}</strong><small>{draft.portraits.some(item=>item.id===photo.id)?'Mediabibliotheek':'Clubselectie'} · {heroPortraitKinds.find(kind=>kind.value===photo.kind)?.label}</small></div></div></label>
    {draft.portraits.some(item=>item.id===photo.id)&&<div className={styles.cardActions}><button type="button" className="cms-button" disabled={!editable||busy||uploading} onClick={()=>editPortrait(photo.id)}><Pencil size={13}/>Bewerken</button><button type="button" className="cms-button danger" disabled={!editable||busy||uploading} aria-label={`${photo.name} verwijderen uit spelersfoto’s`} onClick={()=>{if(!window.confirm(`‘${photo.name}’ uit de spelersfoto’s verwijderen? De foto blijft in de mediabibliotheek.`))return;change({items:draft.items.filter(id=>id!==photo.id),portraits:draft.portraits.filter(item=>item.id!==photo.id)});}}><Trash2 size={14}/></button></div>}
   </article>)}</div>
   {!photos.length&&<p className={styles.empty}>Geen spelersfoto’s gevonden. Pas je zoekopdracht aan of voeg een foto toe.</p>}
   <Pagination label="Spelersfoto’s" {...pagination} disabled={busy}/>
   {!!missing.length&&<div className={styles.warning}><strong>Niet-beschikbare spelersfoto’s</strong>{missing.map(item=><p key={item.id}>{item.name}: de afbeelding is niet gepubliceerd of verwijderd. <button type="button" className="cms-button" disabled={!editable||busy} onClick={()=>editPortrait(item.id)}>Andere foto kiezen</button><button type="button" className="cms-button" disabled={!editable||busy} onClick={()=>change({items:draft.items.filter(id=>id!==item.id),portraits:draft.portraits.filter(portrait=>portrait.id!==item.id)})}>Verwijderen uit selectie</button></p>)}</div>}
  </section>
  {editor&&<section className={`cms-panel ${styles.panel}`} aria-label={editor.id?'Spelersfoto bewerken':'Spelersfoto toevoegen'}><div className={styles.heading}><div><h3>{editor.id?'Spelersfoto bewerken':'Een nieuw gezicht op de homepage'}</h3><p>Kies een gepubliceerde foto uit de bibliotheek of upload een nieuw portret. De indeling bepaalt hoe de spelers in de hero worden geplaatst.</p></div><button type="button" className="cms-icon-button" aria-label="Foto-editor sluiten" disabled={uploading||busy} onClick={()=>setEditor(null)}><X size={18}/></button></div>
   <fieldset disabled={!editable||busy||uploading} className={styles.editor}><legend className={styles.srOnly}>Gegevens spelersfoto</legend><div className={styles.editorActions}><MediaPicker value={editor.media?.id} onSelect={media=>{setEditor({...editor,media,name:editor.name||media.name.replace(/\.[^.]+$/,''),uploaded:false});setProcessing(false);setError('');}} label="Kies uit mediabibliotheek"/><button type="button" className="cms-button" disabled={!uploadAllowed} onClick={()=>fileInput.current?.click()}><Upload size={16}/>Nieuwe foto uploaden</button><input hidden ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event=>void upload(event.target.files?.[0])}/></div>
    <div className={styles.editorFields}>{editor.media&&<div className={styles.preview}>{!processing?<img src={editor.media.src} alt="Voorbeeld van geselecteerde spelersfoto"/>:<span>De foto wordt verwerkt…</span>}</div>}<div className={styles.fields}><label className="cms-field">Naam van het portret<input aria-label="Naam van het portret" required maxLength={150} value={editor.name} onChange={event=>setEditor({...editor,name:event.target.value})} placeholder="Bijvoorbeeld: Eerste elftal – Sam"/></label><label className="cms-field">Personen en indeling<select aria-label="Personen en indeling" value={editor.kind} onChange={event=>setEditor({...editor,kind:event.target.value as HeroPortraitKind})}>{heroPortraitKinds.map(kind=><option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>{editor.media&&<p className="cms-meta">Gekozen foto: {editor.media.name}</p>}</div></div>
   </fieldset>
   {uploading&&<p role="status">De foto wordt geüpload en verwerkt. Dit kan even duren.</p>}
   {processing&&!uploading&&<button type="button" className="cms-button" onClick={()=>void checkProcessing()}>Verwerking controleren</button>}
   {editor.uploaded&&<p className="cms-meta">Bij toevoegen wordt de nieuwe foto met deze naam als alt-tekst gepubliceerd in de mediabibliotheek. Publiceer daarna de selectie om haar op de homepage te gebruiken.</p>}
   <div className={styles.editorActions}><button type="button" className="cms-button primary" disabled={!editable||busy||uploading||processing||!editor.media||!editor.name.trim()} onClick={()=>void savePortrait()}><ImagePlus size={16}/>{busy?'Opslaan…':editor.id?'Portret bijwerken':'Foto aan selectie toevoegen'}</button><button type="button" className="cms-button" disabled={uploading||busy} onClick={()=>setEditor(null)}>Annuleren</button></div>
  </section>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {storageConflictId==='site-hero-photos'&&<div className={styles.warning}><p>Een andere redacteur heeft de spelersfoto’s gewijzigd. Je eigen selectie staat nog hierboven.</p><button type="button" className="cms-button" disabled={busy||uploading} onClick={async()=>{if(!window.confirm('Je wijzigingen vervangen door de serverversie?'))return;await reload();setDirty(false);setEditor(null);clearStorageError();}}>Serverversie opnieuw laden</button></div>}
  {!draft.items.length&&<p role="alert" className={styles.warning}>Selecteer minimaal één spelersfoto voor de homepage.</p>}
  {!editable&&ready&&<p className="cms-meta">Voor het aanpassen van spelersfoto’s zijn pagina- en publicatierechten nodig.</p>}
  <div className={styles.publish}><div><strong>{dirty?'Je hebt nog niet-gepubliceerde wijzigingen.':'De spelersfoto’s zijn bijgewerkt.'}</strong><span>Je selectie wordt zichtbaar na publicatie. Bezoekers zien per bezoek een van de geselecteerde portretten.</span></div><button type="button" className="cms-button primary" disabled={!editable||busy||uploading||!dirty||!draft.items.length||!!missing.length} onClick={()=>void publish()}><Save size={16}/>{busy?'Publiceren…':'Selectie publiceren'}</button></div>
 </div>;
}

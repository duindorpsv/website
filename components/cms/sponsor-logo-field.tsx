'use client';

import {useEffect,useId,useRef,useState,type ChangeEvent} from 'react';
import {ImagePlus,Link2,LoaderCircle,Trash2,Upload} from 'lucide-react';
import {validateImageFile} from '@/lib/cms/media-storage';
import {useCMS} from './sponsor-workspace-provider';
import './sponsor-logo-field.css';

type UploadedLogo={id:string;url:string;previewUrl:string;name:string;mime:string};

/** Uploads remain temporary until the relation is saved by the server. */
export function SponsorLogoField({sponsorId,value,onChange,onBusyChange,label='Bedrijfslogo',disabled=false}:{sponsorId:string;value:string;onChange:(value:string)=>void;onBusyChange?:(busy:boolean)=>void;label?:string;disabled?:boolean}){
 const {contextSignal}=useCMS();
 const id=useId(),input=useRef<HTMLInputElement>(null),mounted=useRef(true),generation=useRef(0),controller=useRef<AbortController|null>(null),pending=useRef<UploadedLogo|null>(null),valueRef=useRef(value),disabledRef=useRef(disabled),busyChange=useRef(onBusyChange);
 valueRef.current=value;disabledRef.current=disabled;busyChange.current=onBusyChange;
 const [mode,setMode]=useState<'upload'|'url'>(value&&!value.startsWith('/api/sponsorship/logos/')?'url':'upload');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[failedSource,setFailedSource]=useState(''),[filename,setFilename]=useState(''),[preview,setPreview]=useState<UploadedLogo|null>(null);
 function setUploading(next:boolean){if(mounted.current)setBusy(next);busyChange.current?.(next);}
 function discard(upload:UploadedLogo|null){if(upload)void fetch('/api/sponsorship/logo-uploads/'+encodeURIComponent(upload.id),{method:'DELETE',keepalive:true}).catch(()=>{});}
 function cancel(){++generation.current;controller.current?.abort();controller.current=null;setUploading(false);}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current;controller.current?.abort();discard(pending.current);pending.current=null;busyChange.current?.(false);};},[sponsorId]);
 useEffect(()=>{if(pending.current&&pending.current.url!==value){discard(pending.current);pending.current=null;setPreview(null);}setFailedSource('');},[value]);
 const validSource=/^https?:\/\/[^\s<>"\\]+$/i.test(value)||/^\/(?!\/)[^\s<>"\\]*$/.test(value);
 const source=value&&validSource&&failedSource!==value?(preview?.url===value?preview.previewUrl:value.replace(/^\/api\/sponsorship\/logos\//,'/api/sponsorship/previews/')):'';
 async function choose(file?:File){
  if(!file||disabledRef.current)return;
  cancel();const version=generation.current,previous=valueRef.current,scope=contextSignal(),abort=new AbortController();controller.current=abort;
  const allowed=()=>mounted.current&&!disabledRef.current&&!scope.aborted&&!abort.signal.aborted&&generation.current===version&&valueRef.current===previous;
  const abortContext=()=>abort.abort();scope.addEventListener('abort',abortContext,{once:true});setUploading(true);setError('');
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Kies een PNG-, JPG- of WebP-bestand.');
   const problem=await new Promise<string|null>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Het logo kon niet op tijd worden gecontroleerd. Kies een kleiner bestand.')),15_000);const stop=()=>{clearTimeout(timer);reject(new DOMException('Upload geannuleerd','AbortError'));};abort.signal.addEventListener('abort',stop,{once:true});validateImageFile(file).then(resolve,reject).finally(()=>{clearTimeout(timer);abort.signal.removeEventListener('abort',stop);});});
   if(problem)throw Error('Controleer het logo: '+problem+'.');if(!allowed())return;
   const response=await fetch('/api/sponsorship/logo-uploads/'+encodeURIComponent(sponsorId),{method:'POST',signal:abort.signal,headers:{'Content-Type':file.type,'X-File-Name':file.name.replace(/[^a-zA-Z0-9._ -]/g,'_')},body:file});
   const result=await response.json() as UploadedLogo&{message?:string};if(!response.ok)throw Error(result.message||'Het logo kon niet worden opgeslagen.');
   if(!allowed()){discard(result);return;}
   discard(pending.current);pending.current=result;setPreview(result);setFilename(file.name);setFailedSource('');onChange(result.url);
  }catch(reason){if(allowed())setError(reason instanceof Error?reason.message:'Het logo kon niet worden verwerkt.');}
  finally{scope.removeEventListener('abort',abortContext);if(mounted.current&&generation.current===version){controller.current=null;setUploading(false);}}
 }
 function select(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';void choose(file);}
 function remove(){cancel();discard(pending.current);pending.current=null;setPreview(null);setFilename('');setError('');setFailedSource('');onChange('');}
 function changeMode(next:'upload'|'url'){cancel();setError('');setMode(next);}
 return <div className="slogo-field" role="group" aria-labelledby={`${id}-label`} aria-describedby={error?`${id}-error`:undefined} aria-busy={busy}>
  <div className="slogo-heading"><span id={`${id}-label`}>{label}</span><div className="slogo-modes" aria-label="Logo toevoegen via"><button type="button" aria-pressed={mode==='upload'} disabled={disabled} onClick={()=>changeMode('upload')}><Upload size={13}/>Upload</button><button type="button" aria-pressed={mode==='url'} disabled={disabled} onClick={()=>changeMode('url')}><Link2 size={13}/>Via URL</button></div></div>
  <div className="slogo-content"><div className={`slogo-preview${source?' has-image':''}`}>
   {source?<img src={source} alt="Voorvertoning bedrijfslogo" onError={()=>setFailedSource(value)}/>:<ImagePlus size={25} aria-hidden="true"/>}
  </div><div className="slogo-controls">
   {mode==='upload'?<><input ref={input} className="slogo-file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Bedrijfslogo uploaden" disabled={disabled||busy} onChange={select}/><button type="button" className="cms-button slogo-upload" disabled={disabled||busy} onClick={()=>input.current?.click()}>{busy?<LoaderCircle className="slogo-spin" size={15}/>:<Upload size={15}/>} {busy?'Logo voorbereiden…':value?'Ander logo kiezen':'Logo uploaden'}</button><small>{filename||'PNG, JPG of WebP · maximaal 8 MB'}<br/>Een transparant logo komt hier goed tot zijn recht.</small></>:<><label className="slogo-url-label" htmlFor={`${id}-url`}>Logo-URL of bestaand assetpad</label><input id={`${id}-url`} className="slogo-url" type="text" inputMode="url" maxLength={4096} value={value} disabled={disabled||busy} placeholder="https://… of /assets/sponsors/…" onChange={event=>{cancel();setFilename('');setError('');onChange(event.target.value);}}/><small>Gebruik een afbeelding die beschikbaar is via een veilige URL.</small></>}
   {value&&<button type="button" className="slogo-remove" disabled={disabled} onClick={remove}><Trash2 size={13}/>Logo verwijderen</button>}
  </div></div>
  {(failedSource===value&&!!value||!!value&&!validSource)&&<p className="slogo-error" role="alert">Het logo kan niet worden getoond. Kies een afbeelding of controleer de URL.</p>}
  {error&&<p className="slogo-error" id={`${id}-error`} role="alert">{error}</p>}
  <span className="slogo-status" role="status" aria-live="polite">{busy?'Het logo wordt voorbereid.':''}</span>
 </div>;
}

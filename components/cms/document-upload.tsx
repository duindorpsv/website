'use client';
import {useRef,useState} from 'react';
import {Upload} from 'lucide-react';
import {useCMS} from './provider';
export function DocumentUpload(){
 const {reload,can}=useCMS(),[message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false),input=useRef<HTMLInputElement>(null);
 if(!can('pages'))return null;
 async function upload(file?:File){
  if(!file||busy)return;setError(false);setMessage('');
  if(file.size>10_000_000){setError(true);setMessage('Een document mag maximaal 10 MB zijn.');return;}
  setBusy(true);
  try{const form=new FormData();form.append('file',file);const response=await fetch('/api/cms/documents/uploads',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw new Error(data.message||'Uploaden is mislukt. Probeer het opnieuw.');await reload();setMessage('PDF privé opgeslagen. Open het document hieronder, vul de metadata in en publiceer het wanneer het klaar is.');if(input.current)input.current.value='';}
  catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'Uploaden is mislukt. Probeer het opnieuw.');}
  finally{setBusy(false);}
 }
 return <section className="cms-panel"><div className="cms-section-heading"><div><h3><Upload size={17} style={{display:'inline',verticalAlign:'middle',marginRight:7}}/>PDF toevoegen</h3><p className="cms-meta">Upload een PDF van maximaal 10 MB. Nieuwe documenten blijven privé totdat je ze publiceert.</p></div></div><label className="cms-field">PDF-document uploaden<input ref={input} type="file" accept="application/pdf" disabled={busy} onChange={event=>void upload(event.target.files?.[0])}/></label>{busy&&<p role="status">PDF uploaden…</p>}{message&&<p role={error?'alert':'status'}>{message}</p>}</section>;
}

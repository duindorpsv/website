'use client';
import {useState} from 'react';
import {planningInput,planningInstant} from '@/lib/cms/planning';
import {useCMS} from './provider';

export function SchedulingControl({module,record,disabled=false}:{module:'pages'|'articles';record:Record<string,any>;disabled?:boolean}) {
  const {reload,saving}=useCMS();
  const [local,setLocal]=useState(''),[occurrence,setOccurrence]=useState<'reject'|'earlier'|'later'>('reject'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(action:'schedule'|'cancelSchedule') {
    setBusy(true);setMessage('');
    try {
      const scheduledAt=action==='schedule'?planningInstant(local,occurrence):undefined;
      const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),changes:[{module,id:record.id,expectedVersion:record.version,action,...(action==='schedule'?{data:record,scheduledAt}:{})}]})});
      const data=await response.json();if(!response.ok)throw new Error(data.message);
      await reload();setMessage(action==='schedule'?'Deze versie is ingepland. Latere conceptbewerkingen veranderen de geplande versie niet.':'De planning is geannuleerd.');
    } catch(error) {setMessage(error instanceof RangeError?'Controleer het tijdstip. Bij de wintertijd moet je de eerste of tweede keer kiezen.':error instanceof Error?error.message:'Planning mislukt.');}
    finally {setBusy(false);}
  }
  return <section><h3>Publicatie plannen</h3>{record.status==='scheduled'&&record.scheduledAt&&<p>Ingepland: {planningInput(record.scheduledAt).replace('T',' ')} · Europe/Amsterdam</p>}<label className="cms-field">Datum en tijd · Europe/Amsterdam<input type="datetime-local" value={local} disabled={disabled||busy} onChange={e=>setLocal(e.target.value)}/></label><label className="cms-field">Bij de dubbele wintertijd<select value={occurrence} onChange={e=>setOccurrence(e.target.value as typeof occurrence)}><option value="reject">Vraag om een keuze bij dubbel tijdstip</option><option value="earlier">Eerste keer (zomertijd)</option><option value="later">Tweede keer (wintertijd)</option></select></label><button className="cms-button" disabled={disabled||saving||busy||!local} onClick={()=>void submit('schedule')}>Deze versie inplannen</button>{record.status==='scheduled'&&<button className="cms-button" disabled={disabled||saving||busy} onClick={()=>void submit('cancelSchedule')}>Planning annuleren</button>}<p className="cms-meta">De worker publiceert deze opgeslagen versie, ook als je de browser sluit.</p>{message&&<p role="status">{message}</p>}</section>;
}

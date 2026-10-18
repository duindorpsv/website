'use client';
import {useEffect,useState} from 'react';
type Subscriber={id:string;email:string;name:string;topics:string[];status:string;confirmed_at:string|null;created_at:string;version:number};
const labels:Record<string,string>={'active':'Actief','pending-confirmation':'Wacht op bevestiging','unsubscribed':'Afgemeld'};
export function NewsletterManager(){
 const [filters,setFilters]=useState({q:'',topic:'',status:'all',offset:0}),[query,setQuery]=useState(''),[topic,setTopic]=useState('');
 const [data,setData]=useState<{items:Subscriber[];total:number;limit:number}|null>(null),[revision,reload]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [editing,setEditing]=useState<Subscriber|null>(null),[name,setName]=useState(''),[topics,setTopics]=useState('');
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);
  void fetch('/api/cms/newsletter?'+new URLSearchParams({...filters,offset:String(filters.offset)}),{signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.message||'De abonneelijst kon niet worden geladen.');setData(result);}).catch(error=>{if(!controller.signal.aborted){setData(null);setMessage(error instanceof Error?error.message:'De abonneelijst kon niet worden geladen.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[filters,revision]);
 function choose(item:Subscriber){setEditing(item);setName(item.name);setTopics(item.topics.join('\n'));setMessage('');}
 async function change(action:'update'|'unsubscribe'){
  if(!editing)return;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/cms/newsletter/'+encodeURIComponent(editing.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,expectedVersion:editing.version,...(action==='update'?{name,topics:topics.split('\n').map(t=>t.trim()).filter(Boolean)}:{})})});
   const result=await response.json();if(!response.ok)throw new Error(result.message||'De wijziging kon niet worden opgeslagen.');
   setEditing(null);setMessage(action==='unsubscribe'?'Abonnee afgemeld.':'Abonnee opgeslagen.');reload(v=>v+1);
  }catch(error){setMessage(error instanceof Error?error.message:'De wijziging kon niet worden opgeslagen.');}finally{setBusy(false);}
 }
 return <section className="cms-panel" aria-label="Nieuwsbriefabonnees" style={{overflowWrap:'anywhere',minWidth:0}}><h2>Nieuwsbriefabonnees</h2><p>Beheer de abonneelijst en onderwerpen in het CMS. Alleen bevestigde inschrijvingen zijn actief. Een afgemelde abonnee meldt zich opnieuw aan via het openbare formulier.</p>
 <form onSubmit={e=>{e.preventDefault();setEditing(null);setMessage('');setFilters(v=>({...v,q:query,topic,offset:0}));}}>
 <label className="cms-field">Abonnees zoeken<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Naam of e-mailadres" maxLength={200}/></label>
 <label className="cms-field">Onderwerpfilter<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Alle onderwerpen" maxLength={120}/></label>
 <label className="cms-field">Status abonnees<select value={filters.status} onChange={e=>{setEditing(null);setFilters(v=>({...v,status:e.target.value,offset:0}));}}><option value="all">Alle statussen</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <button className="cms-button" disabled={busy}>Zoeken</button><button className="cms-button" type="button" disabled={busy} onClick={()=>{setEditing(null);reload(v=>v+1);}}>Abonneelijst vernieuwen</button></form>
 {loading&&<p role="status">Abonnees laden…</p>}
 {data&&<><p>{data.total} abonnee(s) gevonden.</p>{data.items.map(item=><article key={item.id}><button className="cms-button" disabled={busy||loading} onClick={()=>choose(item)} aria-label={`Beheer abonnee ${item.email}`} style={{whiteSpace:'normal',maxWidth:'100%',textAlign:'left'}}>{item.name?item.name+' · ':''}{item.email}</button><p>{labels[item.status]||item.status}{item.topics.length?' · '+item.topics.join(', '):''}</p></article>)}
 <div><button className="cms-button" disabled={loading||busy||filters.offset===0} onClick={()=>{setEditing(null);setFilters(v=>({...v,offset:Math.max(0,v.offset-50)}));}}>Vorige abonnees</button><button className="cms-button" disabled={loading||busy||filters.offset+data.limit>=data.total||filters.offset>=10000} onClick={()=>{setEditing(null);setFilters(v=>({...v,offset:v.offset+50}));}}>Volgende abonnees</button></div></>}
 {editing&&<form onSubmit={e=>{e.preventDefault();void change('update');}}><h3>Abonnee bewerken</h3><p>{editing.email} · {labels[editing.status]}</p><p>{editing.status!=='pending-confirmation'&&editing.confirmed_at?'Laatste bevestiging op '+new Date(editing.confirmed_at).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam'}):'Deze inschrijving is nog niet bevestigd.'}</p><fieldset disabled={busy}><label className="cms-field">Naam abonnee<input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label><label className="cms-field">Onderwerpen abonnee<textarea aria-describedby="newsletter-topics-hint" value={topics} onChange={e=>setTopics(e.target.value)} rows={4}/></label><small id="newsletter-topics-hint">Eén onderwerp per regel, maximaal 20.</small><button className="cms-button primary">Abonnee opslaan</button><button type="button" className="cms-button" onClick={()=>setEditing(null)}>Sluiten</button>{editing.status!=='unsubscribed'&&<button type="button" className="cms-button danger" onClick={()=>{if(window.confirm('Deze abonnee afmelden? Opnieuw inschrijven vereist een nieuwe bevestiging per e-mail.'))void change('unsubscribe');}}>Abonnee afmelden</button>}</fieldset></form>}
 {message&&<p role="status">{message}</p>}</section>;
}

'use client';
import {useEffect,useState} from 'react';
export function DirectoryPersonPicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [search,setSearch]=useState(''),[people,setPeople]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState<{id:string;name:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController(),timer=setTimeout(()=>{fetch('/api/sponsorship/directory-lookup?search='+encodeURIComponent(search),{signal:controller.signal,cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.message);setPeople(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});},250);return()=>{controller.abort();clearTimeout(timer);};},[search]);
 useEffect(()=>{if(!value){setSelected(null);return;}const controller=new AbortController();fetch('/api/sponsorship/directory-lookup?id='+encodeURIComponent(value),{signal:controller.signal,cache:'no-store'}).then(r=>r.json()).then(data=>{if(Array.isArray(data))setSelected(data[0]||null);}).catch(()=>{});return()=>controller.abort();},[value]);
 const options=selected&&!people.some(p=>p.id===selected.id)?[selected,...people]:people;
 return <span className="directory-person-picker"><input aria-label="Zoek een ouder of verzorger" type="search" placeholder="Zoek op naam…" value={search} onChange={e=>setSearch(e.target.value)}/><select required aria-label="Kies ouder of verzorger" value={value} onChange={e=>onChange(e.target.value)}><option value="">Kies een persoon…</option>{options.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{error&&<small role="alert">{error}</small>}</span>;
}

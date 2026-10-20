'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Building2,ClipboardCheck,Mail,Plus,UserRound} from 'lucide-react';
import {useCMS} from './provider';
import {formKindLabels} from '@/lib/cms/forms';
import type {CmsDepartment,FormKind} from '@/lib/cms/types';
import {Pagination,usePagination} from './pagination';
import {FormDefinitions} from './form-definitions';
import {SubmissionInbox} from './submission-inbox';
import styles from './forms-manager.module.css';

const kinds:FormKind[]=['contact','registration','request'];
const kindIcons={contact:Mail,registration:UserRound,request:ClipboardCheck};
export function FormsManager(){
 const {can,state}=useCMS();
 const [kind,setKind]=useState<FormKind>('contact'),[tab,setTab]=useState<'forms'|'inbox'|'departments'>('forms'),[resultForm,setResultForm]=useState(''),[counts,setCounts]=useState<Partial<Record<FormKind,{total:number;new:number}>>>({}),[countsRevision,setCountsRevision]=useState(0);
 const configure=can('forms'),activeTab=configure?tab:'inbox';
 useEffect(()=>{const controller=new AbortController();void Promise.all(kinds.map(async value=>{const results=await Promise.all(['','new'].map(async status=>{const response=await fetch('/api/cms/submissions?'+new URLSearchParams({kind:value,status,limit:'1'}),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Inzendingen tellen is niet beschikbaar.');return (await response.json()).total;}));return [value,{total:results[0],new:results[1]}] as const;})).then(values=>setCounts(Object.fromEntries(values))).catch(()=>{});return()=>controller.abort();},[countsRevision]);
 function openInbox(value:FormKind){setKind(value);setResultForm('');setTab('inbox');}
 return <section className={styles.root}>
  <div className={styles.intro}><h2>Contact, aanmeldingen & aanvragen</h2><p>Maak formulieren voor de website en volg ontvangen berichten op. Per formulier kies je de afdeling die de e-mails ontvangt.</p></div>
  <div className={styles.kindCards} aria-label="Soorten inzendingen">{kinds.map(value=>{const Icon=kindIcons[value],active=activeTab==='inbox'&&kind===value;return <button type="button" className={styles.kindCard} aria-pressed={active} key={value} onClick={()=>openInbox(value)}><span className={styles.kindIcon}><Icon size={21}/></span><span><strong>{formKindLabels[value].plural}</strong><small>{formKindLabels[value].description}</small><span className={styles.kindMeta}>{counts[value]?`${counts[value]!.total} ontvangen`: 'Inzendingen openen'} <span aria-hidden="true">·</span> {counts[value]?`${counts[value]!.new} nieuw`:`${state.forms.filter(form=>form.kind===value).length} formulieren`}</span></span></button>;})}</div>
  <nav className={styles.tabs} aria-label="Formulierbeheer">
   {configure&&<button type="button" aria-label="Formulieren maken en bewerken" aria-current={activeTab==='forms'?'page':undefined} onClick={()=>setTab('forms')}>Formulieren maken en bewerken <span>{state.forms.length}</span></button>}
   <button type="button" aria-current={activeTab==='inbox'?'page':undefined} onClick={()=>{setResultForm('');setTab('inbox');}}>Inzendingen</button>
   {configure&&<button type="button" aria-current={activeTab==='departments'?'page':undefined} onClick={()=>setTab('departments')}>Afdelingen en ontvangers</button>}
  </nav>
  {activeTab==='forms'?<FormDefinitions onResults={form=>{setKind(form.kind);setResultForm(form.id);setTab('inbox');}}/>:activeTab==='departments'?<DepartmentsEditor/>:<SubmissionInbox key={kind+resultForm} kind={kind} initialFormId={resultForm} onChanged={()=>setCountsRevision(value=>value+1)}/>}
 </section>;
}

type Department=CmsDepartment&{version:number};
type DepartmentDraft=CmsDepartment&{expectedVersion:number};
function DepartmentsEditor(){
 const {reload}=useCMS();
 const [items,setItems]=useState<Department[]>([]),[draft,setDraft]=useState<DepartmentDraft|null>(null),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const saving=useRef(false),pagination=usePagination(items);
 async function refresh(){const response=await fetch('/api/cms/departments',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'Afdelingen ophalen is mislukt.');const rows:Department[]=data.items||[];setItems(rows);return rows;}
 useEffect(()=>{let active=true;void refresh().catch(error=>{if(active)setMessage(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 function choose(item:Department){setDraft({id:item.id,name:item.name,description:item.description,emails:item.emails,active:item.active,confirmation:item.confirmation,expectedVersion:item.version});setMessage('');}
 function create(){setDraft({id:crypto.randomUUID(),name:'',description:'',emails:[],active:true,confirmation:'',expectedVersion:0});setMessage('');}
 async function save(event:FormEvent){
  event.preventDefault();if(!draft||saving.current)return;saving.current=true;setBusy(true);setMessage('');
  try{const response=await fetch('/api/cms/departments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,name:draft.name.trim(),emails:draft.emails.map(email=>email.trim()).filter(Boolean)})}),data=await response.json();if(!response.ok)throw Error(data.message||'Afdeling opslaan is mislukt.');const rows=await refresh(),saved=rows.find(item=>item.id===draft.id);if(saved)choose(saved);await reload();setMessage('Afdeling opgeslagen.');}
  catch(error){setMessage(error instanceof Error?error.message:'Afdeling opslaan is mislukt.');}finally{saving.current=false;setBusy(false);}
 }
 const patch=(values:Partial<DepartmentDraft>)=>setDraft(current=>current?{...current,...values}:current);
 return <div className={styles.workspace}>
  <aside className={styles.library}><div className={styles.panelHead}><div><h3>Afdelingen</h3><p>Ontvangers per formulier</p></div><Building2 size={19}/></div><div className={styles.libraryAction}><button type="button" className="cms-button primary" disabled={busy} onClick={create}><Plus size={15}/>Afdeling toevoegen</button></div><div className={styles.recordList}>
   {pagination.items.map(item=><button type="button" className={styles.record} aria-pressed={draft?.id===item.id} disabled={busy} key={item.id} onClick={()=>choose(item)}><strong>{item.name}</strong><small>{item.emails.join(', ')}</small><span className={styles.badge}>{item.active?'Actief':'Uitgeschakeld'}</span></button>)}
   {loading&&<p className={styles.loading} role="status">Afdelingen laden…</p>}
  </div><Pagination label="Afdelingen" {...pagination} disabled={busy}/></aside>
  <section className={styles.editor}>{draft?<form onSubmit={save}><div className={styles.panelHead}><div><h3>{draft.name||'Nieuwe afdeling'}</h3><p>Formulierberichten gaan naar de e-mailadressen hieronder.</p></div></div><fieldset className={styles.settings} disabled={busy}>
   <label className="cms-field">Naam<input required maxLength={120} aria-label="Afdelingsnaam" value={draft.name} onChange={event=>patch({name:event.target.value})}/></label>
   <label className="cms-field">Omschrijving<textarea maxLength={1000} value={draft.description} onChange={event=>patch({description:event.target.value})}/></label>
   <label className="cms-field">Ontvangers, gescheiden door komma’s<input required aria-label="Ontvangers, gescheiden door komma’s" value={draft.emails.join(', ')} onChange={event=>patch({emails:event.target.value.split(',')})}/><small>Gebruik maximaal 10 geldige e-mailadressen.</small></label>
   <label className="cms-field">Ontvangstbevestiging<textarea maxLength={3000} value={draft.confirmation} onChange={event=>patch({confirmation:event.target.value})}/></label>
   <label className={styles.check}><input type="checkbox" checked={draft.active} onChange={event=>patch({active:event.target.checked})}/>Afdeling actief</label>
   <div className={styles.actions}><button className="cms-button primary" type="submit">{busy?'Opslaan…':'Bewaren'}</button></div>
  </fieldset></form>:<div className="cms-empty"><Building2 size={30}/><h3>Kies een afdeling</h3><p>Beheer hier de ontvangers van contactberichten, aanmeldingen en aanvragen.</p></div>}{message&&<p className={styles.message} role="status">{message}</p>}</section>
 </div>;
}

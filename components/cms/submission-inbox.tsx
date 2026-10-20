'use client';
import {useEffect,useRef,useState} from 'react';
import {ClipboardCheck,Inbox,Mail,UserRound,X} from 'lucide-react';
import {Pagination,usePageState} from './pagination';
import {useCMS} from './provider';
import {formKindLabels,statusesForFormKind,submissionLabels} from '@/lib/cms/forms';
import type {FormAnswer,FormKind,SubmissionStatus} from '@/lib/cms/types';
import styles from './forms-manager.module.css';

type Submission={id:string;version:number;form_id:string;department_id:string;status:SubmissionStatus;created_at:string;delivery_status:string;external_ref?:string;snapshot:{name?:string;email?:string;formName:string;definition?:{registrationPurpose?:string}};answers:FormAnswer[];notes?:{note:string;created_at?:string}[];history?:{from_status:SubmissionStatus;to_status:SubmissionStatus;created_at?:string}[]};
const date=(value:string)=>new Date(value).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const deliveryLabels:Record<string,string>={sent:'E-mail verzonden',pending:'E-mail staat klaar voor verzending',retry:'E-mail wordt opnieuw aangeboden',failed:'E-mail verzenden is mislukt','legacy-unknown':'E-mailstatus onbekend'};
export function SubmissionInbox({kind,initialFormId='',onChanged}:{kind:FormKind;initialFormId?:string;onChanged?:()=>void}){
 const {state}=useCMS();
 const [items,setItems]=useState<Submission[]>([]),[selected,setSelected]=useState<Submission|null>(null),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[formId,setFormId]=useState(initialFormId),[departmentId,setDepartmentId]=useState(''),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[detailLoading,setDetailLoading]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[note,setNote]=useState(''),[externalRef,setExternalRef]=useState('');
 const saveLock=useRef(false),selectedId=useRef(''),detailSequence=useRef(0),busy=loading||saving||detailLoading;
 const filters=JSON.stringify([kind,query,status,formId,departmentId]),pagination=usePageState(total,filters);
 const key=JSON.stringify([filters,pagination.page,pagination.pageSize]),current=useRef(key);current.current=key;
 async function refresh(required=false){
  const requested=key;setLoading(true);
  try{const params=new URLSearchParams({kind,limit:String(pagination.pageSize),offset:String((pagination.page-1)*pagination.pageSize),query,status,formId,departmentId}),response=await fetch('/api/cms/submissions?'+params,{cache:'no-store'}),data=await response.json();if(requested!==current.current)return;if(!response.ok)throw Error(data.message||'Inzendingen ophalen is mislukt.');setItems(data.items);setTotal(data.total??data.items.length);}
  catch(error){if(required)throw error;if(requested===current.current)setMessage(error instanceof Error?error.message:'Inzendingen ophalen is mislukt.');}finally{if(requested===current.current)setLoading(false);}
 }
 useEffect(()=>{selectedId.current='';detailSequence.current++;setSelected(null);setDetailLoading(false);setMessage('');setNote('');const timer=setTimeout(()=>void refresh(),200);return()=>{clearTimeout(timer);detailSequence.current++;};},[key]);
 async function detail(id:string,required=false){
  const sequence=++detailSequence.current,requested=key;selectedId.current=id;setDetailLoading(true);
  try{const response=await fetch(`/api/cms/submissions/${encodeURIComponent(id)}?kind=${kind}`,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'Inzending ophalen is mislukt.');if(sequence!==detailSequence.current||requested!==current.current||selectedId.current!==id)return;setSelected(data);setExternalRef(data.external_ref||'');setNote('');}
  catch(error){if(required)throw error;if(sequence===detailSequence.current)setMessage(error instanceof Error?error.message:'Inzending ophalen is mislukt.');}finally{if(sequence===detailSequence.current)setDetailLoading(false);}
 }
 async function patch(values:Record<string,string>){
  if(!selected||saveLock.current||detailLoading)return;saveLock.current=true;setSaving(true);setMessage('');
  try{const response=await fetch(`/api/cms/submissions/${encodeURIComponent(selected.id)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:selected.version,...values})}),data=await response.json();if(!response.ok)throw Error(data.message||'Opslaan is mislukt.');await detail(selected.id,true);await refresh(true);onChanged?.();setMessage('Opvolging opgeslagen.');}
  catch(error){setMessage(error instanceof Error?error.message:'Opslaan is mislukt.');}finally{saveLock.current=false;setSaving(false);}
 }
 function closeDetail(){selectedId.current='';detailSequence.current++;setSelected(null);setDetailLoading(false);setNote('');}
 const Icon=kind==='contact'?Mail:kind==='registration'?UserRound:ClipboardCheck;
 return <section>
  <div className={styles.inboxFilters}>
   <label className="cms-field">Zoeken<input disabled={saving} aria-label="Zoeken in inzendingen" value={query} onChange={event=>setQuery(event.target.value)} placeholder={`Zoek in ${formKindLabels[kind].plural.toLocaleLowerCase('nl')}`}/></label>
   <label className="cms-field">Formulier<select disabled={saving} aria-label="Formulier" value={formId} onChange={event=>setFormId(event.target.value)}><option value="">Alle formulieren</option>{state.forms.filter(form=>form.kind===kind).map(form=><option value={form.id} key={form.id}>{form.name}</option>)}</select></label>
   <label className="cms-field">Afdeling<select disabled={saving} aria-label="Afdeling" value={departmentId} onChange={event=>setDepartmentId(event.target.value)}><option value="">Alle afdelingen</option>{state.departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
   <label className="cms-field">Status<select disabled={saving} aria-label="Status" value={status} onChange={event=>setStatus(event.target.value)}><option value="">Alle statussen</option>{statusesForFormKind(kind).map(value=><option value={value} key={value}>{submissionLabels[value]}</option>)}</select></label>
  </div>
  <div className={styles.inboxWorkspace}>
   <section className={styles.inboxList} aria-label={formKindLabels[kind].plural}><div className={styles.listHeading}><h3>{formKindLabels[kind].plural}</h3><span role="status">{loading?'Laden…':`${total} gevonden`}</span></div>
    <div className={styles.recordList}>{items.map(item=><button type="button" className={styles.record} aria-pressed={selectedId.current===item.id} disabled={saving} key={item.id} onClick={()=>void detail(item.id)}><strong>{item.snapshot.name||'Inzending'}</strong><small>{item.snapshot.formName}{item.snapshot.email?' · '+item.snapshot.email:''}</small><span className={styles.recordMeta}><time dateTime={item.created_at}>{date(item.created_at)}</time><span className={styles.badge}>{submissionLabels[item.status]}</span></span></button>)}</div>
    {!loading&&!items.length&&<div className={styles.empty}><Icon size={32}/><h3>Geen {formKindLabels[kind].plural.toLocaleLowerCase('nl')} gevonden</h3><p>Ontvangen inzendingen verschijnen hier. Gebruik de filters om eerder ontvangen berichten te vinden.</p></div>}
    <Pagination label="Inzendingen" {...pagination} disabled={busy}/>
   </section>
   <article className={styles.detail} aria-busy={detailLoading||saving}>{selected?<>
    <div className={styles.panelHead}><div><h3>{selected.snapshot.formName}</h3><p>{selected.snapshot.name||formKindLabels[kind].singular}</p></div><button className="cms-button" type="button" disabled={saving} onClick={closeDetail}><X size={13}/>Inzending sluiten</button></div>
    <div className={styles.detailBody}><div className={styles.detailMeta}><span>Ontvangen op {date(selected.created_at)}</span><span>{state.departments.find(department=>department.id===selected.department_id)?.name}</span></div>
     {detailLoading&&<p role="status">Inzending laden…</p>}
     <dl className={`${styles.answers} cms-submission-answers`}>{selected.answers.map(answer=><div key={answer.fieldId}><dt>{answer.label}</dt><dd>{answer.value||'—'}</dd></div>)}</dl>
     <div className={styles.delivery}>{deliveryLabels[selected.delivery_status]||selected.delivery_status}</div>
     <label className="cms-field">Behandelstatus<select aria-label="Behandelstatus" disabled={busy} value={selected.status} onChange={event=>void patch({status:event.target.value})}>{statusesForFormKind(kind).map(value=><option key={value} value={value}>{submissionLabels[value]}</option>)}</select></label>
     <label className="cms-field">Interne notitie<textarea disabled={saving||detailLoading} aria-label="Interne notitie" maxLength={10000} value={note} onChange={event=>setNote(event.target.value)} placeholder="Schrijf een notitie voor je collega’s"/></label>
     <button type="button" className="cms-button" disabled={!note.trim()||busy} onClick={()=>void patch({note:note.trim()})}>Notitie bewaren</button>
     {selected.snapshot.definition?.registrationPurpose==='membership'&&<div className={styles.notes}><label className="cms-field">Externe registratie / referentie<input disabled={saving||detailLoading} maxLength={200} value={externalRef} onChange={event=>setExternalRef(event.target.value)}/></label><button type="button" className="cms-button" disabled={!externalRef.trim()||busy} onClick={()=>void patch({externalRef:externalRef.trim()})}>Registratie bijwerken</button></div>}
     <section className={styles.notes} aria-label="Interne notities"><h4>Notities</h4>{selected.notes?.length?selected.notes.map((item,index)=><p className={styles.note} key={index}><span>{item.note}</span>{item.created_at&&<time dateTime={item.created_at}>{date(item.created_at)}</time>}</p>):<p className="cms-meta">Nog geen interne notities.</p>}</section>
     <section className={styles.notes}><h4>Statusgeschiedenis</h4>{selected.history?.length?selected.history.map((item,index)=><div className={styles.history} key={index}>{submissionLabels[item.from_status]} → {submissionLabels[item.to_status]}{item.created_at&&<time dateTime={item.created_at}>{date(item.created_at)}</time>}</div>):<p className="cms-meta">De behandelstatus is nog niet gewijzigd.</p>}</section>
    </div>
   </>:<div className={styles.empty}><Inbox size={35}/><h3>{detailLoading?'Inzending laden…':`${formKindLabels[kind].singular} opvolgen`}</h3><p>Selecteer een inzending om de ingevulde gegevens te bekijken en de status bij te werken.</p></div>}</article>
  </div>{message&&<p className={styles.message} role="status">{message}</p>}
 </section>;
}

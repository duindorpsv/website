'use client';
import {Pagination,usePagination} from './pagination';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,Plus,Save,Trash2} from 'lucide-react';
import {useCMS} from './provider';
import {agendaDate,agendaSchema,emptyAgenda,type ClubAgendaEvent} from '@/lib/club-agenda';
export {HeroPhotosManager} from './hero-photos-manager';
import styles from './homepage-content-managers.module.css';

// Edits keep the version from when they started. Another editor's publication
// cannot be silently overwritten by a later, unrelated bootstrap refresh.
function usePublishedItems<T>(module:'agenda'|'heroPhotos',items:T[]) {
  const {update,recordVersion}=useCMS();
  const id=module==='agenda'?'site-agenda':'site-hero-photos';
  const [draft,setDraft]=useState<T[]>(items),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const version=useRef(recordVersion(id));
  useEffect(()=>{if(!dirty){setDraft(items);version.current=recordVersion(id);}},[items,dirty,id,recordVersion]);
  function change(next:T[]){setDraft(next);setDirty(true);}
  async function publish() {
    setBusy(true);
    try {
      const saved=await update(state=>{state.appearance||={};(state.appearance[module] as T[])=draft;},'Gepubliceerd op de website.',{[id]:{action:'publish',expectedVersion:version.current}});
      if(saved)setDirty(false);
    } finally {setBusy(false);}
  }
  return {draft,change,dirty,busy,publish,discard:()=>setDirty(false)};
}

export function AgendaManager() {
  const {state,can,storageConflictId,reload,clearStorageError}=useCMS();
  const {draft,change,dirty,busy,publish,discard}=usePublishedItems<ClubAgendaEvent>('agenda',state.appearance?.agenda||emptyAgenda);
  const [selected,setSelected]=useState<string|null>(null),[error,setError]=useState('');
  const editable=can('pages')&&can('publish',undefined,'pages');
  const active=draft.find(item=>item.id===selected);
  const sorted=draft.slice().sort((a,b)=>`${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const pagination=usePagination(sorted);
  function add(){const id=crypto.randomUUID();change([...draft,{id,title:'',date:'',time:'',description:''}]);setSelected(id);setError('');}
  function edit(field:keyof Omit<ClubAgendaEvent,'id'>,value:string){change(draft.map(item=>item.id===selected?{...item,[field]:value}:item));setError('');}
  async function save(){
    const result=agendaSchema.safeParse(draft);
    if(!result.success){const issue=result.error.issues[0],index=Number(issue.path[0]);setSelected(draft[index]?.id||selected);setError(`Controleer ${issue.path[1]==='title'?'de titel':issue.path[1]==='description'?'de beschrijving':'de datum en tijd'} van de activiteit. ${issue.message}`);return;}
    setError('');await publish();
  }
  return <div className={styles.agenda}>
    <section className="cms-panel"><div className="cms-section-heading"><div><h3>De agenda van de club</h3><p className="cms-meta">Activiteiten verschijnen na publicatie op de homepage, op volgorde van datum en tijd. Voorbijgegane dagen verdwijnen vanzelf uit het openbare overzicht. Alle tijden zijn Nederlandse tijd.</p></div><button className="cms-button" disabled={!editable||busy||draft.length>=500} onClick={add}><Plus size={16}/>Activiteit toevoegen</button></div>
      <div className={styles.split}><div className={styles.list} aria-label="Activiteiten">{!draft.length?<p className="cms-meta">Er zijn nog geen activiteiten. Voeg de eerste activiteit toe.</p>:pagination.items.map(item=><button key={item.id} className={styles.event} aria-current={selected===item.id?'true':undefined} onClick={()=>setSelected(item.id)}><CalendarDays size={19}/><span><strong>{item.title||'Nieuwe activiteit'}</strong><small>{item.date&&item.time&&agendaSchema.safeParse([item]).success?`${agendaDate(item)} · ${item.time} uur`:'Datum en tijd nog invullen'}</small></span></button>)}</div>
      {active?<fieldset disabled={!editable||busy} className={styles.editor}><legend>Activiteit bewerken</legend><label className="cms-field">Titel<input value={active.title} maxLength={150} required onChange={e=>edit('title',e.target.value)}/></label><div className={styles.dates}><label className="cms-field">Datum<input type="date" value={active.date} required onChange={e=>edit('date',e.target.value)}/></label><label className="cms-field">Tijd<input type="time" value={active.time} required onChange={e=>edit('time',e.target.value)}/></label></div><div className="cms-field"><label htmlFor="agenda-description">Beschrijving</label><textarea id="agenda-description" rows={7} maxLength={5000} value={active.description} required onChange={e=>edit('description',e.target.value)}/></div><button className="cms-button danger" onClick={()=>{change(draft.filter(item=>item.id!==active.id));setSelected(null);setError('');}}><Trash2 size={16}/>Activiteit verwijderen</button><p className="cms-meta">Verwijderen wordt pas zichtbaar na publicatie.</p></fieldset>:<div className={styles.empty}><CalendarDays size={32}/><p>Kies een activiteit om te bewerken of voeg er een toe.</p></div>}</div>
    </section>
    <Pagination label="Agenda" {...pagination}/>
    {error&&<p role="alert" className="cms-status">{error}</p>}
    {storageConflictId==='site-agenda'&&<div className="cms-panel"><p>Een andere redacteur heeft de agenda gewijzigd. Je wijzigingen staan nog hierboven. Kopieer wat je wilt bewaren voordat je de serverversie overneemt.</p><button className="cms-button" disabled={busy} onClick={async()=>{if(!window.confirm('Je niet-gepubliceerde agendawijzigingen vervangen door de serverversie?'))return;await reload();discard();clearStorageError();}}>Serverversie opnieuw laden</button></div>}
    <div className="cms-toolbar"><button className="cms-button primary" disabled={!editable||busy||!dirty} onClick={()=>void save()}><Save size={16}/>{busy?'Publiceren…':'Agenda publiceren'}</button><span className="cms-meta">{dirty?'Je hebt nog niet-gepubliceerde wijzigingen.':'De agenda is bijgewerkt.'}</span></div>
  </div>;
}

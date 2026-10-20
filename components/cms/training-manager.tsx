'use client';
import {Pagination,usePagination} from './pagination';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,Plus,Search,Trash2} from 'lucide-react';
import {useCMS} from './provider';
import {clubTrainingSchedule,type ClubTrainingRecord} from '@/lib/clubmuur-training';
import {trainingDays,trainingSchema} from '@/lib/cms/training';
import styles from './training-manager.module.css';

export function TrainingManager(){
 const {state,can,update,recordVersion,storageConflictId,reload,clearStorageError}=useCMS();
 const saved=state.appearance?.training??clubTrainingSchedule;
 const [draft,setDraft]=useState<ClubTrainingRecord[]>(()=>structuredClone(saved)),[dirty,setDirty]=useState(false),[selected,setSelected]=useState(0),[query,setQuery]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const version=useRef(recordVersion('site-training')),added=useRef<number|null>(null);
 const visible=draft.map((team,index)=>({team,index})).filter(({team})=>team.teamLabel.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl')));
 const pagination=usePagination(visible,query),active=draft[selected];
 const editable=can('pages'),publish=can('publish','','pages');
 useEffect(()=>{if(!dirty){setDraft(structuredClone(saved));version.current=recordVersion('site-training');}},[saved,dirty,recordVersion]);
 useEffect(()=>{if(added.current!==null){pagination.onPageChange(Math.floor(added.current/pagination.pageSize)+1);added.current=null;}},[draft.length,query,pagination.pageSize]);
 function change(next:ClubTrainingRecord[]){setDraft(next);setDirty(true);setMessage('');}
 const patch=(index:number,value:Partial<ClubTrainingRecord>)=>change(draft.map((item,i)=>i===index?{...item,...value}:item));
 function add(){added.current=draft.length;setQuery('');setSelected(draft.length);change([...draft,{teamLabel:'',sessions:[]}]);}
 async function save(){
  const result=trainingSchema.safeParse(draft);
  if(!result.success){const issue=result.error.issues[0];if(typeof issue.path[0]==='number'){setSelected(issue.path[0]);added.current=issue.path[0];setQuery('');pagination.onPageChange(Math.floor(issue.path[0]/pagination.pageSize)+1);}setMessage(issue.path[1]==='teamLabel'?'Vul voor ieder team een unieke teamnaam in (maximaal 120 tekens).':issue.path.includes('field')?'Vul bij ieder trainingsmoment een veld in.':issue.message);return;}
  setBusy(true);try{if(await update(next=>{next.appearance||={};next.appearance.training=result.data;},'Trainingstijden gepubliceerd',{'site-training':{action:'publish',expectedVersion:version.current}})){setDirty(false);setMessage('Trainingstijden zijn gepubliceerd op de trainingspagina en de teampagina’s.');}}finally{setBusy(false);}
 }
 return <section className={styles.manager}>
  <div className="cms-panel"><div className="cms-section-heading"><div><h2>Het trainingsrooster</h2><p className="cms-meta">Kies een team om dagen, tijden en velden te bewerken. Gebruik de teamnaam uit Sportlink om het rooster ook bij dat team te tonen.</p></div><button type="button" className="cms-button primary" disabled={!editable||busy||draft.length>=150} onClick={add}><Plus size={16}/>Team toevoegen</button></div>
   <div className={styles.layout}><aside><label className={styles.search}><Search size={16}/><input aria-label="Trainingsteams zoeken" placeholder="Zoek een team…" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className={styles.list} aria-label="Trainingsteams">{pagination.items.length?pagination.items.map(({team,index})=><button type="button" key={index} className={styles.team} aria-current={selected===index?'true':undefined} onClick={()=>{setSelected(index);setMessage('');}}><CalendarDays size={18}/><span><strong>{team.teamLabel||'Nieuw team'}</strong><small>{team.sessions.length} trainingsmoment{team.sessions.length===1?'':'en'}</small></span></button>):<p className="cms-meta">{draft.length?'Geen teams gevonden. Pas je zoekopdracht aan.':'Voeg het eerste team toe aan het rooster.'}</p>}</div><Pagination label="Trainingsteams" {...pagination}/></aside>
   {active?<fieldset className={styles.editor} disabled={!editable||busy}><legend>{active.teamLabel||'Nieuw team'}</legend><label className="cms-field">Teamnaam<input value={active.teamLabel} maxLength={120} onChange={event=>patch(selected,{teamLabel:event.target.value})}/></label>{active.sessions.length?active.sessions.map((session,position)=><section className={styles.session} key={position}><div className={styles.sessionHeading}><strong>Trainingsmoment {position+1}</strong><button type="button" className="cms-button danger" aria-label={`Training ${position+1} verwijderen`} onClick={()=>patch(selected,{sessions:active.sessions.filter((_,i)=>i!==position)})}><Trash2 size={14}/>Training verwijderen</button></div><div className={styles.sessionFields}><label className="cms-field">Dag<select value={session.day} onChange={event=>patch(selected,{sessions:active.sessions.map((item,i)=>i===position?{...item,day:event.target.value}:item)})}>{trainingDays.map(day=><option key={day}>{day}</option>)}</select></label>{(['start','end','field'] as const).map(key=><label className="cms-field" key={key}>{key==='start'?'Begintijd':key==='end'?'Eindtijd':'Veld'}<input type={key==='field'?'text':'time'} value={session[key]} onChange={event=>patch(selected,{sessions:active.sessions.map((item,i)=>i===position?{...item,[key]:event.target.value}:item)})}/></label>)}</div></section>):<p className="cms-meta">Dit team heeft nog geen trainingsmomenten. Voeg een dag en tijd toe.</p>}<div className="cms-toolbar"><button type="button" className="cms-button" disabled={active.sessions.length>=14} onClick={()=>patch(selected,{sessions:[...active.sessions,{day:'Maandag',start:'18:00',end:'19:00',field:'Veld 1'}]})}><Plus size={15}/>Trainingsmoment toevoegen</button><button type="button" className="cms-button danger" onClick={()=>{change(draft.filter((_,i)=>i!==selected));setSelected(Math.max(0,selected-1));}}>Team uit rooster verwijderen</button></div></fieldset>:<div className={styles.empty}><CalendarDays size={30}/><p>Kies een team of voeg er een toe.</p></div>}
   </div>
  </div>
  {storageConflictId==='site-training'&&<div className="cms-panel" role="alert"><p>Een andere redacteur heeft het rooster gewijzigd. Je werkversie blijft hierboven staan. Bewaar je wijzigingen voordat je de serverversie overneemt.</p><button type="button" className="cms-button" disabled={busy} onClick={async()=>{if(!window.confirm('Je niet-gepubliceerde trainingswijzigingen vervangen door de serverversie?'))return;await reload();setDirty(false);clearStorageError();}}>Serverversie opnieuw laden</button></div>}
  <div className="cms-toolbar"><button type="button" className="cms-button primary" disabled={!editable||!publish||busy||!dirty} onClick={()=>void save()}>{busy?'Publiceren…':'Trainingstijden opslaan en publiceren'}</button><span className="cms-meta">{dirty?'Je hebt nog niet-gepubliceerde wijzigingen.':'Het trainingsrooster is bijgewerkt.'}</span></div>{message&&<p role="status" className="cms-panel">{message}</p>}
 </section>;
}

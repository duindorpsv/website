'use client';
import {PlanningMigrationReview} from './planning-migration-review';

import {useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowRight,CalendarDays,Check,ChevronLeft,ChevronRight,Clock3,Eye,Info,MapPin,Plus,Repeat2,Trash2,Users,X} from 'lucide-react';
import {useCMS} from './provider';
import {CmsMultiSelect} from './multi-select';
import {uid} from '@/lib/cms/model';
import {addPlanningDays,expandWeeklyTraining,validPlanningDate,validateActivity,planningInstant,validPlanningTime} from '@/lib/cms/planning';
import type {CmsActivity,CmsState} from '@/lib/cms/types';
import './training-manager.css';
import {useCmsPageHeader} from './page-header';

const WEEKDAYS=[{id:1,name:'Maandag',short:'Ma'},{id:2,name:'Dinsdag',short:'Di'},{id:3,name:'Woensdag',short:'Wo'},{id:4,name:'Donderdag',short:'Do'},{id:5,name:'Vrijdag',short:'Vr'},{id:6,name:'Zaterdag',short:'Za'},{id:0,name:'Zondag',short:'Zo'}];
type TrainingDraft={activity:CmsActivity;until:string;weekdays:number[]};
type SeriesPreview={activities:CmsActivity[];errors:string[]};

function todayInAmsterdam(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=(type:string)=>parts.find(item=>item.type===type)?.value||'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function weekday(date:string){return new Date(`${date}T12:00:00Z`).getUTCDay();}
function monday(date:string){return addPlanningDays(date,-((weekday(date)+6)%7));}
function displayDate(date:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short'}){
  if(!validPlanningDate(date))return 'Datum ontbreekt';
  return new Intl.DateTimeFormat('nl-NL',{timeZone:'UTC',...options}).format(new Date(`${date}T12:00:00Z`));
}
function prepareSeries(state:CmsState,draft:TrainingDraft):SeriesPreview {
  let activities:CmsActivity[];
  try{activities=expandWeeklyTraining({...draft.activity,title:draft.activity.title.trim(),description:draft.activity.description.trim()},{until:draft.until,weekdays:draft.weekdays});}
  catch(error){return {activities:[],errors:[error instanceof Error?error.message:'Controleer de datums en trainingsdagen.']};}
  const errors:string[]=[];
  if(!draft.activity.teamIds.length)errors.push('Kies minimaal één team voor de training.');
  if(!activities.length)errors.push('Er valt geen geselecteerde trainingsdag binnen deze periode.');
  const working={...state,planning:{...state.planning,activities:[...state.planning.activities]}};
  for(const activity of activities){
    if(working.planning.activities.some(row=>row.id===activity.id))errors.push('Deze trainingsreeks is al opgeslagen. Open de bestaande momenten in de jaaragenda.');
    for(const message of validateActivity(working,activity))errors.push(`${displayDate(activity.date,{day:'numeric',month:'short',year:'numeric'})}: ${message}`);
    working.planning.activities.push(activity);
  }
  return {activities,errors:[...new Set(errors)]};
}
function Modal({open,onOpenChange,title,description,children,confirm=false}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;description:string;children:ReactNode;confirm?:boolean}){
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="cms-training-overlay"/><Dialog.Content onEscapeKeyDown={event=>{if(event.target instanceof Element && event.target.closest('.cms-multiselect[data-open="true"]'))event.preventDefault();}} className={`cms-training-modal${confirm?' cms-training-confirm':''}`}><header className="cms-training-modal-head"><div><span className="cms-training-modal-eyebrow">DUINDORP SV / TRAININGSPLANNING</span><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className="cms-training-close" aria-label="Venster sluiten"><X size={18}/></Dialog.Close></header>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function TrainingManager({onOpenActivity}:{onOpenActivity?:(id:string)=>void}){
  const {state,update,can,notify,recordVersion,reload,saving,storageError}=useCMS();
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[checkedKey,setCheckedKey]=useState(''),[serverErrors,setServerErrors]=useState<string[]>([]);const deletionVersions=useRef<Record<string,number>>({});
  const [today]=useState(todayInAmsterdam);
  const [week,setWeek]=useState(()=>monday(today));
  const [teamFilter,setTeamFilter]=useState('');
  const [draft,setDraft]=useState<TrainingDraft|null>(null);
  const [submitted,setSubmitted]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const [deleteScope,setDeleteScope]=useState<'one'|'series'>('one');
  const [deleteError,setDeleteError]=useState('');
  const weekEnd=addPlanningDays(week,6);
  const trainings=state.planning.activities.filter(activity=>!activity.deletedAt&&activity.type==='training');
  const upcoming=trainings.filter(activity=>activity.status==='planned'&&activity.date>=today);
  const visible=trainings.filter(activity=>activity.date>=week&&activity.date<=weekEnd&&(!teamFilter||activity.teamIds.includes(teamFilter))).sort((a,b)=>`${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)||a.title.localeCompare(b.title,'nl'));
  const days=[...new Set(visible.map(activity=>activity.date))];
  const editable=can('pages')||state.settings.teams.some(team=>can('pages',team.id));
  const canEdit=(activity:CmsActivity)=>activity.teamIds.length?activity.teamIds.every(id=>can('pages',id)):can('pages');
  const canPublish=(activity:CmsActivity)=>activity.teamIds.length?activity.teamIds.every(id=>can('publish',id,'pages')):can('publish',undefined,'pages');
  const canModify=(activity:CmsActivity)=>canEdit(activity)&&(!activity.public||canPublish(activity));
  const preview=useMemo(()=>draft?prepareSeries(state,draft):{activities:[],errors:[]},[state,draft]);
  const draftKey=draft?JSON.stringify(draft):'';
  const occurrenceChoiceNeeded=preview.activities.some(activity=>[activity.startTime,activity.endTime].some(time=>{if(!validPlanningTime(time))return false;try{planningInstant(activity.date+'T'+time);return false;}catch{return true;}}));
  useEffect(()=>{setCheckedKey('');setServerErrors([]);if(!draft||preview.errors.length){setChecking(false);return;}const controller=new AbortController();const timer=setTimeout(()=>{setChecking(true);void fetch('/api/cms/planning/series',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({mode:'preview',activity:draft.activity,until:draft.until,weekdays:draft.weekdays,operationId:crypto.randomUUID()})}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.message||'De reekscontrole is niet gelukt.');setServerErrors(data.conflicts||[]);setCheckedKey(draftKey);}).catch(error=>{if(error.name!=='AbortError')setServerErrors([error.message]);}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});},350);return()=>{clearTimeout(timer);controller.abort();};},[draftKey,state.planning.activities]);
  const activeDeletion=trainings.find(activity=>activity.id===deleteId);
  const deletionItems=activeDeletion?(deleteScope==='series'&&activeDeletion.seriesId?trainings.filter(activity=>activity.seriesId===activeDeletion.seriesId):[activeDeletion]):[];
  const deletionDates=deletionItems.map(activity=>activity.date).sort();

  function openAgenda(activity:CmsActivity){
    if(onOpenActivity)onOpenActivity(activity.id);
    else window.location.hash='jaaragenda';
  }
  function startTraining(){
    if(!editable)return;
    const teamIds=teamFilter&&can('pages',teamFilter)?[teamFilter]:[];
    const id=uid('training');
    setDraft({activity:{id,title:teamIds.length?`Training ${state.settings.teams.find(team=>team.id===teamIds[0])?.name||''}`:'',type:'training',date:today,startTime:'18:00',endTime:'19:00',locationIds:[],personIds:[],committeeIds:[],teamIds,public:false,description:'',status:'planned',source:'manual',seriesId:`series-${id}`},until:addPlanningDays(today,84),weekdays:[weekday(today)]});
    setSubmitted(false);setSaveError('');
  }
  function patchActivity(patch:Partial<CmsActivity>){
    setDraft(current=>current?{...current,activity:{...current.activity,...patch}}:null);setSaveError('');
  }
  function chooseTeams(teamIds:string[]){
    if(!draft)return;
    const titleFor=(ids:string[])=>ids.length?`Training ${ids.map(id=>state.settings.teams.find(team=>team.id===id)?.name||'').filter(Boolean).join(' & ')}`:'';
    const activity={...draft.activity,teamIds,title:!draft.activity.title||draft.activity.title===titleFor(draft.activity.teamIds)?titleFor(teamIds):draft.activity.title};
    if(!canPublish(activity))activity.public=false;
    patchActivity(activity);
  }
  async function saveTraining(event:FormEvent){event.preventDefault();setSubmitted(true);setSaveError('');if(!draft||busy||!canModify(draft.activity)||preview.errors.length||serverErrors.length||checkedKey!==draftKey)return;setBusy(true);try{const response=await fetch('/api/cms/planning/series',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'apply',activity:draft.activity,until:draft.until,weekdays:draft.weekdays,operationId:crypto.randomUUID()})}),data=await response.json();if(!response.ok)throw Error(data.message||'De volledige reeks kon niet worden opgeslagen.');await reload();setWeek(monday(preview.activities[0].date));setDraft(null);notify(`${preview.activities.length} trainingen atomair ingepland. Elk moment is afzonderlijk te beheren.`);}catch(error){setSaveError(error instanceof Error?error.message:'Opslaan is niet gelukt. Je ingevulde reeks blijft bewaard.');}finally{setBusy(false);}}

  async function deleteTraining(){
    if(!activeDeletion||busy||!deletionItems.length||!deletionItems.every(canModify))return;
    if(deleteScope==='series'&&activeDeletion.seriesId){setBusy(true);setDeleteError('');try{const expectedVersions=Object.fromEntries(deletionItems.map(item=>[item.id,deletionVersions.current[item.id]??0]));const response=await fetch('/api/cms/planning/series',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({seriesId:activeDeletion.seriesId,expectedVersions,operationId:crypto.randomUUID()})}),data=await response.json();if(!response.ok)throw Error(data.message||'De reeks kon niet atomair worden verwijderd.');await reload();setDeleteId(null);notify(`${deletionItems.length} trainingsmomenten naar de prullenbak verplaatst.`);}catch(error){setDeleteError(error instanceof Error?error.message:'Verwijderen is niet gelukt; de reeks is behouden.');}finally{setBusy(false);}return;}
    const expected=new Set(deletionItems.map(activity=>activity.id));
    const saved=await update(current=>{
      const currentItems=current.planning.activities.filter(activity=>expected.has(activity.id));
      if(currentItems.some(activity=>!canModify(activity)))throw new Error('De rechten of zichtbaarheid zijn gewijzigd. Controleer de trainingen opnieuw.');
      current.planning.activities=current.planning.activities.filter(activity=>!expected.has(activity.id));
    },`${deletionItems.length} trainingsmoment${deletionItems.length===1?'':'en'} verwijderd: ${activeDeletion.title}`,Object.fromEntries(deletionItems.map(item=>[item.id,{action:'trash' as const,expectedVersion:deletionVersions.current[item.id]??recordVersion(item.id)}])));
    if(saved){setDeleteId(null);notify(`${deletionItems.length} trainingsmoment${deletionItems.length===1?'':'en'} verwijderd.`);}
    else setDeleteError('Verwijderen is niet gelukt. De trainingen zijn behouden.');
  }

  const pageHeader=useCmsPageHeader({actions:<button type="button" className="cms-button primary" onClick={startTraining} disabled={!editable||busy||saving}><Plus size={16}/>Trainingsreeks plannen</button>});
  return <div className="cms-training">
    {pageHeader}<PlanningMigrationReview source="training"/>
    <div className="cms-training-stats"><div className="cms-training-stat"><CalendarDays size={20}/><div><strong>{visible.filter(activity=>activity.status==='planned').length}</strong><small>Trainingen in deze week{teamFilter?' · teamfilter':''}</small></div></div><div className="cms-training-stat"><Repeat2 size={20}/><div><strong>{new Set(upcoming.map(activity=>activity.seriesId).filter(Boolean)).size}</strong><small>Komende trainingsreeksen</small></div></div><div className="cms-training-stat"><Users size={20}/><div><strong>{new Set(upcoming.flatMap(activity=>activity.teamIds)).size}</strong><small>Teams met trainingen</small></div></div></div>
    <section className="cms-panel cms-training-calendar" aria-label="Wekelijks trainingsoverzicht"><div className="cms-training-bar"><div className="cms-training-week-nav"><button type="button" className="cms-icon-button" aria-label="Vorige trainingsweek" onClick={()=>setWeek(addPlanningDays(week,-7))}><ChevronLeft size={17}/></button><strong>{displayDate(week)} – {displayDate(weekEnd,{day:'numeric',month:'short',year:'numeric'})}</strong><button type="button" className="cms-icon-button" aria-label="Volgende trainingsweek" onClick={()=>setWeek(addPlanningDays(week,7))}><ChevronRight size={17}/></button></div><div className="cms-training-filters"><button type="button" className="cms-button" onClick={()=>setWeek(monday(today))}>Deze week</button><select value={teamFilter} onChange={event=>setTeamFilter(event.target.value)} aria-label="Trainingen filteren op team"><option value="">Alle teams</option>{state.settings.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></div></div>
      {days.length?days.map(date=><div className="cms-training-day" key={date}><div className={`cms-training-day-heading${date===today?' today':''}`}><strong>{displayDate(date,{weekday:'long'})}</strong><span>{displayDate(date)}</span>{date===today&&<small>Vandaag</small>}</div><div className="cms-training-day-items">{visible.filter(activity=>activity.date===date).map(activity=>{
        const locations=activity.locationIds.map(id=>state.planning.locations.find(location=>location.id===id)?.name).filter(Boolean);
        const people=activity.personIds.map(id=>state.people.find(person=>person.id===id&&!person.deletedAt)?.name).filter(Boolean);
        const teams=activity.teamIds.map(id=>state.settings.teams.find(team=>team.id===id)?.name).filter(Boolean);
        return <article className={`cms-training-row${activity.status==='cancelled'?' cancelled':''}`} key={activity.id}><div className="cms-training-row-time">{activity.startTime}–{activity.endTime}<small>{activity.status==='cancelled'?'Afgelast':activity.seriesId?'Wekelijks':'Losse training'}</small></div><div className="cms-training-row-copy"><strong>{activity.title}</strong><span><span><MapPin size={12}/>{locations.join(' · ')||'Locatie nog te kiezen'}</span>{activity.public&&<span><Eye size={12}/>Openbaar</span>}</span>{teams.length>0&&<small>{teams.join(' · ')}</small>}{people.length>0&&<small>Begeleiding: {people.join(', ')}</small>}</div><div className="cms-training-row-actions"><button type="button" className="cms-button" onClick={()=>openAgenda(activity)} aria-label={`${activity.title} op ${displayDate(activity.date)} openen in jaaragenda`}><CalendarDays size={14}/><span>Jaaragenda</span><ArrowRight size={13}/></button><button type="button" className="cms-training-delete-button" disabled={!canModify(activity)} aria-label={`${activity.title} op ${displayDate(activity.date)} verwijderen`} onClick={()=>{deletionVersions.current=Object.fromEntries(trainings.map(item=>[item.id,recordVersion(item.id)]));setDeleteId(activity.id);setDeleteScope('one');setDeleteError('');}}><Trash2 size={15}/></button></div></article>;
      })}</div></div>):<div className="cms-training-empty"><CalendarDays size={35}/><h3>Ruimte om te trainen.</h3><p>{teamFilter?'Voor dit team zijn in deze week geen trainingen gepland. Kies een andere week of maak een trainingsreeks.':'In deze week zijn nog geen trainingen gepland. Maak een reeks voor één of meerdere teams.'}</p><button type="button" className="cms-button primary" disabled={!editable} onClick={startTraining}><Plus size={15}/>Trainingsreeks plannen</button></div>}
      <footer className="cms-training-calendar-foot"><span><Repeat2 size={13}/>Een wijziging in de jaaragenda is ook hier direct zichtbaar.</span><a href="#jaaragenda">Open de jaaragenda <ArrowRight size={13}/></a></footer>
    </section>

    <Modal open={!!draft} onOpenChange={open=>{if(!open&&!busy&&!saving)setDraft(null);}} title="Trainingsreeks plannen" description="Eén schema, concrete trainingsmomenten in de agenda.">
      {draft&&<form className="cms-training-modal-form" onSubmit={saveTraining}><div className="cms-training-modal-layout"><div className="cms-training-fields"><fieldset disabled={!editable||busy||saving}>
        <label className="cms-field">Titel *<input autoFocus value={draft.activity.title} onChange={event=>patchActivity({title:event.target.value})} required maxLength={180} placeholder="Bijvoorbeeld: Training JO15-1"/></label>
        <CmsMultiSelect label="Team(s) *" required disabled={!editable} placeholder="Zoek een team…" options={state.settings.teams.map(team=>({...team,disabled:!can('pages',team.id)}))} value={draft.activity.teamIds} onChange={chooseTeams} hint="De geselecteerde teams trainen samen op dezelfde tijden en locaties."/>
        <div className="cms-training-two"><label className="cms-field">Vanaf datum *<input type="date" value={draft.activity.date} required onChange={event=>patchActivity({date:event.target.value})}/></label><label className="cms-field">Herhalen tot en met *<input type="date" value={draft.until} min={draft.activity.date} max={validPlanningDate(draft.activity.date)?addPlanningDays(draft.activity.date,364):undefined} required onChange={event=>{setDraft({...draft,until:event.target.value});setSaveError('');}}/></label></div>
        <fieldset className="cms-training-choice-group"><legend>Iedere week op *</legend><div className="cms-training-choices weekdays">{WEEKDAYS.map(day=><label className="cms-training-choice" key={day.id} title={day.name}><input type="checkbox" aria-label={day.name} checked={draft.weekdays.includes(day.id)} onChange={event=>{setDraft({...draft,weekdays:event.target.checked?[...draft.weekdays,day.id]:draft.weekdays.filter(value=>value!==day.id)});setSaveError('');}}/><span>{day.short}</span></label>)}</div><small>Dezelfde lokale tijd op alle gekozen dagen, ook na de wisseling van zomer- en wintertijd. Maximaal 364 dagen tussen begin- en einddatum, inclusief beide grensdatums (soms 53 momenten per weekdag).</small></fieldset>
        <div className="cms-training-two"><label className="cms-field">Begintijd *<input type="time" required value={draft.activity.startTime} onChange={event=>patchActivity({startTime:event.target.value})}/></label><label className="cms-field">Eindtijd *<input type="time" required value={draft.activity.endTime} onChange={event=>patchActivity({endTime:event.target.value})}/></label></div>
        <CmsMultiSelect label="Velden & ruimtes" disabled={!editable} placeholder="Zoek een veld of ruimte…" options={state.planning.locations.filter(location=>location.active&&!location.deletedAt).map(location=>({id:location.id,name:location.name}))} value={draft.activity.locationIds} onChange={locationIds=>patchActivity({locationIds})} hint="Een heel veld en een deel van dat veld mogen niet tegelijk worden gekozen. Elke datum wordt op bestaande reserveringen gecontroleerd."/>
        <CmsMultiSelect label="Trainers & begeleiders" disabled={!editable} placeholder="Zoek een trainer of begeleider…" options={state.people.filter(person=>!person.deletedAt).sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(person=>({id:person.id,name:person.name}))} value={draft.activity.personIds} onChange={personIds=>patchActivity({personIds})} hint="Deze persoonskoppelingen en contactgegevens worden niet in de openbare agenda getoond."/>
        {occurrenceChoiceNeeded&&<label className="cms-field">Bij dubbel tijdstip door wintertijd<select value={draft.activity.occurrence||'reject'} onChange={event=>patchActivity({occurrence:event.target.value as CmsActivity['occurrence']})}><option value="reject">Vraag om expliciete keuze</option><option value="earlier">Eerste tijdstip</option><option value="later">Tweede tijdstip</option></select></label>}<label className="cms-field">Omschrijving<textarea rows={3} value={draft.activity.description} onChange={event=>patchActivity({description:event.target.value})} placeholder="Bijvoorbeeld: verzamelen bij het clubhuis."/><small>Bij een openbare training is deze tekst zichtbaar voor bezoekers.</small></label>
        <label className="cms-training-public"><input type="checkbox" checked={draft.activity.public} disabled={!canPublish(draft.activity)} onChange={event=>patchActivity({public:event.target.checked})}/><span><strong>Deze reeks meteen publiceren in de openbare clubagenda</strong><small>{canPublish(draft.activity)?'Bezoekers zien titel, datum, tijd, locatie en omschrijving.':'Voor openbare activiteiten zijn publicatierechten nodig.'}</small></span></label>
      </fieldset></div>
      <aside className="cms-training-preview" aria-label="Voorbeeld van de trainingsreeks"><div className="cms-training-preview-label"><Repeat2 size={14}/>Vooruitblik op de reeks</div><div className="cms-training-preview-count" aria-live="polite"><strong>{preview.activities.length}</strong><span>training{preview.activities.length===1?'':'en'}</span></div><p>{preview.activities.length?`${displayDate(preview.activities[0].date,{day:'numeric',month:'long'})} tot en met ${displayDate(preview.activities[preview.activities.length-1].date,{day:'numeric',month:'long',year:'numeric'})}.`:'Kies een periode en de dagen waarop het team traint.'}</p>
        {!!preview.activities.length&&<><ol className="cms-training-preview-dates">{preview.activities.slice(0,6).map(activity=><li key={activity.id}><span>{displayDate(activity.date,{weekday:'short',day:'numeric',month:'short'})}</span><small>{activity.startTime}–{activity.endTime}</small></li>)}</ol>{preview.activities.length>6&&<span className="cms-training-preview-more">En nog {preview.activities.length-6} trainingsmomenten.</span>}</>}
        <div className="cms-training-preview-note"><Info size={15}/><span>Ieder moment wordt apart opgeslagen. Een vakantie, afgelasting of eenmalige tijdwijziging pas je daarna per training aan.</span></div>
        {(submitted||(draft.activity.title.trim()&&draft.activity.teamIds.length>0))&&preview.errors.length>0&&<div className="cms-training-preview-error" role="alert"><strong>Controleer de reeks</strong><ul>{preview.errors.slice(0,5).map((error,index)=><li key={`${index}-${error}`}>{error}</li>)}</ul>{preview.errors.length>5&&<p>En nog {preview.errors.length-5} melding(en). Pas de periode, tijden of locaties aan.</p>}<p>Er worden pas trainingen toegevoegd als de hele reeks klopt.</p></div>}
        {preview.activities.length>0&&preview.errors.length===0&&checkedKey===draftKey&&!serverErrors.length&&<div className="cms-training-preview-success"><Check size={15}/><span>De volledige reeks is gecontroleerd. Geen locatieconflicten gevonden.</span></div>}
        {checking&&<p role="status">De volledige reeks wordt op de server gecontroleerd…</p>}{serverErrors.length>0&&<div className="cms-training-preview-error" role="alert">{serverErrors.map((error,index)=><p key={index}>{error}</p>)}</div>}{storageError&&<p className="cms-training-preview-error" role="alert">{storageError}</p>}{saveError&&<div className="cms-training-preview-error" role="alert">{saveError}</div>}
      </aside></div><footer className="cms-training-modal-foot"><small><Clock3 size={12} style={{display:'inline',verticalAlign:'-2px',marginRight:4}}/>Alle tijden volgen de Nederlandse clubtijd.</small><div className="cms-training-modal-actions"><button type="button" className="cms-button" onClick={()=>setDraft(null)}>Annuleren</button><button type="submit" className="cms-button primary" disabled={!canModify(draft.activity)||busy||saving||checking||checkedKey!==draftKey||!!serverErrors.length||!!preview.errors.length}><Check size={15}/>{preview.activities.length||''} training{preview.activities.length===1?'':'en'} plannen</button></div></footer></form>}
    </Modal>

    <Modal open={!!activeDeletion} onOpenChange={open=>{if(!open&&!busy&&!saving)setDeleteId(null);}} title="Training verwijderen" description="Kies precies welke momenten uit de planning verdwijnen." confirm>
      {activeDeletion&&<><div className="cms-training-confirm-body"><p><strong>{activeDeletion.title}</strong><br/>{displayDate(activeDeletion.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · {activeDeletion.startTime}–{activeDeletion.endTime}</p><div className="cms-training-delete-options"><label><input type="radio" name="training-delete-scope" checked={deleteScope==='one'} onChange={()=>setDeleteScope('one')}/><span><strong>Alleen deze training</strong><small>Verwijder dit ene moment op {displayDate(activeDeletion.date)}.</small></span></label>{activeDeletion.seriesId&&<label><input type="radio" name="training-delete-scope" checked={deleteScope==='series'} onChange={()=>setDeleteScope('series')}/><span><strong>De hele trainingsreeks</strong><small>Alle {trainings.filter(activity=>activity.seriesId===activeDeletion.seriesId).length} resterende momenten in deze reeks, ook eerder ingeplande datums.</small></span></label>}</div><div className="cms-training-delete-warning">Je verwijdert <strong>{deletionItems.length} trainingsmoment{deletionItems.length===1?'':'en'}</strong>{deletionItems.length>1?` van ${displayDate(deletionDates[0],{day:'numeric',month:'short',year:'numeric'})} t/m ${displayDate(deletionDates[deletionDates.length-1],{day:'numeric',month:'short',year:'numeric'})}`:''}. De bijbehorende locaties komen vrij. De momenten worden naar de prullenbak verplaatst; de historie blijft bewaard.</div>{!deletionItems.every(canModify)&&<p className="cms-training-preview-error" role="alert">Je hebt onvoldoende rechten om alle gekozen momenten te verwijderen.</p>}{deleteError&&<p className="cms-training-preview-error" role="alert">{deleteError}</p>}</div><footer className="cms-training-modal-foot"><div className="cms-training-modal-actions"><button type="button" className="cms-button" onClick={()=>setDeleteId(null)}>Annuleren</button><button type="button" className="cms-button danger" disabled={busy||saving||!deletionItems.length||!deletionItems.every(canModify)} onClick={deleteTraining}><Trash2 size={15}/>{deletionItems.length} moment{deletionItems.length===1?'':'en'} verwijderen</button></div></footer></>}
    </Modal>
  </div>;
}

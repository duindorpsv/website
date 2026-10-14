'use client';

import {useState,type FormEvent,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,ChevronRight,ClipboardCheck,Mail,Plus,Search,Trash2,UserRound} from 'lucide-react';
import {useCMS} from './provider';
import {now,uid} from '@/lib/cms/model';
import {createSubmissionSnapshot,filterSubmissions,formKindLabels,statusesForFormKind,submissionLabels} from '@/lib/cms/forms';
import type {CmsDepartment,CmsForm,FormKind,SubmissionStatus} from '@/lib/cms/types';
import './admin.css';

type View='inbox'|'departments'|'forms'|'test';
const KINDS:FormKind[]=['contact','registration','request'];
const KIND_ICONS={contact:Mail,registration:UserRound,request:ClipboardCheck};
const emailValid=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const displayDate=(value:string)=>new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const clone=<T,>(value:T):T=>structuredClone(value);
function Note({children}:{children:ReactNode}){return <div className="cms-admin-note">{children}</div>}
function ErrorMessage({message}:{message:string}){return message?<p className="cms-admin-error" role="alert">{message}</p>:null}
function Empty({children}:{children:ReactNode}){return <div className="cms-empty">{children}</div>}
function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="cms-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function CheckField({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){return <label className="cms-admin-check"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>}

export function FormsManager(){
  const {state,update,can,notify}=useCMS();
  const [kind,setKind]=useState<FormKind>('contact');
  const [tab,setTab]=useState<View>('inbox');
  const [department,setDepartment]=useState<CmsDepartment|null>(null);
  const [form,setForm]=useState<CmsForm|null>(null);
  const [recipients,setRecipients]=useState('');
  const [error,setError]=useState('');
  const [selectedSubmission,setSelectedSubmission]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [formFilter,setFormFilter]=useState('');
  const [departmentFilter,setDepartmentFilter]=useState('');
  const [inboxSearch,setInboxSearch]=useState('');
  const [note,setNote]=useState('');
  const [testFormId,setTestFormId]=useState('');
  const [testDepartmentId,setTestDepartmentId]=useState('');
  const [testValues,setTestValues]=useState<Record<string,string>>({});
  const [confirmDelete,setConfirmDelete]=useState(false);
  const editable=can('forms');
  const labels=formKindLabels[kind];
  const Icon=KIND_ICONS[kind];
  const submissions=filterSubmissions(state.submissions,{kind,formId:formFilter,departmentId:departmentFilter,status:statusFilter,query:inboxSearch});
  const selected=submissions.find(s=>s.id===selectedSubmission);
  const forms=state.forms.filter(f=>f.kind===kind);
  const activeForms=forms.filter(f=>f.active);
  const testForm=activeForms.find(f=>f.id===testFormId)||activeForms[0];
  const effectiveDepartment=testDepartmentId||testForm?.departmentId||'';
  const originalForm=state.forms.find(f=>f.id===form?.id);
  const hasExistingSubmissions=!!form&&state.submissions.some(s=>s.formId===form.id);
  // Include historical form names even after a form is renamed or moved to a different type.
  const filterForms=[...new Map([...forms.map(f=>[f.id,f.name] as const),...state.submissions.filter(s=>s.kind===kind).map(s=>[s.formId,s.formName] as const)]).entries()];

  function clearFilters(){setStatusFilter('');setFormFilter('');setDepartmentFilter('');setInboxSearch('')}
  function chooseKind(next:FormKind){setKind(next);setTab('inbox');setForm(null);setError('');setSelectedSubmission('');setNote('');setConfirmDelete(false);setTestFormId('');setTestDepartmentId('');setTestValues({});clearFilters()}
  function chooseSubmission(id:string){const entry=state.submissions.find(s=>s.id===id);setSelectedSubmission(id);setNote(entry?.note||'');setConfirmDelete(false)}
  function addForm(){
    setForm({id:uid('form'),kind,name:'',departmentId:state.departments.find(d=>d.active)?.id||'',active:true,retentionDays:90,fields:[
      {id:uid('field'),label:'Naam',type:'text',required:true},
      {id:uid('field'),label:'E-mailadres',type:'email',required:true},
      {id:uid('field'),label:kind==='contact'?'Bericht':'Toelichting',type:'textarea',required:kind==='contact'},
    ]});setError('');setTab('forms');
  }
  function saveDepartment(e:FormEvent){
    e.preventDefault();if(!department||!editable)return;
    const emails=recipients.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
    if(!department.name.trim()||!emails.length||emails.some(e=>!emailValid(e))){setError('Vul een afdelingsnaam en minimaal één geldig e-mailadres in. Scheid adressen met komma’s.');return}
    if(state.departments.some(d=>d.id!==department.id&&d.name.toLowerCase()===department.name.trim().toLowerCase())){setError('Er bestaat al een afdeling met deze naam.');return}
    if(!department.active&&state.forms.some(f=>f.departmentId===department.id&&f.active)){setError('Deze afdeling is nog aan een actief formulier gekoppeld. Kies eerst in dat formulier een andere afdeling of maak het inactief.');return}
    const next={...clone(department),name:department.name.trim(),emails:[...new Set(emails)]};
    if(update(s=>{const index=s.departments.findIndex(d=>d.id===next.id);if(index<0)s.departments.push(next);else s.departments[index]=next},`Afdeling opgeslagen: ${next.name}`)){setDepartment(next);setError('');notify('Afdeling en routering opgeslagen voor de toekomstige e-mailkoppeling.')}
  }
  function saveForm(e:FormEvent){
    e.preventDefault();if(!form||!editable)return;
    if(!form.name.trim()||!state.departments.some(d=>d.id===form.departmentId)){setError('Vul een formuliernaam in en kies een afdeling.');return}
    if(form.active&&!state.departments.find(d=>d.id===form.departmentId)?.active){setError('Een actief formulier heeft een actieve standaardafdeling nodig.');return}
    if(!form.fields.length||form.fields.some(f=>!f.label.trim())){setError('Voeg minimaal één veld toe en geef ieder veld een label.');return}
    if(!Number.isInteger(form.retentionDays)||form.retentionDays<1||form.retentionDays>3650){setError('Kies een bewaartermijn van 1 tot 3650 hele dagen.');return}
    const next={...clone(form),name:form.name.trim(),fields:form.fields.map(f=>({...f,label:f.label.trim()}))};
    if(update(s=>{const index=s.forms.findIndex(f=>f.id===next.id);if(index<0)s.forms.push(next);else s.forms[index]=next},`Formulier opgeslagen: ${next.name}`)){setForm(next);setKind(next.kind);clearFilters();setError('');notify(`Formulier opgeslagen onder ${formKindLabels[next.kind].plural.toLowerCase()}. Bestaande inzendingen blijven behouden.`)}
  }
  function moveField(index:number,direction:number){if(!form)return;const fields=[...form.fields];const target=index+direction;if(target<0||target>=fields.length)return;[fields[index],fields[target]]=[fields[target],fields[index]];setForm({...form,fields})}
  function testSubmit(e:FormEvent){
    e.preventDefault();if(!editable||!testForm)return;
    const dept=state.departments.find(d=>d.id===effectiveDepartment&&d.active);
    if(!dept){setError('Kies een actieve afdeling.');return}
    if(testForm.fields.some(f=>f.required&&!testValues[f.id]?.trim())){setError('Vul alle verplichte velden in.');return}
    if(testForm.fields.some(f=>f.type==='email'&&testValues[f.id]&&!emailValid(testValues[f.id].trim()))){setError('Controleer het e-mailadres.');return}
    const submission=createSubmissionSnapshot(testForm,testValues,{id:uid('submission'),departmentId:dept.id,createdAt:now(),demo:true});
    if(update(s=>{s.submissions.push(submission)},`Test${formKindLabels[testForm.kind].singular.toLowerCase()} toegevoegd: ${testForm.name}`)){
      setTestValues({});setError('');setSelectedSubmission(submission.id);setNote('');setConfirmDelete(false);clearFilters();setKind(testForm.kind);setTab('inbox');
      notify(`Test opgeslagen bij ${formKindLabels[testForm.kind].plural.toLowerCase()}. Er is geen e-mail verstuurd.`);
    }
  }
  function setSubmissionStatus(status:SubmissionStatus){
    if(!editable||!selected||!statusesForFormKind(selected.kind).includes(status))return;
    if(update(s=>{const entry=s.submissions.find(x=>x.id===selected.id);if(entry)entry.status=status},`${formKindLabels[selected.kind].singular}: ${submissionLabels[status]}`))notify('Status opgeslagen.');
  }

  return <div className="cms-admin cms-forms-manager">
    <div className="cms-toolbar"><div><h2>Contact, aanmeldingen & aanvragen</h2><p>Een eigen overzicht en opvolging voor elk soort formulier. Contactvragen blijven gescheiden van inschrijvingen.</p></div></div>
    <Note>Dit concept bewaart inzendingen lokaal. E-mailverzending, echte bezoekersinzendingen en Sportlink-aanmeldingen worden op de VPS aangesloten. Gebruik hier fictieve testgegevens.</Note>
    <div className="cms-form-streams" aria-label="Soort inzending">
      {KINDS.map(stream=>{
        const StreamIcon=KIND_ICONS[stream];
        const entries=state.submissions.filter(s=>s.kind===stream);
        const newCount=entries.filter(s=>s.status==='new').length;
        return <button key={stream} type="button" aria-pressed={kind===stream} className={`cms-form-stream ${kind===stream?'active':''}`} onClick={()=>chooseKind(stream)}>
          <span className="cms-form-stream-icon"><StreamIcon size={20}/></span>
          <span className="cms-form-stream-copy"><strong>{formKindLabels[stream].plural}</strong><small>{formKindLabels[stream].description}</small><span>{entries.length} ontvangen <b>{newCount} nieuw</b></span></span>
        </button>;
      })}
    </div>
    <nav className="cms-admin-tabs" aria-label={`Beheer ${labels.plural.toLowerCase()}`}>
      {([{id:'inbox',label:labels.plural},{id:'forms',label:'Formulieren'},{id:'departments',label:'Afdelingen'},{id:'test',label:'Testformulier'}] as const).map(t=><button type="button" aria-current={tab===t.id?'page':undefined} key={t.id} onClick={()=>{setTab(t.id);setError('')}}>{t.label}{t.id==='forms'&&<span>{forms.length}</span>}</button>)}
    </nav>

    {tab==='inbox'&&<>
      <div className="cms-admin-filters cms-form-inbox-filters">
        <label className="cms-admin-search"><Search size={17}/><input aria-label={`Zoek in ${labels.plural.toLowerCase()}`} placeholder={`Zoek in ${labels.plural.toLowerCase()}`} value={inboxSearch} onChange={e=>setInboxSearch(e.target.value)}/></label>
        <select aria-label="Filter op formulier" value={formFilter} onChange={e=>setFormFilter(e.target.value)}><option value="">Alle formulieren</option>{filterForms.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Filter op afdeling" value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}><option value="">Alle afdelingen</option>{state.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select aria-label="Filter op status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Alle statussen</option>{statusesForFormKind(kind).map(status=><option key={status} value={status}>{submissionLabels[status]}</option>)}</select>
        {(inboxSearch||formFilter||departmentFilter||statusFilter)&&<button type="button" className="cms-button" onClick={clearFilters}>Filters wissen</button>}
      </div>
      <div className="cms-admin-split">
        <div className="cms-panel cms-admin-list">
          <div className="cms-admin-list-heading"><h3>{labels.plural}</h3><span className="cms-meta">{submissions.length} gevonden</span></div>
          {submissions.length?submissions.map(s=><button key={s.id} className={`cms-admin-inbox-row ${s.id===selectedSubmission?'selected':''}`} onClick={()=>chooseSubmission(s.id)}>
            <span className="cms-admin-inbox-top"><strong>{s.name}</strong><span className={`cms-submission-status status-${s.status}`}>{submissionLabels[s.status]}</span></span>
            <span className="cms-form-source">{s.formName}</span>
            <span>{s.answers.find(answer=>answer.type==='textarea')?.value.slice(0,90)||s.email||'Bekijk ingevulde gegevens'}</span>
            <small>{state.departments.find(d=>d.id===s.departmentId)?.name||'Onbekende afdeling'} · {displayDate(s.createdAt)}</small>
          </button>):<Empty><Icon size={30}/><h3>Geen {labels.plural.toLowerCase()} gevonden</h3><p>{inboxSearch||formFilter||departmentFilter||statusFilter?'Pas je filters aan om andere inzendingen te zien.':`Test een ${labels.singular.toLowerCase()} via Testformulier. Het verschijnt alleen in dit overzicht.`}</p></Empty>}
        </div>
        <div className="cms-panel">{selected?<div className="cms-admin-editor">
          <div className="cms-admin-editor-heading"><div><span className="cms-meta">{formKindLabels[selected.kind].singular}{selected.demo?' · Testinzending':''}</span><h3>{selected.name}</h3><p>{selected.email}</p></div><span className="cms-meta">{displayDate(selected.createdAt)}</span></div>
          <p className="cms-admin-recipient"><strong>Ingediend formulier:</strong> {selected.formName}<br/><strong>Afdeling:</strong> {state.departments.find(d=>d.id===selected.departmentId)?.name||'—'}<br/><strong>Huidige e-mailroutering:</strong> {state.departments.find(d=>d.id===selected.departmentId)?.emails.join(', ')||'—'}</p>
          <h4 className="cms-submitted-title">Ingevulde gegevens</h4>
          {selected.answers.length?<dl className="cms-submitted-answers">{selected.answers.map((answer,index)=><div key={`${answer.fieldId}-${index}`}><dt>{answer.label}</dt><dd>{answer.value||'Niet ingevuld'}</dd></div>)}</dl>:<div className="cms-admin-message">{selected.message||'Geen ingevulde gegevens beschikbaar'}</div>}
          <p className="cms-meta cms-submission-snapshot-note">Dit is de formulierinhoud op het moment van indienen. Latere formulierwijzigingen veranderen deze gegevens niet.</p>
          <Field label="Status"><select disabled={!editable} value={selected.status} onChange={e=>setSubmissionStatus(e.target.value as SubmissionStatus)}>{statusesForFormKind(selected.kind).map(status=><option key={status} value={status}>{submissionLabels[status]}</option>)}</select></Field>
          <Field label="Interne notitie" hint="Alleen zichtbaar in dit beheerconcept; wordt niet naar de afzender verzonden."><textarea disabled={!editable} rows={3} value={note} onChange={e=>setNote(e.target.value)}/></Field>
          <div className="cms-admin-actions"><button className="cms-button primary" disabled={!editable} onClick={()=>{if(update(s=>{const entry=s.submissions.find(x=>x.id===selected.id);if(entry)entry.note=note},`Interne notitie opgeslagen: ${selected.name}`))notify('Interne notitie opgeslagen.')}}>Notitie opslaan</button><button className="cms-button danger" disabled={!editable} onClick={()=>setConfirmDelete(!confirmDelete)}><Trash2 size={15}/>Verwijderen</button></div>
          {confirmDelete&&<Note>Deze lokale {formKindLabels[selected.kind].singular.toLowerCase()} definitief verwijderen?<div className="cms-admin-actions"><button className="cms-button danger" disabled={!editable} onClick={()=>{if(!editable)return;if(update(s=>{s.submissions=s.submissions.filter(x=>x.id!==selected.id)},'Lokale inzending verwijderd')){setSelectedSubmission('');setConfirmDelete(false);notify('Inzending verwijderd.')}}}>Definitief verwijderen</button><button className="cms-button" onClick={()=>setConfirmDelete(false)}>Annuleren</button></div></Note>}
        </div>:<Empty><Icon size={34}/><h3>{labels.singular} opvolgen</h3><p>Selecteer een {labels.singular.toLowerCase()} om de ingevulde gegevens te bekijken en de status bij te werken.</p></Empty>}</div>
      </div>
    </>}

    {tab==='departments'&&<>
      <p className="cms-meta cms-form-section-hint">Afdelingen worden gedeeld door alle formuliertypen. Per formulier bepaal je welke afdeling de inzending ontvangt.</p>
      <div className="cms-admin-split"><div className="cms-panel cms-admin-list"><div className="cms-admin-list-heading"><h3>Afdelingen</h3><button className="cms-button" disabled={!editable} onClick={()=>{setDepartment({id:uid('department'),name:'',description:'',emails:[],active:true,confirmation:'Bedankt voor je inzending. We nemen zo snel mogelijk contact met je op.'});setRecipients('');setError('')}}><Plus size={16}/>Toevoegen</button></div>
        {state.departments.map(d=><button key={d.id} className={`cms-admin-person-row ${department?.id===d.id?'selected':''}`} onClick={()=>{setDepartment(clone(d));setRecipients(d.emails.join(', '));setError('')}}><span><strong>{d.name}</strong><small>{d.active?'Actief':'Inactief'} · {d.emails.length} ontvanger{d.emails.length!==1?'s':''}</small></span><ChevronRight size={16}/></button>)}
      </div><div className="cms-panel">{department?<form onSubmit={saveDepartment} className="cms-admin-editor"><h3>{department.name||'Nieuwe afdeling'}</h3><fieldset disabled={!editable}>
        <Field label="Naam afdeling"><input required value={department.name} onChange={e=>setDepartment({...department,name:e.target.value})}/></Field>
        <Field label="Omschrijving"><input value={department.description} onChange={e=>setDepartment({...department,description:e.target.value})}/></Field>
        <Field label="E-mailontvangers" hint="Meerdere adressen scheiden met een komma. Er wordt nog niets verstuurd."><textarea required rows={2} value={recipients} onChange={e=>setRecipients(e.target.value)}/></Field>
        <Field label="Bevestigingstekst voor de bezoeker"><textarea rows={4} value={department.confirmation} onChange={e=>setDepartment({...department,confirmation:e.target.value})}/></Field>
        <CheckField label="Afdeling actief" checked={department.active} onChange={active=>setDepartment({...department,active})}/>
        {!department.active&&state.forms.some(f=>f.departmentId===department.id&&f.active)&&<Note>Deze afdeling wordt gebruikt door een actief formulier. Kies in dat formulier een andere actieve afdeling.</Note>}
      </fieldset><ErrorMessage message={error}/><button className="cms-button primary" disabled={!editable}>Afdeling opslaan</button></form>:<Empty><Mail size={34}/><h3>Een duidelijk aanspreekpunt</h3><p>Kies een afdeling of voeg er één toe.</p></Empty>}</div></div>
    </>}

    {tab==='forms'&&<>
      <p className="cms-meta cms-form-section-hint">Formulieren voor {labels.plural.toLowerCase()}. Het formuliertype bepaalt in welk overzicht nieuwe inzendingen terechtkomen.</p>
      <div className="cms-admin-split"><div className="cms-panel cms-admin-list"><div className="cms-admin-list-heading"><h3>{labels.plural}</h3><button className="cms-button" disabled={!editable} onClick={addForm}><Plus size={16}/>Formulier</button></div>
        {forms.length?forms.map(f=><button key={f.id} className={`cms-admin-person-row ${form?.id===f.id?'selected':''}`} onClick={()=>{setForm(clone(f));setError('')}}><span><strong>{f.name}</strong><small>{formKindLabels[f.kind].singular} · {f.active?'Actief':'Inactief'} · {f.fields.length} velden</small></span><ChevronRight size={16}/></button>):<Empty><Icon size={30}/><h3>Nog geen formulier</h3><p>Voeg een formulier toe voor {labels.plural.toLowerCase()}.</p><button className="cms-button" disabled={!editable} onClick={addForm}><Plus size={15}/>Formulier toevoegen</button></Empty>}
      </div><div className="cms-panel">{form?<form onSubmit={saveForm} className="cms-admin-editor"><h3>{form.name||'Nieuw formulier'}</h3><fieldset disabled={!editable}>
        <Field label="Formuliertype *" hint="Bepaalt het ontvangstoverzicht en de beschikbare opvolgstatussen."><select required value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as FormKind})}>{KINDS.map(k=><option key={k} value={k}>{formKindLabels[k].singular}</option>)}</select></Field>
        {hasExistingSubmissions&&originalForm?.kind!==form.kind&&<Note>Deze wijziging geldt voor nieuwe inzendingen. Eerdere inzendingen blijven in hun oorspronkelijke overzicht staan, inclusief de toen ingevulde gegevens.</Note>}
        <div className="cms-admin-two"><Field label="Formuliernaam"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Standaardafdeling"><select required value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}><option value="">Kies een afdeling</option>{state.departments.map(d=><option key={d.id} value={d.id}>{d.name}{!d.active?' (inactief)':''}</option>)}</select></Field></div>
        <div className="cms-admin-subheading"><h4>Formuliervelden</h4><button type="button" className="cms-button" onClick={()=>setForm({...form,fields:[...form.fields,{id:uid('field'),label:'Nieuw veld',type:'text',required:false}]})}><Plus size={14}/>Veld toevoegen</button></div>
        <div className="cms-admin-formfields">{form.fields.map((field,index)=><div key={field.id} className="cms-admin-formfield"><div className="cms-admin-formfield-main"><Field label={`Veld ${index+1}`}><input value={field.label} onChange={e=>setForm({...form,fields:form.fields.map(f=>f.id===field.id?{...f,label:e.target.value}:f)})}/></Field><Field label="Type"><select value={field.type} onChange={e=>setForm({...form,fields:form.fields.map(f=>f.id===field.id?{...f,type:e.target.value as typeof field.type}:f)})}><option value="text">Korte tekst</option><option value="textarea">Lange tekst</option><option value="email">E-mailadres</option><option value="tel">Telefoon</option></select></Field></div><div className="cms-admin-actions"><CheckField label="Verplicht" checked={field.required} onChange={required=>setForm({...form,fields:form.fields.map(f=>f.id===field.id?{...f,required}:f)})}/><button type="button" className="cms-button" aria-label={`Verplaats ${field.label} omhoog`} disabled={index===0} onClick={()=>moveField(index,-1)}><ArrowUp size={14}/></button><button type="button" className="cms-button" aria-label={`Verplaats ${field.label} omlaag`} disabled={index===form.fields.length-1} onClick={()=>moveField(index,1)}><ArrowDown size={14}/></button><button type="button" className="cms-button danger" aria-label={`Verwijder veld ${field.label}`} onClick={()=>setForm({...form,fields:form.fields.filter(f=>f.id!==field.id)})}><Trash2 size={14}/></button></div></div>)}</div>
        <Field label="Bewaartermijn in dagen" hint="Voorbereiding voor de VPS. In dit concept worden inzendingen niet automatisch verwijderd."><input type="number" min={1} max={3650} step={1} value={form.retentionDays} onChange={e=>setForm({...form,retentionDays:Number(e.target.value)})}/></Field>
        <CheckField label="Formulier actief" checked={form.active} onChange={active=>setForm({...form,active})}/>
      </fieldset><ErrorMessage message={error}/><button className="cms-button primary" disabled={!editable}>Formulier opslaan</button></form>:<Empty><Icon size={34}/><h3>Stel de juiste vraag</h3><p>Kies een formulier om het type, de velden en de afdeling in te richten.</p></Empty>}</div></div>
    </>}

    {tab==='test'&&<div className="cms-panel cms-admin-test"><div><span className="cms-meta">VOORBEELDWEERGAVE · {labels.singular.toUpperCase()}</span><h3>Probeer een {labels.singular.toLowerCase()}</h3><p>Vul fictieve gegevens in. Je inzending verschijnt bij <strong>{labels.plural.toLowerCase()}</strong>.</p></div>
      {testForm?<form onSubmit={testSubmit} className="cms-admin-editor"><fieldset disabled={!editable}>
        <Field label="Formulier"><select value={testForm.id} onChange={e=>{setTestFormId(e.target.value);setTestDepartmentId('');setTestValues({});setError('')}}>{activeForms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
        <Field label="Afdeling"><select value={effectiveDepartment} onChange={e=>setTestDepartmentId(e.target.value)}><option value="">Kies een afdeling</option>{state.departments.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        {testForm.fields.map(f=><Field key={f.id} label={`${f.label}${f.required?' *':''}`}>{f.type==='textarea'?<textarea required={f.required} rows={4} value={testValues[f.id]||''} onChange={e=>setTestValues({...testValues,[f.id]:e.target.value})}/>:<input required={f.required} type={f.type} value={testValues[f.id]||''} placeholder={f.type==='email'?'voorbeeld@example.com':''} onChange={e=>setTestValues({...testValues,[f.id]:e.target.value})}/>}</Field>)}
      </fieldset><ErrorMessage message={error}/><button className="cms-button primary" disabled={!editable}>Test{labels.singular.toLowerCase()} opslaan</button></form>:<Empty><Icon size={30}/><h3>Nog geen actief formulier</h3><p>Maak een formulier voor {labels.plural.toLowerCase()} aan om het hier te testen.</p><button className="cms-button" disabled={!editable} onClick={addForm}><Plus size={15}/>Formulier toevoegen</button></Empty>}
    </div>}
  </div>;
}

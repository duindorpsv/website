'use client';
import {useEffect,useState} from 'react';
import {ChevronRight,FileText,Inbox,Plus,Save,Send} from 'lucide-react';
import {Pagination,usePagination} from './pagination';
import {useCMS,CmsProvider} from './provider';
import {PublicForm} from './public-form';
import {formDefinitionErrors} from '@/lib/cms/form-definition';
import {formKindLabels} from '@/lib/cms/forms';
import type {CmsForm,FormField,FormFieldType,FormKind} from '@/lib/cms/types';
import styles from './forms-manager.module.css';

const fieldTypes:[FormFieldType,string][]=[['text','Korte tekst'],['textarea','Lange tekst'],['email','E-mailadres'],['tel','Telefoonnummer'],['date','Datum'],['select','Keuzelijst'],['radio','Keuzerondjes'],['checkbox','Selectievakje'],['consent','Toestemming']];
export function FormDefinitions({onResults}:{onResults:(form:CmsForm)=>void}){
 const {state,can,update}=useCMS();
 const [form,setForm]=useState<CmsForm|null>(null),[query,setQuery]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[expandedField,setExpandedField]=useState('');
 const editable=can('forms'),publish=can('publish','','forms');
 useEffect(()=>{const id=new URLSearchParams(location.search).get('formulier'),existing=state.forms.find(item=>item.id===id);if(existing&&!form)setForm(structuredClone(existing));},[state.forms,form]);
 const patch=(value:Partial<CmsForm>)=>setForm(current=>current?{...current,...value}:current);
 const field=(index:number,value:Partial<FormField>)=>{if(form)patch({fields:form.fields.map((item,i)=>i===index?{...item,...value}:item)});};
 function choose(item:CmsForm){setForm(structuredClone(item));setExpandedField('');setMessage('');}
 function create(){setMessage('');setExpandedField('name');setForm({id:crypto.randomUUID(),kind:'contact',name:'Nieuw formulier',departmentId:state.departments.find(item=>item.id==='secretariaat')?.id||state.departments.find(item=>item.active)?.id||'',active:true,retentionDays:90,fields:[{id:'name',label:'Naam',type:'text',required:true},{id:'email',label:'E-mailadres',type:'email',required:true},{id:'message',label:'Bericht',type:'textarea',required:true}]});}
 async function save(publication:boolean){
  if(!form||busy)return;
  if(publication){const errors=formDefinitionErrors(form);if(errors.length){setMessage(errors.join(' '));return;}}
  setBusy(true);setMessage('');try{const ok=await update(next=>{const index=next.forms.findIndex(item=>item.id===form.id);if(index<0)next.forms.push(form);else next.forms[index]=form;},publication?'Formulier gepubliceerd':'Formulierconcept bewaard',publication?{[form.id]:{action:'publish'}}:undefined);if(ok){if(publication)setForm(current=>current?.id===form.id?{...current,published:true}:current);setMessage(publication?'Het formulier is gepubliceerd. Kies het in het formulierblok van je pagina.':'Concept bewaard. Publiceer wanneer het formulier klaar is.');}}finally{setBusy(false);}
 }
 function addField(){if(!form)return;const id=crypto.randomUUID();patch({fields:[...form.fields,{id,label:'Nieuw veld',type:'text',required:false}]});setExpandedField(id);}
 function moveField(index:number,direction:number){if(!form)return;const fields=[...form.fields];[fields[index+direction],fields[index]]=[fields[index],fields[index+direction]];patch({fields});}
 const matches=state.forms.filter(item=>`${item.name} ${formKindLabels[item.kind].plural}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl'))),pagination=usePagination(matches,query);
 return <><div className={styles.toolbar}><label className="cms-field">Formulieren zoeken<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Zoek op naam of soort formulier"/></label><button type="button" className="cms-button primary" disabled={!editable||busy} onClick={create}><Plus size={15}/>Nieuw formulier</button></div>
 <div className={styles.workspace}>
  <aside className={styles.library}><div className={styles.panelHead}><div><h3>Formulieren</h3><p>{matches.length} gevonden</p></div><FileText size={19}/></div><div className={styles.recordList}>{pagination.items.map(item=><section key={item.id}><button type="button" className={styles.record} disabled={busy} aria-pressed={form?.id===item.id} onClick={()=>choose(item)}><strong>{item.name}</strong><small>{formKindLabels[item.kind].plural} · {state.departments.find(department=>department.id===item.departmentId)?.name||'Geen afdeling'}</small><span className={styles.badge} data-live={!!item.published}>{item.published?'Gepubliceerd':'Concept'}{!item.active?' · Uitgeschakeld':''}</span></button><div className={styles.recordActions}><button type="button" className="cms-button" disabled={busy} onClick={()=>onResults(item)}><Inbox size={13}/>Inzendingen bekijken</button></div></section>)}{!matches.length&&<div className={styles.empty}><FileText size={28}/><h3>Geen formulieren gevonden</h3><p>Pas je zoekopdracht aan of maak een nieuw formulier.</p></div>}</div><Pagination label="Formulieren" {...pagination} disabled={busy}/></aside>
  <section className={styles.editor}>{form?<>
   <div className={styles.panelHead}><div><h3>{form.name||'Formulier bewerken'}</h3><p>Voeg dit formulier na publicatie via het blok ‘Formulier’ aan een pagina toe.</p></div><span className={styles.badge} data-live={!!form.published}>{form.published?'Gepubliceerd':'Concept'}</span></div>
   <fieldset className={styles.settings} disabled={!editable||busy}>
    <label className="cms-field">Formuliernaam<input aria-label="Formuliernaam" value={form.name} maxLength={160} onChange={event=>patch({name:event.target.value})}/></label>
    <div className={styles.settingsGrid}><label className="cms-field">Soort formulier<select aria-label="Soort formulier" value={form.kind} onChange={event=>patch({kind:event.target.value as FormKind})}>{(['contact','registration','request'] as FormKind[]).map(kind=><option key={kind} value={kind}>{formKindLabels[kind].plural}</option>)}</select></label>
    <label className="cms-field">Ontvangende afdeling<select aria-label="Ontvangende afdeling" value={form.departmentId} onChange={event=>patch({departmentId:event.target.value})}><option value="">Kies een afdeling</option>{state.departments.filter(item=>item.active||item.id===form.departmentId).map(department=><option key={department.id} value={department.id}>{department.name}{!department.active?' (uitgeschakeld)':''}</option>)}</select></label>
    {form.kind==='registration'&&<label className="cms-field">Soort aanmelding<select aria-label="Soort aanmelding" value={form.registrationPurpose||'activity'} onChange={event=>patch({registrationPurpose:event.target.value as CmsForm['registrationPurpose']})}><option value="activity">Clubactiviteit</option><option value="volunteer">Vrijwilliger</option><option value="membership">Lidmaatschap</option></select></label>}
    <label className="cms-field">Bewaartermijn (dagen)<input aria-label="Bewaartermijn (dagen)" type="number" min={0} value={form.retentionDays} onChange={event=>patch({retentionDays:Number(event.target.value)})}/><small>0 betekent dat inzendingen niet automatisch verlopen.</small></label></div>
    <label className={styles.check}><input type="checkbox" checked={form.active} onChange={event=>patch({active:event.target.checked})}/>Formulier beschikbaar na publicatie</label>
    <div className={styles.fieldsHead}><h4>Formuliervelden</h4><span>{form.fields.length} van maximaal 60</span></div>
    {form.fields.map((item,index)=><details className={styles.fieldCard} key={item.id} open={expandedField===item.id}><summary onClick={event=>{event.preventDefault();setExpandedField(expandedField===item.id?'':item.id);}}><ChevronRight size={14}/><span>{index+1}. {item.label||'Nieuw veld'}</span><small>{fieldTypes.find(([type])=>type===item.type)?.[1]}{item.required?' · Verplicht':''}</small></summary><div className={styles.fieldBody}>
     <label className="cms-field">Label<input aria-label="Label" value={item.label} onChange={event=>field(index,{label:event.target.value})}/></label>
     <div className={styles.settingsGrid}><label className="cms-field">Onderdeel / tussenkop<input value={item.section||''} onChange={event=>field(index,{section:event.target.value})}/></label><label className="cms-field">Veldtype<select aria-label="Veldtype" value={item.type} onChange={event=>field(index,{type:event.target.value as FormFieldType})}>{fieldTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
     {['select','radio'].includes(item.type)&&<label className="cms-field">Keuzes (één per regel)<textarea aria-label="Keuzes (één per regel)" value={item.options?.join('\n')||''} onChange={event=>field(index,{options:event.target.value.split('\n')})}/></label>}
     <label className={styles.check}><input type="checkbox" checked={item.required} onChange={event=>field(index,{required:event.target.checked})}/>Verplicht veld</label>
     {item.condition&&<p className="cms-meta">Dit veld verschijnt afhankelijk van ‘{form.fields.find(source=>source.id===item.condition?.fieldId)?.label}’.</p>}
     <div className={styles.actions}><button type="button" className="cms-button" disabled={index===0} onClick={()=>moveField(index,-1)}>Omhoog</button><button type="button" className="cms-button" disabled={index===form.fields.length-1} onClick={()=>moveField(index,1)}>Omlaag</button><button type="button" className="cms-button danger" onClick={()=>patch({fields:form.fields.filter((_,i)=>i!==index)})}>Veld verwijderen</button></div>
    </div></details>)}
    <button type="button" className="cms-button" disabled={form.fields.length>=60} onClick={addField}><Plus size={14}/>Veld toevoegen</button>
   </fieldset>
   <div className={`${styles.actions} ${styles.editorActions}`}><button type="button" className="cms-button" disabled={!editable||busy} onClick={()=>save(false)}><Save size={14}/>Concept bewaren</button><button type="button" className="cms-button primary" disabled={!editable||!publish||busy} onClick={()=>save(true)}><Send size={14}/>{busy?'Opslaan…':'Opslaan en publiceren'}</button><button type="button" className="cms-button" disabled={busy} onClick={()=>onResults(form)}><Inbox size={14}/>Inzendingen bekijken</button></div>
   <details className={styles.preview}><summary>Formulier bekijken</summary><div className={styles.previewContent}><CmsProvider key={JSON.stringify(form)} initialState={{...state,forms:[{...form,active:true}]}} preview><PublicForm formId={form.id}/></CmsProvider></div></details>
  </>:<div className={styles.empty}><FileText size={34}/><h3>Een formulier voor de club</h3><p>Kies links een formulier om het te bewerken of maak een nieuw formulier. Inzendingen blijven apart bewaard.</p><button type="button" className="cms-button primary" disabled={!editable} onClick={create}><Plus size={14}/>Formulier toevoegen</button></div>}{message&&<p className={styles.message} role="status">{message}</p>}</section>
 </div></>;
}

'use client';
import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import type {CmsForm} from '@/lib/cms/types';
import {contextualContactForm,submittedFormValues,todayInAmsterdam,validateFormValues,visibleFormFields} from '@/lib/cms/form-validation';
import {useCMS} from './provider';
import styles from './public-form.module.css';

export function PublicForm({formId,showTitle=true,contextMessage=''}:{formId:string;showTitle?:boolean;contextMessage?:string}){
  const {state,preview}=useCMS(),[contactId,setContactId]=useState('contact');
  useEffect(()=>{if(!preview&&formId==='contact')setContactId(contextualContactForm(location.search));},[formId,preview]);
  const target=formId==='contact'?contactId:formId,form=state.forms.find(item=>item.id===target&&item.active);
  return form?<FormContent key={form.id} form={form} preview={preview} showTitle={showTitle} contextMessage={contextMessage}/>:<p>Dit formulier is tijdelijk niet beschikbaar.</p>;
}
function FormContent({form,preview,showTitle,contextMessage}:{form:CmsForm;preview:boolean;showTitle:boolean;contextMessage:string}){
  const prefix=useId(),operation=useRef({id:'',payload:''});
  const [values,setValues]=useState<Record<string,string>>({}),[honeypot,setHoneypot]=useState(''),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{text:string;error:boolean}|null>(null),[errors,setErrors]=useState<Record<string,string>>({});
  const fields=visibleFormFields(form,values),groups=[...new Set(fields.map(field=>field.section||''))];
  function change(id:string,value:string){setValues(current=>({...current,[id]:value}));setErrors(current=>{const next={...current};delete next[id];return next;});setMessage(null);}
  function focusField(id:string){requestAnimationFrame(()=>document.getElementById(prefix+'-'+id)?.focus());}
  async function submit(event:FormEvent){
    event.preventDefault();if(preview||busy)return;
    const answers=submittedFormValues(form,values);if(contextMessage&&form.fields.some(f=>f.id==='message'))answers.message=[answers.message,contextMessage].filter(Boolean).join('\n\n');const problems=validateFormValues(form,answers);
    if(problems.length){setErrors(Object.fromEntries(problems.map(problem=>[problem.fieldId,problem.message])));focusField(problems[0].fieldId);return;}
    const payload=JSON.stringify(answers);
    if(operation.current.payload!==payload||!operation.current.id)operation.current={id:crypto.randomUUID(),payload};
    setBusy(true);setErrors({});setMessage(null);
    try{
      const response=await fetch(`/api/forms/${encodeURIComponent(form.id)}/submissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:operation.current.id,answers,website:honeypot})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.id){if(data?.details?.fieldId){setErrors({[data.details.fieldId]:data.message});focusField(data.details.fieldId);}throw new Error(data?.message||'Versturen is niet gelukt. Je invoer blijft bewaard. Probeer het opnieuw.');}
      setMessage({text:form.registrationPurpose==='membership'?'Je inschrijving is ontvangen. Het secretariaat neemt contact met je op over je aanmelding.':form.id==='sponsorship'?'Je sponsoraanvraag is ontvangen. De sponsorcommissie neemt contact met je op.':'Bedankt! Je bericht is ontvangen. De club komt bij je terug.',error:false});
      setValues({});operation.current={id:'',payload:''};
    }catch(error){setMessage({text:error instanceof Error?error.message:'Versturen is niet gelukt. Je invoer blijft bewaard.',error:true});}
    finally{setBusy(false);}
  }
  const autocomplete:Record<string,string>={name:'name',firstName:'given-name',lastName:'family-name',email:'email',phone:'tel',street:'address-line1',postalCode:'postal-code',city:'address-level2',birthDate:'bday',company:'organization',guardianName:'section-guardian name',guardianEmail:'section-guardian email',guardianPhone:'section-guardian tel'};
  return <section className={styles.root}>
    {contextMessage&&<p>{contextMessage}</p>}{showTitle&&<h2 className={styles.title}>{form.name}</h2>}
    <p className={styles.intro}>Velden met een * zijn verplicht.{form.registrationPurpose==='membership'&&' Ben je jonger dan 18? Vul dan ook de gegevens van je ouder of voogd in.'}</p>
    {preview&&<p>Voorvertoning van de werkversie. Verzenden is uitgeschakeld.</p>}
    <form onSubmit={submit} aria-label={form.name} aria-busy={busy}>
      <fieldset className={styles.body} disabled={busy||preview}>
        {groups.map(group=><fieldset className={styles.group} key={group}>
          {group&&<legend>{group}</legend>}
          <div className={styles.fields}>{fields.filter(field=>(field.section||'')===group).map(field=>{
            const id=prefix+'-'+field.id,check=['consent','checkbox'].includes(field.type);
            const common={id,name:field.id,required:field.required,'aria-invalid':!!errors[field.id],'aria-describedby':errors[field.id]?id+'-error':undefined};
            return <div className={`${styles.field} ${field.type==='textarea'||check?styles.wide:''}`} key={field.id}>
              <label className={check?styles.checkbox:undefined} htmlFor={id}>
                {check&&<input {...common} type="checkbox" checked={values[field.id]==='yes'} onChange={event=>change(field.id,event.target.checked?'yes':'')}/>}
                <span>{field.label}{field.required?' *':' (optioneel)'}</span>
              </label>
              {!check&&(['select','radio'].includes(field.type)?<select {...common} value={values[field.id]||''} onChange={event=>change(field.id,event.target.value)}><option value="">Maak een keuze</option>{field.options?.map(option=><option key={option}>{option}</option>)}</select>:field.type==='textarea'?<textarea {...common} rows={5} maxLength={5000} value={values[field.id]||''} onChange={event=>change(field.id,event.target.value)}/>:<input {...common} type={field.type} autoComplete={autocomplete[field.id]} max={field.id==='birthDate'?todayInAmsterdam():undefined} maxLength={500} value={values[field.id]||''} onChange={event=>change(field.id,event.target.value)}/>)}
              {errors[field.id]&&<small className={styles.error} id={id+'-error'}>{errors[field.id]}</small>}
            </div>;
          })}</div>
        </fieldset>)}
        <div className={styles.honeypot} aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={event=>setHoneypot(event.target.value)}/></label></div>
        <button className={styles.submit} type="submit">{busy?'Versturen…':form.registrationPurpose==='membership'?'Inschrijving versturen':form.id==='sponsorship'?'Sponsoraanvraag versturen':'Versturen'}</button>
      </fieldset>
      {message&&<p className={message.error?styles.failure:styles.success} role={message.error?'alert':'status'}>{message.text}</p>}
    </form>
  </section>;
}

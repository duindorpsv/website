import type {CmsForm,FormField} from './types';
export type FormProblem={fieldId:string;message:string};
export function contextualContactForm(search:string){
  const query=new URLSearchParams(search);
  return [query.get('onderwerp'),query.get('afdeling')].some(value=>value&&/sponsor/i.test(value))?'sponsorship':'contact';
}
export function todayInAmsterdam(at=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
}
export function validDate(value:string){
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function ageOnDate(birthDate:string,today=todayInAmsterdam()){
  if(!validDate(birthDate)||birthDate>today)return null;
  return Number(today.slice(0,4))-Number(birthDate.slice(0,4))-(today.slice(5)<birthDate.slice(5)?1:0);
}
export function visibleFormFields(form:CmsForm,values:Record<string,string>,today=todayInAmsterdam()):FormField[]{
  return form.fields.filter(field=>{
    if(!field.condition)return true;
    const value=(values[field.condition.fieldId]||'').trim();
    if(field.condition.operator==='equals')return value===field.condition.value;
    const age=ageOnDate(value,today);return age!==null&&age<18;
  });
}
export function submittedFormValues(form:CmsForm,values:Record<string,string>,today=todayInAmsterdam()){
  return Object.fromEntries(visibleFormFields(form,values,today).map(field=>[field.id,(values[field.id]||'').trim()]));
}
export function validateFormValues(form:CmsForm,values:Record<string,string>,today=todayInAmsterdam()):FormProblem[]{
  const problems:FormProblem[]=[];
  for(const field of visibleFormFields(form,values,today)){
    const value=(values[field.id]||'').trim();
    const fail=(message:string)=>problems.push({fieldId:field.id,message});
    if(field.required&&(!value||(['consent','checkbox'].includes(field.type)&&value!=='yes'))){fail(`${field.label} is verplicht.`);continue;}
    if(!value)continue;
    if(value.length>(field.type==='textarea'?5000:500))fail(`${field.label} is te lang.`);
    if(['select','radio'].includes(field.type)&&!field.options?.includes(value))fail('Kies een geldige optie.');
    if(field.type==='date'&&!validDate(value))fail('Gebruik een bestaande datum.');
    if(field.id==='birthDate'&&validDate(value)&&value>today)fail('De geboortedatum mag niet in de toekomst liggen.');
    if(field.type==='tel'&&(!/^[+\d\s().-]+$/.test(value)||value.replace(/\D/g,'').length<8||value.replace(/\D/g,'').length>15))fail('Vul een geldig telefoonnummer in.');
    if(['checkbox','consent'].includes(field.type)&&!['yes','no'].includes(value))fail('Gebruik een geldige keuze.');
  }
  return problems;
}

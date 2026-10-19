import type {CmsForm} from './types';

export function formDefinitionErrors(form:CmsForm):string[]{
 const errors:string[]=[];
 if(!form.name.trim())errors.push('Geef het formulier een naam.');
 if(!form.departmentId)errors.push('Kies een afdeling met ontvangers.');
 if(!Number.isInteger(form.retentionDays)||form.retentionDays<0)errors.push('Gebruik een geldige bewaartermijn vanaf nul dagen.');
 if(!form.fields.length)errors.push('Voeg ten minste één veld toe.');
 if(form.fields.length>60)errors.push('Gebruik maximaal 60 velden.');
 for(const field of form.fields){
  if(!field.label.trim())errors.push('Geef ieder veld een label.');
  if(['select','radio'].includes(field.type)&&(!field.options?.length||field.options.some(option=>!option.trim())))errors.push(`Vul de keuzes voor “${field.label||'dit veld'}” in.`);
  if(field.condition){const source=form.fields.find(item=>item.id===field.condition?.fieldId);if(!source||source.id===field.id||field.condition.operator==='under18'&&source.type!=='date')errors.push(`Controleer de voorwaarde bij “${field.label||'dit veld'}”.`);}
 }
 return [...new Set(errors)];
}

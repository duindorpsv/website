import {submittedFormValues} from './form-validation';
import type {CmsForm,CmsSubmission,FormKind,SubmissionStatus} from './types';

export const formKindLabels:Record<FormKind,{singular:string;plural:string;description:string}>={
  contact:{singular:'Contactbericht',plural:'Contactberichten',description:'Vragen en berichten aan de club.'},
  registration:{singular:'Aanmelding',plural:'Aanmeldingen',description:'Inschrijvingen voor lidmaatschap, activiteiten en vrijwilligerswerk.'},
  request:{singular:'Aanvraag',plural:'Aanvragen',description:'Aanvragen die een beoordeling of besluit nodig hebben.'},
};

export const submissionLabels:Record<SubmissionStatus,string>={
  new:'Nieuw','in-progress':'In behandeling',done:'Afgehandeld',accepted:'Geaccepteerd',declined:'Afgewezen',waitlist:'Wachtlijst',
};

export function statusesForFormKind(kind:FormKind):SubmissionStatus[]{
  if(kind==='registration')return ['new','in-progress','accepted','waitlist','declined','done'];
  if(kind==='request')return ['new','in-progress','accepted','declined','done'];
  return ['new','in-progress','done'];
}

/** Freeze the submitted form definition alongside every answer, independent of later edits. */
export function createSubmissionSnapshot(
  form:CmsForm,
  values:Record<string,string>,
  options:{id:string;departmentId:string;createdAt:string;demo?:boolean},
):CmsSubmission{
  const submitted=submittedFormValues(form,values);
  const answers=form.fields.filter(field=>field.id in submitted).map(field=>({fieldId:field.id,label:field.label,type:field.type,value:(values[field.id]||'').trim()}));
  const name=(form.registrationPurpose==='membership'&&[submitted.firstName,submitted.lastName].filter(Boolean).join(' '))||answers.find(answer=>/naam|name/i.test(answer.label))?.value||'Onbekende afzender';
  const email=submitted.guardianEmail||answers.find(answer=>answer.type==='email')?.value||'';
  return {
    id:options.id,kind:form.kind,formId:form.id,formName:form.name,answers,
    departmentId:options.departmentId,name,email,
    message:answers.map(answer=>`${answer.label}: ${answer.value||'—'}`).join('\n\n'),
    createdAt:options.createdAt,status:'new',note:'',demo:options.demo??true,
  };
}

export function filterSubmissions(submissions:CmsSubmission[],filters:{kind:FormKind;formId?:string;departmentId?:string;status?:string;query?:string}):CmsSubmission[]{
  const query=(filters.query||'').trim().toLocaleLowerCase('nl-NL');
  return submissions.filter(submission=>
    submission.kind===filters.kind&&
    (!filters.formId||submission.formId===filters.formId)&&
    (!filters.departmentId||submission.departmentId===filters.departmentId)&&
    (!filters.status||submission.status===filters.status)&&
    (!query||`${submission.name} ${submission.email} ${submission.formName} ${submission.message} ${submission.answers.map(answer=>`${answer.label} ${answer.value}`).join(' ')}`.toLocaleLowerCase('nl-NL').includes(query))
  ).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

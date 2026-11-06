'use client';

import {useEffect,useState} from 'react';
import {Dialog} from 'radix-ui';
import {useDialogFocusReturn} from './dialog-focus';
import {Pagination,usePagination} from './pagination';
import {CalendarDays,Plus,Save,ShieldCheck,X} from 'lucide-react';
import {useCMS} from './sponsor-workspace-provider';
import {readSponsorship,saveSponsorSettings,saveSponsorEvent,recordSponsorManualPayment,money} from '@/lib/cms/sponsorship';
import {uid} from '@/lib/cms/model';
import type {SponsorEvent,SponsorSettings,SponsorInvoice} from '@/lib/cms/sponsorship-types';
import './sponsor-settings-panel.css';

const emailValid=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const clubFields=[{key:'legalName',label:'Statutaire clubnaam',placeholder:'Duindorp Sportvereniging'},{key:'address',label:'Clubadres',placeholder:'Adres, postcode en plaats'},{key:'companyNumber',label:'KvK-nummer club',placeholder:'KvK-nummer'},{key:'representative',label:'Vertegenwoordiger',placeholder:'Naam bevoegd vertegenwoordiger'},{key:'representativeFunction',label:'Functie vertegenwoordiger',placeholder:'Bijvoorbeeld voorzitter'},{key:'email',label:'E-mailadres club',placeholder:'secretariaat@duindorpsv.nl'}] as const;
const localDateTime=(value:string)=>{if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};

export function SponsorSettingsPanel(){
 const {state,update,can,userId,beginEdit,saving,storageError}=useCMS(),data=readSponsorship(state);
 const [draft,setDraft]=useState<SponsorSettings>(()=>structuredClone(data.settings));
 const [reminderInput,setReminderInput]=useState(data.settings.reminderDays.join(', '));
 const [event,setEvent]=useState<SponsorEvent|null>(null),[error,setError]=useState('');
 const allowed=can('sponsors'),eventsPage=usePagination(data.events);
 useEffect(()=>beginEdit('record:sponsor-settings'),[beginEdit]);
 useEffect(()=>{if(event)beginEdit('record:'+event.id)},[event?.id,beginEdit]);
 useEffect(()=>{if(storageError)setError(storageError)},[storageError]);
 async function saveSettings(){
  setError('');
  const reminders=reminderInput.split(',').map(value=>value.trim()).filter(Boolean).map(Number);
  if(!emailValid(draft.committeeEmail.trim())){setError('Vul een geldig e-mailadres voor de sponsorcommissie in.');return;}
  if(reminders.some(value=>!Number.isInteger(value)||value<0||value>365)){setError('Gebruik herinneringstermijnen van 0 tot en met 365 dagen, gescheiden met komma’s.');return;}
  const club=Object.fromEntries(clubFields.map(field=>[field.key,(draft.contractClubDetails?.[field.key]||'').trim()]));
  if(Object.values(club).some(value=>value.length>500)||club.email&&!emailValid(club.email)){setError('Controleer de verenigingsgegevens en het e-mailadres.');return;}
  const ok=await update(next=>{
   const current=readSponsorship(next).settings;
   saveSponsorSettings(next,userId,{...current,committeeEmail:draft.committeeEmail.trim(),defaultTerms:draft.defaultTerms,defaultPaymentTerms:draft.defaultPaymentTerms,vatNote:draft.vatNote,mollieEnabled:false,reminderDays:[...new Set(reminders)].sort((a,b)=>b-a),contractClubDetails:club});
  },'Sponsorinstellingen opgeslagen.');
  if(!ok)setError('De instellingen zijn niet opgeslagen. Controleer de melding en probeer opnieuw.');
 }
 async function saveEvent(){
  setError('');if(!event)return;
  if(!event.title.trim()||!event.date||!Number.isFinite(Date.parse(event.date))||!event.location.trim()||!Number.isInteger(event.capacity)||event.capacity<1){setError('Vul een titel, geldige datum, locatie en capaciteit van minimaal één plaats in.');return;}
  const ok=await update(next=>{
   saveSponsorEvent(next,userId,{...structuredClone(event),title:event.title.trim(),location:event.location.trim()});
  },'Sponsorbijeenkomst opgeslagen.');
  if(ok)setEvent(null);else setError('De bijeenkomst is niet opgeslagen. Controleer de melding en probeer opnieuw.');
 }
 return <div className="sb-settings-panel">
  <div className="sb-section-head"><div><h3>Een vaste basis voor iedere samenwerking.</h3><p>Standaardvoorwaarden, communicatie en clubmomenten voor sponsoren.</p></div></div>
  <form className="sb-stack" aria-label="Instellingen sponsoring" onSubmit={event=>{event.preventDefault();saveSettings();}}>
   <fieldset disabled={!allowed||saving} className="sb-settings-fields">
    <div className="sb-settings-grid">
     <section className="sb-panel"><div className="sb-panel-head"><h3>Overeenkomsten</h3></div><div className="sb-panel-body">
      <label className="cms-field"><span>Standaard betaalafspraken</span><textarea rows={3} value={draft.defaultPaymentTerms} onChange={event=>setDraft({...draft,defaultPaymentTerms:event.target.value})}/></label>
      <label className="cms-field"><span>Standaardvoorwaarden</span><textarea rows={7} value={draft.defaultTerms} onChange={event=>setDraft({...draft,defaultTerms:event.target.value})}/></label>
      <p className="sb-no-margin">Nieuwe voorstellen nemen deze tekst over. Bestaande vastgezette documenten blijven ongewijzigd.</p>
     </div></section>
     <section className="sb-panel"><div className="sb-panel-head"><h3>Contact &amp; opvolging</h3></div><div className="sb-panel-body">
      <label className="cms-field"><span>E-mailadres sponsorcommissie</span><input required type="email" value={draft.committeeEmail} onChange={event=>setDraft({...draft,committeeEmail:event.target.value})}/></label>
      <label className="cms-field"><span>Toelichting btw-behandeling</span><textarea rows={3} value={draft.vatNote} onChange={event=>setDraft({...draft,vatNote:event.target.value})}/></label>
      <div className="sb-inline-note"><ShieldCheck size={17}/><span>0% en vrijgesteld zijn verschillende keuzes. Laat de financiële inrichting aansluiten op de situatie van de vereniging.</span></div>
      <label className="sb-check"><input type="checkbox" checked={false} disabled/><span>Mollie-betaalknop tonen in het sponsorportaal<br/><small>Online betalen is niet geconfigureerd. Ontvangen betalingen worden met een referentie handmatig geregistreerd.</small></span></label>
      <div className="sb-mini-title"><strong>Verlengherinneringen</strong><span className="sb-badge">{data.settings.reminderDays.join(' / ')} dagen</span></div>
      <label className="cms-field"><span>Herinneringen vooraf (dagen, met komma's)</span><input value={reminderInput} onChange={event=>setReminderInput(event.target.value)} placeholder="14, 7, 1"/></label>
      <p className="sb-no-margin">Herinneringen worden via de achtergrondverwerking voorbereid voor de gekoppelde contactpersonen.</p>
     </div></section>
    </div>
    <section className="sb-panel"><div className="sb-panel-head"><h3>De club als contractpartij</h3></div><div className="sb-panel-body"><p>Deze gegevens worden gebruikt in nieuwe voorstellen. Bestaande vastgezette documenten blijven behouden.</p><div className="sb-form-grid">{clubFields.map(field=><label className="cms-field" key={field.key}><span>{field.label}</span><input type={field.key==='email'?'email':'text'} maxLength={500} value={draft.contractClubDetails?.[field.key]||''} placeholder={field.placeholder} onChange={event=>setDraft({...draft,contractClubDetails:{...draft.contractClubDetails,[field.key]:event.target.value}})}/></label>)}</div></div></section>
    <div><button type="submit" className="cms-button primary"><Save size={15}/>Instellingen bewaren</button></div>
   </fieldset>
  </form>
  <section className="sb-panel sb-settings-events"><div className="sb-panel-head"><h3>Clubmomenten voor sponsoren</h3><button type="button" className="cms-button" disabled={!allowed||saving} onClick={()=>{setError('');setEvent({id:uid('sponsor-event'),title:'',description:'',date:'',location:'',capacity:50,registrations:[]});}}><Plus size={15}/>Toevoegen</button></div><div className="sb-panel-body">
   {data.events.length?eventsPage.items.map(item=><button key={item.id} type="button" className="sb-settings-event" onClick={()=>{setError('');setEvent(structuredClone(item));}}><CalendarDays size={20}/><span><strong>{item.title}</strong><small>{new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(item.date))} · {item.registrations.reduce((total,row)=>total+row.guests,0)} / {item.capacity} plaatsen</small></span></button>):<p>Nog geen sponsorbijeenkomsten.</p>}
   <Pagination label="Sponsorbijeenkomsten" {...eventsPage}/>{event&&<form className="sb-stack sb-settings-event-form" onSubmit={formEvent=>{formEvent.preventDefault();saveEvent();}}><fieldset disabled={!allowed||saving} className="sb-settings-fields"><h4>{data.events.some(row=>row.id===event.id)?'Bijeenkomst bewerken':'Nieuwe bijeenkomst'}</h4><div className="sb-form-grid"><label className="cms-field"><span>Titel</span><input required value={event.title} onChange={change=>setEvent({...event,title:change.target.value})}/></label><label className="cms-field"><span>Datum en tijd</span><input required type="datetime-local" value={localDateTime(event.date)} onChange={change=>{const date=new Date(change.target.value);setEvent({...event,date:change.target.value&&Number.isFinite(date.getTime())?date.toISOString():''})}}/></label><label className="cms-field"><span>Locatie</span><input required value={event.location} onChange={change=>setEvent({...event,location:change.target.value})}/></label><label className="cms-field"><span>Capaciteit</span><input required type="number" min={1} step={1} value={event.capacity} onChange={change=>setEvent({...event,capacity:Number(change.target.value)})}/></label><label className="cms-field sb-full"><span>Beschrijving</span><textarea rows={3} value={event.description} onChange={change=>setEvent({...event,description:change.target.value})}/></label></div><div className="sb-modal-actions"><button className="cms-button" type="button" onClick={()=>setEvent(null)}><X size={15}/>Annuleren</button><button className="cms-button primary" type="submit"><Save size={15}/>Bijeenkomst bewaren</button></div></fieldset></form>}
  </div></section>
  {error&&<p className="sb-error" role="alert">{error}</p>}
 </div>;
}

export function ManualSponsorPayment({invoice,onClose}:{invoice:SponsorInvoice;onClose:()=>void}){
 const focusReturn=useDialogFocusReturn();
 const {update,userId,saving}=useCMS(),[reference,setReference]=useState('');
 return <Dialog.Root open onOpenChange={open=>!open&&onClose()}><Dialog.Portal><Dialog.Overlay className="sb-overlay"/><Dialog.Content {...focusReturn} className="sb-modal"><header><div><Dialog.Title>Ontvangen betaling registreren</Dialog.Title><Dialog.Description>Registreer uitsluitend een betaling die op de bank is ontvangen.</Dialog.Description></div><Dialog.Close className="cms-button" aria-label="Venster sluiten"><X size={18}/></Dialog.Close></header><form className="sb-modal-body" onSubmit={async e=>{e.preventDefault();if(await update(s=>recordSponsorManualPayment(s,userId,invoice.id,reference),'Ontvangen betaling geregistreerd.'))onClose();}}><p>{invoice.number} · {money(invoice.totalCents)}</p><label className="cms-field">Bank- of boekingsreferentie<input required minLength={1} maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></label><div className="sb-modal-actions"><Dialog.Close className="cms-button" type="button">Annuleren</Dialog.Close><button className="cms-button primary" disabled={saving}>Ontvangst bevestigen</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

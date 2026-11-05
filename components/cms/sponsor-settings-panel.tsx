'use client';
import {useDialogFocusReturn} from './dialog-focus';
import {useEffect,useState,type FormEvent} from 'react';
import {Dialog} from 'radix-ui';
import {Plus,Save,X,CalendarDays,ShieldCheck} from 'lucide-react';
import {Pagination,usePagination} from './pagination';
import {useCMS} from './sponsor-workspace-provider';
import {readSponsorship,saveSponsorSettings,saveSponsorEvent,recordSponsorManualPayment,money} from '@/lib/cms/sponsorship';
import type {SponsorEvent,SponsorInvoice} from '@/lib/cms/sponsorship-types';
export function SponsorSettingsPanel(){
 const {state,update,saving}=useCMS(),data=readSponsorship(state);
 const eventsPage=usePagination(data.events);
 const [draft,setDraft]=useState(structuredClone(data.settings)),[event,setEvent]=useState<SponsorEvent|null>(null);
 const {userId,beginEdit}=useCMS();useEffect(()=>beginEdit('record:sponsor-settings'),[beginEdit]);useEffect(()=>{if(event)beginEdit('record:'+event.id);},[event?.id,beginEdit]);
 return <div>
  <div className="sb-section-head"><div><h3>Een vaste basis voor iedere samenwerking.</h3><p>Standaardvoorwaarden, communicatie en de voorbereiding van betalingen.</p></div></div>
  <form className="sb-stack" aria-label="Instellingen sponsoring" onSubmit={async e=>{e.preventDefault();await update(s=>saveSponsorSettings(s,userId,draft),'Sponsorinstellingen opgeslagen.');}}>
   <fieldset disabled={saving} style={{display:'contents'}}>
    <div className="sb-settings-grid">
     <section className="sb-panel"><div className="sb-panel-head"><h3>Overeenkomsten</h3></div><div className="sb-panel-body">
      <label className="cms-field"><span>Standaard betaalafspraken</span><textarea rows={3} value={draft.defaultPaymentTerms} onChange={e=>setDraft({...draft,defaultPaymentTerms:e.target.value})}/></label>
      <label className="cms-field"><span>Standaardvoorwaarden</span><textarea rows={7} value={draft.defaultTerms} onChange={e=>setDraft({...draft,defaultTerms:e.target.value})}/></label>
      <p className="sb-no-margin">Nieuwe voorstellen nemen deze tekst over. Bestaande vastgezette documenten blijven ongewijzigd.</p>
     </div></section>
     <section className="sb-panel"><div className="sb-panel-head"><h3>Contact &amp; opvolging</h3></div><div className="sb-panel-body">
      <label className="cms-field"><span>E-mailadres sponsorcommissie</span><input type="email" required value={draft.committeeEmail} onChange={e=>setDraft({...draft,committeeEmail:e.target.value})}/></label>
      <label className="cms-field"><span>Toelichting btw-behandeling</span><textarea rows={3} value={draft.vatNote} onChange={e=>setDraft({...draft,vatNote:e.target.value})}/></label>
      <div className="sb-inline-note"><ShieldCheck size={17}/><span>0% en vrijgesteld zijn verschillende keuzes. Laat de financiële inrichting aansluiten op de situatie van de vereniging.</span></div>
      <label className="sb-check"><input type="checkbox" checked={false} disabled/><span>Mollie-betaalknop tonen in het sponsorportaal<br/><small>Online betalen is niet geconfigureerd. Ontvangen betalingen worden met een referentie handmatig geregistreerd.</small></span></label>
      <div className="sb-mini-title"><strong>Verlengherinneringen</strong><span className="sb-badge">{draft.reminderDays.join(' / ')} dagen</span></div>
      <label className="cms-field"><span>Herinneringen vooraf (dagen, met komma's)</span><input value={draft.reminderDays.join(', ')} onChange={e=>{const values=e.target.value.split(',').map(v=>Number(v.trim()));if(values.every(n=>Number.isInteger(n)&&n>=0&&n<=365))setDraft({...draft,reminderDays:[...new Set(values)]});}}/></label>
      <p className="sb-no-margin">Herinneringen worden via de achtergrondverwerking voorbereid voor de gekoppelde contactpersonen.</p>
     </div></section>
    </div>
    <section className="sb-panel"><div className="sb-panel-head"><h3>De club als contractpartij</h3></div><div className="sb-panel-body"><p>Deze gegevens worden vastgelegd in nieuwe voorstellen. Bestaande documenten blijven behouden.</p><div className="sb-form-grid">{([{key:'legalName',label:'Statutaire clubnaam',placeholder:'Duindorp Sportvereniging'},{key:'address',label:'Clubadres',placeholder:'Houtrustlaan 1, 2566 ZW Den Haag'},{key:'companyNumber',label:'KvK-nummer club',placeholder:'27092652'},{key:'representative',label:'Vertegenwoordiger',placeholder:'Naam bevoegd vertegenwoordiger'},{key:'representativeFunction',label:'Functie vertegenwoordiger',placeholder:'Bijvoorbeeld voorzitter'},{key:'email',label:'E-mailadres club',placeholder:'secretariaat@duindorpsv.nl'}] as const).map(field=><label className="cms-field" key={field.key}><span>{field.label}</span><input type={field.key==='email'?'email':'text'} maxLength={500} value={draft.contractClubDetails?.[field.key]||''} placeholder={field.placeholder} onChange={e=>setDraft({...draft,contractClubDetails:{...draft.contractClubDetails,[field.key]:e.target.value}})}/></label>)}</div></div></section>
    <div><button type="submit" className="cms-button primary" disabled={saving}><Save size={15}/>Instellingen bewaren</button></div>
   </fieldset>
  </form>
  <section className="sb-panel" style={{marginTop:17}}><div className="sb-panel-head"><h3>Clubmomenten voor sponsoren</h3><button className="cms-button" onClick={()=>setEvent({id:crypto.randomUUID(),title:'',description:'',date:'',location:'',capacity:50,registrations:[]})}><Plus size={15}/>Toevoegen</button></div><div className="sb-panel-body">{data.events.length?eventsPage.items.map(item=><button key={item.id} className="sb-event-row" onClick={()=>setEvent(structuredClone(item))}><CalendarDays size={20}/><span><strong>{item.title}</strong><small>{new Date(item.date).toLocaleString('nl-NL')} · {item.registrations.reduce((n,r)=>n+r.guests,0)} / {item.capacity} plaatsen</small></span></button>):<p>Nog geen sponsorbijeenkomsten.</p>}<Pagination label="Sponsorbijeenkomsten" {...eventsPage}/>{event&&<form onSubmit={async e=>{e.preventDefault();const ok=await update(s=>saveSponsorEvent(s,userId,event),'Sponsorbijeenkomst opgeslagen.');if(ok)setEvent(null);}} className="sb-stack"><h4>{data.events.some(v=>v.id===event.id)?'Bijeenkomst bewerken':'Nieuwe bijeenkomst'}</h4><label className="cms-field"><span>Titel</span><input required value={event.title} onChange={e=>setEvent({...event,title:e.target.value})}/></label><label className="cms-field"><span>Datum en tijd</span><input required type="datetime-local" value={event.date?new Date(new Date(event.date).getTime()-new Date(event.date).getTimezoneOffset()*60000).toISOString().slice(0,16):''} onChange={e=>setEvent({...event,date:e.target.value?new Date(e.target.value).toISOString():''})}/></label><label className="cms-field"><span>Locatie</span><input required value={event.location} onChange={e=>setEvent({...event,location:e.target.value})}/></label><label className="cms-field"><span>Beschrijving</span><textarea value={event.description} onChange={e=>setEvent({...event,description:e.target.value})}/></label><label className="cms-field"><span>Capaciteit</span><input type="number" min={1} required value={event.capacity} onChange={e=>setEvent({...event,capacity:Number(e.target.value)})}/></label><div className="sb-modal-actions"><button className="cms-button" type="button" onClick={()=>setEvent(null)}>Annuleren</button><button className="cms-button primary" disabled={saving}>Bijeenkomst bewaren</button></div></form>}</div></section>
 </div>;
}
export function ManualSponsorPayment({invoice,onClose}:{invoice:SponsorInvoice;onClose:()=>void}){
 const focusReturn=useDialogFocusReturn();
 const {update,userId,saving}=useCMS(),[reference,setReference]=useState('');
 return <Dialog.Root open onOpenChange={open=>!open&&onClose()}><Dialog.Portal><Dialog.Overlay className="sb-overlay"/><Dialog.Content {...focusReturn} className="sb-modal"><header><div><Dialog.Title>Ontvangen betaling registreren</Dialog.Title><Dialog.Description>Registreer uitsluitend een betaling die op de bank is ontvangen.</Dialog.Description></div><Dialog.Close className="cms-button" aria-label="Venster sluiten"><X size={18}/></Dialog.Close></header><form className="sb-modal-body" onSubmit={async e=>{e.preventDefault();if(await update(s=>recordSponsorManualPayment(s,userId,invoice.id,reference),'Ontvangen betaling geregistreerd.'))onClose();}}><p>{invoice.number} · {money(invoice.totalCents)}</p><label className="cms-field">Bank- of boekingsreferentie<input required minLength={1} maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></label><div className="sb-modal-actions"><Dialog.Close className="cms-button" type="button">Annuleren</Dialog.Close><button className="cms-button primary" disabled={saving}>Ontvangst bevestigen</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

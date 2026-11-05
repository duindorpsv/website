'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Check,Hash} from 'lucide-react';
import {useCMS} from './sponsor-workspace-provider';
import {ensureSponsorship,readSponsorship} from '@/lib/cms/sponsorship';
import {canManageInvoiceSeries,getInvoiceNumbering,getNextInvoiceSequence,nextInvoiceNumber,saveInvoiceNumberingSettings,type InvoiceNumberingSettings,type InvoiceSeries} from '@/lib/cms/invoice-numbering';
import './invoice-number-settings.css';

const currentYear=()=>new Intl.DateTimeFormat('en',{timeZone:'Europe/Amsterdam',year:'numeric'}).format(new Date());
export function InvoiceNumberSettings({series}:{series?:InvoiceSeries}){
 const {state,update,userId,beginEdit,saving,storageError}=useCMS(),data=readSponsorship(state);
 const [year,setYear]=useState(currentYear),[draft,setDraft]=useState<InvoiceNumberingSettings>(()=>getInvoiceNumbering(data)),[error,setError]=useState('');
 useEffect(()=>beginEdit('record:sponsor-settings'),[beginEdit]);
 useEffect(()=>{if(storageError)setError(storageError)},[storageError]);
 const stored=JSON.stringify(data.settings.invoiceNumbering);
 useEffect(()=>{setDraft(getInvoiceNumbering(readSponsorship(state)));setError('')},[stored,userId]);
 const visible=(series?[series]:['sponsors','donors'] as InvoiceSeries[]).filter(value=>canManageInvoiceSeries(state,userId,value));
 if(!visible.length)return null;
 async function save(event:FormEvent){event.preventDefault();setError('');try{
  const input:Partial<InvoiceNumberingSettings>={};for(const value of visible)input[value]=draft[value];
  const check=structuredClone(state);ensureSponsorship(check);saveInvoiceNumberingSettings(check,userId,input);
  const ok=await update(next=>{ensureSponsorship(next);saveInvoiceNumberingSettings(next,userId,input)},'Factuurreeksen opgeslagen. Bestaande facturen behouden hun nummer.');if(!ok)setError('De factuurreeksen zijn niet opgeslagen. Controleer de melding en probeer opnieuw.');
 }catch(reason){setError(reason instanceof Error?reason.message:'Opslaan is mislukt.')}}
 function change(value:InvoiceSeries,field:'prefix'|'digits'|'next',input:string){setDraft(previous=>({...previous,[value]:{...previous[value],...(field==='prefix'?{prefix:input,nextByYear:{...previous[value].nextByYear,[year]:previous[value].nextByYear[year]??getNextInvoiceSequence(data,value,year)}}:field==='digits'?{digits:Number(input)}:{nextByYear:{...previous[value].nextByYear,[year]:Number(input)}})}}))}
 return <section className="in-settings sb-panel"><div className="sb-panel-head"><h3><Hash size={17}/>Factuurnummering</h3></div><form className="sb-panel-body" onSubmit={save}><fieldset className="in-controls" disabled={saving}>
  <p>Stel voor sponsors en donateurs een eigen reeks in: <b>prefix-jaar-volgnummer</b>. Het factuurjaar volgt de factuurdatum.</p>
  <label className="cms-field in-year"><span>Factuurjaar</span><input aria-label="Factuurjaar voor nummering" required type="number" min="1900" max="9999" value={year} onChange={event=>setYear(event.target.value)}/></label>
  <div className="in-series-grid">{visible.map(value=>{let next=1,preview='Controleer de instellingen';try{next=getNextInvoiceSequence(data,value,year);const proposed=structuredClone(data);proposed.settings.invoiceNumbering=draft;preview=nextInvoiceNumber(proposed,value,`${year}-01-01`)}catch{}
   return <fieldset key={value}><legend>{value==='sponsors'?'Sponsorfacturen':'Donateursfacturen'}</legend><label className="cms-field"><span>Prefix</span><input required maxLength={30} value={draft[value].prefix} onChange={event=>change(value,'prefix',event.target.value)}/></label><div className="in-small-grid"><label className="cms-field"><span>Aantal cijfers</span><input required type="number" min="1" max="8" value={draft[value].digits} onChange={event=>change(value,'digits',event.target.value)}/></label><label className="cms-field"><span>Volgend volgnummer</span><input required type="number" min={next} max="999999999" value={draft[value].nextByYear[year]??next} onChange={event=>change(value,'next',event.target.value)}/></label></div><div className="in-preview"><small>Volgende factuur · voorbeeld</small><strong>{preview}</strong></div></fieldset>})}</div>
  <p className="in-note">Elk nieuw jaar start bij 1. Gebruikte en geannuleerde nummers blijven gereserveerd. Een gewijzigd prefix of startnummer past bestaande facturen niet aan.</p>
  {error&&<p className="sb-error" role="alert">{error}</p>}<button className="cms-button primary" disabled={saving}><Check size={15}/>Nummering opslaan</button>
 </fieldset></form></section>;
}

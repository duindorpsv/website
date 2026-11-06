'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowLeft,CheckCircle2,Download,FileSignature,FileText,History,Mail,Send,ShieldCheck,X} from 'lucide-react';
import {useCMS} from './sponsor-workspace-provider';
import {useDialogFocusReturn} from './dialog-focus';
import type {SponsorAgreementDeliverySource,SponsorAgreementDelivery} from '@/lib/cms/sponsor-agreement-delivery';
import {prepareSponsorConceptIntent,confirmSponsorConceptIntent,refreshSponsorConceptIntent,type SponsorConceptIntent} from '@/lib/cms/sponsor-concept-intent';
import {calculateSponsorProposalTotals,money} from '@/lib/cms/sponsorship';
import './sponsor-concept-composer.css';

export type SponsorAgreementComposerTarget={proposalId?:string;agreementId?:string;deliveryId?:string};
type Prepared={source:SponsorAgreementDeliverySource|null;html:string;error:string;deliveries:SponsorAgreementDelivery[]};
const timestamp=(value:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const deliveryStatus=(row:SponsorAgreementDelivery)=>row.status==='accepted'?'Door mailprovider geaccepteerd · aflevering niet bevestigd':row.status==='queued'?'In de verzendwachtrij':row.status==='failed'?'Verzending niet bevestigd':'Verzending geannuleerd';
function queryFor(target:SponsorAgreementComposerTarget){const query=new URLSearchParams();for(const [key,value] of Object.entries(target))if(value)query.set(key,value);return query.toString()}

export function SponsorAgreementComposer({target,onClose,onSent}:{target:SponsorAgreementComposerTarget;onClose:()=>void;onSent?:(agreementId:string)=>void}){
 const {state,can,notify,contextSignal,request,reload}=useCMS(),focusReturn=useDialogFocusReturn(),allowed=can('sponsors');
 const [prepared,setPrepared]=useState<Prepared|null>(null),[deliveryId,setDeliveryId]=useState(target.deliveryId||''),[agreementId,setAgreementId]=useState(target.agreementId||''),[recipient,setRecipient]=useState(''),[subject,setSubject]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const historical=!!target.deliveryId,mounted=useRef(true),operation=useRef<SponsorConceptIntent|undefined>(undefined);
 const currentTarget={...(target.proposalId?{proposalId:target.proposalId}:{}),...(agreementId?{agreementId}:{}),...(deliveryId?{deliveryId}:{})};
 const currentQuery=queryFor(currentTarget),activeQuery=useRef('');activeQuery.current=currentQuery;
 const load=useCallback(async()=>{
  const response=await fetch('/api/sponsorship/agreement-composer?'+currentQuery,{cache:'no-store',signal:contextSignal()}),value=await response.json();
  if(!response.ok)throw new Error(value.message||'De sponsorovereenkomst kon niet worden geladen.');
  if(mounted.current&&activeQuery.current===currentQuery){setPrepared(value);operation.current=refreshSponsorConceptIntent(operation.current,(value.deliveries||[]).map((row:SponsorAgreementDelivery)=>row.id));}
  return value as Prepared;
 },[currentQuery,contextSignal]);
 const loader=useRef(load);loader.current=load;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{setPrepared(null);void loader.current().catch(reason=>{if(mounted.current)setError(reason instanceof Error?reason.message:'De sponsorovereenkomst kon niet worden geladen.')});const timer=setInterval(()=>{void loader.current().catch(()=>{})},5000);return()=>clearInterval(timer)},[currentQuery]);
 const source=prepared?.source,delivery=prepared?.deliveries.find(row=>row.id===deliveryId);
 const agreement=state.sponsorship?.agreements.find(row=>row.id===(agreementId||source?.agreementId));
 const canSend=allowed&&!deliveryId&&!historical&&(!agreement||agreement.status==='awaiting-signature');
 useEffect(()=>{
  if(delivery){setRecipient(delivery.recipient);setSubject(delivery.subject);setMessage(delivery.message)}
  else if(source&&!deliveryId){setRecipient(source.snapshot.sponsorEmail);setSubject(`Sponsorovereenkomst · ${source.snapshot.name} | Duindorp SV`.slice(0,180));setMessage(`Beste sponsor,\n\nHierbij ontvang je de sponsorovereenkomst voor ${source.snapshot.name}. In de bijlage vind je onze afspraken en de looptijd van de samenwerking.\n\nBekijk de overeenkomst en onderteken deze via Mijn sponsoring. Na jouw handtekening ondertekenen wij namens Duindorp SV. Heb je nog vragen? Laat het ons gerust weten.\n\nMet sportieve groet,\nTeam Sponsoring · Duindorp SV`)}
 },[deliveryId,delivery?.id,source?.documentHash]);
 async function send(event?:FormEvent,retryId?:string){
  event?.preventDefault();if(!allowed||busy||!source||historical||(!retryId&&!canSend))return;
  setError('');setBusy(true);
  const body=retryId?{action:'retry',deliveryId:retryId}:{action:'create',target:agreementId?{agreementId}:{proposalId:target.proposalId},expectedHash:source.documentHash,recipient,subject,message};
  let confirmedId='';
  try{
   if(operation.current?.deliveryId)throw new Error('De overeenkomst staat al in de verzendwachtrij. Vernieuw eerst de verzendstatus.');
   operation.current=prepareSponsorConceptIntent(operation.current,body);
   const result=await request<{id:string;agreementId:string}>('/api/sponsorship/agreement-composer',{...body,operationId:operation.current.id});
   confirmedId=result.id;operation.current=confirmSponsorConceptIntent(operation.current,result.id);
   if(!mounted.current)return;
   setAgreementId(result.agreementId);setDeliveryId(result.id);notify('Sponsorovereenkomst staat in de verzendwachtrij.');onSent?.(result.agreementId);
   // Fetch the committed receipt directly: React has not rendered the new target yet.
   const response=await fetch('/api/sponsorship/agreement-composer?'+queryFor({agreementId:result.agreementId,deliveryId:result.id}),{cache:'no-store',signal:contextSignal()});
   if(!response.ok)throw new Error('De verzendstatus kon nog niet worden vernieuwd.');
   const value=await response.json();if(mounted.current){setPrepared(value);operation.current=refreshSponsorConceptIntent(operation.current,(value.deliveries||[]).map((row:SponsorAgreementDelivery)=>row.id));await reload();}
  }catch(reason){if(mounted.current)setError(confirmedId||operation.current?.deliveryId?'De sponsorovereenkomst staat in de verzendwachtrij. De verzendstatus kon nog niet worden vernieuwd.':reason instanceof Error?reason.message:'De sponsorovereenkomst kon niet worden verstuurd.')}
  finally{if(mounted.current)setBusy(false)}
 }
 async function download(){
  if(!source||busy)return;setBusy(true);setError('');
  try{const signal=contextSignal(),response=await fetch('/api/sponsorship/agreement-composer/pdf?'+currentQuery,{cache:'no-store',signal});if(!response.ok)throw new Error((await response.json()).message||'Downloaden is mislukt.');const blob=await response.blob();if(!mounted.current||signal.aborted)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`Duindorp-SV-Sponsorovereenkomst-v${source.version}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'Downloaden is mislukt.')}
  finally{if(mounted.current)setBusy(false)}
 }
 return <Dialog.Root open onOpenChange={open=>!open&&!busy&&onClose()}><Dialog.Portal><Dialog.Overlay className="sb-overlay"/><Dialog.Content {...focusReturn} className="sb-modal wide sc-modal sa-modal" aria-busy={busy}><header><div><Dialog.Title>{delivery?'Vastgelegde sponsorovereenkomst':'Sponsorovereenkomst versturen'}</Dialog.Title><Dialog.Description>{delivery?'De overeenkomst, geadresseerde en je persoonlijke bericht zijn bij deze verzending vastgelegd.':'Stuur de overeenkomst direct ter ondertekening. Een conceptvoorstel vooraf is optioneel.'}</Dialog.Description></div><Dialog.Close aria-label="Sluiten" disabled={busy}><X size={19}/></Dialog.Close></header><div className="sb-modal-body">
  <div className={`sc-notice ${delivery?.status==='accepted'?'recorded':''}`}><span className="sc-notice-icon">{delivery?.status==='accepted'?<CheckCircle2 size={23}/>:<FileSignature size={23}/>}</span><div><strong>{delivery?deliveryStatus(delivery):'Direct naar een goede afspraak.'}</strong><p>{delivery?'Het document en je persoonlijke bericht blijven bij deze verzending bewaard. De ondertekening wordt afzonderlijk gevolgd in Mijn sponsoring.':'Controleer de volledige overeenkomst en schrijf je persoonlijke bericht. Pas bij versturen wordt de overeenkomst vastgezet en klaargezet voor ondertekening.'}</p></div><span className="sb-badge">{delivery?'Verzending vastgelegd':'Ter ondertekening'}</span></div>
  {error&&<p className="sb-error" role="alert">{error}</p>}{!prepared&&!error&&<p role="status">Sponsorovereenkomst laden…</p>}{prepared?.error&&<p className="sb-error" role="alert">{prepared.error}</p>}{deliveryId&&!delivery&&<div className="sc-notice"><div><strong>De vastgelegde verzendstatus wordt geladen.</strong><p>Vernieuw de status om deze overeenkomstverzending te bekijken.</p></div><button type="button" className="cms-button" disabled={busy} onClick={()=>{setError('');void loader.current().catch(reason=>{if(mounted.current)setError(reason instanceof Error?reason.message:'De status kon niet worden geladen.')})}}>Verzendstatus vernieuwen</button></div>}{!allowed&&<p className="sb-error" role="alert">Je hebt sponsorbeheerrechten nodig.</p>}
  {source&&allowed&&<div className="sc-compose-grid"><form className="sc-compose-form" onSubmit={event=>void send(event)}><div className="sc-section-heading"><Mail size={17}/><h3>{delivery?'Vastgelegde verzending':'Bericht aan de sponsor'}</h3></div><label className="cms-field"><span>Aan · e-mailadres</span><input type="email" required maxLength={254} autoComplete="off" value={recipient} readOnly={!canSend} disabled={busy} onChange={event=>setRecipient(event.target.value)}/><small>Dit bericht gaat naar de contactpersoon. Ondertekenen kan uitsluitend met een gekoppeld tekenbevoegd account.</small></label><label className="cms-field"><span>Onderwerp</span><input required maxLength={180} value={subject} readOnly={!canSend} disabled={busy} onChange={event=>setSubject(event.target.value)}/></label><label className="cms-field"><span>Persoonlijk bericht</span><textarea maxLength={5000} rows={10} value={message} readOnly={!canSend} disabled={busy} onChange={event=>setMessage(event.target.value)}/></label><div className="sc-attachment"><span className="sc-file-icon"><FileSignature size={23}/></span><div><strong>Sponsorovereenkomst · versie {source.version}</strong><small>{delivery?.agreementNumber||agreement?.number||'Documentnummer bij versturen'} · PDF in OnzeTrots-huisstijl</small><small>{source.snapshot.lines.length} tegenprestaties · {money(calculateSponsorProposalTotals(source.snapshot).totalCents)} incl. btw</small></div><button type="button" className="cms-button" disabled={busy} onClick={()=>void download()}><Download size={13}/>PDF</button></div><div className="sc-send-note"><ShieldCheck size={16}/><span>{delivery?'De vastgezette overeenkomst en dit bericht blijven bewaard. Factureren volgt pas na de ondertekening door beide partijen.':'Deze route slaat het conceptvoorstel over. De bijlage bevat de overeenkomstvoorwaarden; de sponsor tekent eerst en daarna de club. Teruggaan bewaart alleen het bewerkbare concept.'}</span></div>{delivery&&<dl className="sc-record-meta"><div><dt>Verzendstatus</dt><dd>{deliveryStatus(delivery)}</dd></div><div><dt>Vastgelegd</dt><dd>{timestamp(delivery.createdAt)}</dd></div><div><dt>Document</dt><dd>{delivery.agreementNumber} · versie {source.version}</dd></div>{delivery.acceptedAt&&<div><dt>Provideracceptatie</dt><dd>{timestamp(delivery.acceptedAt)}</dd></div>}{delivery.providerId&&<div><dt>Providerreferentie</dt><dd>{delivery.providerId}</dd></div>}</dl>}{delivery?.error&&<p className="sb-error" role="status">{delivery.error}</p>}<div className="sc-form-actions">{delivery?<>{!historical&&agreement?.status==='awaiting-signature'&&<button type="button" className="cms-button" disabled={busy} onClick={()=>{setError('');setDeliveryId('')}}><Mail size={14}/>Opnieuw versturen</button>}{!historical&&delivery.status==='failed'&&<button type="button" className="cms-button" disabled={busy} onClick={()=>void send(undefined,delivery.id)}><Send size={14}/>Dezelfde verzending opnieuw proberen</button>}<button type="button" className="cms-button primary" disabled={busy} onClick={onClose}>Gereed</button></>:<><button type="button" className="cms-button" disabled={busy} onClick={onClose}><ArrowLeft size={14}/>Terug</button><button className="cms-button primary" disabled={busy||!canSend}><Send size={14}/>{busy?'Voorbereiden…':'Sponsorovereenkomst versturen'}</button></>}</div></form><section className="sc-preview"><div className="sc-section-heading"><FileText size={17}/><h3>Bijlage · sponsorovereenkomst</h3><span className="sb-badge">Versie {source.version}</span></div><p>Volledige afspraken, tegenprestaties en voorwaarden. De PDF neemt deze vastgelegde inhoud over.</p><iframe sandbox="allow-same-origin" title={`Sponsorovereenkomst versie ${source.version} · ter ondertekening`} srcDoc={prepared.html}/></section></div>}
  {!!prepared?.deliveries.length&&<section className="sc-history"><div className="sc-section-heading"><History size={17}/><h3>Eerdere verzendingen</h3><span className="sb-badge">{prepared.deliveries.length}</span></div><p>Iedere verzending bewaart de geadresseerde en het persoonlijke bericht bij de documentversie.</p><div className="sc-history-rows">{prepared.deliveries.map(row=><div key={row.id} className={deliveryId===row.id?'selected':''}><FileSignature size={17}/><span><strong>Sponsorovereenkomst · versie {row.version}</strong><small>{row.recipient} · {timestamp(row.createdAt)}</small><small>{deliveryStatus(row)}</small></span><button type="button" className="cms-button" disabled={busy} onClick={()=>{setError('');setDeliveryId(row.id)}}>Bekijken</button></div>)}</div></section>}
 </div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

'use client';

import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {CheckCircle2,Copy,CreditCard,ExternalLink,RefreshCw,X} from 'lucide-react';
import {useDialogFocusReturn} from './dialog-focus';
import {money} from '@/lib/cms/sponsorship';
import './invoice-payment.css';

type Attempt={id:string;status:string;providerId:string|null;checkoutUrl:string|null;errorCode:string|null;mode:'test'|'live'};
type Payment={mode:'test'|'live';enabled:boolean;reason:string;attempt:Attempt|null};
const closed=new Set(['failed','canceled','expired']);
const labels:Record<string,string>={prepared:'Betaallink voorbereiden',uncertain:'Mollie heeft de aanvraag nog niet bevestigd',open:'Wacht op betaling',pending:'Betaling wordt verwerkt',authorized:'Betaling goedgekeurd, ontvangst volgt',paid:'Betaald',failed:'Betaling mislukt',canceled:'Betaling geannuleerd',expired:'Betaallink verlopen',review:'Controleer deze betaling in Mollie'};

export function InvoicePayment({sourceKind,sourceId,invoiceNumber,totalCents,onClose,onUpdated}:{sourceKind:'sponsors'|'donors';sourceId:string;invoiceNumber:string;totalCents:number;onClose:()=>void;onUpdated:()=>Promise<void>}){
 const focusReturn=useDialogFocusReturn(),[payment,setPayment]=useState<Payment|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 const operation=useRef(crypto.randomUUID()),operationMode=useRef<'test'|'live'|null>(null),controller=useRef<AbortController|null>(null),locked=useRef(false);
 const params=new URLSearchParams({sourceKind,sourceId}).toString();
 async function load(signal?:AbortSignal){
  const response=await fetch('/api/sponsorship/payments?'+params,{cache:'no-store',signal}),body=await response.json();
  if(!response.ok)throw Error(body.message||'De betaalgegevens konden niet worden geladen.');
  if(!signal?.aborted){if(operationMode.current!==body.mode){operation.current=crypto.randomUUID();operationMode.current=body.mode;}setPayment(body);}
 }
 useEffect(()=>{
  const current=new AbortController();controller.current=current;operation.current=crypto.randomUUID();operationMode.current=null;setPayment(null);setError('');
  const reload=()=>void load(current.signal).catch(reason=>{if(!current.signal.aborted)setError(reason instanceof Error?reason.message:'Laden mislukt.');});
  reload();window.addEventListener('focus',reload);
  return()=>{current.abort();window.removeEventListener('focus',reload);};
 },[sourceKind,sourceId]);
 async function act(verify=false){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');setCopied(false);
  const signal=controller.current?.signal;
  try{
   const previous=payment?.attempt;
   if(!verify&&previous&&closed.has(previous.status))operation.current=crypto.randomUUID();
   const body=verify?{action:'verify',sourceKind,sourceId}:{operationId:operation.current,sourceKind,sourceId,expectedMode:payment?.mode,...(previous?{previousAttemptId:previous.id}:{})};
   const response=await fetch('/api/sponsorship/payments',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(body)}),result=await response.json();
   if(!response.ok)throw Error(result.message||'De betaalactie kon niet worden verwerkt.');
   if(verify)setPayment(result);else await load(signal);
   await onUpdated();
  }catch(reason){
   if(!signal?.aborted){setError(reason instanceof Error?reason.message:'De betaalactie kon niet worden verwerkt.');await load(signal).catch(()=>{});}
  }finally{locked.current=false;if(!signal?.aborted)setBusy(false);}
 }
 const attempt=payment?.attempt,paid=attempt?.status==='paid',canCreate=payment?.enabled&&(!attempt||closed.has(attempt.status)||['prepared','uncertain'].includes(attempt.status));
 return <Dialog.Root open onOpenChange={open=>!open&&onClose()}><Dialog.Portal><Dialog.Overlay className="mip-overlay"/><Dialog.Content {...focusReturn} className="mip-dialog"><header><div><Dialog.Title>Mollie-betaallink</Dialog.Title><Dialog.Description>Maak een betaallink voor deze factuur en volg de bevestiging van Mollie.</Dialog.Description></div><Dialog.Close aria-label="Sluiten"><X size={19}/></Dialog.Close></header><div className="mip-body">
  <div className="mip-invoice"><CreditCard size={24}/><div><strong>{invoiceNumber}</strong><span>{money(totalCents)} inclusief btw</span></div>{payment&&<b className={payment.mode==='test'?'mip-mode test':'mip-mode'}>{payment.mode==='test'?'Testomgeving':'Liveomgeving'}</b>}</div>
  {!payment&&!error&&<p role="status">Betaalgegevens laden…</p>}
  {payment?.mode==='test'&&<p className="mip-note">Dit is een testbetaling. Er wordt geen echt geld afgeschreven en de factuur blijft openstaan.</p>}
  {attempt&&<div className={`mip-status${paid?' paid':''}`} role="status">{paid&&<CheckCircle2 size={18}/>}<span><strong>{paid&&attempt.mode==='test'?'Testbetaling voltooid':labels[attempt.status]||'Betaalstatus wordt gecontroleerd'}</strong>{paid&&attempt.mode==='live'&&<small>De factuur is bijgewerkt op basis van de bevestigde betaling.</small>}{attempt.providerId&&<small>Betaalreferentie: {attempt.providerId}</small>}</span></div>}
  {attempt?.checkoutUrl&&!paid&&!closed.has(attempt.status)&&attempt.status!=='review'&&<div className="mip-link"><label>Betaallink<input aria-label="Mollie-betaallink" readOnly value={attempt.checkoutUrl}/></label><div><a className="cms-button primary" href={attempt.checkoutUrl} target="_blank" rel="noreferrer">{attempt.mode==='test'?'Testbetaling openen':'Betaallink openen'} <ExternalLink size={14}/></a><button className="cms-button" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(attempt.checkoutUrl!);setCopied(true);}catch{setError('Selecteer en kopieer de betaallink uit het veld.');}}}><Copy size={14}/>{copied?'Gekopieerd':'Link kopiëren'}</button></div></div>}
  {payment&&!payment.enabled&&!attempt&&<div className="mip-note"><p>{payment.reason}</p><a href="/beheer?koppeling=mollie#instellingen" className="cms-button">Mollie instellen <ExternalLink size={13}/></a></div>}
  {error&&<p className="mip-error" role="alert">{error}</p>}
  <div className="mip-actions"><button className="cms-button" type="button" onClick={onClose}>Sluiten</button>{attempt?.providerId&&<button className="cms-button" type="button" disabled={busy} onClick={()=>void act(true)}><RefreshCw size={14}/>Betaalstatus controleren</button>}{canCreate&&<button className="cms-button primary" type="button" disabled={busy} onClick={()=>void act()}><CreditCard size={14}/>{busy?'Mollie wordt geraadpleegd…':attempt&&['prepared','uncertain'].includes(attempt.status)?'Dezelfde aanvraag herstellen':attempt?'Nieuwe betaallink maken':payment.mode==='test'?'Testbetaallink maken':'Betaallink maken'}</button>}</div>
  <p className="mip-help">De factuur wordt pas als betaald geregistreerd nadat Mollie de livebetaling heeft bevestigd. Je kunt de link kopiëren en zelf met de betaler delen.</p>
 </div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

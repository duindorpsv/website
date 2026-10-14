'use client';
import {useState} from 'react';
export function NewsletterTokenAction({token,action}:{token:string;action:'bevestigen'|'afmelden'}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <><button className="btn btn-blue" disabled={busy||!!message} onClick={async()=>{setBusy(true);try{const response=await fetch(`/api/newsletter/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();setMessage(data.message||'De aanvraag kon niet worden verwerkt.');}catch{setMessage('Geen verbinding. Probeer het opnieuw.');}finally{setBusy(false);}}}>{action==='bevestigen'?'Nieuwsbriefaanvraag bevestigen':'Nieuwsbrief afmelden'}</button>{message&&<p role="status">{message}</p>}</>;
}

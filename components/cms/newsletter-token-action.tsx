'use client';
import {useState} from 'react';
export function NewsletterTokenAction({token,action}:{token:string;action:'bevestigen'|'afmelden'}){
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 return <><button className="btn btn-blue" type="button" disabled={busy||done} onClick={async()=>{setBusy(true);setMessage('');try{const response=await fetch(`/api/newsletter/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok)throw Error(data.message||'De aanvraag kon niet worden verwerkt.');setMessage(data.message);setFailed(false);setDone(true);}catch(e){setFailed(true);setMessage(e instanceof Error?e.message:'Geen verbinding. Probeer het opnieuw.');}finally{setBusy(false);}}}>{busy?'Verwerken…':action==='bevestigen'?'Nieuwsbriefaanvraag bevestigen':'Nieuwsbrief afmelden'}</button>{message&&<p role={failed?'alert':'status'}>{message}</p>}</>;
}

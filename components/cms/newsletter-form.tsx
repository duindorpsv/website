'use client';
import {useRef,useState} from 'react';
import styles from './public-form.module.css';
export function NewsletterForm(){
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[consent,setConsent]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),operation=useRef({id:'',payload:''});
  return <form className={styles.root} aria-label="Nieuwsbrief aanvragen" onSubmit={async event=>{
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    const payload=JSON.stringify({email,name,consent});if(payload!==operation.current.payload||!operation.current.id)operation.current={id:crypto.randomUUID(),payload};
    try{
      const response=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:operation.current.id,email,name,topics:[],consent})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'Aanvraag mislukt. Probeer het opnieuw.');
      setMessage(data.message);setFailed(false);setEmail('');setName('');setConsent(false);operation.current={id:'',payload:''};
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:'Aanvraag mislukt. Je invoer blijft bewaard.');}finally{setBusy(false);}
  }}><fieldset className={styles.body} disabled={busy}><div className={styles.fields}><label className={styles.field}>Voornaam (optioneel)<input autoComplete="given-name" maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label><label className={styles.field}>E-mailadres *<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label><div className={`${styles.field} ${styles.wide}`}><label className={styles.checkbox}><input type="checkbox" required checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>Ik wil de nieuwsbrief ontvangen en bevestig mijn aanvraag via e-mail.</span></label></div></div><button className={styles.submit} style={{marginTop:20}} disabled={busy}>{busy?'Aanvragen…':'Nieuwsbrief aanvragen'}</button></fieldset>{message&&<p className={failed?styles.failure:styles.success} role={failed?'alert':'status'}>{message}</p>}</form>;
}

'use client';
import {useEffect,useState} from 'react';
import {authClient} from '@/lib/auth-client';
export function Login(){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[wait,setWait]=useState(0);
 useEffect(()=>{if(wait<=0)return;const timer=setTimeout(()=>setWait(wait-1),1000);return()=>clearTimeout(timer);},[wait]);
 async function requestCode(){
  setBusy(true);setMessage('');
  try{const result=await authClient.requestEmailCode({email});if(result.error)throw new Error(result.error.message);setSent(true);setCode('');setWait(60);setMessage('Als dit e-mailadres toegang heeft, ontvang je een inlogcode.');}
  catch(error){setMessage(error instanceof Error?error.message:'De code kon niet worden aangevraagd.');}finally{setBusy(false);}
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(!sent)return requestCode();setBusy(true);setMessage('');
  try{const result=await authClient.verifyEmailCode({email,code});if(result.error)throw new Error(result.error.message);location.assign('/beheer');}
  catch(error){setMessage(error instanceof Error?error.message:'Inloggen is niet gelukt.');setCode('');}finally{setBusy(false);}
 }
 return <main className="cms-panel" style={{maxWidth:480,margin:'10vh auto',padding:32}}><img src="/assets/logo.png" width={72} height={72} alt="Duindorp SV"/><h1>Clubbeheer</h1><p>Log in met een eenmalige code per e-mail.</p><form onSubmit={submit}>{sent?<><p>Vul de achtcijferige code in die naar <strong>{email}</strong> is gestuurd. De code is maximaal tien minuten geldig.</p><label className="cms-field">Inlogcode<input required autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,8))} style={{fontSize:28,letterSpacing:5}}/></label></>:<label className="cms-field">E-mailadres<input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label>}<button className="cms-button primary" disabled={busy}>{busy?'Bezig…':sent?'Inloggen':'Inlogcode aanvragen'}</button></form>{message&&<p role="status">{message}</p>}{sent&&<div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:20}}><button className="cms-button" disabled={busy||wait>0} onClick={requestCode}>{wait>0?`Nieuwe code over ${wait} seconden`:'Nieuwe code aanvragen'}</button><button className="cms-button" disabled={busy} onClick={()=>{setSent(false);setCode('');setMessage('');}}>Ander e-mailadres</button></div>}<p style={{marginTop:24}}>Je kunt alleen inloggen als een beheerder je toegang heeft gegeven. Neem voor toegang contact op met de club.</p></main>;
}
export function AccountSecurity(){const [message,setMessage]=useState('');return <main className="cms-panel" style={{maxWidth:680,margin:'5vh auto',padding:32}}><h1>Accountbeveiliging</h1><p>Je logt in met een eenmalige achtcijferige code per e-mail. Je hebt geen wachtwoord of authenticator nodig. Deel je code met niemand.</p><p>Een code is maximaal tien minuten geldig. Je sessie verloopt uiterlijk na twaalf uur. Met uitloggen beëindig je je CMS-sessies op alle apparaten.</p><button className="cms-button" onClick={async()=>{const result=await authClient.signOut();if(result.error)setMessage(result.error.message);else location.assign('/beheer/login');}}>Overal uitloggen</button>{message&&<p role="status">{message}</p>}<p><a href="/beheer">Terug naar beheer</a></p></main>;}

'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,Clock3,LoaderCircle,Mail,RotateCw,ShieldCheck} from 'lucide-react';
import {authClient} from '@/lib/auth-client';
import styles from './login.module.css';

export function Login({destination='/beheer'}:{destination?:'/beheer'|'/portaal'|'/sponsorportaal'}){
 const portal=destination!=='/beheer';
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[message,setMessage]=useState(''),[hasError,setHasError]=useState(false),[busy,setBusy]=useState(false),[wait,setWait]=useState(0);
 useEffect(()=>{if(wait<=0)return;const timer=setTimeout(()=>setWait(wait-1),1000);return()=>clearTimeout(timer);},[wait]);
 async function requestCode(){
  setBusy(true);setMessage('');setHasError(false);
  try{const result=await authClient.requestEmailCode({email});if(result.error)throw new Error(result.error.message);setSent(true);setCode('');setWait(60);setMessage('Als dit e-mailadres toegang heeft, ontvang je een inlogcode.');}
  catch(error){setHasError(true);setMessage(error instanceof Error?error.message:'De code kon niet worden aangevraagd.');}finally{setBusy(false);}
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(!sent)return requestCode();setBusy(true);setMessage('');setHasError(false);
  try{const result=await authClient.verifyEmailCode({email,code});if(result.error)throw new Error(result.error.message);location.assign(destination);}
  catch(error){setHasError(true);setMessage(error instanceof Error?error.message:'Inloggen is niet gelukt.');setCode('');}finally{setBusy(false);}
 }
 return <main className={styles.page}>
  <div className={styles.topbar}>
   <a href="/" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true"/>Terug naar de website</a>
   <span className={styles.topbarLabel}>{portal?'MIJN DUINDORP':'CLUBBEHEER'}</span>
  </div>
  <div className={styles.shell}>
   <section className={styles.clubPanel} aria-label="Duindorp SV">
    <img className={styles.clubPhoto} src="/assets/kit-locker.webp" alt="" width={1672} height={941}/>
    <div className={styles.photoShade}/>
    <a href="/" className={styles.brand} aria-label="Duindorp SV — naar de website">
     <img src="/assets/logo.png" alt="" width={56} height={64}/>
     <span>DUINDORP SV<small>ONZE WIJK. ONZE CLUB.</small></span>
    </a>
    <div className={styles.clubCopy}>
     <span className={styles.clubEyebrow}>SAMEN VOOR DUINDORP</span>
     <h2>Onze wijk.<br/>Onze club.<br/><span>Onze trots.</span></h2>
     <p>Voor iedereen die onze club vooruithelpt.</p>
    </div>
   </section>
   <section className={styles.formPanel} aria-labelledby="login-title">
    <div className={styles.formContent}>
     <div className={styles.mailIcon} aria-hidden="true"><Mail size={25} strokeWidth={1.7}/></div>
     <p className={styles.eyebrow}>{portal?'WELKOM BIJ MIJN DUINDORP':'WELKOM BIJ CLUBBEHEER'}</p>
     <h1 id="login-title" className={styles.title}>{sent?'Check je e-mail.':'Welkom terug.'}</h1>
     <p className={styles.intro}>{sent?'Vul de achtcijferige inlogcode in die je per e-mail ontvangt.':portal?'Jouw club en sponsorafspraken op één plek. Log in met je persoonlijke e-mailadres.':'Beheer wat onze club bijzonder maakt. Log eenvoudig in met een code per e-mail.'}</p>
     <ol className={styles.steps} aria-label="Inlogstappen">
      <li className={sent?styles.completedStep:styles.activeStep} aria-current={!sent?'step':undefined}>
       <span>{sent?<Check size={13} aria-hidden="true"/>:1}</span>E-mailadres
      </li>
      <li className={sent?styles.activeStep:undefined} aria-current={sent?'step':undefined}><span>2</span>Inlogcode</li>
     </ol>
     {sent&&<div className={styles.recipient}><Mail size={15} aria-hidden="true"/><span>{email}</span></div>}
     <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      {sent?<div className={styles.field}>
       <label htmlFor="login-code">Inlogcode</label>
       <input key="code" id="login-code" className={styles.codeInput} required autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} placeholder="00000000" readOnly={busy} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,8))} aria-describedby="login-code-hint"/>
       <p id="login-code-hint" className={styles.hint}><Clock3 size={14} aria-hidden="true"/>De code is maximaal 10 minuten geldig.</p>
      </div>:<div className={styles.field}>
       <label htmlFor="login-email">E-mailadres</label>
       <div className={styles.inputWrap}>
        <Mail size={18} aria-hidden="true"/>
        <input key="email" id="login-email" required type="email" autoComplete="email" placeholder="jouw@e-mailadres.nl" readOnly={busy} value={email} onChange={event=>setEmail(event.target.value)} aria-describedby="login-email-hint"/>
       </div>
       <p id="login-email-hint" className={styles.hint}>Gebruik het e-mailadres waarmee je toegang hebt.</p>
      </div>}
      {message&&<p className={hasError?styles.error:styles.srOnly} role={hasError?'alert':'status'}>{message}</p>}
      <button className={styles.submitButton} type="submit" disabled={busy||(sent&&code.length!==8)}>
       {busy?<><LoaderCircle size={18} className={styles.spinner} aria-hidden="true"/>{sent?'Inloggen…':'Code aanvragen…'}</>:<>{sent?'Inloggen':'Inlogcode aanvragen'}<ArrowRight size={18} aria-hidden="true"/></>}
      </button>
     </form>
     {sent?<div className={styles.codeActions}>
      <button className={styles.resendButton} type="button" disabled={busy||wait>0} onClick={requestCode}><RotateCw size={14} aria-hidden="true"/>{wait>0?`Nieuwe code over ${wait} seconden`:'Nieuwe code aanvragen'}</button>
      <button className={styles.changeEmailButton} type="button" disabled={busy} onClick={()=>{setSent(false);setCode('');setMessage('');setHasError(false);}}><ArrowLeft size={14} aria-hidden="true"/>Ander e-mailadres</button>
     </div>:<p className={styles.passwordNote}><ShieldCheck size={15} aria-hidden="true"/>Een persoonlijke code. Geen wachtwoord nodig.</p>}
     <div className={styles.accessNote}>
      <ShieldCheck size={18} aria-hidden="true"/>
      <p>Je kunt alleen inloggen als een beheerder je toegang heeft gegeven. Neem voor toegang <a href="/clubmuur/club/contact">contact op met de club</a>.</p>
     </div>
    </div>
   </section>
  </div>
  <p className={styles.footer}>Duindorp SV <span aria-hidden="true">·</span> Samen maken we de club.</p>
 </main>;
}
export function AccountSecurity(){const [message,setMessage]=useState('');return <main className="cms-panel" style={{maxWidth:680,margin:'5vh auto',padding:32}}><h1>Accountbeveiliging</h1><p>Je logt in met een eenmalige achtcijferige code per e-mail. Je hebt geen wachtwoord of authenticator nodig. Deel je code met niemand.</p><p>Een code is maximaal tien minuten geldig. Je sessie verloopt uiterlijk na twaalf uur. Met uitloggen beëindig je je CMS-sessies op alle apparaten.</p><button className="cms-button" onClick={async()=>{const result=await authClient.signOut();if(result.error)setMessage(result.error.message);else location.assign('/beheer/login');}}>Overal uitloggen</button>{message&&<p role="status">{message}</p>}<p><a href="/beheer">Terug naar beheer</a></p></main>;}

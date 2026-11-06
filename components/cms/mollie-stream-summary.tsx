'use client';
import {useEffect,useState} from 'react';
import {CreditCard,ExternalLink} from 'lucide-react';
import {useCMS} from './provider';
import './mollie-stream-summary.css';
type Summary={mode:'test'|'live';available:boolean;reason:string;profileName:string;balanceDescription:string;referencePrefix:string;classificationLabel:string;paymentsEnabled:false};
export function MollieStreamSummary({streamCode}:{streamCode:'sponsors'|'donations'}){
 const {can}=useCMS(),[summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;async function load(){try{const response=await fetch('/api/cms/mollie?stream='+streamCode,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'De betaalroute is niet beschikbaar.');if(active){setSummary(data);setError('');}}catch(reason){if(active){setSummary(null);setError(reason instanceof Error?reason.message:'De betaalroute is niet beschikbaar.');}}}void load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load)}},[streamCode]);
 return <div className="mss-summary"><div className="mss-heading"><CreditCard size={18}/><strong>Mollie · {streamCode==='sponsors'?'sponsoring':'donateurs'}</strong><span>{summary?.mode==='live'?'Live-inrichting':'Testinrichting'}</span></div>
  {summary?.available?<><p><b>{summary.profileName}</b><br/>{summary.balanceDescription} · referentie {summary.referencePrefix}</p><small>{summary.classificationLabel}. Betalingen zijn uitgeschakeld.</small></>:<p>{error||summary?.reason||'Betaalroute laden…'}</p>}
  {can('settings')?<a className="cms-button" href="/beheer?koppeling=mollie#instellingen">Mollie instellen <ExternalLink size={13}/></a>:<small>Een beheerder met clubinstellingen kan deze betaalstroom koppelen.</small>}
 </div>;
}

'use client';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import styles from './admin-workspace.module.css';
type Status={mailConfigured:boolean;sportlinkReadConfigured:boolean};
export function IntegrationStatus(){
 const [status,setStatus]=useState<Status|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function refresh(){setLoading(true);setError('');try{const response=await fetch('/api/cms/integrations',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'Koppelingen ophalen is mislukt.');setStatus(data);}catch(error){setError(error instanceof Error?error.message:'Koppelingen ophalen is mislukt.');}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 return <section aria-label="Status van koppelingen">{error&&<p role="alert">{error}</p>}<div className={styles.integration}><span><strong>Sportlink · voetbalgegevens</strong><a href="#sportlink">Synchronisatie-instellingen beheren</a><small>Leesinstellingen voor teams en wedstrijden. De status controleert de configuratie.</small></span><b data-ready={!!status?.sportlinkReadConfigured}>{loading?'Laden…':status?.sportlinkReadConfigured?'Ingesteld':'Niet ingesteld'}</b></div><div className={styles.integration}><span><strong>E-mail · Resend API</strong><small>Formuliernotificaties en nieuwsbrieven. Abonnees en afmeldingen blijven in het CMS.</small></span><b data-ready={!!status?.mailConfigured}>{loading?'Laden…':status?.mailConfigured?'Ingesteld':'Niet ingesteld'}</b></div><div className={styles.integration}><span><strong>Ledenaanmeldingen</strong><small>Inschrijvingen worden opgeslagen in de inbox en door het secretariaat opgevolgd.</small></span><b>Handmatige opvolging</b></div><button type="button" className="cms-button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={13}/>Status vernieuwen</button></section>;
}

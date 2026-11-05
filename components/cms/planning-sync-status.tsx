'use client';
import {CheckCircle2,Clock3,RefreshCw,TriangleAlert} from 'lucide-react';
import {useCMS} from './provider';
import './planning-sync-status.css';
export function PlanningSyncStatus(){
 const {planningSync:sync,planningConnected,can,preview}=useCMS();
 const missing=!sync?.configured||!sync.credentialConfigured;
 const running=sync?.status==='running',failed=sync?.status==='failed';
 const Icon=running?RefreshCw:failed||missing?TriangleAlert:sync?.status==='success'?CheckCircle2:Clock3;
 const stamp=sync?.lastSuccessAt?new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'short',timeStyle:'short'}).format(new Date(sync.lastSuccessAt)):'Nog niet';
 return <section className="planning-sync" aria-label="Sportlink planningstatus" role="status" data-status={failed?'failed':running?'running':'idle'}><Icon size={20}/><div><strong>{preview?'Voorbeeldweergave':!sync?'Verbinding met gedeelde planning maken…':missing?'Sportlink nog niet geconfigureerd':running?'Bronupdate wordt verwerkt':failed?'Bronupdate niet verwerkt':'Gedeelde jaaragenda en bezetting'}</strong><p>{sync?.message||'Sportlink wordt via de ingestelde broncontroles opgehaald. Een geldige update werkt beide overzichten samen bij.'}</p><small>Laatste succes: {stamp} · {planningConnected?'Live beheerverbinding':'Beheerverbinding onderbroken; wijzigingen worden na herstel opgehaald'}{!can('settings')?' · Alleen-lezen bronstatus':''}</small>{sync?.counts&&<div className="planning-sync-counts"><span>{(sync.counts.imported||0)+(sync.counts.updated||0)+(sync.counts.unchanged||0)} verwerkt</span><span>{sync.counts.skipped||0} overgeslagen</span><span>{sync.counts.unresolved||0} te beoordelen</span></div>}</div>{can('settings')&&<a className="cms-button" href="#sportlink">Koppeling beheren</a>}</section>;
}

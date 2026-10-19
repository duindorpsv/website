'use client';
import {defaultSponsors} from '@/lib/cms/site-sponsors';
import {SponsorFields} from './sponsor-fields';
import {useState} from 'react';
import {siteCopyFields,siteText,type SiteCopyKey} from '@/lib/cms/site-copy';
import {useCMS} from './provider';

export function SiteCopyManager(){
 const {state,can,update}=useCMS();const [draft,setDraft]=useState(()=>({...state.settings.siteCopy})),[sponsors,setSponsors]=useState(()=>structuredClone(state.settings.sponsors??defaultSponsors)),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const editable=can('settings')&&can('publish',undefined,'settings');
 return <form className="cms-panel" onSubmit={async event=>{event.preventDefault();setBusy(true);try{if(await update(next=>{next.settings.siteCopy=draft;next.settings.sponsors=sponsors;},'Website-teksten gepubliceerd',{'settings':{action:'publish'}}))setMessage('De teksten zijn gepubliceerd op de website.');}finally{setBusy(false);}}}><h3>Website-teksten</h3><p>De vaste teksten op de homepage, overzichtspagina’s en in de voettekst. De inhoud van clubpagina’s beheer je bij Pagina’s.</p><fieldset disabled={!editable||busy}>{[['home','Homepage'],['news','Nieuws en verhalen'],['teams','Teams en wedstrijden'],['footer','Voettekst']].map(([group,label])=><details key={group} open={group==='home'}><summary>{label}</summary>{siteCopyFields.filter(field=>field[0]===group).map(([,key,label])=><label className="cms-field" key={key}>{label}<textarea rows={2} maxLength={2000} value={draft[key as SiteCopyKey]??siteText(state,key)} onChange={event=>setDraft(value=>({...value,[key]:event.target.value}))}/></label>)}</details>)}<SponsorFields items={sponsors} onChange={setSponsors}/></fieldset><button className="cms-button primary" disabled={!editable||busy}>{busy?'Publiceren…':'Teksten opslaan en publiceren'}</button>{message&&<p role="status">{message}</p>}</form>;
}

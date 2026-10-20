'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,Clock3,Eye,MessageSquareQuote,RefreshCw,Save,Send,ShieldCheck} from 'lucide-react';
import {useCMS} from './provider';
import {Pagination,usePagination} from './pagination';
import {emptyMatchPreviewContent,matchPreviewContent,previewUtcDate,validateMatchPreview} from '@/lib/cms/match-preview';
import type {CmsMatchPreview,MatchPreviewContent,CmsCommand} from '@/lib/cms/types';
import type {SportlinkMatch,SportlinkTeam} from '@/lib/sportlink-types';
import './match-preview-manager.css';
const format=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const label=(match:SportlinkMatch)=>`${match.home.name} – ${match.away.name}`;
type Choices={firstTeam:SportlinkTeam|null;cmsTeamId:string;items:SportlinkMatch[]};
const answers=[{key:'intro',label:'Inleiding',max:1200},{key:'whatAtStake',label:'Wat staat er op het spel?',max:3000},{key:'preparation',label:'Hoe bereiden we ons voor?',max:3000},{key:'supporterFocus',label:'Waarop moeten supporters letten?',max:3000}] as const;
export function MatchPreviewManager(){
 const {state,update,can,recordVersion,saving,reload}=useCMS();
 const [choices,setChoices]=useState<Choices|null>(null),[failure,setFailure]=useState(''),[matchId,setMatchId]=useState(''),[query,setQuery]=useState(''),[draft,setDraft]=useState<MatchPreviewContent>(emptyMatchPreviewContent),[base,setBase]=useState(0),[schedule,setSchedule]=useState(''),[errors,setErrors]=useState<string[]>([]),[preview,setPreview]=useState(false);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/cms/match-previews/matches',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.message||'De wedstrijdselectie kon niet worden geladen.');if(!controller.signal.aborted)setChoices(data);}).catch(error=>{if(!controller.signal.aborted)setFailure(error.message);});return()=>controller.abort();},[]);
 const match=choices?.items.find(item=>item.id===matchId),saved=state.matchPreviews.find(item=>item.matchId===matchId&&!item.deletedAt),id=`match-preview-${matchId}`;
 const filtered=(choices?.items||[]).filter(match=>label(match).toLowerCase().includes(query.trim().toLowerCase())),pagination=usePagination(filtered,query);
 const editable=!!match&&!!choices?.firstTeam&&can('news',choices.cmsTeamId),publishable=editable&&can('publish',choices?.cmsTeamId,'news'),conflict=!!matchId&&recordVersion(id)!==base;
 function choose(next:string){const row=state.matchPreviews.find(item=>item.matchId===next&&!item.deletedAt);setMatchId(next);setDraft(row?matchPreviewContent(row):emptyMatchPreviewContent());setBase(recordVersion(`match-preview-${next}`));setErrors([]);setPreview(false);setSchedule('');}
 function field<K extends keyof MatchPreviewContent>(key:K,value:MatchPreviewContent[K]){setDraft(previous=>({...previous,[key]:value}));}
 async function persist(action:CmsCommand['action']){
  if(!match||!choices?.firstTeam||!editable||conflict)return;
  if(['publish','schedule','unpublish','cancelSchedule'].includes(action)&&!publishable)return;
  const issues=['publish','schedule'].includes(action)?validateMatchPreview(draft):[];
  const scheduledAt=action==='schedule'?previewUtcDate(schedule):undefined;
  if(action==='schedule'&&(!scheduledAt||Date.parse(scheduledAt)<=Date.now()))issues.push('Kies een geldig toekomstig tijdstip in Europe/Amsterdam. Een dubbel of niet-bestaand tijdstip wordt niet geaccepteerd.');
  setErrors(issues);if(issues.length)return;
  const row:CmsMatchPreview={...draft,id,matchId:match.id,firstTeamId:choices.firstTeam.id,teamId:choices.cmsTeamId,title:label(match),status:'draft',publishAt:'',updatedAt:new Date().toISOString()};
  const success=await update(next=>{const index=next.matchPreviews.findIndex(item=>item.id===id);if(index<0)next.matchPreviews.push(row);else next.matchPreviews[index]=row;},action==='save'?'Vooruitblik als concept bewaard.':action==='schedule'?'Vooruitblik ingepland.':action==='unpublish'?'Vooruitblik ingetrokken.':'Vooruitblik bijgewerkt.',{[id]:{action,expectedVersion:base,scheduledAt}});
  if(success)setBase(recordVersion(id));
 }
 return <div className="cmp-manager">
  <section className="cms-panel cmp-selector"><div><span className="dd-eyebrow">ONS EERSTE · VOORUITBLIK</span><h2>Stem uit de kleedkamer.</h2><p>Kies een gesynchroniseerde wedstrijd van het eerste elftal. Je bewerkt hier uitsluitend redactionele tekst; Sportlink beheert de wedstrijdgegevens.</p></div><MessageSquareQuote size={31}/></section>
  {failure&&<p className="cms-status" role="alert">{failure}</p>}
  {!choices&&!failure&&<p role="status">Opgeslagen wedstrijden laden…</p>}
  {choices&&!choices.items.length&&<section className="cms-panel cms-empty"><CalendarDays/><h2>Nog geen beschikbare wedstrijden.</h2><p>Synchroniseer eerst de wedstrijden van het bevestigde eerste elftal via de Sportlink-instellingen.</p></section>}
  {choices&&choices.items.length>0&&<section className="cms-panel"><label className="cms-field">Zoek een wedstrijd<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Teamnaam"/></label><div className="cmp-match-list">{pagination.items.map(item=><button className="cms-button" type="button" key={item.id} aria-pressed={matchId===item.id} onClick={()=>choose(item.id)}><CalendarDays size={17}/><span><b>{label(item)}</b><small>{format.format(new Date(item.kickoff))}</small></span></button>)}</div><Pagination label="Voorbeschouwingen" {...pagination}/></section>}
  {match&&<><div className="cmp-toolbar"><span><CalendarDays size={18}/><b>{label(match)}</b><small>{format.format(new Date(match.kickoff))}</small></span><div><button className="cms-button" onClick={()=>setPreview(value=>!value)}><Eye size={16}/>Voorbeeld</button><button className="cms-button" disabled={!editable||saving||conflict} onClick={()=>void persist('save')}><Save size={16}/>Concept bewaren</button><button className="cms-button primary" disabled={!publishable||saving||conflict} onClick={()=>void persist('publish')}><Send size={16}/>{saved?.live?'Publicatie bijwerken':'Publiceren'}</button></div></div>
  {conflict&&<div className="cms-status" role="alert">Deze vooruitblik is gewijzigd. Je tekst blijft hier staan. <button className="cms-button" onClick={async()=>{await reload();choose(matchId);}}><RefreshCw size={16}/>Serverversie laden</button></div>}
  {errors.length>0&&<ul className="cms-status" role="alert">{errors.map(error=><li key={error}>{error}</li>)}</ul>}
  <div className="cmp-workspace"><section className="cms-panel cmp-editor"><label className="cmp-enable"><input type="checkbox" checked={draft.enabled} disabled={!editable} onChange={event=>field('enabled',event.target.checked)}/><span><b>Stem uit de kleedkamer inschakelen</b><small>De tab Kleedkamer verschijnt na een geldige publicatie.</small></span></label><div className="cmp-pair"><label className="cms-field">Spreker<input maxLength={120} value={draft.speaker} disabled={!editable} onChange={event=>field('speaker',event.target.value)}/></label><label className="cms-field">Rol<input maxLength={120} value={draft.role} disabled={!editable} onChange={event=>field('role',event.target.value)}/></label></div>{answers.map(item=><label key={item.key} className="cms-field">{item.label}<textarea rows={item.key==='intro'?3:5} maxLength={item.max} value={draft[item.key]} disabled={!editable} onChange={event=>field(item.key,event.target.value)}/><small>{draft[item.key].length}/{item.max} · optioneel</small></label>)}</section>
   <aside className="cmp-sidebar"><section className="cms-panel"><h3><ShieldCheck size={18}/>Publicatie</h3><b>{saved?.live?'Er staat een vooruitblik op de website.':'Nog geen openbare vooruitblik.'}</b><p>Concept, live-publicatie en ingeplande versie blijven onafhankelijk.</p>{saved?.scheduledAt&&<p>Ingepland: {format.format(new Date(saved.scheduledAt))}</p>}{saved?.live&&<button className="cms-button" disabled={!publishable||saving||conflict} onClick={()=>void persist('unpublish')}>Publicatie intrekken</button>}{saved?.scheduledAt&&<button className="cms-button" disabled={!publishable||saving||conflict} onClick={()=>void persist('cancelSchedule')}>Planning annuleren</button>}</section><section className="cms-panel"><h3><Clock3 size={18}/>Publicatie plannen</h3><label className="cms-field">Datum en tijd · Europe/Amsterdam<input type="datetime-local" value={schedule} onChange={event=>setSchedule(event.target.value)} disabled={!publishable}/></label><button className="cms-button" disabled={!publishable||saving||conflict} onClick={()=>void persist('schedule')}>Deze versie inplannen</button><small>Een huidige publicatie blijft zichtbaar tot dit moment.</small></section></aside></div>
  {preview&&<section className="cms-panel cmp-preview"><span className="dd-eyebrow">VOORBEELD VAN JE WERKVERSIE</span><h2>Stem uit de kleedkamer</h2><strong>{draft.speaker}</strong><p>{draft.role}</p>{answers.filter(item=>draft[item.key].trim()).map(item=><div key={item.key}>{item.key!=='intro'&&<h3>{item.label}</h3>}<p style={{whiteSpace:'pre-wrap'}}>{draft[item.key]}</p></div>)}</section>}</>}
 </div>;
}

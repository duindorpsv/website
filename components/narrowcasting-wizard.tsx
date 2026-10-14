'use client';

import {useEffect, useId, useMemo, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, ArrowRight, Check, CircleCheck, LayoutGrid, Monitor, Plus, Search, Smartphone, Trophy, Users, X} from 'lucide-react';
import {useSportlink} from '@/hooks/use-sportlink';
import {defaultSportsConfig, kindTitles, narrowcastKinds, type NarrowcastGroup, type NarrowcastKind, type NarrowcastSlide, type NarrowcastSportsConfig} from '@/lib/narrowcasting-config';
import type {SportlinkTeam} from '@/lib/sportlink-types';

type Props = {onCreate:(group:NarrowcastGroup)=>void;onClose:()=>void;portrait:boolean};
type DraftSlide = Omit<NarrowcastSlide, 'id'>;
type Scope = NarrowcastSportsConfig['scope'];
const stepNames = ['Teams', 'Slides', 'Indeling'];
const kindDescriptions:Record<NarrowcastKind,string> = {
  programma:'Komende wedstrijden met aftraptijden.',
  uitslagen:'Gespeelde wedstrijden met de eindstand.',
  stand:'De volledige poule, inclusief de vorm per team.',
  wedstrijd:'De eerstvolgende wedstrijd van het eerste, uit of thuis.',
  kantine:'De prijslijst van de kantine.',
  clubnieuws:'Berichten en activiteiten van de club.',
  partners:'Een scherm voor onze partners.',
  welkom:'Een welkom voor bezoekers op de club.',
};

/** Keep a club programme collective, but never combine different league tables. */
export function draftNarrowcastSlides({scope, teams, kinds, individual, venue, layout}:{scope:Scope;teams:SportlinkTeam[];kinds:NarrowcastKind[];individual:boolean;venue:NarrowcastSportsConfig['venue'];layout:NarrowcastSportsConfig['layout']}):DraftSlide[] {
  teams = [...new Map(teams.map(team=>[team.id,team])).values()];
  const base:NarrowcastSportsConfig = {scope, teamIds:scope === 'teams' ? teams.map(team=>team.id) : [], venue, layout};
  return [...new Set(kinds)].flatMap((kind):DraftSlide[]=>{
    if (kind === 'wedstrijd') return [{kind,title:kindTitles[kind],config:{...defaultSportsConfig,layout}}];
    if (!['programma','uitslagen','stand'].includes(kind)) return [{kind,title:kindTitles[kind],config:{...defaultSportsConfig,layout}}];
    if (scope !== 'competition' && (kind === 'stand' || individual)) {
      return teams.map(team=>({kind,title:`${kindTitles[kind]} · ${team.name}`,config:{...base,scope:'teams' as const,teamIds:[team.id],venue:kind === 'stand' ? 'all' as const : venue}}));
    }
    const suffix = scope === 'competition' ? 'Poule van het eerste' : scope === 'club' ? 'Hele club' : teams.length === 1 ? teams[0]?.name : `${teams.length} teams`;
    return [{kind,title:`${kindTitles[kind]} · ${suffix}`,config:{...base,venue:kind === 'stand' ? 'all' as const : venue}}];
  });
}

export function narrowcastDraftIssue(slides:DraftSlide[]):string|null {
  if (!slides.length) return 'Kies minimaal één soort slide.';
  if (slides.length > 100) return 'Deze selectie maakt meer dan 100 slides. Kies minder teams of combineer programma en uitslagen.';
  return null;
}

export function NarrowcastingWizard({onCreate,onClose,portrait:initialPortrait}:Props) {
  const {data,loading,error,reload} = useSportlink();
  const [step,setStep] = useState(0);
  const [scope,setScope] = useState<Scope>('competition');
  const [teamIds,setTeamIds] = useState<string[]>([]);
  const [query,setQuery] = useState('');
  const [kinds,setKinds] = useState<NarrowcastKind[]>(['programma','uitslagen','stand']);
  const [individual,setIndividual] = useState(false);
  const [name,setName] = useState('Zaterdag op de club');
  const [portrait,setPortrait] = useState(initialPortrait);
  const [venue,setVenue] = useState<NarrowcastSportsConfig['venue']>('all');
  const [layout,setLayout] = useState<NarrowcastSportsConfig['layout']>('auto');
  const [validation,setValidation] = useState('');
  const [creating,setCreating] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const teams = useMemo(()=>[...(data?.teams ?? [])].sort((a,b)=>a.name.localeCompare(b.name,'nl',{numeric:true})),[data?.teams]);
  const visibleTeams = useMemo(()=>teams.filter(team=>`${team.name} ${team.category}`.toLocaleLowerCase('nl').includes(query.trim().toLocaleLowerCase('nl'))),[teams,query]);
  const selectedTeams = useMemo(()=>scope === 'club' ? teams : teams.filter(team=>teamIds.includes(team.id)),[scope,teams,teamIds]);
  const drafts = useMemo(()=>draftNarrowcastSlides({scope,teams:selectedTeams,kinds,individual,venue,layout}),[scope,selectedTeams,kinds,individual,venue,layout]);
  const allVisibleSelected = visibleTeams.length > 0 && visibleTeams.every(team=>teamIds.includes(team.id));
  const hasMatchLists = kinds.includes('programma') || kinds.includes('uitslagen');
  const hasTeamSlides = kinds.some(kind=>['programma','uitslagen','stand'].includes(kind));
  const selectionIssue = scope !== 'competition' && selectedTeams.length === 0;
  const countIssue = drafts.length > 0 ? narrowcastDraftIssue(drafts) : null;

  useEffect(()=>{
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event:KeyboardEvent)=>{
      if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();closeRef.current();return;}
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? [])].filter(node=>node.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length-1];
      if (!first) {event.preventDefault();titleRef.current?.focus();return;}
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown,true);
    return ()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',onKeyDown,true);previousFocus?.focus();};
  },[]);

  useEffect(()=>{titleRef.current?.focus();dialogRef.current?.querySelector('.ncw-body')?.scrollTo({top:0});},[step]);

  function next() {
    if (step === 0 && selectionIssue) {setValidation(scope === 'teams' ? 'Selecteer minimaal één team.' : 'Wacht tot de clubteams beschikbaar zijn of kies de poule van het eerste.');return;}
    if (step === 1 && !kinds.length) {setValidation('Kies minimaal één soort slide.');return;}
    if (step === 1 && countIssue) {setValidation(countIssue);return;}
    setValidation('');setStep(current=>Math.min(2,current+1));
  }
  function submit(event:FormEvent) {
    event.preventDefault();
    if (step < 2) {next();return;}
    if (!name.trim()) {setValidation('Geef de schermgroep een naam.');return;}
    if (!drafts.length || !kinds.length || (hasTeamSlides && selectionIssue)) {setValidation('Kies teams en minimaal één slide voordat je de groep aanmaakt.');return;}
    if (countIssue) {setValidation(countIssue);return;}
    if (creating) return;
    setCreating(true);
    onCreate({id:crypto.randomUUID(),name:name.trim(),portrait,slides:drafts.map(slide=>({...slide,id:crypto.randomUUID()}))});
  }
  function toggleKind(kind:NarrowcastKind) {
    setKinds(current=>narrowcastKinds.filter(value=>value===kind ? !current.includes(value) : current.includes(value)));
    setValidation('');
  }
  function toggleVisibleTeams() {
    setTeamIds(current=>allVisibleSelected ? current.filter(id=>!visibleTeams.some(team=>team.id===id)) : [...new Set([...current,...visibleTeams.map(team=>team.id)])]);
    setValidation('');
  }

  return <div className="ncw-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="ncw-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
      <form onSubmit={submit}>
        <header className="ncw-header">
          <div><span className="ncw-eyebrow">ONZETROTS TV · SCHERMGROEP</span><h2 id={titleId} ref={titleRef} tabIndex={-1}>Nieuwe schermgroep</h2><p>Kies je teams, slides en schermformaat.</p></div>
          <button type="button" className="ncw-close" onClick={onClose} aria-label="Wizard sluiten"><X size={22}/></button>
        </header>
        <ol className="ncw-steps" aria-label="Voortgang">
          {stepNames.map((label,index)=><li key={label} className={index===step?'ncw-current':index<step?'ncw-done':''} aria-current={index===step?'step':undefined}><span>{index<step?<Check size={14}/>:index+1}</span>{label}</li>)}
        </ol>
        <div className="ncw-body">
          {step === 0 && <>
            <fieldset className="ncw-fieldset"><legend>Welke teams wil je tonen?</legend>
              <div className="ncw-scope-grid">
                {([
                  ['competition','Poule van het eerste','Dezelfde speelrondes en stand als op de website.',Trophy],
                  ['teams','Eén of meer teams','Selecteer de clubteams voor deze schermgroep.',Users],
                  ['club','Hele club','Programma en uitslagen van alle clubteams.',LayoutGrid],
                ] as const).map(([value,label,description,Icon])=><label key={value} className={`ncw-choice ${scope===value?'ncw-chosen':''}`}><input type="radio" name="ncw-scope" value={value} checked={scope===value} onChange={()=>{setScope(value);setValidation('');}}/><Icon size={25} aria-hidden="true"/><strong>{label}</strong><small>{description}</small></label>)}
              </div>
            </fieldset>
            {scope !== 'competition' && <div className="ncw-teams-panel">
              {!data && loading && <p className="ncw-state" role="status">Clubteams laden…</p>}
              {(error || (!loading && !teams.length)) && <div className="ncw-data-warning" role="status"><p>{error || 'Er zijn nog geen clubteams beschikbaar.'}</p><button type="button" className="ncw-text-button" onClick={reload} disabled={loading}>{loading?'Opnieuw laden…':'Opnieuw proberen'}</button></div>}
              {teams.length>0 && scope==='club' && <p className="ncw-info"><Users size={21} aria-hidden="true"/><span><strong>Alle {teams.length} clubteams geselecteerd.</strong> Programma en uitslagen kun je combineren. Een standenlijst blijft altijd per team.</span></p>}
              {teams.length>0 && scope==='teams' && <>
                <label className="ncw-search"><Search size={18} aria-hidden="true"/><span className="ncw-sr-only">Zoek een team</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Zoek een team…"/></label>
                <div className="ncw-selection-bar"><span>{selectedTeams.length} van {teams.length} geselecteerd</span><button type="button" className="ncw-text-button" onClick={toggleVisibleTeams} disabled={!visibleTeams.length}>{allVisibleSelected?'Zichtbare teams uitzetten':'Alle zichtbare teams kiezen'}</button></div>
                <div className="ncw-team-list">{visibleTeams.map(team=><label key={team.id} className="ncw-team"><input type="checkbox" checked={teamIds.includes(team.id)} onChange={()=>{setTeamIds(current=>current.includes(team.id)?current.filter(id=>id!==team.id):[...current,team.id]);setValidation('');}}/><span><strong>{team.name}</strong><small>{[team.category,team.day].filter(Boolean).join(' · ')}</small></span></label>)}{!visibleTeams.length&&<p className="ncw-empty">Geen teams gevonden. Pas je zoekopdracht aan.</p>}</div>
              </>}
            </div>}
            {scope==='competition'&&<p className="ncw-info"><Trophy size={21} aria-hidden="true"/><span>Deze keuze gebruikt de drie wedstrijdcontainers van de website: de volgende speelronde, de vorige speelronde en de volledige stand van de poule.</span></p>}
          </>}

          {step === 1 && <>
            <fieldset className="ncw-fieldset"><legend>Welke slides wil je maken?</legend><div className="ncw-kind-grid">{narrowcastKinds.map(kind=><label className={`ncw-kind ${kinds.includes(kind)?'ncw-chosen':''}`} key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={()=>toggleKind(kind)}/><span><strong>{kindTitles[kind]}</strong><small>{kindDescriptions[kind]}</small></span></label>)}</div></fieldset>
            {scope!=='competition' && hasMatchLists && <fieldset className="ncw-fieldset ncw-combine"><legend>Programma en uitslagen indelen</legend><label><input type="radio" name="ncw-combine" checked={!individual} onChange={()=>setIndividual(false)}/><span><strong>Teams samen op één slide per soort</strong><small>De wedstrijden komen in één gezamenlijke lijst.</small></span></label><label><input type="radio" name="ncw-combine" checked={individual} onChange={()=>setIndividual(true)}/><span><strong>Een aparte slide per team</strong><small>Elk geselecteerd team krijgt zijn eigen programma en uitslagen.</small></span></label></fieldset>}
            {kinds.includes('stand')&&scope!=='competition'&&<p className="ncw-info"><Trophy size={21} aria-hidden="true"/><span>Standen verschijnen apart per team: {selectedTeams.length} {selectedTeams.length===1?'standenlijst':'standenlijsten'}. Elke slide toont de volledige poule van dat team.</span></p>}
            {kinds.includes('wedstrijd')&&<p className="ncw-hint">“Volgende wedstrijd” toont altijd het eerste elftal, zowel uit als thuis.</p>}
          </>}

          {step === 2 && <>
            <label className="ncw-name">Naam van de groep<input value={name} onChange={event=>{setName(event.target.value);setValidation('');}} maxLength={80} placeholder="Bijvoorbeeld: Zaterdag op de club" autoComplete="off"/></label>
            <fieldset className="ncw-fieldset"><legend>Schermformaat</legend><div className="ncw-format-grid"><label className={`ncw-format ${!portrait?'ncw-chosen':''}`}><input type="radio" name="ncw-format" checked={!portrait} onChange={()=>setPortrait(false)}/><Monitor size={32} aria-hidden="true"/><span><strong>16:9 · Liggend</strong><small>1920 × 1080</small></span></label><label className={`ncw-format ${portrait?'ncw-chosen':''}`}><input type="radio" name="ncw-format" checked={portrait} onChange={()=>setPortrait(true)}/><Smartphone size={32} aria-hidden="true"/><span><strong>9:16 · Staand</strong><small>1080 × 1920</small></span></label></div></fieldset>
            {hasMatchLists&&<div className="ncw-settings-grid"><label>Indeling van de teamnamen<select value={layout} onChange={event=>setLayout(event.target.value as NarrowcastSportsConfig['layout'])}><option value="auto">Automatisch per schermformaat</option><option value="side-by-side">Naast elkaar</option><option value="stacked">Onder elkaar</option></select><small>Automatisch: naast elkaar op 16:9, onder elkaar op 9:16. Logo’s staan links van de namen.</small></label><label>Uit- en thuiswedstrijden<select value={venue} onChange={event=>setVenue(event.target.value as NarrowcastSportsConfig['venue'])}><option value="all">Uit én thuis</option><option value="home">Alleen thuis</option><option value="away">Alleen uit</option></select><small>{scope==='competition'?'Bij alleen uit of thuis zie je de wedstrijden van ons eerste uit deze speelronde.':'Dit filter geldt voor het programma en de uitslagen van de gekozen clubteams.'}</small></label></div>}
            <div className="ncw-review"><div className="ncw-review-heading"><CircleCheck size={23} aria-hidden="true"/><strong>{drafts.length} {drafts.length===1?'slide':'slides'} in één groep</strong><span>{portrait?'9:16':'16:9'}</span></div><ol>{drafts.slice(0,8).map((slide,index)=><li key={`${slide.kind}-${index}`}>{slide.title}</li>)}</ol>{drafts.length>8&&<p>En {drafts.length-8} andere slides.</p>}<p>Je kunt de groep daarna selecteren, slides aan- of uitzetten en de schermlink openen.</p></div>
          </>}
          {(validation||countIssue)&&<p className="ncw-error" role="alert">{validation||countIssue}</p>}
        </div>
        <footer className="ncw-footer"><div><span>Stap {step+1} van 3</span>{step>0&&<small>{drafts.length} slides</small>}</div><div className="ncw-actions">{step>0?<button type="button" className="ncw-secondary" onClick={()=>{setStep(current=>current-1);setValidation('');}}><ArrowLeft size={17}/>Terug</button>:<button type="button" className="ncw-secondary" onClick={onClose}>Annuleren</button>}<button type="submit" className="ncw-primary" disabled={creating||(step===2&&!!countIssue)}>{step===2?<><Plus size={18}/>{creating?'Groep aanmaken…':'Groep aanmaken'}</>:<>Verder<ArrowRight size={17}/></>}</button></div></footer>
      </form>
    </div>
  </div>;
}

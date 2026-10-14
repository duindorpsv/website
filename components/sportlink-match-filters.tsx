'use client';

import {CalendarDays,ChevronDown,RotateCcw,Search,SlidersHorizontal,X} from 'lucide-react';
import {useId,useRef,useState} from 'react';
import type {SportlinkTeam} from '@/lib/sportlink-types';
import {matchDatePreset,validateDateRange,type MatchDatePreset,type MatchFilters} from '@/lib/sportlink-match-filters';

type Props={
 filters:MatchFilters;
 teams:SportlinkTeam[];
 competitions:string[];
 sort:'asc'|'desc';
 onChange:(patch:Partial<MatchFilters>)=>void;
 onSort:(sort:'asc'|'desc')=>void;
 onReset:()=>void;
 mode:'programma'|'uitslagen';
};

const venueLabels={all:'Thuis & uit',home:'Thuis',away:'Uit'};
function displayDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):value;}

export function SportlinkMatchFilters({filters,teams,competitions,sort,onChange,onSort,onReset,mode}:Props){
 const [expanded,setExpanded]=useState(false);
 const panelId=useId();
 const toggleRef=useRef<HTMLButtonElement>(null);
 function closeFilters(){setExpanded(false);toggleRef.current?.focus();}
 const categories=[...new Set(teams.map(team=>team.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nl'));
 const visibleTeams=filters.category==='all'?teams:teams.filter(team=>team.category===filters.category);
 const selectedTeam=teams.find(team=>team.id===filters.teamId);
 const dateError=validateDateRange(filters);
 const chips:{label:string;patch:Partial<MatchFilters>}[]=[];
 if(filters.teamId!=='all')chips.push({label:selectedTeam?.name||'Onbekend team',patch:{teamId:'all'}});
 if(filters.venue!=='all')chips.push({label:venueLabels[filters.venue],patch:{venue:'all'}});
 if(filters.dateFrom||filters.dateTo)chips.push({label:filters.dateFrom&&filters.dateTo?`${displayDate(filters.dateFrom)} – ${displayDate(filters.dateTo)}`:filters.dateFrom?`Vanaf ${displayDate(filters.dateFrom)}`:`Tot en met ${displayDate(filters.dateTo)}`,patch:{dateFrom:'',dateTo:''}});
 if(filters.category!=='all')chips.push({label:filters.category,patch:{category:'all'}});
 if(filters.competition!=='all')chips.push({label:filters.competition,patch:{competition:'all'}});
 if(filters.query.trim())chips.push({label:`Zoeken: ${filters.query.trim()}`,patch:{query:''}});
 const presets:{value:MatchDatePreset;label:string}[]=mode==='programma'?[{value:'today',label:'Vandaag'},{value:'thisweek',label:'Deze week'},{value:'weekend',label:'Dit weekend'},{value:'next7',label:'Komende 7 dagen'}]:[{value:'today',label:'Vandaag'},{value:'thisweek',label:'Deze week'},{value:'last7',label:'Afgelopen 7 dagen'}];
 function selectCategory(category:string){onChange({category,...(selectedTeam&&category!=='all'&&selectedTeam.category!==category?{teamId:'all'}:{})});}
 return <section className="sl-filter-panel" aria-label="Wedstrijdfilters">
  <div className="sl-filter-heading"><h2><button ref={toggleRef} id={`${panelId}-toggle`} type="button" className="sl-filter-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}><SlidersHorizontal size={19}/><span className="sl-filter-toggle-copy"><span>Filters{chips.length>0&&<b aria-label={`${chips.length} actieve filters`}>{chips.length}</b>}</span><small>{dateError?'Controleer je datumbereik':chips.length?chips.map(chip=>chip.label).join(' · '):'Team, thuis/uit, datum en meer'}</small></span><ChevronDown size={18} className="sl-filter-chevron"/></button></h2>{chips.length>0&&<button type="button" className="sl-filter-reset" onClick={onReset}><RotateCcw size={13}/>Wis filters</button>}</div>
  <div className="sl-filter-content" id={panelId} hidden={!expanded} aria-labelledby={`${panelId}-toggle`} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeFilters();}}}>
  <div className="sl-filter-primary">
   <label className="sl-filter-field"><span>Team</span><select value={filters.teamId} onChange={event=>onChange({teamId:event.target.value})} aria-label="Filter op team"><option value="all">Alle teams</option>{filters.teamId!=='all'&&!visibleTeams.some(team=>team.id===filters.teamId)&&<option value={filters.teamId}>{selectedTeam?.name||'Team niet beschikbaar'}</option>}{visibleTeams.map(team=><option key={team.id} value={team.id}>{team.name}{team.day?` · ${team.day}`:''}</option>)}</select></label>
   <fieldset className="sl-filter-venue"><legend>Waar spelen we?</legend><div>{(['all','home','away'] as const).map(value=><button key={value} type="button" aria-pressed={filters.venue===value} onClick={()=>onChange({venue:value})}>{venueLabels[value]}</button>)}</div></fieldset>
   <label className="sl-filter-field sl-filter-search"><span>Zoek een wedstrijd</span><span className="sl-filter-search-box"><Search size={16}/><input type="search" value={filters.query} onChange={event=>onChange({query:event.target.value})} placeholder="Team, tegenstander of sportpark" aria-label="Zoek team, tegenstander of sportpark"/></span></label>
  </div>
  <div className="sl-filter-date-row">
   <div className="sl-filter-date-pair">
    <label className="sl-filter-field"><span><CalendarDays size={13}/>Datum vanaf</span><input type="date" aria-label="Datum vanaf" value={filters.dateFrom} onInput={event=>onChange({dateFrom:event.currentTarget.value})} onChange={event=>onChange({dateFrom:event.target.value})} aria-invalid={!!dateError} aria-describedby={dateError?'sl-filter-date-error':undefined}/></label>
    <label className="sl-filter-field"><span><CalendarDays size={13}/>Tot en met</span><input type="date" aria-label="Datum tot en met" value={filters.dateTo} onInput={event=>onChange({dateTo:event.currentTarget.value})} onChange={event=>onChange({dateTo:event.target.value})} aria-invalid={!!dateError} aria-describedby={dateError?'sl-filter-date-error':undefined}/></label>
   </div>
   <div className="sl-filter-date-shortcuts" aria-label="Snelle datumkeuzes"><button type="button" aria-pressed={!filters.dateFrom&&!filters.dateTo} onClick={()=>onChange({dateFrom:'',dateTo:''})}>Alle datums</button>{presets.map(preset=>{const range=matchDatePreset(preset.value);return <button type="button" key={preset.value} aria-pressed={filters.dateFrom===range.dateFrom&&filters.dateTo===range.dateTo} onClick={()=>onChange(range)}>{preset.label}</button>;})}</div>
  </div>
  {dateError&&<p className="sl-filter-date-error" id="sl-filter-date-error" role="alert">{dateError}</p>}
  <div className="sl-filter-details"><div className="sl-filter-secondary">
   <label className="sl-filter-field"><span>Categorie</span><select value={filters.category} onChange={event=>selectCategory(event.target.value)} aria-label="Filter op categorie"><option value="all">Alle categorieën</option>{filters.category!=='all'&&!categories.includes(filters.category)&&<option value={filters.category}>{filters.category}</option>}{categories.map(category=><option value={category} key={category}>{category}</option>)}</select></label>
   <label className="sl-filter-field"><span>Competitie</span><select value={filters.competition} onChange={event=>onChange({competition:event.target.value})} aria-label="Filter op competitie"><option value="all">Alle competities</option>{filters.competition!=='all'&&!competitions.includes(filters.competition)&&<option value={filters.competition}>{filters.competition}</option>}{competitions.map(competition=><option key={competition} value={competition}>{competition}</option>)}</select></label>
   <label className="sl-filter-field"><span>Sorteer op datum</span><select value={sort} onChange={event=>onSort(event.target.value as 'asc'|'desc')} aria-label="Sorteer wedstrijden"><option value="asc">Oudste eerst</option><option value="desc">Nieuwste eerst</option></select></label>
  </div></div>
  {!!chips.length&&<div className="sl-filter-active" aria-label="Actieve filters"><span>Jouw selectie</span>{chips.map(chip=><button type="button" key={Object.keys(chip.patch)[0]} onClick={()=>onChange(chip.patch)} aria-label={`Verwijder filter: ${chip.label}`}><span>{chip.label}</span><X size={12}/></button>)}</div>}
  <div className="sl-filter-footer"><span>Filters werken direct.</span><button type="button" onClick={closeFilters}>Bekijk wedstrijden <ChevronDown size={14}/></button></div>
  </div>
 </section>;
}

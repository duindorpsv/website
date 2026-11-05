'use client';

import {archiveYear} from '@/lib/club-archive-schema';

import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,BookOpen,Camera,ChevronLeft,ChevronRight,Clock3,Landmark,Plus,MoveHorizontal} from 'lucide-react';
import {useArchive} from './club-archive-provider';
import {ArchiveContributionDialog} from './club-archive-contributions';
import {archiveDateLabel,archiveDateOverlaps,momentHref,objectHref,type ArchiveMoment,type ContributionContext,archiveCompareDate} from '@/lib/club-archive-types';

const FIRST_YEAR=1950;
const CURRENT_YEAR=archiveYear();
const DECADES=Array.from({length:Math.floor((CURRENT_YEAR-FIRST_YEAR)/10)+1},(_,i)=>FIRST_YEAR+i*10);
const byDate=archiveCompareDate;
const hasPhoto=(src:string)=>!!src&&!src.endsWith('/logo.png');

export function ArchiveHomeTimeline(){
 const {state}=useArchive();
 const [decade,setDecade]=useState<number|null>(null);
 const [year,setYear]=useState<number|null>(null);
 const [activeId,setActiveId]=useState(state.featuredMomentId);
 const [contribution,setContribution]=useState<ContributionContext|null>(null);
 const rail=useRef<HTMLDivElement>(null);const stops=useRef(new Map<string,HTMLButtonElement>());
 const moments=useMemo(()=>state.moments.filter(item=>item.published&&item.date.year&&!item.date.unknown&&item.date.year>=FIRST_YEAR&&item.date.year<=CURRENT_YEAR).sort(byDate),[state.moments]);
 const visible=useMemo(()=>moments.filter(item=>year!==null?archiveDateOverlaps(item.date,year):decade!==null?archiveDateOverlaps(item.date,decade,decade+9):true),[moments,year,decade]);
 const active=visible.find(item=>item.id===activeId)||visible[0];
 const index=active?visible.findIndex(item=>item.id===active.id):-1;
 const linkedObjects=active?state.objects.filter(item=>item.published&&(active.objectIds.includes(item.id)||item.momentIds.includes(active.id))):[];
 const museum=linkedObjects.find(item=>item.id===state.featuredObjectId)||linkedObjects[0];
 const rulerYears=useMemo(()=>Array.from(new Set(moments.map(item=>item.date.year!))),[moments]);
 const selectedYear=year??active?.date.year??decade??FIRST_YEAR;
 const progress=Math.max(0,Math.min(100,(selectedYear-FIRST_YEAR)/(CURRENT_YEAR-FIRST_YEAR)*100));
 const period=year!==null?String(year):decade!==null?`de jaren ${decade}`:'1950 tot nu';
 useEffect(()=>{
  const viewport=rail.current;const node=active?stops.current.get(active.id):null;
  if(!viewport||!node)return;
  const viewportRect=viewport.getBoundingClientRect(),nodeRect=node.getBoundingClientRect();
  const left=viewport.scrollLeft+nodeRect.left-viewportRect.left-viewport.clientWidth/2+nodeRect.width/2;
  viewport.scrollTo({left:Math.max(0,left),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 },[active?.id,year,decade]);
 if(!state.widgetEnabled)return null;
 const chooseDecade=(value:number|null)=>{setDecade(value);setYear(null);};
 const chooseYear=(value:number|null)=>{setYear(value);setDecade(value===null?null:Math.floor(value/10)*10);};
 const chooseMoment=(moment:ArchiveMoment)=>setActiveId(moment.id);
 const step=(direction:number,focus=false)=>{const next=visible[index+direction];if(!next)return;chooseMoment(next);if(focus)stops.current.get(next.id)?.focus({preventScroll:true});};
 const keydown=(event:KeyboardEvent<HTMLButtonElement>,position:number)=>{
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=visible[position+(event.key==='ArrowRight'?1:-1)];if(next){chooseMoment(next);stops.current.get(next.id)?.focus({preventScroll:true});}}
  else if(event.key==='Home'||event.key==='End'){event.preventDefault();const next=visible[event.key==='Home'?0:visible.length-1];if(next){chooseMoment(next);stops.current.get(next.id)?.focus({preventScroll:true});}}
 };
 const addContext:ContributionContext={kind:'moment',date:year!==null?{year}:undefined};
 return <section id="clubarchief" className="cht-widget" aria-labelledby="cht-title"><div className="cht-shell">
  <header className="cht-heading"><div><span className="cht-eyebrow">ONZE CLUB. ONZE TROTS.</span><h2 id="cht-title">Een reis door <em>onze geschiedenis.</em></h2><p>Volg de lijn. Kies een moment. Ontdek het verhaal van jouw club.</p></div><div className="cht-heading-links"><a href="/clubmuur/club/tijdlijn">De volledige tijdlijn<ArrowUpRight size={16}/></a><a href="/clubmuur/club/museum"><Landmark size={16}/>Het museum</a></div></header>
  <div className="cht-explorer">
   <div className="cht-toolbar"><div><Clock3 size={17}/><span>VAN DE EERSTE AFTRAP TOT VANDAAG</span></div><label>Ga naar een jaar<select aria-label="Kies een jaar op de homepage-tijdlijn" value={year??''} onChange={event=>chooseYear(event.target.value?Number(event.target.value):null)}><option value="">Alle jaren</option>{Array.from({length:CURRENT_YEAR-FIRST_YEAR+1},(_,i)=>FIRST_YEAR+i).map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
   <nav className="cht-decades" aria-label="Kies een periode op de tijdlijn"><button aria-pressed={decade===null} onClick={()=>chooseDecade(null)}>De hele reis</button>{DECADES.map(value=><button key={value} aria-pressed={decade===value} onClick={()=>chooseDecade(value)}>{value}<span>–{Math.min(value+9,CURRENT_YEAR)}</span></button>)}</nav>
   <div className="cht-overview" aria-label={`Overzicht van ${FIRST_YEAR} tot ${CURRENT_YEAR}`}><span>{FIRST_YEAR}</span><div className="cht-overview-axis"><div className="cht-overview-progress" style={{width:`${progress}%`}}/>{rulerYears.map(value=>{const candidates=moments.filter(item=>item.date.year===value);return <button key={value} className={selectedYear===value?'is-active':''} style={{left:`${(value-FIRST_YEAR)/(CURRENT_YEAR-FIRST_YEAR)*100}%`}} title={`${value} · ${candidates.map(item=>item.title).join(' / ')}`} aria-label={`Ga naar ${value}: ${candidates[0].title}`} aria-pressed={selectedYear===value} onClick={()=>{setYear(null);setDecade(null);chooseMoment(candidates[0]);}}/>;})}<span className="cht-overview-cursor" style={{left:`${progress}%`}} aria-hidden="true"/></div><span>{CURRENT_YEAR}<small>NU</small></span></div>
   <div className="cht-rail-heading"><span role="status">{active?<>Moment <b>{index+1}</b> van {visible.length}{year!==null||decade!==null?` · ${period}`:''}</>:<>Nog geen momenten uit {period}</>}</span><div><button onClick={()=>step(-1)} disabled={index<=0} aria-label="Vorig moment"><ChevronLeft size={21}/></button><button onClick={()=>step(1)} disabled={index<0||index>=visible.length-1} aria-label="Volgend moment"><ChevronRight size={21}/></button></div></div>
   <div className="cht-rail-viewport" ref={rail} role="region" aria-label="Blader door de historische mijlpalen" tabIndex={0}><ol className="cht-rail">{visible.map((moment,position)=><li key={moment.id} className={`cht-stop${active?.id===moment.id?' is-active':''}`}><button ref={node=>{if(node)stops.current.set(moment.id,node);else stops.current.delete(moment.id);}} onClick={()=>chooseMoment(moment)} onKeyDown={event=>keydown(event,position)} aria-pressed={active?.id===moment.id} aria-controls="cht-selected"><span className="cht-stop-year">{moment.date.year}<small>{moment.date.season?`SEIZOEN ${moment.date.season}`:moment.date.month?archiveDateLabel(moment.date).replace(String(moment.date.year),'').trim():'CLUBGESCHIEDENIS'}</small></span><span className="cht-stop-dot"><span/></span><span className={`cht-stop-photo${!hasPhoto(moment.cover)?' cht-stop-photo--missing':''}`}>{hasPhoto(moment.cover)?<img src={moment.cover} alt="" loading="lazy"/>:<Camera size={23}/>}<span>{String(position+1).padStart(2,'0')}</span></span><span className="cht-stop-category">{moment.category}</span><strong>{moment.title}</strong><span className="cht-stop-open">{active?.id===moment.id?'Dit verhaal is geopend':'Ontdek dit moment'}<ArrowDownRight/></span></button></li>)}<li className="cht-stop cht-stop--add"><button onClick={()=>setContribution(addContext)}><span className="cht-stop-year">{year??'Jij'}<small>{year?'JOUW HERINNERING':'MAAKT HET VERHAAL COMPLEET'}</small></span><span className="cht-stop-dot"><Plus size={16}/></span><span className="cht-add-photo"><Camera size={25}/></span><strong>{year?`Wat gebeurde er in ${year}?`:'Hier past jouw herinnering.'}</strong><span className="cht-stop-open">Voeg iets toe<Plus size={14}/></span></button></li></ol></div>
   <div className="cht-swipe-hint"><MoveHorizontal size={16}/>Veeg door de jaren · tik op een moment</div>
   <div id="cht-selected" className="cht-selected" key={active?.id||`empty-${period}`} aria-label={active?`Geselecteerd: ${active.title}`:`Herinneringen uit ${period}`}>
    {active?<><article className="cht-story"><a className={`cht-story-photo${!hasPhoto(active.cover)?' cht-story-photo--missing':''}`} href={momentHref(active.slug)}>{hasPhoto(active.cover)?<img src={active.cover} alt={active.media.find(item=>item.src===active.cover)?.caption||active.title} loading="lazy"/>:<><img src="/assets/logo.png" alt="Duindorp SV"/><span>BEELDEN GEZOCHT</span></>}<span className="cht-story-photo-year">{active.date.year}</span><span className="cht-story-photo-open"><ArrowUpRight size={19}/></span></a><div className="cht-story-copy"><span className="cht-eyebrow">{archiveDateLabel(active.date)} · {active.category}</span><h3>{active.title}</h3><p>{active.intro}</p><div className="cht-story-actions"><a href={momentHref(active.slug)}>Ontdek het verhaal<ArrowRight size={16}/></a><button onClick={()=>setContribution({kind:'addition',targetId:active.id,targetType:'moment',date:active.date})}><Plus size={15}/>Ik was erbij</button></div></div></article><aside className="cht-museum">{museum?<><span className="cht-eyebrow"><Landmark size={15}/>BEWAARD BIJ DIT MOMENT</span><a className="cht-museum-photo" href={objectHref(museum.slug)}><img src={museum.cover} alt={museum.title} loading="lazy"/></a><div><small>{archiveDateLabel(museum.date)}</small><h4><a href={objectHref(museum.slug)}>{museum.title}</a></h4><a className="cht-museum-link" href={objectHref(museum.slug)}>Bekijk in het museum<ArrowUpRight size={15}/></a>{linkedObjects.length>1&&<span className="cht-museum-count">+ {linkedObjects.length-1} {linkedObjects.length===2?'verbonden museumstuk':'verbonden museumstukken'}</span>}</div></>:<><span className="cht-eyebrow"><Landmark size={15}/>DE HERINNERING ACHTER HET MOMENT</span><div className="cht-museum-wanted"><BookOpen size={30}/><h4>Bewaar jij nog iets uit deze tijd?</h4><p>Een fotoalbum, een vaantje of een programmaboekje. Geef het een plek bij dit verhaal.</p><button onClick={()=>setContribution({kind:'object',targetId:active.id,targetType:'moment',date:active.date})}>Meld een museumstuk aan<Plus size={15}/></button></div></>}</aside></>:<div className="cht-empty"><span>{year??decade??'?'}</span><Camera size={33}/><div><h3>{year?`${year} wacht nog op jouw verhaal.`:`Wat gebeurde er in ${period}?`}</h3><p>We hebben hier nog geen momenten verzameld. Een foto, film, geluidsfragment of herinnering is welkom.</p><button onClick={()=>setContribution({kind:'moment',date:year!==null?{year}:undefined})}>Voeg {year?`een herinnering uit ${year}`:'een herinnering'} toe<Plus size={17}/></button></div></div>}
   </div>
   <footer className="cht-footer"><span><Plus size={17}/>{active?'Dit verhaal groeit met jouw herinnering.':'Samen maken we onze geschiedenis compleet.'}</span><button onClick={()=>setContribution(active?{kind:'addition',targetId:active.id,targetType:'moment',date:active.date}:addContext)}>Deel jouw herinnering<ArrowUpRight size={15}/></button><a href="/clubmuur/club/tijdlijn">Bekijk de volledige tijdlijn<ArrowRight size={15}/></a></footer>
  </div>
 </div><ArchiveContributionDialog open={contribution!==null} onClose={()=>setContribution(null)} context={contribution||undefined}/></section>;
}

function ArrowDownRight(){return <ArrowUpRight className="cht-stop-arrow" size={14}/>;}

'use client';
import {siteText} from '@/lib/cms/site-copy';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowRight, ArrowUpRight, CalendarDays, CalendarPlus, Clock3, MapPin, X } from 'lucide-react';
import { communityEventCalendar,publicCommunityEvents, type ClubCommunityEvent } from '@/lib/clubmuur-community';

import {useCMS} from './cms/provider';
import {useNewsClock} from '@/hooks/use-news-clock';
import {agendaDate} from '@/lib/club-agenda';
import type { Article } from '@/lib/club-data';
import { ClubmuurNewsFeed } from '@/components/clubmuur-news-feed';

function CommunityDialog({ open, onOpenChange, title, description, returnFocus, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; returnFocus: RefObject<HTMLButtonElement | null>; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="cm-community-overlay" />
      <Dialog.Content className="cm-community-dialog" onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus({ preventScroll: true }); }}>
        <div className="cm-community-dialog-head"><span>DUINDORP SV <span>MEER DAN EEN CLUB</span></span><Dialog.Close className="cm-community-dialog-close" aria-label="Venster sluiten"><X size={20} /></Dialog.Close></div>
        <div className="cm-community-dialog-body"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

const activityLabels={meeting:'Bijeenkomst',event:'Clubactiviteit',training:'Training',match:'Wedstrijd'};
const detailDate=(date:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
function saveCalendar(event: ClubCommunityEvent) {
  if(event.central){const anchor=document.createElement('a');anchor.href=`/api/planning/${encodeURIComponent(event.id)}/ics`;anchor.download=`duindorp-activiteit.ics`;document.body.appendChild(anchor);anchor.click();anchor.remove();return;}
  const url = URL.createObjectURL(new Blob([communityEventCalendar(event)], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `duindorp-activiteit-${event.id}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ClubmuurCommunityCards({ items, onOpen, articleOpen = false }: { items: Article[]; onOpen: (article: Article) => void; articleOpen?: boolean }) {
  const {state,ready}=useCMS();
  const now=useNewsClock();
  const events=ready?publicCommunityEvents(state,now):[];
  const sectionRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [verifiedEvent,setVerifiedEvent]=useState<ClubCommunityEvent|null>(null);
  const listedEvent=events.find(item=>item.id===eventId)||null;
  const event=listedEvent&&verifiedEvent?.id===listedEvent.id?verifiedEvent:listedEvent;
  const centralEventId=listedEvent?.central?listedEvent.id:null;
  useEffect(()=>{if(eventId&&!event)setEventId(null);},[eventId,event]);
  useEffect(()=>{
    if(!centralEventId)return;const controller=new AbortController();
    const verify=async()=>{try{const response=await fetch(`/api/planning/${encodeURIComponent(centralEventId)}`,{cache:'no-store',signal:controller.signal});if(response.status===404){setEventId(current=>current===centralEventId?null:current);return;}if(!response.ok)return;const item=await response.json();if(controller.signal.aborted||item.id!==centralEventId)return;setVerifiedEvent({id:item.id,title:item.title,type:item.type,date:item.date,time:item.startTime,endTime:item.endTime,description:item.description,location:item.location,occurrence:item.occurrence,central:true});}catch{/* A temporary outage must not replace the last approved snapshot. */}};
    void verify();const timer=window.setInterval(verify,30_000);window.addEventListener('focus',verify);
    return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',verify);};
  },[centralEventId]);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.08 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return <section ref={sectionRef} className="cm-community" aria-label="Nieuws en agenda van Duindorp" data-in-view={visible}>
    <div className="cm-community-grid">
      <ClubmuurNewsFeed items={items} onOpen={onOpen} articleOpen={articleOpen || !!event} />
      <article className="cm-community-card cm-community-agenda" id="clubagenda" aria-labelledby="cm-community-agenda-title">
        <header className="cm-community-card-head"><div className="cm-community-eyebrow"><span>{siteText(state,'agendaEyebrow')}</span><CalendarDays size={18} aria-hidden="true" /></div><h2 id="cm-community-agenda-title">{siteText(state,'agendaTitle')}</h2><p>{siteText(state,'agendaIntro')}</p></header>
        <div className="cm-community-events">{events.length?events.map(item => <button type="button" key={item.id} onClick={click => { dialogTriggerRef.current = click.currentTarget; setVerifiedEvent(null);setEventId(item.id); }} className="cm-community-event" aria-label={`Bekijk ${item.title}, ${agendaDate(item)}, ${item.time}${item.endTime?'–'+item.endTime:''}`}><span className="cm-community-date" aria-hidden="true"><strong>{Number(item.date.slice(8))}</strong><small>{agendaDate(item,true).split(' ').slice(1).join(' ').replace('.','').toLocaleUpperCase('nl')}</small></span><span className="cm-community-event-copy"><small>{activityLabels[item.type||'event']} · {item.time}{item.endTime?'–'+item.endTime:''}</small><strong>{item.title}</strong>{item.location&&<span className="cm-community-event-location">{item.location}</span>}</span><ArrowUpRight size={18} aria-hidden="true" /></button>):<div className="cm-community-agenda-empty" role="status"><CalendarDays size={27}/><strong>{ready?'Binnenkort weer nieuwe momenten.':'Clubagenda wordt geladen…'}</strong>{ready&&<p>Er staan op dit moment geen openbare activiteiten op de agenda. Houd deze plek in de gaten.</p>}</div>}</div>
        <footer className="cm-community-card-foot"><span className="cm-community-footnote"><span />{events.length?`${events.length} komende activiteit${events.length===1?'':'en'}`:'Clubagenda'}</span><span className="cm-community-month">DUINDORP SV</span></footer>
      </article>

    </div>

    <CommunityDialog open={!!event} onOpenChange={open => { if (!open) setEventId(null); }} title={event?.title ?? 'Clubactiviteit'} description="Een moment voor onze club. En voor elkaar." returnFocus={dialogTriggerRef}>
      {event && <><div className="cm-community-dialog-meta"><span><CalendarDays size={16} />{detailDate(event.date)}</span><span><Clock3 size={16}/>{event.time}{event.endTime?'–'+event.endTime:''}</span>{event.location&&<span><MapPin size={16} />{event.location}</span>}</div>{event.description&&<p className="cm-community-dialog-copy" style={{whiteSpace:'pre-wrap'}}>{event.description}</p>}<button type="button" className="cm-community-dialog-primary" onClick={() => saveCalendar(event)}><CalendarPlus size={17} />Zet in mijn agenda<ArrowRight size={17} /></button><small className="cm-community-dialog-hint">Download een agendabestand (.ics). Tijden volgen de Nederlandse tijdzone. Dit is geen aanmelding.</small></>}
    </CommunityDialog>

  </section>;
}

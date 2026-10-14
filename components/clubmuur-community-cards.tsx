'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowRight, ArrowUpRight, CalendarDays, CalendarPlus, MapPin, Sparkles, X } from 'lucide-react';
import { clubCommunityEvents, communityEventCalendar, type ClubCommunityEvent } from '@/lib/clubmuur-community';

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

function saveCalendar(event: ClubCommunityEvent) {
  const url = URL.createObjectURL(new Blob([communityEventCalendar(event)], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `duindorp-voorbeeld-${event.id}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ClubmuurCommunityCards({ items, onOpen, articleOpen = false }: { items: Article[]; onOpen: (article: Article) => void; articleOpen?: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [event, setEvent] = useState<ClubCommunityEvent | null>(null);

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
      <article className="cm-community-card cm-community-agenda" aria-labelledby="cm-community-agenda-title">
        <header className="cm-community-card-head"><div className="cm-community-eyebrow"><span>OP DE AGENDA</span><CalendarDays size={18} aria-hidden="true" /></div><h2 id="cm-community-agenda-title">Binnenkort.</h2><p>Een plek om samen te komen.</p></header>
        <div className="cm-community-events">{clubCommunityEvents.map(item => <button type="button" key={item.id} onClick={event => { dialogTriggerRef.current = event.currentTarget; setEvent(item); }} className="cm-community-event" aria-label={`Bekijk ${item.title}, ${item.day} oktober`}><span className="cm-community-date" aria-hidden="true"><strong>{item.day}</strong><small>{item.month}</small></span><span className="cm-community-event-copy"><small>{item.category}</small><strong>{item.title}</strong></span><ArrowUpRight size={18} aria-hidden="true" /></button>)}</div>
        <footer className="cm-community-card-foot"><span className="cm-community-footnote"><span />Voorbeeldagenda</span><span className="cm-community-month">OKTOBER ’26</span></footer>
      </article>

    </div>

    <CommunityDialog open={!!event} onOpenChange={open => { if (!open) setEvent(null); }} title={event?.title ?? 'Clubactiviteit'} description="Een moment voor onze club. En voor elkaar." returnFocus={dialogTriggerRef}>
      {event && <><div className="cm-community-dialog-meta"><span><CalendarDays size={16} />{event.day} oktober 2026</span><span><MapPin size={16} />Houtrust</span></div><p className="cm-community-dialog-copy">{event.description}</p><div className="cm-community-demo-note"><Sparkles size={16} /><p><strong>Voorbeeldagenda</strong>Deze activiteit laat zien hoe de clubagenda werkt. Datum en invulling zijn nog niet bevestigd.</p></div><button type="button" className="cm-community-dialog-primary" onClick={() => saveCalendar(event)}><CalendarPlus size={17} />Zet voorbeeld in mijn agenda<ArrowRight size={17} /></button><small className="cm-community-dialog-hint">Download een agendabestand (.ics). Dit is geen aanmelding.</small></>}
    </CommunityDialog>

  </section>;
}

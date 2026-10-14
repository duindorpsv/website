'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import type { Article } from '@/lib/club-data';
import { sortedClubArticles } from '@/lib/clubmuur-articles';

const SCROLL_SPEED = 22;
const END_HOLD_MS = 2200;
const INTERACTION_HOLD_MS = 6500;

export function ClubmuurNewsFeed({ items, onOpen, articleOpen = false }: { items: Article[]; onOpen: (article: Article) => void; articleOpen?: boolean }) {
  const latest = useMemo(() => sortedClubArticles(items).slice(0, 10), [items]);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const manualPause = useRef(false);
  const modalOpen = useRef(articleOpen);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [edges, setEdges] = useState({ overflow: false, above: false, below: false });
  const id = useId();

  useEffect(() => { manualPause.current = paused; }, [paused]);
  useEffect(() => { modalOpen.current = articleOpen; }, [articleOpen]);

  useEffect(() => {
    const element = viewport.current;
    const rows = content.current;
    if (!element || !rows) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = preference.matches;
    let visible = false;
    let pageVisible = document.visibilityState === 'visible';
    let hovered = false;
    let focused = false;
    let interacting = false;
    let direction = 1;
    let max = 0;
    let position = element.scrollTop;
    let frame = 0;
    let lastTime = 0;
    let holdUntil = performance.now() + END_HOLD_MS;
    setReducedMotion(reduced);

    const updateEdges = () => {
      const top = element.scrollTop;
      const next = { overflow: max > 2, above: top > 3, below: max - top > 3 };
      setEdges(current => current.overflow === next.overflow && current.above === next.above && current.below === next.below ? current : next);
    };
    const measure = () => {
      max = Math.max(0, element.scrollHeight - element.clientHeight);
      position = Math.min(element.scrollTop, max);
      updateEdges();
    };
    const idle = () => { holdUntil = performance.now() + INTERACTION_HOLD_MS; position = element.scrollTop; };
    const enter = (event: PointerEvent) => { if (event.pointerType === 'mouse') hovered = true; };
    const leave = () => { hovered = false; idle(); };
    const focus = () => { focused = true; };
    const blur = (event: FocusEvent) => { if (!element.contains(event.relatedTarget as Node | null)) { focused = false; idle(); } };
    const down = () => { interacting = true; idle(); };
    const up = () => { if (interacting) { interacting = false; idle(); } };
    const visibility = () => { pageVisible = document.visibilityState === 'visible'; lastTime = 0; };
    const motion = () => { reduced = preference.matches; setReducedMotion(reduced); };
    const scroll = () => { updateEdges(); };
    const tick = (time: number) => {
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 0;
      lastTime = time;
      if (visible && pageVisible && max > 2 && !reduced && !manualPause.current && !modalOpen.current && !hovered && !focused && !interacting && time >= holdUntil) {
        position = Math.max(0, Math.min(max, position + direction * SCROLL_SPEED * elapsed / 1000));
        element.scrollTop = position;
        if (position >= max || position <= 0) { direction *= -1; holdUntil = time + END_HOLD_MS; }
      } else {
        // Keep the user's native scroll position; never jump back on resume.
        position = element.scrollTop;
      }
      frame = requestAnimationFrame(tick);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    resizeObserver.observe(rows);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; lastTime = 0; }, { threshold: 0 });
    visibilityObserver.observe(element);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('pointerdown', down);
    element.addEventListener('wheel', idle, { passive: true });
    element.addEventListener('touchmove', idle, { passive: true });
    element.addEventListener('keydown', idle);
    element.addEventListener('focusin', focus);
    element.addEventListener('focusout', blur);
    element.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', motion);
    measure();
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('wheel', idle);
      element.removeEventListener('touchmove', idle);
      element.removeEventListener('keydown', idle);
      element.removeEventListener('focusin', focus);
      element.removeEventListener('focusout', blur);
      element.removeEventListener('scroll', scroll);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', motion);
    };
  }, [latest.length]);

  return <article className="cm-community-card cm-community-news" aria-labelledby={`${id}-title`}>
    <header className="cm-community-card-head">
      <div className="cm-community-eyebrow"><span>HET LAATSTE UIT DE CLUB</span><span className="cm-community-news-count">{latest.length} {latest.length === 1 ? 'BERICHT' : 'BERICHTEN'}</span></div>
      <div className="cm-community-news-heading"><h2 id={`${id}-title`}>Nieuws van de club.</h2>{edges.overflow && !reducedMotion && <button type="button" className="cm-community-news-pause" aria-pressed={paused} aria-label={paused ? 'Automatisch scrollen hervatten' : 'Automatisch scrollen pauzeren'} title={paused ? 'Automatisch scrollen hervatten' : 'Automatisch scrollen pauzeren'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>}</div>
      <p>Verhalen van het veld. En van de mensen eromheen.</p>
    </header>
    <div className="cm-community-news-window" data-fade-top={edges.above} data-fade-bottom={edges.below}>
      <div ref={viewport} className="cm-community-news-scroll" role="region" tabIndex={0} aria-label="Laatste clubnieuws, scroll om meer berichten te lezen">
        <div ref={content} className="cm-community-news-items">
          {latest.map(article => <button key={article.id} type="button" className="cm-community-news-row" onClick={() => onOpen(article)} aria-label={`Lees bericht: ${article.title}`}>
            <span className="cm-community-news-image" aria-hidden="true"><img src={article.image} alt="" width={160} height={128} loading="lazy" decoding="async" /></span>
            <span className="cm-community-news-copy"><strong>{article.title}</strong><span>{article.intro || article.body.find(paragraph => paragraph.trim()) || 'Lees het volledige bericht.'}</span></span>
            <span className="cm-community-news-arrow" aria-hidden="true"><ArrowUpRight size={19} /></span>
          </button>)}
          {latest.length === 0 && <p className="cm-community-news-empty">Binnenkort lees je hier de nieuwste berichten van onze club.</p>}
        </div>
      </div>
    </div>
    <footer className="cm-community-card-foot"><span className="cm-community-news-hint">{edges.overflow && <><ArrowDownUp size={13} aria-hidden="true" />Scroll door de berichten</>}</span><a className="cm-community-news-all" href="/clubmuur/nieuws">Al het nieuws<ArrowRight size={17} aria-hidden="true" /></a></footer>
  </article>;
}

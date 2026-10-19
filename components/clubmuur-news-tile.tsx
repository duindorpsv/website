'use client';

import {useEffect, useId, useMemo, useRef, useState, type CSSProperties} from 'react';
import {ArrowUpRight, ArrowRight, Pause, Play} from 'lucide-react';
import type {Article} from '@/lib/club-data';
import type {HeroCardConfig} from '@/lib/clubmuur-config';
import {heroClubArticles} from '@/lib/clubmuur-articles';
import {useNewsClock} from '@/hooks/use-news-clock';
import {featuredExpiry} from '@/lib/cms/featured';

const ROTATION_MS = 8000;
const ROW_GAP = 5;

export function ClubmuurNewsTile({card, items, onOpen}: {
  card: HeroCardConfig;
  items: Article[];
  onOpen: (article: Article) => void;
}) {
  const nextExpiry=Math.min(...items.filter(item=>item.featured).map(featuredExpiry).filter(time=>time>Date.now()));
  const now=useNewsClock(nextExpiry);
  const latest = useMemo(() => heroClubArticles(items,now).slice(0, 3), [items,now]);
  const [capacity, setCapacity] = useState({rowHeight: 60, lines: 2, compact: false});
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const heading = card.title.trim().replace(/\s+/g, ' ') || 'Laatste nieuws';
  const selected = Math.min(active, Math.max(0, latest.length - 1));

  // Always keep the latest three stories. On short screens, place the expanded
  // image beside its excerpt so the hero never has to grow beyond its frame.
  useEffect(() => {
    if (!list.current) return;
    const measure = () => {
      if (!list.current) return;
      const {height, width} = list.current.getBoundingClientRect();
      if (height <= 0) return;
      const rowHeight = height < 320 ? 52 : width >= 350 ? 64 : 60;
      const actualCount = latest.length;
      const extra = height - actualCount * rowHeight - Math.max(0, actualCount - 1) * ROW_GAP;
      const lines = extra >= 220 ? 3 : 2;
      const compact = extra < 130;
      setCapacity(current => current.rowHeight === rowHeight && current.lines === lines && current.compact === compact
        ? current : {rowHeight, lines, compact});
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list.current);
    measure();
    return () => observer.disconnect();
  }, [latest.length]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updatePreference();
    updateVisibility();
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= .25), {threshold: .25});
    if (root.current) observer.observe(root.current);
    return () => {
      preference.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
      observer.disconnect();
    };
  }, []);

  const playing = latest.length > 1 && visible && pageVisible && !paused && !hovered && !focused && !reducedMotion;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActive((selected + 1) % latest.length), ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [selected, latest.length, playing]);

  return <article
    ref={root}
    className="cm-news-tile"
    data-slot-id={card.id}
    data-compact-excerpt={capacity.compact}
    style={{'--cm-news-row-height': `${capacity.rowHeight}px`, '--cm-news-excerpt-lines': capacity.lines} as CSSProperties}
    aria-labelledby={`${id}-heading`}
    onPointerEnter={event => {if (event.pointerType === 'mouse') setHovered(true);}}
    onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);}}
  >
    <div className="cm-news-tile-heading">
      <h2 id={`${id}-heading`}>{heading}{!/[.!?…]$/.test(heading) && <span aria-hidden="true">.</span>}</h2>
      {latest.length > 1 && !reducedMotion && <button
        type="button"
        className="cm-news-tile-pause"
        aria-label={paused ? 'Nieuws automatisch wisselen' : 'Automatisch wisselen pauzeren'}
        aria-pressed={paused}
        onClick={() => {if (paused) setFocused(false); setPaused(value => !value);}}
        title={paused ? 'Automatisch wisselen hervatten' : 'Automatisch wisselen pauzeren'}
      >{paused ? <Play size={13} fill="currentColor"/> : <Pause size={13} fill="currentColor"/>}</button>}
    </div>

    <div ref={list} className="cm-news-tile-items">
      {latest.map((item, index) => {
        const expanded = selected === index;
        const paragraph = item.body.find(text => typeof text === 'string' && text.trim() && text.trim() !== item.intro)?.trim() || item.intro;
        const excerpt = paragraph.length > 340 ? `${paragraph.slice(0, 337).replace(/\s+\S*$/, '')}…` : paragraph;
        return <div key={item.id} className={`cm-news-tile-row${expanded ? ' is-active' : ''}`}>
          <div className="cm-news-tile-row-heading">
            <button
              type="button"
              className="cm-news-tile-toggle"
              aria-expanded={expanded}
              aria-controls={`${id}-excerpt-${index}`}
              onClick={() => setActive(index)}
            >
              <span className="cm-news-tile-photo" aria-hidden="true"><img src={item.image} alt="" width={80} height={80} loading="lazy" decoding="async"/></span>
              <span className="cm-news-tile-copy"><span className="cm-news-tile-title" id={`${id}-title-${index}`}>{item.title}</span><span className="cm-news-tile-intro">{item.intro}</span></span>
            </button>
            <button type="button" className="cm-news-tile-open" onClick={() => onOpen(item)} aria-label={`Lees bericht: ${item.title}`}><ArrowUpRight size={18}/></button>
          </div>
          <div className="cm-news-tile-excerpt" id={`${id}-excerpt-${index}`} aria-hidden={!expanded}>
            <div className="cm-news-tile-feature">
              <div className="cm-news-tile-hero" aria-hidden="true">
                <img src={item.image} alt="" width={640} height={360} loading="lazy" decoding="async"/>
                <span className="cm-news-tile-category">{item.category}</span>
              </div>
              <p>{excerpt}</p>
            </div>
          </div>
        </div>;
      })}
      {latest.length === 0 && <p className="cm-news-tile-empty">Binnenkort lees je hier het laatste clubnieuws.</p>}
    </div>

    <a className="cm-news-tile-all" href="/clubmuur/nieuws">Al het nieuws<ArrowRight size={16}/></a>
  </article>;
}

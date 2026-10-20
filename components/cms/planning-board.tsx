'use client';
import {PlanningSyncStatus} from './planning-sync-status';
import {matchSide,matchSideLabel,matchColors} from '@/lib/cms/planning';
import {PlanningMigrationReview} from './planning-migration-review';

import { cloneElement,isValidElement,useId,useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Globe2, GripVertical, Layers3, LockKeyhole, MapPin, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, UsersRound, X } from 'lucide-react';
import { useCMS } from './provider';
import { CmsMultiSelect } from './multi-select';
import { uid } from '@/lib/cms/model';
import { expandWeeklyTraining, needsFieldAssignment, validateActivity,planningInstant,validPlanningDate,validPlanningTime } from '@/lib/cms/planning';
import type { CmsActivity } from '@/lib/cms/types';
import './planning-board.css';
import {useCmsPageHeader} from './page-header';

type View = 'day' | 'week' | 'month' | 'year';
const TYPES: { id: CmsActivity['type']; label: string; plural: string }[] = [
  { id: 'meeting', label: 'Vergadering', plural: 'Vergaderingen' },
  { id: 'event', label: 'Evenement', plural: 'Evenementen' },
  { id: 'training', label: 'Training', plural: 'Trainingen' },
  { id: 'match', label: 'Wedstrijd', plural: 'Wedstrijden' },
];
const VIEWS: { id: View; label: string }[] = [{ id: 'day', label: 'Dag' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Maand' }, { id: 'year', label: 'Jaar' }];
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const HOUR_HEIGHT = 52;
const dateKey=(date:Date)=>date.toISOString().slice(0,10);
const clubToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const parseDate = (s: string) => new Date(`${s}T12:00:00Z`);
const shiftDay = (d: Date, days: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 12));
const monday = (d: Date) => shiftDay(d, -((d.getUTCDay() + 6) % 7));
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeValue = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const labelDate = (d: Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) => d.toLocaleDateString('nl-NL', {timeZone:'UTC',...options});
const copy = <T,>(value: T): T => structuredClone(value);

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const labelId=useId();
  return <label className={`plan-field ${className}`}><span id={labelId}>{label}</span>{isValidElement<Record<string,unknown>>(children)?cloneElement(children,{'aria-labelledby':labelId}):children}</label>;
}

/** Compact lanes keep simultaneous activities readable without covering one another. */
function eventLanes(events: CmsActivity[]) {
  const sorted = [...events].sort((a, b) => minutes(a.startTime) - minutes(b.startTime) || minutes(b.endTime) - minutes(a.endTime));
  const positions = new Map<string, { lane: number; count: number }>();
  let cluster: CmsActivity[] = [], end = -1;
  function finish() {
    const ends: number[] = [];
    for (const item of cluster) {
      let lane = ends.findIndex(value => value <= minutes(item.startTime));
      if (lane < 0) lane = ends.length;
      ends[lane] = minutes(item.endTime);
      positions.set(item.id, { lane, count: 1 });
    }
    for (const item of cluster) positions.get(item.id)!.count = ends.length;
    cluster = [];
  }
  for (const item of sorted) {
    if (minutes(item.startTime) >= end && cluster.length) { finish(); end = -1; }
    cluster.push(item); end = Math.max(end, minutes(item.endTime));
  }
  finish(); return positions;
}

export function PlanningBoard({ initialType, activityId, newActivityDate }: { initialType?: 'training'; activityId?: string; newActivityDate?: string } = {}) {
  const { state, ready, update, can, notify,recordVersion,reload,saving,storageError } = useCMS();
  const selectedVersion=useRef(0),dragVersion=useRef(0);const [busy,setBusy]=useState(false);
  const [view, setView] = useState<View>('week');
  const [selectedDate, setSelectedDate] = useState(() => clubToday());
  const [type, setType] = useState<string>(initialType || '');
  const [location, setLocation] = useState(''), [person, setPerson] = useState(''), [committee, setCommittee] = useState(''), [team, setTeam] = useState('');
  const [search, setSearch] = useState(''), [showCancelled, setShowCancelled] = useState(false);
  const [draft, setDraft] = useState<CmsActivity | null>(null), [errors, setErrors] = useState<string[]>([]), [boardError, setBoardError] = useState('');
  const [repeat, setRepeat] = useState(false), [repeatUntil, setRepeatUntil] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null), [dropKey, setDropKey] = useState('');
  const [selectionRequest, setSelectionRequest] = useState('');
  const modal = useRef<HTMLDivElement>(null), gridScroll = useRef<HTMLDivElement>(null);
  const existing = draft ? state.planning.activities.find(a => a.id === draft.id) : undefined;
  const editable = can('pages')||state.settings.teams.some(team=>can('pages',team.id));
  const canEditActivity=(activity:CmsActivity)=>activity.teamIds.length?activity.teamIds.every(id=>can('pages',id)):can('pages');
  const canPublishActivity=(activity:CmsActivity)=>activity.teamIds.length?activity.teamIds.every(id=>can('publish',id,'pages')):can('publish',undefined,'pages');
  const canChange = (a: CmsActivity) => canEditActivity(a) && (!a.public||canPublishActivity(a));
  const editorEnabled = !!draft&&!(existing&&recordVersion(draft.id)!==selectedVersion.current)&&canEditActivity(draft)&&(!existing||canEditActivity(existing))&&(!existing?.public||canPublishActivity(existing))&&!busy&&!saving;
  const incomingChanged=!!draft&&!!existing&&recordVersion(draft.id)!==selectedVersion.current;
  const sourceLocked = draft?.source === 'sportlink';
  const occurrenceChoiceNeeded=!!draft&&validPlanningDate(draft.date)&&[draft.startTime,draft.endTime].some(time=>{if(!validPlanningTime(time))return false;try{planningInstant(draft.date+'T'+time);return false;}catch{return true;}});
  const today = clubToday(), selected = parseDate(selectedDate);
  const people = state.people.filter(p => !p.deletedAt);
  const locations = state.planning.locations.filter(l => l.active);
  const committees = state.planning.committees.filter(c => c.active);
  const teams = state.settings.teams;
  const activeFilters = [type, location, person, committee, team, search].filter(Boolean).length;
  const filtered = useMemo(() => state.planning.activities.filter(a => !a.deletedAt&&
    (showCancelled || a.status !== 'cancelled') && (!type || a.type === type) &&
    (!location || a.locationIds.includes(location)) && (!person || a.personIds.includes(person) || a.committeeIds.some(id => state.planning.committees.find(c => c.id === id)?.members.some(m => m.personId === person))) &&
    (!committee || a.committeeIds.includes(committee)) && (!team || a.teamIds.includes(team)) &&
    (!search || `${a.title} ${a.description}`.toLocaleLowerCase('nl').includes(search.toLocaleLowerCase('nl')))
  ), [state.planning.activities, state.planning.committees, showCancelled, type, location, person, committee, team, search]);
  const days = view === 'day' ? [selected] : Array.from({ length: 7 }, (_, i) => shiftDay(monday(selected), i));
  const dayKeys = days.map(dateKey);
  const weekEvents = filtered.filter(a => dayKeys.includes(a.date));
  const startHour = Math.min(8, ...weekEvents.map(a => Math.floor(minutes(a.startTime) / 60)));
  const endHour = Math.max(22, ...weekEvents.map(a => Math.ceil(minutes(a.endTime) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const unassigned = filtered.filter(a => a.status === 'planned' && (a.type==='match'?needsFieldAssignment(state,a):!a.locationIds.length)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const periodEvents = filtered.filter(a => view === 'day' ? a.date === selectedDate : view === 'week' ? dayKeys.includes(a.date) : view === 'month' ? a.date.startsWith(selectedDate.slice(0, 7)) : a.date.startsWith(selectedDate.slice(0, 4)));
  const title = view === 'week' ? `${labelDate(days[0], { day: 'numeric', month: 'short' })} – ${labelDate(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}` : view === 'day' ? labelDate(selected, { weekday: 'long', day: 'numeric', month: 'long' }) : labelDate(selected, view === 'month' ? { month: 'long', year: 'numeric' } : { year: 'numeric' });

  function open(activity: CmsActivity) { selectedVersion.current=recordVersion(activity.id);setDraft(copy(activity)); setErrors([]); setRepeat(false); setConfirmDelete(false); }
  function create(date = selectedDate, startTime = '19:00') {
    if (!editable) return;selectedVersion.current=0;
    const teamIds = team && can('pages',team) ? [team] : can('pages') ? [] : teams.filter(item=>can('pages',item.id)).slice(0,1).map(item=>item.id);
    setDraft({ id: uid('activity'), title: '', type: initialType || (type && type !== 'match' ? type as CmsActivity['type'] : 'meeting'), date, startTime, endTime: timeValue(Math.min(1439, minutes(startTime) + 60)), locationIds: location ? [location] : [], personIds: person ? [person] : [], committeeIds: committee ? [committee] : [], teamIds, public: false, description: '', status: 'planned', source: 'manual' });
    setErrors([]); setRepeat(false); setRepeatUntil(dateKey(shiftDay(parseDate(date), 56))); setConfirmDelete(false);
  }
  function close() { if(busy||saving)return;setDraft(null); setErrors([]); setConfirmDelete(false); }
  const modalOpen = !!draft;
  useEffect(() => {
    if (!modalOpen) return;
    const before = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => modal.current?.querySelector<HTMLElement>('input:not([disabled]),button')?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); setDraft(null); }
      if (event.key === 'Tab') {
        const items = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]') || []).filter(el => el.offsetParent !== null);
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); before?.focus(); };
  }, [modalOpen]);
  useEffect(() => {
    if (!gridScroll.current || (view !== 'day' && view !== 'week')) return;
    const planned = weekEvents.filter(a => a.status === 'planned');
    const firstHour = planned.length ? Math.min(...planned.map(a => minutes(a.startTime) / 60)) : 9;
    gridScroll.current.scrollTop = Math.max(0, (Math.min(firstHour - 1, 15) - startHour) * HOUR_HEIGHT);
  // Scroll on navigation, never while dragging or changing an activity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, view, ready]);
  // Root selection is an explicit request, applied once without resetting an open form on store updates.
  const requestedSelection = `${activityId || ''}|${newActivityDate || ''}`;
  if (ready && selectionRequest !== requestedSelection) {
    setSelectionRequest(requestedSelection);
    const activity = activityId ? state.planning.activities.find(a => a.id === activityId) : undefined;
    if (activity) { setSelectedDate(activity.date); open(activity); }
    else if (!activityId && newActivityDate && /^\d{4}-\d{2}-\d{2}$/.test(newActivityDate)) { setSelectedDate(newActivityDate); create(newActivityDate); }
  }

  function navigate(direction: number) {
    const d = parseDate(selectedDate);
    if (view === 'day' || view === 'week') setSelectedDate(dateKey(shiftDay(d, direction * (view === 'day' ? 1 : 7))));
    else if (view === 'month') setSelectedDate(dateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1, 12))));
    else setSelectedDate(dateKey(new Date(Date.UTC(d.getUTCFullYear() + direction, d.getUTCMonth(), 1, 12))));
    setBoardError('');
  }
  function patch(value: Partial<CmsActivity>) { if (draft) setDraft({ ...draft, ...value }); setErrors([]); }
  async function save(event: FormEvent,publish=false) {
    event.preventDefault(); if (!draft || !editorEnabled) return;
    if (publish && !canPublishActivity(draft)) { setErrors(['Je hebt publicatierechten nodig om een activiteit openbaar te maken.']); return; }
    let items: CmsActivity[];
    try {
      const activity = { ...copy(draft), title: draft.title.trim(), description: draft.description.trim() };
      items = !existing && repeat && activity.type === 'training' ? expandWeeklyTraining(activity, { until: repeatUntil }) : [activity];
      if (!items.length) throw new Error('Kies een einddatum op of na de eerste trainingsdatum.');
      const checkState = copy(state);
      checkState.planning.activities = checkState.planning.activities.filter(a => a.id !== activity.id);
      const issues: string[] = [];
      for (const item of items) { issues.push(...validateActivity(checkState, item, [item.id]).map(message => items.length > 1 ? `${labelDate(parseDate(item.date))}: ${message}` : message)); checkState.planning.activities.push(item); }
      if (issues.length) { setErrors([...new Set(issues)]); return; }
      setBusy(true);if(!existing&&repeat&&activity.type==='training'){const response=await fetch('/api/cms/planning/series',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'apply',activity,until:repeatUntil,weekdays:[parseDate(activity.date).getUTCDay()],operationId:crypto.randomUUID()})}),data=await response.json();if(!response.ok)throw Error(data.message||'De reeks kon niet worden opgeslagen.');await reload();setSelectedDate(activity.date);setDraft(null);notify('De volledige trainingsreeks is opgeslagen.');return;}
      if (await update(s => {
        const current = s.planning.activities.find(a => a.id === activity.id);
        if (current?.source === 'sportlink' && (activity.date !== current.date || activity.startTime !== current.startTime || activity.endTime !== current.endTime || activity.type !== current.type)) throw new Error('Datum en tijd van Sportlink-wedstrijden worden door de bron bepaald.');
        s.planning.activities = s.planning.activities.filter(a => a.id !== activity.id);
        for (const item of items) { const conflicts = validateActivity(s, item, [item.id]); if (conflicts.length) throw new Error(conflicts.join(' ')); s.planning.activities.push(item); }
      }, items.length > 1 ? `${items.length} wekelijkse trainingen ingepland: ${activity.title}` : `Activiteit opgeslagen: ${activity.title}`,{[activity.id]:{action:publish?(activity.public?'publish':'unpublish'):'save',expectedVersion:selectedVersion.current}})) {
        setSelectedDate(activity.date); setDraft(null); notify(items.length > 1 ? `${items.length} trainingen opgeslagen, inclusief de reserveringen.` : 'Activiteit en bijbehorende reservering opgeslagen.');
      }
    } catch (error) { setErrors([error instanceof Error ? error.message : 'Opslaan is niet gelukt.']); }finally{setBusy(false);}
  }
  async function remove() {
    if (!existing || !canChange(existing) || existing.source !== 'manual') return;
    if (await update(s => { s.planning.activities = s.planning.activities.filter(a => a.id !== existing.id); }, `Activiteit verwijderd: ${existing.title}`,{[existing.id]:{action:'trash',expectedVersion:selectedVersion.current}})) { setDraft(null); notify('Activiteit verwijderd. De gereserveerde locaties en personen zijn weer vrij.'); }
  }
  function startDrag(event: DragEvent, activity: CmsActivity) {
    if (!canChange(activity) || activity.source !== 'manual' || activity.status !== 'planned') { event.preventDefault(); return; }
    dragVersion.current=recordVersion(activity.id);event.dataTransfer.setData('application/x-duindorp-activity', activity.id); event.dataTransfer.effectAllowed = 'move'; setDragging(activity.id); setBoardError('');
  }
  async function drop(event: DragEvent, date: string, time?: string) {
    event.preventDefault(); event.stopPropagation(); setDropKey(''); setDragging(null);
    const id = event.dataTransfer.getData('application/x-duindorp-activity');
    const activity = state.planning.activities.find(a => a.id === id);
    if (!activity || !canChange(activity) || activity.source !== 'manual') return;
    const startTime = time || activity.startTime, duration = minutes(activity.endTime) - minutes(activity.startTime), end = minutes(startTime) + duration;
    if (end >= 1440) { setBoardError('Deze activiteit past niet binnen één dag. Kies een eerdere begintijd.'); return; }
    const moved = { ...activity, date, startTime, endTime: timeValue(end) };
    const conflicts = validateActivity(state, moved, [id]);
    if (conflicts.length) { setBoardError(conflicts.join(' ')); return; }
    if (await update(s => { const live = s.planning.activities.find(a => a.id === id); if (!live) throw new Error('De activiteit bestaat niet meer.'); const result = { ...live, date, startTime, endTime: moved.endTime }; const errors = validateActivity(s, result, [id]); if (errors.length) throw new Error(errors.join(' ')); s.planning.activities = s.planning.activities.map(a => a.id === id ? result : a); }, `Activiteit verplaatst: ${activity.title}`,{[id]:{action:'save',expectedVersion:dragVersion.current}})) notify(`Verplaatst naar ${labelDate(parseDate(date), { day: 'numeric', month: 'long' })}, ${startTime}–${moved.endTime}.`);
  }
  function dragOver(event: DragEvent, key: string) { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropKey(key); }
  function activityCard(activity: CmsActivity, style?: CSSProperties, compact = false) {
    const dense=typeof style?.height==='number'&&style.height<85;
    const names = activity.locationIds.map(id => state.planning.locations.find(l => l.id === id)?.name).filter(Boolean).join(', ');
    const draggable = canChange(activity) && activity.source === 'manual' && activity.status === 'planned';
    return <button key={activity.id} type="button" className={`plan-card ${activity.type} ${compact ? 'compact' : ''} ${activity.status === 'cancelled' ? 'cancelled' : ''} ${dragging === activity.id ? 'dragging' : ''}`} style={{...style,...(activity.type==='match'?matchColors(activity):{})}} draggable={draggable} onDragStart={event => startDrag(event, activity)} onDragEnd={() => { setDragging(null); setDropKey(''); }} onClick={() => open(activity)} title={`${activity.title}\n${activity.startTime}–${activity.endTime}\n${names || activity.sourceData?.venue || 'Nog geen locatie'}${activity.source === 'sportlink' ? '\nSportlink' : '\nKlik om te bewerken of te verplaatsen'}`}>
      <span className="plan-card-top"><span>{activity.startTime}{!compact&&!dense && ` – ${activity.endTime}`}{activity.type==='match'&&<b className="plan-match-side"> · {matchSideLabel(activity)}</b>}</span>{activity.source === 'sportlink' ? <span className="plan-source-dot" aria-label="Sportlink bronwedstrijd">S</span> : draggable && <GripVertical size={12}/>}</span>
      <strong>{activity.title}</strong>{!compact&&!dense && <small><MapPin size={10}/>{names || activity.sourceData?.venue || (activity.source==='sportlink'?'Locatie niet beschikbaar':'Nog in te delen')}</small>}{activity.public && !compact && <Globe2 className="plan-public-icon" size={11}/>}
    </button>;
  }
  function renderTimeGrid() {
    return <div className="plan-time-scroll" ref={gridScroll}><div className={`plan-time-grid ${view === 'day' ? 'single' : ''}`} style={{ '--plan-days': days.length } as CSSProperties}>
      <div className="plan-time-head"><div className="plan-time-zone">TIJD<span>Amsterdam</span></div>{days.map(day => <button key={dateKey(day)} className={dateKey(day) === today ? 'today' : ''} onClick={() => { setSelectedDate(dateKey(day)); setView('day'); }}><span>{labelDate(day, { weekday: 'short' })}</span><strong>{day.getUTCDate()}</strong><small>{filtered.filter(a => a.date === dateKey(day)).length} activiteiten</small></button>)}</div>
      <div className="plan-time-body"><div className="plan-time-labels" style={{ height: hours.length * HOUR_HEIGHT }}>{hours.map(hour => <span key={hour} style={{ top: (hour - startHour) * HOUR_HEIGHT }}>{timeValue(hour * 60)}</span>)}</div>{days.map(day => {
        const key = dateKey(day), events = filtered.filter(a => a.date === key), lanes = eventLanes(events);
        return <div key={key} className={`plan-day-column ${key === today ? 'today' : ''}`} style={{ height: hours.length * HOUR_HEIGHT }}>
          {hours.flatMap(hour => [0, 30].map(minute => { const time = timeValue(hour * 60 + minute), target = `${key}-${time}`; return <button key={time} type="button" className={`plan-slot ${minute ? 'half' : ''} ${dropKey === target ? 'drop-target' : ''}`} style={{ top: ((hour - startHour) + minute / 60) * HOUR_HEIGHT, height: HOUR_HEIGHT / 2 }} aria-label={`${labelDate(day)}, ${time}: activiteit toevoegen`} disabled={!editable} onClick={() => create(key, time)} onDragOver={e => dragOver(e, target)} onDrop={e => drop(e, key, time)}><Plus size={12}/></button>; }))}
          {events.map(activity => { const lane = lanes.get(activity.id)!; return activityCard(activity, { top: (minutes(activity.startTime) / 60 - startHour) * HOUR_HEIGHT + 2, height: Math.max(25, (minutes(activity.endTime) - minutes(activity.startTime)) / 60 * HOUR_HEIGHT - 4), left: `calc(${lane.lane * 100 / lane.count}% + 3px)`, width: `calc(${100 / lane.count}% - 6px)` }); })}
        </div>;
      })}</div>
    </div></div>;
  }
  function renderMonth() {
    const start = monday(new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 12)));
    return <div className="plan-month-scroll"><div className="plan-month"><div className="plan-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div><div className="plan-month-grid">{Array.from({ length: 42 }, (_, i) => shiftDay(start, i)).map(day => {
      const key = dateKey(day), items = filtered.filter(a => a.date === key).sort((a, b) => a.startTime.localeCompare(b.startTime));
      return <div key={key} className={`plan-month-day ${day.getUTCMonth() !== selected.getUTCMonth() ? 'outside' : ''} ${key === today ? 'today' : ''} ${dropKey === key ? 'drop-target' : ''}`} onDragOver={e => dragOver(e, key)} onDrop={e => drop(e, key)}><div className="plan-month-day-top"><button onClick={() => { setSelectedDate(key); setView('day'); }} aria-label={labelDate(day)}>{day.getUTCDate()}</button>{editable && <button className="plan-month-add" onClick={() => create(key)} aria-label={`Activiteit op ${labelDate(day)} toevoegen`}><Plus size={12}/></button>}</div>{items.slice(0, 3).map(a => activityCard(a, undefined, true))}{items.length > 3 && <button className="plan-more" onClick={() => { setSelectedDate(key); setView('day'); }}>+ {items.length - 3} meer bekijken</button>}</div>;
    })}</div></div></div>;
  }
  function renderYear() {
    return <div className="plan-year">{Array.from({ length: 12 }, (_, month) => {
      const first = new Date(Date.UTC(selected.getUTCFullYear(), month, 1, 12)), prefix = dateKey(first).slice(0, 7), count = filtered.filter(a => a.date.startsWith(prefix)).length, start = monday(first);
      return <section key={month}><button className="plan-year-month-title" onClick={() => { setSelectedDate(dateKey(first)); setView('month'); }}><strong>{labelDate(first, { month: 'long' })}</strong><span>{count}{filtered.some(a=>a.date.startsWith(prefix)&&a.type==='match')&&<small className="plan-year-side-summary">{filtered.filter(a=>a.date.startsWith(prefix)&&matchSide(a)==='home').length} Thuis · {filtered.filter(a=>a.date.startsWith(prefix)&&matchSide(a)==='away').length} Uit</small>}</span></button><div className="plan-year-days">{WEEKDAYS.map(day => <small key={day}>{day}</small>)}{Array.from({ length: 42 }, (_, i) => shiftDay(start, i)).map(day => {
        const key = dateKey(day), items = filtered.filter(a => a.date === key);
        return <button key={key} className={`${day.getUTCMonth() !== month ? 'outside' : ''} ${key === today ? 'today' : ''} ${items.length ? 'has-events' : ''}`} onClick={() => { setSelectedDate(key); setView('day'); }} title={`${labelDate(day)} · ${items.length} activiteiten · ${items.filter(a=>a.type==='match').map(a=>matchSideLabel(a)+': '+a.title).join(', ')}`} aria-label={`${labelDate(day)}, ${items.length} activiteiten · ${items.filter(a=>a.type==='match').map(a=>matchSideLabel(a)+': '+a.title).join(', ')}`} >{day.getUTCDate()}<span>{[...new Set(items.map(a => a.type==='match'?matchSide(a)==='home'?'match':matchSide(a)==='away'?'away':'unknown':a.type))].slice(0, 3).map(t => <i key={t} className={t}/>)}</span></button>;
      })}</div></section>;
    })}</div>;
  }

  const pageHeader=useCmsPageHeader({actions:<button className="cms-button primary" disabled={!editable||busy||saving} onClick={()=>create()}><Plus size={17}/>{initialType?'Training toevoegen':'Activiteit toevoegen'}</button>});
  return <div className="planning-board">
    {pageHeader}<PlanningSyncStatus/><PlanningMigrationReview source="agenda"/>
    <div className="plan-workspace"><section className="plan-calendar" aria-label="Clubagenda">
      <div className="plan-calendar-top"><div className="plan-period"><div className="plan-navigation"><button aria-label="Vorige periode" onClick={() => navigate(-1)}><ChevronLeft size={18}/></button><button aria-label="Volgende periode" onClick={() => navigate(1)}><ChevronRight size={18}/></button></div><div><h3>{title}</h3><span>{periodEvents.length} {periodEvents.length === 1 ? 'activiteit' : 'activiteiten'} in deze periode</span></div></div><div className="plan-calendar-actions"><button className="plan-today" onClick={() => setSelectedDate(today)}>Vandaag</button><label className="plan-date-picker" title="Ga naar datum"><CalendarDays size={15}/><input aria-label="Ga naar datum" type="date" value={selectedDate} onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}/></label></div></div>
      <div className="plan-viewbar"><div className="plan-views" role="group" aria-label="Agendaweergave">{VIEWS.map(item => <button key={item.id} aria-pressed={view === item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</div><div className="plan-legend">{TYPES.filter(item=>item.id!=='match').map(item => <span key={item.id}><i className={item.id}/>{item.label}</span>)}<span><i className="match"/>Thuis</span><span><i className="away"/>Uit</span><span><i className="unknown"/>Nog te bepalen</span></div></div>
      <div className="plan-filters"><SlidersHorizontal size={15}/><select aria-label="Filter op activiteitsoort" value={type} onChange={e => setType(e.target.value)}><option value="">Alle activiteiten</option>{TYPES.map(t => <option key={t.id} value={t.id}>{t.plural}</option>)}</select><select aria-label="Filter op locatie" value={location} onChange={e => setLocation(e.target.value)}><option value="">Alle locaties</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select><select aria-label="Filter op persoon" value={person} onChange={e => setPerson(e.target.value)}><option value="">Alle personen</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Filter op commissie" value={committee} onChange={e => setCommittee(e.target.value)}><option value="">Alle commissies</option>{committees.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Filter op team" value={team} onChange={e => setTeam(e.target.value)}><option value="">Alle teams</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{activeFilters > 0 && <button className="plan-reset" title="Filters wissen" aria-label="Filters wissen" onClick={() => { setType(''); setLocation(''); setPerson(''); setCommittee(''); setTeam(''); setSearch(''); }}><RotateCcw size={14}/></button>}</div>
      {boardError && <div className="plan-board-error" role="alert"><AlertCircle size={17}/><span><strong>Verplaatsen niet mogelijk</strong>{boardError}</span><button aria-label="Melding sluiten" onClick={() => setBoardError('')}><X size={15}/></button></div>}
      {view === 'day' || view === 'week' ? renderTimeGrid() : view === 'month' ? renderMonth() : renderYear()}
      <div className="plan-calendar-footer"><span><GripVertical size={13}/>Sleep een activiteit naar een tijdvak. Klik om te bewerken.</span><label><input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)}/>Afgelast tonen</label></div>
    </section><aside className="plan-sidebar">
      <div className="plan-side-search"><Search size={16}/><input aria-label="Zoek activiteit" placeholder="Zoek een activiteit…" value={search} onChange={e => setSearch(e.target.value)}/></div>
      <section className="plan-side-section"><div className="plan-side-heading"><span className="plan-side-icon"><Layers3 size={18}/></span><div><h3>Nog in te delen</h3><p>Locatie nog toewijzen</p></div><b>{unassigned.length}</b></div><div className="plan-unassigned">{unassigned.length ? unassigned.map(a => <div key={a.id}><span className="plan-unassigned-date">{labelDate(parseDate(a.date), { day: 'numeric', month: 'short' })}{needsFieldAssignment(state, a) ? ' · Veld nog indelen' : ''}</span>{activityCard(a)}</div>) : <div className="plan-all-assigned"><Check size={22}/><strong>Alles heeft een plek</strong><p>Activiteiten zonder locatie verschijnen hier.</p></div>}</div></section>
      <section className="plan-side-section plan-reservations"><h3><MapPin size={15}/>Eén activiteit, alles geregeld</h3><p>Locaties worden meteen gereserveerd. Personen, commissies en teams blijven aan de activiteit gekoppeld.</p><div><Check size={14}/><span>Dubbele locatieboekingen worden gecontroleerd vóór het opslaan.</span></div><div><UsersRound size={14}/><span>Filter op betrokkenen om hun activiteiten naast elkaar te bekijken.</span></div><div><Globe2 size={14}/><span>Alleen openbare activiteiten verschijnen in de clubagenda.</span></div></section>
      <section className="plan-source-note"><span>S</span><div><strong>Sportlink</strong><p>Wedstrijden met een S komen uit de gekoppelde Sportlink-bron. De bron beheert titel, status, datum, tijd en toegewezen veld- en kleedkamerindeling. Extra locaties en betrokkenen beheer je hier.</p></div></section>
      {!editable && <div className="plan-readonly"><LockKeyhole size={15}/>Je bekijkt de planning zonder bewerkrechten.</div>}
    </aside></div>

    {draft && <div className="plan-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div className="plan-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="plan-modal-title"><form onSubmit={event=>void save(event)}>
      <header><div><span className="plan-eyebrow">ACTIVITEIT & RESERVERING</span><h2 id="plan-modal-title">{existing ? 'Activiteit bewerken' : draft.type === 'training' ? 'Training inplannen' : 'Nieuwe activiteit'}</h2></div><button type="button" className="plan-modal-close" aria-label="Sluiten" onClick={close}><X size={21}/></button></header>
      <div className="plan-modal-body">{incomingChanged&&<div className="plan-form-note" role="alert"><AlertCircle size={18}/><div><strong>Deze activiteit is op de server bijgewerkt.</strong><p>Je bewerking blijft hier staan. De actuele planning bevat {existing?.date} {existing?.startTime}–{existing?.endTime}, {existing?.status==='cancelled'?'Afgelast':existing&&matchSideLabel(existing)}. Opslaan is geblokkeerd om nieuwe brongegevens te beschermen.</p><button type="button" className="plan-button" onClick={()=>{if(existing&&confirm('Je werkversie vervangen door de actuele activiteit? Kopieer eerst eventuele eigen opmerkingen.'))open(existing);}}>Actuele activiteit laden</button></div></div>}{sourceLocked && <div className="plan-form-note"><LockKeyhole size={16}/><span><strong>Sportlink · {matchSideLabel(draft)}</strong>{draft.sourceData?.venue&&<span>Speelplaats: {draft.sourceData.venue}<br/></span>}Titel, status, datum, tijd en indeling worden door de bron bepaald. Je kunt extra locaties en betrokkenen toewijzen.</span></div>}{!editorEnabled&&!incomingChanged && <div className="plan-form-note"><LockKeyhole size={16}/><span>{existing?.public ? 'Voor wijzigingen aan een openbare activiteit zijn publicatierechten nodig.' : 'Je hebt geen rechten om deze activiteit te wijzigen.'}</span></div>}
        <fieldset className="plan-form-fields" disabled={!editorEnabled}>
          <div className="plan-form-grid"><Field label="Titel *" className="wide"><input autoComplete="off" readOnly={sourceLocked} value={draft.title} placeholder="Bijvoorbeeld bestuursvergadering" maxLength={150} required onChange={e => patch({ title: e.target.value })}/></Field><Field label="Soort activiteit"><select value={draft.type} disabled={sourceLocked} onChange={e => { patch({ type: e.target.value as CmsActivity['type'] }); setRepeat(false); }}>{TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field><Field label="Datum *"><input type="date" value={draft.date} disabled={sourceLocked} required onChange={e => patch({ date: e.target.value })}/></Field><Field label="Begintijd *"><input type="time" step={300} value={draft.startTime} disabled={sourceLocked} required onChange={e => patch({ startTime: e.target.value })}/></Field><Field label="Eindtijd *"><input type="time" step={300} value={draft.endTime} disabled={sourceLocked} required onChange={e => patch({ endTime: e.target.value })}/></Field></div>
          {!existing && draft.type === 'training' && <div className="plan-repeat"><label><input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)}/><span><strong>Wekelijks herhalen</strong><small>Iedere {draft.date ? labelDate(parseDate(draft.date), { weekday: 'long' }) : 'weekdag'}, met dezelfde locaties en betrokkenen.</small></span></label>{repeat && <Field label="Herhalen tot en met"><input type="date" min={draft.date} value={repeatUntil} required onChange={e => setRepeatUntil(e.target.value)}/></Field>}</div>}
          <div className="plan-form-section-title"><MapPin size={16}/><div><h3>Locaties & betrokkenen</h3><p>Zoek en selecteer locaties en betrokkenen. Je kunt meerdere keuzes toevoegen.</p></div></div>
          <div className="plan-linked-fields">
            <CmsMultiSelect label="Locaties" placeholder="Zoek een veld of ruimte…" options={state.planning.locations.filter(l => !l.deletedAt && l.active || draft.locationIds.includes(l.id)).map(l => ({ id: l.id, name: l.name, description: draft.sourceData?.locationIds.includes(l.id)?'Sportlink · bronbeheerd':draft.locationIds.includes(l.id)?'Handmatige nevenreservering':!l.active ? 'Inactief' : l.type === 'field' ? 'Veld' : l.type === 'changing' ? 'Kleedkamer' : 'Ruimte', disabled: !!draft.sourceData?.locationIds.includes(l.id) || !l.active && !draft.locationIds.includes(l.id) }))} value={draft.locationIds} onChange={locationIds => patch({ locationIds })} disabled={!editorEnabled}/>
            <CmsMultiSelect label="Personen" placeholder="Zoek een persoon…" options={state.people.filter(p => !p.deletedAt || draft.personIds.includes(p.id)).map(p => ({ id: p.id, name: p.deletedAt ? `${p.name} (in prullenbak)` : p.name, description: p.role }))} value={draft.personIds} onChange={personIds => patch({ personIds })} disabled={!editorEnabled}/>
            <CmsMultiSelect label="Commissies" placeholder="Zoek een commissie…" options={state.planning.committees.filter(c => !c.deletedAt && c.active || draft.committeeIds.includes(c.id))} value={draft.committeeIds} onChange={committeeIds => patch({ committeeIds })} disabled={!editorEnabled}/>
            <CmsMultiSelect label="Teams" placeholder="Zoek een team…" options={teams.map(team=>({...team,disabled:!can('pages',team.id)}))} value={draft.teamIds} onChange={teamIds => {if(teamIds.length||can('pages'))patch({ teamIds });else notify('Kies minimaal één team waarvoor je bewerkrechten hebt.');}} disabled={!editorEnabled}/>
          </div>
          {occurrenceChoiceNeeded&&<Field label="Bij dubbel tijdstip door wintertijd"><select value={draft.occurrence||'reject'} disabled={sourceLocked} onChange={event=>patch({occurrence:event.target.value as CmsActivity['occurrence']})}><option value="reject">Vraag om expliciete keuze</option><option value="earlier">Eerste tijdstip</option><option value="later">Tweede tijdstip</option></select></Field>}<Field label="Omschrijving of praktische informatie"><textarea rows={3} value={draft.description} placeholder="Bijvoorbeeld agenda, benodigdheden of instructies voor de voorbereiding." maxLength={5000} onChange={e => patch({ description: e.target.value })}/></Field>
          <div className="plan-form-bottom"><label className="plan-public-check"><input type="checkbox" checked={draft.public} disabled={!canPublishActivity(draft)} onChange={e => patch({ public: e.target.checked })}/><span><strong><Globe2 size={14}/>Tonen in openbare clubagenda</strong><small>{can('publish') ? 'Titel, datum, tijd, omschrijving en locatie zijn zichtbaar op de website.' : 'Publicatierechten nodig om dit in te schakelen.'}</small></span></label><Field label="Status"><select disabled={sourceLocked} value={draft.status} onChange={e => patch({ status: e.target.value as CmsActivity['status'] })}><option value="planned">Ingepland</option><option value="cancelled">Afgelast</option></select></Field></div>
        </fieldset>
        {storageError&&<p className="plan-error" role="alert">{storageError}</p>}{errors.length > 0 && <div className="plan-form-errors" role="alert"><strong><AlertCircle size={16}/>Controleer de planning</strong><ul>{errors.slice(0, 12).map((error, index) => <li key={index}>{error}</li>)}</ul>{errors.length > 12 && <p>En {errors.length - 12} andere meldingen. Pas de reeks of reserveringen aan.</p>}</div>}
        {existing?.seriesId && <p className="plan-series-note"><Clock3 size={13}/>Dit is één activiteit uit een reeks. Wijzigingen gelden alleen voor deze datum.</p>}
        {confirmDelete && <div className="plan-delete-confirm"><strong>Deze activiteit verwijderen?</strong><p>De activiteit en alle bijbehorende reserveringen verdwijnen{existing?.seriesId ? ' voor deze datum' : ''}.</p><button type="button" className="plan-button danger" onClick={remove}>Ja, verwijderen</button><button type="button" className="plan-button" onClick={() => setConfirmDelete(false)}>Behouden</button></div>}
      </div><footer>{existing && existing.source === 'manual' && <button type="button" className="plan-button danger subtle" disabled={!editorEnabled} onClick={() => setConfirmDelete(!confirmDelete)}><Trash2 size={15}/>Verwijderen</button>}<span/><button type="button" className="plan-button" onClick={close}>Annuleren</button><button type="submit" className={`plan-button ${!draft.public&&!existing?.published?'primary':''}`} disabled={!editorEnabled}><Check size={16}/>{!existing && repeat ? 'Trainingsreeks opslaan' : 'Activiteit opslaan'}</button>{!repeat&&(draft.public||existing?.published)&&<button type="button" className="plan-button primary" disabled={!editorEnabled||!canPublishActivity(draft)} onClick={event=>void save(event as unknown as FormEvent,true)}>{draft.public?existing?.published?'Publicatie bijwerken':'Opslaan en publiceren':'Publicatie intrekken'}</button>}</footer>
    </form></div></div>}
  </div>;
}

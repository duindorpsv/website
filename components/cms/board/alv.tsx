'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, Check, ClipboardList, Download, Monitor, Plus, Vote } from 'lucide-react';
import { makeBase, type BoardPageProps, type BoardState } from '@/lib/cms/board';
import './alv.css';
import {downloadBoardPdf} from './server-workspace';

type Cycle = BoardState['alvs'][number];
type Point = BoardState['alvItems'][number];
type Round = Cycle['votes'][number];
type PointDraft = Pick<Point, 'title' | 'description' | 'ownerId' | 'kind' | 'stance' | 'document' | 'question' | 'checklist' | 'documentReleased'>;
type RoundDraft = Pick<Round, 'itemId' | 'text' | 'kind' | 'counts' | 'outcome'>;

const panes = { prep: 'Voorbereiding', agenda: 'Agenda & draaiboek', votes: 'Stemmingen', minutes: 'Verslag' } as const;
type Pane = keyof typeof panes;
const pointKinds = { info: 'Ter kennisname', discussion: 'Bespreken', decision: 'Besluiten' };
const pointKindLabel = (kind: Cycle['agendaSnapshot'][number]['kind']) => kind === 'risk' ? 'Risico of escalatie' : pointKinds[kind];
const pointStates = { work: 'In voorbereiding', ready: 'Gereed', scheduled: 'Geagendeerd', handled: 'Behandeld' };
const cycleStates = { draft: 'In voorbereiding', approved: 'Agenda vastgesteld', live: 'In vergadering', closed: 'Afgerond' };
const countLabels = { voor: 'Voor', tegen: 'Tegen', onthouding: 'Onthouding', ongeldig: 'Ongeldig' };
const countKeys = Object.keys(countLabels) as (keyof Round['counts'])[];
const blankCounts = { voor: '0', tegen: '0', onthouding: '0', ongeldig: '0' };
const outcomes = { adopted: 'Aangenomen', rejected: 'Verworpen' };

function displayDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function blankPoint(ownerId: string): PointDraft {
  return {
    title: '', description: '', ownerId, kind: 'discussion', stance: '', document: '', question: '',
    checklist: { stance: false, document: false, question: false }, documentReleased: false,
  };
}

function preparationChecks(point: PointDraft) {
  const missing = [];
  if (!point.title.trim()) missing.push('Titel invullen');
  if (!point.ownerId) missing.push('Eigenaar kiezen');
  if (!point.stance.trim()) missing.push('Bestuursstandpunt invullen');
  if (!point.document.trim()) missing.push('Stukken of geen stukken nodig toelichten');
  if (!point.checklist.stance) missing.push('Bestuursstandpunt controleren');
  if (!point.checklist.document) missing.push('Stukken controleren');
  if (point.kind === 'decision' && (!point.question.trim() || !point.checklist.question)) missing.push('Stemtekst vastleggen en controleren');
  return missing;
}

function isReady(point: PointDraft) {
  return preparationChecks(point).length === 0;
}

function snapshotPoint(point: Point): Cycle['agendaSnapshot'][number] {
  return {
    id: point.id, title: point.title, kind: point.kind, stance: point.stance,
    document: point.document, documentReleased: point.documentReleased,
    question: point.kind === 'decision' ? point.question : '',
  };
}

function countSummary(round: Round) {
  return countKeys.map(key => countLabels[key] + ' ' + round.counts[key]).join(' · ');
}

function showOnScreen(cycle: Cycle, title: string, text: string) {
  const screen = window.open('', 'duindorp-alv-zaalbeeld', 'popup,width=1080,height=660');
  if (!screen) return false;
  screen.opener = null;
  const doc = screen.document;
  doc.title = 'Zaalbeeld | Duindorp SV';
  doc.documentElement.lang = 'nl';
  doc.body.style.cssText = 'margin:0;min-height:100vh;display:grid;align-items:center;background:#082750;color:white;font:18px/1.45 system-ui,sans-serif;';
  const content = doc.createElement('main');
  content.style.cssText = 'max-width:960px;margin:auto;padding:clamp(32px,8vw,90px);overflow-wrap:anywhere;';
  const meta = doc.createElement('p');
  meta.style.cssText = 'color:#b9d7ff;letter-spacing:.09em;text-transform:uppercase;font-weight:800;';
  meta.textContent = 'Duindorp SV  /  ' + cycle.title;
  const heading = doc.createElement('h1');
  heading.style.cssText = 'font-size:clamp(36px,6vw,78px);line-height:1.1;margin:15px 0;';
  heading.textContent = title;
  const body = doc.createElement('p');
  body.style.cssText = 'font-size:clamp(23px,3.5vw,42px);white-space:pre-wrap;';
  body.textContent = text;
  content.appendChild(meta);
  content.appendChild(heading);
  content.appendChild(body);
  doc.body.replaceChildren(content);
  screen.focus();
  return true;
}

export function Alv({ board, actor, people, change, focusId, focusPane, onNavigate }: BoardPageProps & { focusPane?: Pane }) {
  const [cycleId, setCycleId] = useState('');
  const [pane, setPane] = useState<Pane>('prep');
  const [targetPointId, setTargetPointId] = useState<string>();
  const targetPoint = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [editPointId, setEditPointId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const canManage = actor.role === 'chair' || actor.role === 'secretary';
  const cycles = [...board.alvs].sort((a, b) => b.date.localeCompare(a.date));
  const cycle = cycles.find(row => row.id === cycleId) ?? cycles.find(row => row.status !== 'closed') ?? cycles[0];
  const previous = cycles.find(row => row.status === 'closed');
  const points = board.alvItems.filter(row => cycle && row.alvId === cycle.id);
  const intake = board.alvItems.filter(row => !row.alvId);
  const readyCount = points.filter(row => row.status === 'ready').length;
  const agenda = cycle?.status === 'draft'
    ? cycle.agendaIds.flatMap(id => points.filter(row => row.id === id).map(snapshotPoint))
    : cycle?.agendaSnapshot ?? [];
  const confirmed = cycle?.votes.filter(round => round.confirmedAt) ?? [];
  const pendingVotes = cycle?.votes.filter(round => !round.confirmedAt) ?? [];
  const hasPendingVote = pendingVotes.length > 0;
  const targetVote = targetPointId && (pendingVotes.find(round => round.itemId === targetPointId)
    ?? cycle?.votes.find(round => round.itemId === targetPointId));
  const focusPoint = board.alvItems.find(row => row.id === focusId);
  const focusPointId = focusPoint?.id;
  const focusCycleId = board.alvs.find(row => row.id === focusId)?.id ?? focusPoint?.alvId;
  const unfinished = points.filter(point => point.status === 'work' || !isReady(point)).length;
  const preparationNeeded = canManage && cycle?.status === 'draft' && (unfinished > 0 || intake.length > 0);
  const canConfirmVote = pendingVotes.some(round => round.countedBy !== actor.id);

  useEffect(() => {
    if (!focusCycleId && !focusPointId && !focusPane) return;
    if (focusCycleId) setCycleId(focusCycleId);
    setPane(focusPane ?? 'prep');
    setTargetPointId(focusPointId);
    setCreating(false);
    setEditPointId(null);
    setMessage('');
  }, [focusCycleId, focusPointId, focusPane]);

  useEffect(() => {
    if (targetPointId) targetPoint.current?.focus();
  }, [targetPointId, pane, cycle?.id]);

  function selectPane(next: Pane) {
    setPane(next);
    setTargetPointId(undefined);
    setMessage('');
  }

  function pointTarget(id: string) {
    return id === targetPointId ? {
      tabIndex: -1,
      ref: (element: HTMLElement | null) => { targetPoint.current = element; },
    } : {};
  }

  function name(id: string) {
    return id === actor.id ? actor.name : people.find(row => row.id === id)?.name ?? 'Bestuursgebruiker';
  }

  async function createCycle(title: string, date: string, time: string, location: string, carry: boolean) {
    let id = '';
    const saved = await change(draft => {
      const base = makeBase(draft, 'alv');
      id = base.id;
      const origin = carry && previous ? draft.alvs.find(row => row.id === previous.id) : undefined;
      draft.alvs.push({
        ...base, title, date, time, location, status: 'draft', agendaIds: [], agendaSnapshot: [],
        previousId: origin?.id, minutes: '', votes: [], promises: [],
      });
      if (!origin) return;
      const openPoints = draft.alvItems.filter(row => row.alvId === origin.id && row.status !== 'handled');
      for (const point of openPoints) {
        draft.alvItems.push({
          ...point, ...makeBase(draft, 'alvItem'), alvId: id, fromItemId: point.id,
          status: 'work', notes: '', documentReleased: false,
          checklist: { stance: false, document: false, question: false },
        });
      }
      for (const promise of origin.promises) {
        draft.alvItems.push({
          ...makeBase(draft, 'alvItem'), ...blankPoint(actor.id), alvId: id,
          title: promise, description: 'Toezegging uit ' + origin.title, status: 'work', notes: '',
        });
      }
    }, 'ALV-werkvoorraad aangemaakt');
    if (saved) {
      setCycleId(id);
      setCreating(false);
      setEditPointId(null);
      selectPane('prep');
    }
  }

  async function savePoint(input: PointDraft, ready: boolean, existing?: Point) {
    if (!canManage || !cycle || cycle.status !== 'draft') return;
    const saved = await change(draft => {
      const liveCycle = draft.alvs.find(row => row.id === cycle.id && row.status === 'draft');
      if (!liveCycle) return;
      const fields = { ...input, title: input.title.trim(), alvId: cycle.id, status: ready ? 'ready' as const : 'work' as const };
      const point = existing ? draft.alvItems.find(row => row.id === existing.id) : undefined;
      if (point) {
        Object.assign(point, fields);
        if (!ready) liveCycle.agendaIds = liveCycle.agendaIds.filter(id => id !== point.id);
      } else {
        draft.alvItems.push({ ...makeBase(draft, 'alvItem'), ...fields, notes: '' });
      }
    }, ready ? 'ALV-punt gereed voor agenda' : 'ALV-concept opgeslagen');
    if (saved) setEditPointId(null);
  }

  async function addIntake(id: string) {
    if (!canManage || cycle?.status !== 'draft') return;
    await change(draft => {
      const point = draft.alvItems.find(row => row.id === id && !row.alvId);
      if (point) point.alvId = cycle.id;
    }, 'Agendaverzoek toegevoegd aan de ALV-werkvoorraad');
  }

  async function generateAgenda() {
    if (!canManage || cycle?.status !== 'draft') return;
    const saved=await change(draft => {
      const row = draft.alvs.find(item => item.id === cycle.id && item.status === 'draft');
      if (!row) return;
      const ready = draft.alvItems.filter(item => item.alvId === row.id && item.status === 'ready' && isReady(item)).map(item => item.id);
      row.agendaIds = [...row.agendaIds.filter(id => ready.includes(id)), ...ready.filter(id => !row.agendaIds.includes(id))];
    }, 'Conceptagenda opgebouwd uit gereedstaande punten');
    if(saved)selectPane('agenda');
  }

  async function reorder(id: string, direction: -1 | 1) {
    if (!canManage || cycle?.status !== 'draft') return;
    await change(draft => {
      const row = draft.alvs.find(item => item.id === cycle.id && item.status === 'draft');
      if (!row) return;
      const index = row.agendaIds.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= row.agendaIds.length) return;
      row.agendaIds.splice(index, 1);
      row.agendaIds.splice(target, 0, id);
    }, 'Agendavolgorde aangepast');
  }

  async function advance(to: Cycle['status']) {
    if (actor.role!=='chair' || !cycle) return;
    const saved = await change(draft => {
      const row = draft.alvs.find(item => item.id === cycle.id && item.status === cycle.status);
      if (!row) return;
      if (to === 'approved') {
        const scheduled = row.agendaIds.flatMap(id => draft.alvItems.filter(point => point.id === id && point.status === 'ready' && isReady(point)));
        if (!scheduled.length || scheduled.length !== row.agendaIds.length) throw new Error('Werk de conceptagenda bij met gereedstaande punten.');
        row.agendaSnapshot = scheduled.map(snapshotPoint);
        scheduled.forEach(point => { point.status = 'scheduled'; });
      }
      if (to === 'closed' && row.votes.some(round => !round.confirmedAt)) {
        throw new Error('Laat alle tellingen eerst door een tweede persoon bevestigen.');
      }
      row.status = to;
    }, 'ALV · ' + cycleStates[to].toLowerCase());
    if (saved && to === 'closed') selectPane('minutes');
  }

  async function saveNotes(id: string, notes: string, handled: boolean) {
    if (!canManage || cycle?.status !== 'live') return;
    await change(draft => {
      const item = draft.alvItems.find(row => row.id === id && row.alvId === cycle.id);
      if (!item) return;
      item.notes = notes;
      if (handled) item.status = 'handled';
    }, handled ? 'Agendapunt behandeld' : 'ALV-aantekeningen bewaard');
  }

  async function addRound(input: RoundDraft) {
    if (!canManage || cycle?.status !== 'live') return false;
    return await change(draft => {
      const row = draft.alvs.find(item => item.id === cycle.id && item.status === 'live');
      const point = row?.agendaSnapshot.find(item => item.id === input.itemId && item.kind === 'decision');
      if (!row || !point) return;
      const rounds = row.votes.filter(vote => vote.itemId === point.id);
      if (rounds.some(vote => !vote.confirmedAt || vote.kind === 'motion')) {
        throw new Error('Rond eerst de open telling af. Een definitieve voorstelstemming wordt één keer vastgelegd.');
      }
      row.votes.push({
        ...makeBase(draft, 'vote'), ...input, countedBy: actor.id,
        text: input.text.trim(),
      });
    }, 'Fysieke telling geregistreerd · tweede controle vereist');
  }

  async function confirmRound(id: string) {
    if (!canManage || cycle?.status !== 'live') return;
    await change(draft => {
      const row = draft.alvs.find(item => item.id === cycle.id && item.status === 'live');
      const round = row?.votes.find(item => item.id === id);
      const point = row?.agendaSnapshot.find(item => item.id === round?.itemId);
      if (!row || !round || !point || round.confirmedAt || round.countedBy === actor.id) return;
      round.confirmedBy = actor.id;
      round.confirmedAt = new Date().toISOString();
      if (round.kind === 'amendment') return;
      const base = makeBase(draft, 'decision');
      draft.decisions.push({
        ...base, title: point.title,
        text: round.text, effectiveFrom: row.date, effectiveUntil: '', source: 'alv',
        alvItemId: point.id, outcome: round.outcome, votes: countSummary(round),
      });
      round.decisionId = base.id;
      const item = draft.alvItems.find(entry => entry.id === point.id);
      if (item) item.status = 'handled';
    }, 'Stemuitslag bevestigd en opgenomen in het conceptverslag');
  }

  async function removePendingRound(id: string) {
    if (!canManage || cycle?.status !== 'live') return;
    await change(draft => {
      const row = draft.alvs.find(item => item.id === cycle.id && item.status === 'live');
      if (row) row.votes = row.votes.filter(round => round.id !== id || !!round.confirmedAt || round.countedBy !== actor.id);
    }, 'Concepttelling verwijderd');
  }

  async function exportMembers() {
    if (!cycle) return;
    try {
      await downloadBoardPdf('alv-package',cycle.id);
    } catch {
      setMessage('Het ledenpakket kon niet worden gedownload.');
    }
  }

  async function exportMinutes() {
    if (!cycle) return;
    try {
      await downloadBoardPdf('alv-minutes',cycle.id);
    } catch {
      setMessage('De conceptnotulen konden niet worden gedownload.');
    }
  }

  function project(title: string, text: string) {
    if (cycle && !showOnScreen(cycle, title, text)) setMessage('Sta pop-ups toe om het zaalbeeld te openen.');
  }

  return (
    <section className="bp-alv" aria-label="Algemene ledenvergadering">
      <div className="bp-alv-toolbar">
        <div>
          <span className="bp-alv-chip">Algemene ledenvergadering</span>
          <h2>{cycle?.title ?? 'ALV-werkvoorraad'}</h2>
          {cycle && <p>{[displayDate(cycle.date), cycle.time, cycle.location].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="bp-alv-actions">
          {cycles.length > 1 && <label className="bp-alv-field">Vergadering bekijken
            <select value={cycle?.id} onChange={event => { setCycleId(event.target.value); selectPane('prep'); setEditPointId(null); }}>
              {cycles.map(row => <option key={row.id} value={row.id}>{row.title} · {displayDate(row.date)}</option>)}
            </select>
          </label>}
          {canManage && <button className="cms-button primary" type="button" onClick={() => setCreating(!creating)}>
            <CalendarPlus size={16} /> {creating ? 'Sluiten' : 'Nieuwe ALV'}
          </button>}
        </div>
      </div>

      {creating && canManage && <CycleForm previous={previous} onCreate={createCycle} />}
      {message && <p className="bp-alv-error" role="alert">{message}</p>}
      {!cycle && !creating && <div className="bp-alv-card"><h3>De volgende ALV voorbereiden</h3><p>Maak een ALV aan om stukken en doorgestuurde punten samen te brengen.</p></div>}
      {cycle && <>
        <div className="bp-alv-actions">
          <span className="bp-alv-chip">{cycleStates[cycle.status]}</span>
          <span className="bp-alv-muted">{cycle.code} · {agenda.length} agendapunten · {confirmed.length} bevestigde tellingen</span>
          {cycle.previousId && <span className="bp-alv-muted">Vervolg op {cycles.find(row => row.id === cycle.previousId)?.title ?? 'eerdere ALV'}</span>}
        </div>
        <nav className="bp-alv-nav" aria-label="ALV-onderdelen">
          {(Object.keys(panes) as Pane[]).map(id => <button key={id} type="button" aria-pressed={pane === id} onClick={() => selectPane(id)}>{panes[id]}</button>)}
        </nav>
      </>}

      {preparationNeeded && <aside className="bp-alv-card bp-alv-row" aria-label="Eerst nog doen">
        <div><h3>Voor de agenda</h3><p>{[
          unfinished > 0 && (unfinished === 1 ? '1 punt vraagt voorbereiding' : `${unfinished} punten vragen voorbereiding`),
          intake.length > 0 && (intake.length === 1 ? '1 doorgestuurd punt te beoordelen' : `${intake.length} doorgestuurde punten te beoordelen`),
        ].filter(Boolean).join(' · ')}</p></div>
        {pane !== 'prep' && <button className="cms-button" type="button" onClick={() => selectPane('prep')}>Naar voorbereiding</button>}
      </aside>}
      {canManage && cycle?.status === 'live' && hasPendingVote && <aside className="bp-alv-card bp-alv-row" aria-label="Eerst nog doen">
        <div><h3>{pendingVotes.length === 1 ? '1 telling wacht op controle' : `${pendingVotes.length} tellingen wachten op controle`}</h3>
          <p>{canConfirmVote ? 'Controleer de telling van de andere bevoegde gebruiker.' : 'Je telling wacht op controle door een andere bevoegde gebruiker.'}</p></div>
        {pane !== 'votes' && <button className="cms-button" type="button" onClick={() => selectPane('votes')}>Naar stemtellingen</button>}
      </aside>}

      {cycle && pane === 'prep' && <div className="bp-alv-stack">
        <div className="bp-alv-toolbar">
          <div><h3>Werkvoorraad</h3><p>{readyCount} gereed voor de agenda · {points.length} in deze ALV</p></div>
          {canManage && cycle.status === 'draft' && <div className="bp-alv-actions">
            <button className="cms-button" type="button" onClick={() => setEditPointId(editPointId === 'new' ? null : 'new')}><Plus size={16} /> Nieuw ALV-punt</button>
            <button className="cms-button primary" type="button" disabled={!readyCount} onClick={generateAgenda}><ClipboardList size={16} /> Stel conceptagenda op</button>
          </div>}
        </div>
        {editPointId === 'new' && cycle.status === 'draft' && canManage &&
          <PointForm key="new" ownerId={actor.id} people={people} onCancel={() => setEditPointId(null)} onSave={savePoint} />}
        {intake.length > 0 && cycle.status === 'draft' && <div className="bp-alv-card bp-alv-stack">
          <h3>Doorgestuurd uit het bestuur</h3>
          {intake.map(point => <div key={point.id} className="bp-alv-row" {...pointTarget(point.id)}>
            <div><strong>{point.title}</strong><p>{point.code} · {point.description || 'Gereed voor voorbereiding'}</p></div>
            {canManage && <button className="cms-button" type="button" onClick={() => addIntake(point.id)}>Voeg toe aan deze ALV</button>}
          </div>)}
        </div>}
        {points.length === 0 && <div className="bp-alv-card"><p>Er staan nog geen punten in deze werkvoorraad.</p></div>}
        {points.map(point => {
          if (editPointId === point.id && cycle.status === 'draft' && canManage) {
            return <PointForm key={point.id} existing={point} ownerId={actor.id} people={people} onCancel={() => setEditPointId(null)} onSave={savePoint} />;
          }
          const missing = preparationChecks(point);
          return <article className="bp-alv-card bp-alv-stack" key={point.id} {...pointTarget(point.id)}>
            <div className="bp-alv-row">
              <div><h3>{point.title}</h3><p>{point.code} · {pointKinds[point.kind]} · {name(point.ownerId)}</p></div>
              <span className={'bp-alv-chip ' + (point.status !== 'work' ? 'is-checked' : 'is-pending')}>{pointStates[point.status]}</span>
            </div>
            {point.description && <p>{point.description}</p>}
            {canManage && cycle.status === 'draft' && point.status === 'work' && <p className="bp-alv-muted">
              <strong>Openstaand</strong> · {missing.length ? missing.join(' · ') : 'Meld het punt gereed voor de agenda'}
            </p>}
            <div className="bp-alv-actions">
              {point.meetingId && <button className="cms-button" type="button" onClick={() => onNavigate('meetings', point.meetingId)}>Open bronvergadering</button>}
              {point.fromItemId && <span className="bp-alv-muted">Overgenomen van {board.alvItems.find(row => row.id === point.fromItemId)?.code ?? 'eerder ALV-punt'}</span>}
              {canManage && cycle.status === 'draft' && <button className="cms-button" type="button" onClick={() => setEditPointId(point.id)}>Bewerk voorbereiding</button>}
            </div>
          </article>;
        })}
      </div>}
      {cycle && pane === 'agenda' && <div className="bp-alv-stack">
        <div className="bp-alv-toolbar">
          <div>
            <h3>{cycle.status === 'draft' ? 'Conceptagenda' : 'Draaiboek voor de zaal'}</h3>
            <p>{cycle.status === 'draft' ? 'Controleer de punten en zet ze op volgorde.' : 'De agenda en voorstelteksten zijn bewaard bij de vaststelling.'}</p>
          </div>
          <div className="bp-alv-actions">
            {cycle.status !== 'draft' && <button className="cms-button" type="button" onClick={exportMembers}><Download size={16} /> Ledenpakket</button>}
            {cycle.status === 'draft' && actor.role === 'chair' && <button className="cms-button primary" disabled={!agenda.length} type="button" onClick={() => advance('approved')}>Agenda vaststellen</button>}
            {cycle.status === 'approved' && actor.role === 'chair' && <button className="cms-button primary" type="button" onClick={() => advance('live')}>Open de vergadering</button>}
            {cycle.status === 'live' && actor.role === 'chair' && <button className="cms-button primary" disabled={hasPendingVote} type="button" onClick={() => advance('closed')}>Rond ALV af</button>}
          </div>
        </div>
        {!agenda.length && <div className="bp-alv-card"><p>Maak een conceptagenda vanuit de gereedstaande werkvoorraad.</p></div>}
        {cycle.status === 'live' && hasPendingVote && <p className="bp-alv-muted">Bevestig de open stemtellingen om de ALV af te ronden.</p>}
        <ol className="bp-alv-list">
          {agenda.map((point, index) => {
            const current = points.find(row => row.id === point.id);
            return <li className="bp-alv-card bp-alv-stack" key={point.id} {...pointTarget(point.id)}>
              <div className="bp-alv-row">
                <div><h3>{index + 1}. {point.title}</h3><p>{pointKindLabel(point.kind)}{current?.status === 'handled' && ' · Behandeld'}</p></div>
                <div className="bp-alv-actions">
                  {cycle.status === 'draft' && canManage && <>
                    <button className="cms-button" disabled={index === 0} type="button" onClick={() => reorder(point.id, -1)} aria-label={point.title + ' omhoog'}><ArrowUp size={15} /></button>
                    <button className="cms-button" disabled={index === agenda.length - 1} type="button" onClick={() => reorder(point.id, 1)} aria-label={point.title + ' omlaag'}><ArrowDown size={15} /></button>
                  </>}
                  {cycle.status === 'live' && actor.role === 'chair' && <button className="cms-button" type="button" onClick={() => project(point.title, point.question || pointKindLabel(point.kind))}><Monitor size={16} /> Zaalbeeld</button>}
                </div>
              </div>
              {point.question && <div className="bp-alv-note">{point.question}</div>}
              {point.stance && <p><strong>Bestuursstandpunt</strong> · {point.stance}</p>}
              {point.document && <p><strong>Stuk</strong> · {point.document} {point.documentReleased && <span className="bp-alv-chip is-checked">In ledenpakket</span>}</p>}
              {cycle.status === 'live' && canManage && current && <PointNotes key={current.id} point={current} onSave={saveNotes} />}
            </li>;
          })}
        </ol>
      </div>}

      {cycle && pane === 'votes' && <div className="bp-alv-stack">
        <div className="bp-alv-toolbar"><div><h3>Fysieke stemtellingen</h3><p>Leg de tekst en telling vast. Een tweede bevoegde gebruiker controleert de uitkomst.</p></div></div>
        {cycle.status === 'live' && canManage && agenda.some(point => point.kind === 'decision') && <VoteForm key={cycle.id + actor.id} agenda={agenda} rounds={cycle.votes} onSave={addRound} />}
        {cycle.votes.length === 0 && <div className="bp-alv-card"><p>{cycle.status === 'live' ? 'Er zijn nog geen stemtellingen geregistreerd.' : 'Stemtellingen registreren kan tijdens een geopende ALV.'}</p></div>}
        {cycle.votes.map(round => <article className="bp-alv-card bp-alv-stack" key={round.id}
          {...pointTarget(round === targetVote ? round.itemId : '')}>
          <div className="bp-alv-row">
            <div><h3>{agenda.find(point => point.id === round.itemId)?.title ?? 'Stemming'}</h3><p>{round.code} · {round.kind === 'amendment' ? 'Amendement' : 'Voorstel'} · Geteld door {name(round.countedBy)}</p></div>
            <span className={'bp-alv-chip ' + (round.confirmedAt ? 'is-checked' : 'is-pending')}>{round.confirmedAt ? outcomes[round.outcome] : 'Wacht op tweede controle'}</span>
          </div>
          <div className="bp-alv-note">{round.text}</div>
          <div className="bp-alv-counts">{countKeys.map(key => <span key={key}><b>{round.counts[key]}</b>{countLabels[key]}</span>)}</div>
          <div className="bp-alv-actions">
            {!round.confirmedAt && <span className="bp-alv-muted">Voorgestelde uitkomst · {outcomes[round.outcome]}</span>}
            {!round.confirmedAt && cycle.status === 'live' && canManage && round.countedBy !== actor.id &&
              <button className="cms-button primary" type="button" onClick={() => confirmRound(round.id)}><Check size={16} /> Bevestig telling</button>}
            {!round.confirmedAt && round.countedBy === actor.id && <>
              <span className="bp-alv-muted">Een andere bevoegde gebruiker moet deze telling controleren.</span>
              <button className="cms-button" type="button" onClick={() => {
                if (window.confirm('Deze concepttelling verwijderen?')) removePendingRound(round.id);
              }}>Verwijder concepttelling</button>
            </>}
            {round.confirmedBy && <span className="bp-alv-muted">Gecontroleerd door {name(round.confirmedBy)}</span>}
            {round.decisionId && <button className="cms-button" type="button" onClick={() => onNavigate('decisions', round.decisionId)}>Bekijk ALV-besluit</button>}
            {cycle.status === 'live' && actor.role === 'chair' && <button className="cms-button" type="button" onClick={() => project(round.kind === 'amendment' ? 'Amendement' : 'Voorstel', round.text)}><Monitor size={16} /> Toon stemtekst</button>}
          </div>
        </article>)}
      </div>}

      {cycle && pane === 'minutes' && <div className="bp-alv-stack">
        <div className="bp-alv-toolbar">
          <div><h3>Conceptnotulen</h3><p>Behandelde punten, bevestigde uitslagen en toezeggingen in één verslag.</p></div>
          {(cycle.status === 'live' || cycle.status === 'closed') &&
            <button className="cms-button" type="button" onClick={exportMinutes}><Download size={16} /> Download conceptnotulen</button>}
        </div>
        {cycle.agendaSnapshot.map(point => <article className="bp-alv-card bp-alv-stack" key={point.id} {...pointTarget(point.id)}>
          <h3>{point.title}</h3>
          <p>{points.find(row => row.id === point.id)?.notes || 'Geen aantekeningen vastgelegd.'}</p>
          {confirmed.filter(round => round.itemId === point.id).map(round =>
            <div className="bp-alv-note" key={round.id}><strong>{round.code} · {outcomes[round.outcome]}</strong><p>{round.text}</p></div>)}
        </article>)}
        <MinutesEditor key={cycle.id} cycle={cycle} editable={canManage && (cycle.status === 'live' || cycle.status === 'closed')} onSave={async (minutes, promises) => {
          await change(draft => {
            const row = draft.alvs.find(item => item.id === cycle.id);
            if (!row) return;
            row.minutes = minutes;
            row.promises = promises;
          }, 'ALV-verslag en toezeggingen opgeslagen');
        }} />
      </div>}
    </section>
  );
}

function CycleForm({ previous, onCreate }: {
  previous?: Cycle;
  onCreate: (title: string, date: string, time: string, location: string, carry: boolean) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const date = String(data.get('date') ?? '');
    if (!title || !date) return;
    await onCreate(title, date, String(data.get('time') ?? ''), String(data.get('location') ?? '').trim(), data.get('carry') === 'on');
  }
  return <form className="bp-alv-card bp-alv-stack" onSubmit={submit}>
    <h3>Nieuwe ALV voorbereiden</h3>
    <div className="bp-alv-grid">
      <label className="bp-alv-field">Naam<input name="title" defaultValue="Algemene ledenvergadering" maxLength={120} required /></label>
      <label className="bp-alv-field">Datum<input name="date" type="date" required /></label>
      <label className="bp-alv-field">Tijd<input name="time" type="time" defaultValue="20:00" required /></label>
      <label className="bp-alv-field">Locatie<input name="location" defaultValue="Sportpark Duindorp" maxLength={140} required /></label>
    </div>
    {previous && <label className="bp-alv-choice"><input name="carry" type="checkbox" defaultChecked /> Neem toezeggingen en open punten over uit {previous.title}</label>}
    <div className="bp-alv-actions"><button className="cms-button primary" type="submit"><Plus size={16} /> Maak ALV aan</button></div>
  </form>;
}

function PointForm({ existing, ownerId, people, onCancel, onSave }: {
  existing?: Point;
  ownerId: string;
  people: BoardPageProps['people'];
  onCancel: () => void;
  onSave: (input: PointDraft, ready: boolean, existing?: Point) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PointDraft>(() => {
    if (!existing) return blankPoint(ownerId);
    const { title, description, ownerId: previousOwner, kind, stance, document, question, checklist, documentReleased } = existing;
    return { title, description, ownerId: previousOwner, kind, stance, document, question, checklist, documentReleased };
  });
  const [error, setError] = useState('');
  function edit<K extends keyof PointDraft>(key: K, value: PointDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setError('');
  }
  async function save(ready: boolean) {
    if (!draft.title.trim()) { setError('Geef het ALV-punt een titel.'); return; }
    if (ready && !isReady(draft)) {
      setError('Kies een eigenaar, vul het bestuursstandpunt en de stukken in (of vermeld dat geen stukken nodig zijn), controleer deze en leg bij besluitpunten de exacte stemvraag vast.');
      return;
    }
    await onSave(draft, ready, existing);
  }

  return <form className="bp-alv-card bp-alv-stack" onSubmit={async event => { event.preventDefault(); await save(false); }}>
    <h3>{existing ? 'ALV-punt voorbereiden' : 'Nieuw ALV-punt'}</h3>
    <div className="bp-alv-grid">
      <label className="bp-alv-field">Titel<input value={draft.title} onChange={event => edit('title', event.target.value)} maxLength={160} required /></label>
      <label className="bp-alv-field">Doel
        <select value={draft.kind} onChange={event => edit('kind', event.target.value as PointDraft['kind'])}>
          {Object.entries(pointKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="bp-alv-field">Eigenaar
        <select value={draft.ownerId} onChange={event => edit('ownerId', event.target.value)}>
          <option value="">Kies een eigenaar</option>
          {draft.ownerId && !people.some(row => row.id === draft.ownerId) && <option value={draft.ownerId}>Huidige verantwoordelijke</option>}
          {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label className="bp-alv-field">Aanleiding<input value={draft.description} onChange={event => edit('description', event.target.value)} maxLength={500} /></label>
      <label className="bp-alv-field">Bestuursstandpunt<textarea value={draft.stance} onChange={event => {
        setDraft(current => ({ ...current, stance: event.target.value, checklist: { ...current.checklist, stance: false } }));
      }} maxLength={4000} /></label>
      <label className="bp-alv-field">Ledenstuk of bijlagelink<textarea aria-label="Ledenstuk of bijlagelink" aria-describedby="bp-alv-document-help" value={draft.document} onChange={event => {
        setDraft(current => ({ ...current, document: event.target.value, documentReleased: false, checklist: { ...current.checklist, document: false } }));
      }} maxLength={4000} /><small id="bp-alv-document-help">Vermeld de stukken of geef aan dat geen stukken nodig zijn.</small></label>
    </div>
    {draft.kind === 'decision' && <label className="bp-alv-field">Exacte stemtekst<textarea value={draft.question} onChange={event => {
      setDraft(current => ({ ...current, question: event.target.value, checklist: { ...current.checklist, question: false } }));
    }} maxLength={4000} /></label>}
    <div className="bp-alv-stack">
      <strong>Gereedheidscheck</strong>
      <label className="bp-alv-choice"><input type="checkbox" checked={draft.checklist.stance} onChange={event => edit('checklist', { ...draft.checklist, stance: event.target.checked })} /> Bestuursstandpunt gecontroleerd</label>
      <label className="bp-alv-choice"><input type="checkbox" checked={draft.checklist.document} onChange={event => edit('checklist', { ...draft.checklist, document: event.target.checked })} /> Stukken gecontroleerd of geen stukken nodig</label>
      {draft.kind === 'decision' && <label className="bp-alv-choice"><input type="checkbox" checked={draft.checklist.question} onChange={event => edit('checklist', { ...draft.checklist, question: event.target.checked })} /> Exacte stemtekst gecontroleerd</label>}
      <label className="bp-alv-choice"><input type="checkbox" disabled={!draft.document.trim()} checked={!!draft.documentReleased} onChange={event => edit('documentReleased', event.target.checked)} /> Deel dit stuk in het ledenpakket</label>
    </div>
    {error && <p className="bp-alv-error" role="alert">{error}</p>}
    <div className="bp-alv-actions">
      <button className="cms-button" type="button" onClick={onCancel}>Annuleren</button>
      <button className="cms-button" type="submit">Bewaar als concept</button>
      <button className="cms-button primary" type="button" onClick={async () => await save(true)}><Check size={16} /> Zet klaar voor agenda</button>
    </div>
  </form>;
}

function PointNotes({ point, onSave }: { point: Point; onSave: (id: string, notes: string, handled: boolean) => Promise<void> }) {
  const [notes, setNotes] = useState(point.notes);
  return <div className="bp-alv-stack">
    <label className="bp-alv-field">Aantekeningen voor het verslag<textarea value={notes} maxLength={8000} onChange={event => setNotes(event.target.value)} /></label>
    <div className="bp-alv-actions">
      <button className="cms-button" type="button" onClick={async () => await onSave(point.id, notes, false)}>Bewaar aantekeningen</button>
      {point.status !== 'handled' && <button className="cms-button" type="button" onClick={async () => await onSave(point.id, notes, true)}><Check size={16} /> Markeer behandeld</button>}
    </div>
  </div>;
}

function VoteForm({ agenda, rounds, onSave }: { agenda: Cycle['agendaSnapshot']; rounds: Round[]; onSave: (input: RoundDraft) => Promise<boolean> }) {
  const eligible = agenda.filter(point => point.kind === 'decision' && !rounds.some(round =>
    round.itemId === point.id && (!round.confirmedAt || round.kind === 'motion')));
  const [selectedId, setSelectedId] = useState('');
  const [kind, setKind] = useState<Round['kind']>('motion');
  const [editedText, setEditedText] = useState('');
  const [counts, setCounts] = useState(blankCounts);
  const [outcome, setOutcome] = useState<Round['outcome'] | ''>('');
  const [error, setError] = useState('');
  const point = eligible.find(entry => entry.id === selectedId) ?? eligible[0];
  const itemId = point?.id;
  const amended = rounds.some(round => round.itemId === itemId && round.kind === 'amendment' && round.confirmedAt && round.outcome === 'adopted');
  const editableText = kind === 'amendment' || amended;
  const text = editableText ? editedText : point?.question ?? '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numbers = { voor: Number(counts.voor), tegen: Number(counts.tegen), onthouding: Number(counts.onthouding), ongeldig: Number(counts.ongeldig) };
    if (!itemId || !text.trim() || !outcome) {
      setError('Kies het beslispunt, leg de exacte tekst vast en kies de uitkomst.');
      return;
    }
    if (countKeys.some(key => counts[key] === '' || !Number.isSafeInteger(numbers[key]) || numbers[key] < 0 || numbers[key] > 999999)
      || countKeys.every(key => numbers[key] === 0)) {
      setError('Vul hele, positieve of nulwaarden in en registreer minimaal één stem.');
      return;
    }
    if (await onSave({ itemId, kind, text, counts: numbers, outcome })) {
      setCounts(blankCounts);
      setEditedText('');
      setKind('motion');
      setOutcome('');
      setError('');
    }
  }

  if (!eligible.length) return null;
  return <form className="bp-alv-card bp-alv-stack" onSubmit={submit}>
    <h3>Nieuwe telling invoeren</h3>
    <div className="bp-alv-grid">
      <label className="bp-alv-field">Beslispunt<select value={itemId} onChange={event => { setSelectedId(event.target.value); setEditedText(''); }} required>
        {eligible.map(point => <option key={point.id} value={point.id}>{point.title}</option>)}
      </select></label>
      <label className="bp-alv-field">Waarover is gestemd?
        <select value={kind} onChange={event => { setKind(event.target.value as Round['kind']); setEditedText(''); }}>
          <option value="motion">{amended ? 'Gewijzigd voorstel' : 'Oorspronkelijk voorstel'}</option><option value="amendment">Amendement</option>
        </select>
      </label>
    </div>
    {editableText ? <label className="bp-alv-field">{kind === 'amendment' ? 'Exacte tekst van het amendement' : 'Exacte tekst van het gewijzigde voorstel'}
      <textarea value={editedText} onChange={event => setEditedText(event.target.value)} maxLength={4000} required />
    </label> : <div className="bp-alv-note">{text}</div>}
    <div className="bp-alv-grid">{countKeys.map(key => <label key={key} className="bp-alv-field">{countLabels[key]}
      <input type="number" inputMode="numeric" value={counts[key]} min={0} max={999999} step={1} required onChange={event => setCounts({ ...counts, [key]: event.target.value })} />
    </label>)}</div>
    <label className="bp-alv-field">Vastgestelde uitkomst voor deze telling
      <select value={outcome} onChange={event => setOutcome(event.target.value as Round['outcome'] | '')} required>
        <option value="">Kies de uitkomst</option>
        <option value="adopted">Aangenomen</option><option value="rejected">Verworpen</option>
      </select>
      <small>Neem de uitkomst over die in de zaal is vastgesteld.</small>
    </label>
    {error && <p className="bp-alv-error" role="alert">{error}</p>}
    <div className="bp-alv-actions"><button className="cms-button primary" type="submit"><Vote size={16} /> Bied telling aan voor controle</button></div>
  </form>;
}

function MinutesEditor({ cycle, editable, onSave }: { cycle: Cycle; editable: boolean; onSave: (minutes: string, promises: string[]) => Promise<void> }) {
  const [minutes, setMinutes] = useState(cycle.minutes);
  const [promises, setPromises] = useState(cycle.promises.join('\n'));
  return <form className="bp-alv-card bp-alv-stack" onSubmit={async event => {
    event.preventDefault();
    if (editable) await onSave(minutes.trim(), [...new Set(promises.split('\n').map(line => line.trim()).filter(Boolean))]);
  }}>
    <label className="bp-alv-field">Algemene verslagnotities<textarea value={minutes} maxLength={12000} onChange={event => setMinutes(event.target.value)} readOnly={!editable} /></label>
    <label className="bp-alv-field">Toezeggingen voor de volgende ALV
      <textarea value={promises} maxLength={8000} onChange={event => setPromises(event.target.value)} readOnly={!editable} />
      <small>Eén toezegging per regel. Je kunt deze meenemen bij het aanmaken van de volgende ALV.</small>
    </label>
    {editable && <div className="bp-alv-actions"><button className="cms-button primary" type="submit">Bewaar verslag en toezeggingen</button></div>}
  </form>;
}

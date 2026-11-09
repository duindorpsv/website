'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, Download, FileText, Flag, LockKeyhole, MapPin, MessageSquare, Play, Plus, Send, Trash2, UsersRound, Vote } from 'lucide-react';
import { boardToday, makeBase, pointLabels, type BoardPageProps, type Meeting, type MeetingPoint, type PointKind } from '@/lib/cms/board';
import './meetings.css';
import {downloadBoardPdf} from './server-workspace';

const dateLabel = (value: string) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  : 'Datum volgt';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="cms-field bp-field"><span>{label}</span>{children}</label>;
}

function SectionTitle({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="bp-section-head"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{children}</div>;
}

const stageLabels: Record<Meeting['status'], string> = {
  draft: 'Conceptagenda', review: 'Ter goedkeuring', approved: 'Agenda goedgekeurd', live: 'In vergadering', closed: 'Afgesloten',
};
const minutesLabels: Record<Meeting['minutesStatus'], string> = {
  draft: 'Conceptnotulen', review: 'Notulen ter goedkeuring', approved: 'Notulen goedgekeurd',
};
const outcomeLabels: Record<NonNullable<MeetingPoint['outcome']>, string> = {
  decided: 'Besloten', work: 'Uitwerken', deferred: 'Doorschuiven', alv: 'Naar de ALV', noted: 'Kennisgenomen',
};
const pointKinds: PointKind[] = ['info', 'discussion', 'decision', 'risk'];
const votingOptions: MeetingPoint['votes'][string][] = ['voor', 'tegen', 'onthouding', 'afwezig'];

function votingSummary(votes: MeetingPoint['votes']) {
  if (!Object.keys(votes).length) return '';
  const values = Object.values(votes);
  return votingOptions.map(value => `${values.filter(vote => vote === value).length} ${value}`).join(' · ');
}

type RoomTab = 'agenda' | 'summary' | 'minutes';
type MeetingsProps = BoardPageProps & { focusSection?: RoomTab };

export function Meetings(props: MeetingsProps) {
  const { board, actor, change, focusId, onNavigate } = props;
  const newMeeting = focusId === 'new';
  const meeting = board.meetings.find(item => item.id === focusId);
  const canPlan = actor.role === 'chair' || actor.role === 'secretary';

  if (meeting) return <MeetingRoom key={`${meeting.id}-${props.focusSection ?? ''}`} {...props} meeting={meeting}/>;

  const openMeetings = board.meetings.filter(item => item.status !== 'closed').sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const pastMeetings = board.meetings.filter(item => item.status === 'closed').sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    const location = String(data.get('location') || '').trim();
    if (!title || !location) return;
    let meetingId = '';
    const saved = await change(draft => {
      const base = makeBase(draft, 'meeting');
      meetingId = base.id;
      draft.meetings.push({ ...base, title, date: String(data.get('date')), time: String(data.get('time')),
        location, status: 'draft', points: [], attendeeIds: [],
        minutesStatus: 'draft', minutesVersion: 1, minutesSummary: '', agendaVersion: 1 });
    }, 'Conceptvergadering aangemaakt.');
    if (saved) onNavigate('meetings', meetingId);
  }

  function list(items: Meeting[], empty: string) {
    if (!items.length) return <p className="bp-empty">{empty}</p>;
    return <div className="bp-list">{items.map(item => <button key={item.id} type="button" className="bp-row" onClick={() => onNavigate('meetings', item.id)}>
      <span className="bp-row-icon"><CalendarDays size={18}/></span>
      <span className="bp-row-main"><strong>{item.title}</strong><small>{dateLabel(item.date)} · {item.time} uur · {item.location}</small></span>
      <span className="bp-pill">{item.status === 'closed' ? minutesLabels[item.minutesStatus] : stageLabels[item.status]}</span><ChevronRight size={17}/>
    </button>)}</div>;
  }

  return <div className="bp-stack">
    <section className="bp-panel">
      <SectionTitle title="Vergaderingen" description="Van conceptagenda tot de opvolging van besluiten.">
        {canPlan && <button className="cms-button primary" type="button" aria-expanded={newMeeting} onClick={() => onNavigate('meetings', newMeeting ? undefined : 'new')}><Plus size={16}/>{newMeeting ? 'Formulier sluiten' : 'Vergadering plannen'}</button>}
      </SectionTitle>
      {newMeeting && canPlan && <form className="bp-form bp-stack" onSubmit={createMeeting}>
        <Field label="Naam van de vergadering"><input name="title" required maxLength={160} placeholder="Bestuursvergadering"/></Field>
        <div className="bp-form-grid">
          <Field label="Datum"><input name="date" type="date" required defaultValue={boardToday()}/></Field>
          <Field label="Tijd"><input name="time" type="time" required defaultValue="19:00"/></Field>
          <Field label="Locatie"><input name="location" required defaultValue="Bestuurskamer" maxLength={120}/></Field>
        </div>
        <div className="bp-toolbar"><button className="cms-button primary" type="submit">Conceptagenda openen <ArrowRight size={15}/></button></div>
      </form>}
      {list(openMeetings, 'Er staat nog geen bestuursvergadering gepland.')}
    </section>
    <section className="bp-panel">
      <SectionTitle title="Afgeronde vergaderingen" description="Bekijk de vastlegging, besluiten en goedgekeurde notulen."/>
      {list(pastMeetings, 'Afgesloten vergaderingen verschijnen hier.')}
    </section>
  </div>;
}

type RoomProps = MeetingsProps & { meeting: Meeting };

function focusMeetingPanel(panel: { current: HTMLElement | null }) {
  requestAnimationFrame(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: 'start' });
  });
}

function MeetingRoom(props: RoomProps) {
  const { meeting, actor, people, change, onNavigate, focusSection } = props;
  const [view, setView] = useState<RoomTab>(focusSection ?? (meeting.status === 'closed' ? 'minutes' : 'agenda'));
  const [selectedPointId, setSelectedPointId] = useState('');
  const [agendaFeedback, setAgendaFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [editDetails, setEditDetails] = useState(false);
  const pointPanel = useRef<HTMLDivElement>(null);
  const workQueue = useRef<HTMLDivElement>(null);
  const summaryPanel = useRef<HTMLElement>(null);
  const minutesPanel = useRef<HTMLDivElement>(null);
  const isChair = actor.role === 'chair';
  const isSecretary = actor.role === 'secretary';
  const canRun = isChair || isSecretary;
  const canEditAgenda = canRun && meeting.status === 'draft';
  const orderedPoints = pointKinds.flatMap(kind => meeting.points.filter(point => point.kind === kind));
  const openPoints = orderedPoints.filter(point => !point.outcome);
  const completed = orderedPoints.length - openPoints.length;
  const pendingDiscussions = orderedPoints.filter(point => point.kind === 'info' && point.reviewReason);
  const point = orderedPoints.find(row => row.id === selectedPointId) || openPoints[0] || orderedPoints[0];
  const nameFor = (id: string) => people.find(person => person.id === id)?.name || (id === actor.id ? actor.name : 'Actiehouder');

  async function editMeeting(recipe: (row: Meeting) => void, message?: string) {
    return await change(draft => {
      const row = draft.meetings.find(item => item.id === meeting.id);
      if (row) recipe(row);
    }, message);
  }

  async function updatePoint(id: string, recipe: (point: MeetingPoint) => void, message?: string) {
    return await editMeeting(row => {
      const item = row.points.find(candidate => candidate.id === id);
      if (item) recipe(item);
    }, message);
  }

  async function startMeeting() {
    if (await editMeeting(row => { row.status = 'live'; row.agendaEstablishedAt = new Date().toISOString(); }, 'Agenda vastgesteld. De vergadering loopt.')) setView('agenda');
  }

  function openPoint(id: string) {
    setSelectedPointId(id);
    setView('agenda');
    focusMeetingPanel(pointPanel);
  }

  function openSummary() {
    setView('summary');
    focusMeetingPanel(summaryPanel);
  }

  async function closeMeeting() {
    const saved = await change(draft => {
      const row = draft.meetings.find(item => item.id === meeting.id);
      if (row?.status !== 'live' || row.points.some(item => !item.outcome)) return;
      row.status = 'closed';
      row.closedAt = new Date().toISOString();
      row.minutesCode ||= makeBase(draft, 'minutes').code;
    }, 'Vergadering afgesloten. De conceptnotulen staan klaar.');
    if (saved) {
      setView('minutes');
      focusMeetingPanel(minutesPanel);
    }
  }

  return <div className="bp-stack">
    <section className="bp-panel">
      <div className="bp-toolbar"><button className="cms-button" type="button" onClick={() => onNavigate('meetings')}><ArrowLeft size={15}/>Alle vergaderingen</button><span className="bp-pill">{meeting.code} · {stageLabels[meeting.status]}</span></div>
      <SectionTitle title={meeting.title} description={`Agenda versie ${meeting.agendaVersion} · ${completed} van ${meeting.points.length} punten afgehandeld`}/>
      <div className="bp-toolbar bp-meta"><span><CalendarDays size={16}/> {dateLabel(meeting.date)}</span><span><Clock3 size={16}/> {meeting.time} uur</span><span><MapPin size={16}/> {meeting.location}</span>{canEditAgenda && <button type="button" className="cms-button" aria-expanded={editDetails} onClick={() => setEditDetails(value => !value)}>{editDetails ? 'Wijziging sluiten' : 'Vergadergegevens aanpassen'}</button>}</div>
      {editDetails && canEditAgenda && <form className="bp-form bp-stack" onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const title = String(data.get('title') || '').trim();
        const location = String(data.get('location') || '').trim();
        if (!title || !location) return;
        if (await editMeeting(row => { row.title = title; row.location = location; row.date = String(data.get('date')); row.time = String(data.get('time')); }, 'Vergadergegevens opgeslagen.')) setEditDetails(false);
      }}>
        <Field label="Naam van de vergadering"><input name="title" defaultValue={meeting.title} required maxLength={160}/></Field>
        <div className="bp-form-grid"><Field label="Datum"><input name="date" type="date" defaultValue={meeting.date} required/></Field><Field label="Tijd"><input name="time" type="time" defaultValue={meeting.time} required/></Field><Field label="Locatie"><input name="location" defaultValue={meeting.location} required maxLength={120}/></Field></div>
        <div className="bp-toolbar"><button className="cms-button primary" type="submit">Vergadergegevens opslaan</button></div>
      </form>}
      <div className="bp-toolbar bp-meeting-tabs" role="group" aria-label="Onderdeel van de vergadering">
        {([{ key: 'agenda', label: 'Agenda' }, { key: 'summary', label: 'Besluiten & acties' }, { key: 'minutes', label: 'Notulen' }] as const).map(tab => <button key={tab.key} className={`cms-button${view === tab.key ? ' primary' : ''}`} type="button" aria-pressed={view === tab.key} onClick={() => setView(tab.key)}>{tab.label}</button>)}
      </div>
    </section>
    {view === 'agenda' && <>
      {meeting.status !== 'closed' && <section className="bp-panel bp-stack">
        <SectionTitle title={meeting.status === 'live' ? 'Aanwezigheid' : 'Agenda en vaststelling'} description={meeting.status === 'live' ? 'Vink de aanwezigen aan voor de notulen en eventuele stemrondes.' : 'De secretaris dient in, de voorzitter keurt goed en stelt bij opening de agenda vast.'}/>
        {meeting.feedback && meeting.status === 'draft' && <p className="bp-callout"><strong>Terug van de voorzitter</strong> {meeting.feedback}</p>}
        {meeting.status === 'live' && canRun && <fieldset className="bp-checklist"><legend>Aanwezige bestuursleden</legend>{people.filter(person => person.role && person.role !== 'committee').map(person => <label key={person.id}><input type="checkbox" checked={meeting.attendeeIds.includes(person.id)} onChange={async event => {
          const checked = event.target.checked;
          await editMeeting(row => { row.attendeeIds = checked ? [...new Set([...row.attendeeIds, person.id])] : row.attendeeIds.filter(id => id !== person.id); }, 'Aanwezigheid opgeslagen.');
        }}/>{person.name}</label>)}</fieldset>}
        {meeting.status === 'live' && !canRun && <p>{meeting.attendeeIds.map(nameFor).join(', ') || 'Aanwezigheid wordt bijgehouden tijdens het overleg.'}</p>}
        {meeting.status === 'live' && canRun && <div className="bp-callout bp-meeting-progress">
          <div><strong>{openPoints.length ? `${openPoints.length} van ${orderedPoints.length} punten open` : 'Alle agendapunten zijn afgehandeld'}</strong>
            <p>{isChair ? 'Loop samen de besluiten en acties na voor je afsluit.' : 'Leg per punt de uitkomst vast voor de conceptnotulen.'}</p></div>
          <div className="bp-toolbar">{openPoints[0] && <button className="cms-button primary" type="button" onClick={() => openPoint(openPoints[0].id)}>Naar eerstvolgende open punt <ArrowRight size={15}/></button>}
            <button className={`cms-button${openPoints.length ? '' : ' primary'}`} type="button" onClick={openSummary}><ClipboardList size={16}/>Afronding bekijken</button></div>
        </div>}
        {canEditAgenda && <div className="bp-callout bp-meeting-progress">
          <div><strong>{!meeting.points.length ? 'De conceptagenda is nog leeg' : pendingDiscussions.length ? `${pendingDiscussions.length} ${pendingDiscussions.length === 1 ? 'bespreekverzoek' : 'bespreekverzoeken'} te behandelen` : 'Conceptagenda kan worden ingediend'}</strong>
            <p>{!meeting.points.length ? 'Voeg ten minste één agendapunt toe.' : pendingDiscussions.length ? 'Verplaats het punt naar Ter bespreking of behoud het ter kennisname.' : isSecretary ? 'Controleer de punten en dien de agenda in bij de voorzitter.' : 'De secretaris kan de agenda indienen voor je beoordeling.'}</p></div>
          <div className="bp-toolbar">
            {pendingDiscussions[0] && <button className="cms-button" type="button" onClick={() => openPoint(pendingDiscussions[0].id)}>Bekijk bespreekverzoek <ArrowRight size={15}/></button>}
            <button className="cms-button" type="button" onClick={() => focusMeetingPanel(workQueue)}>Naar werkvoorraad <ArrowRight size={15}/></button>
          </div>
        </div>}
        {meeting.status === 'review' && isSecretary && <p className="bp-callout">De voorzitter beoordeelt de agenda. Een verzoek om aanpassing verschijnt bij deze vergadering.</p>}
        {meeting.status === 'approved' && isSecretary && <p className="bp-callout">De agenda is goedgekeurd. Zodra de voorzitter de vergadering start, kun je de aanwezigheid en het verslag bijhouden.</p>}
        <div className="bp-toolbar">
          {meeting.status === 'draft' && isSecretary && <button className="cms-button primary" type="button" disabled={!meeting.points.length || !!pendingDiscussions.length} onClick={async () => await editMeeting(row => { row.status = 'review'; row.feedback = undefined; }, 'De conceptagenda is ingediend bij de voorzitter.')}><Send size={15}/>Agenda indienen bij voorzitter</button>}
          {meeting.status === 'review' && isChair && <>
            <button className="cms-button primary" type="button" onClick={async () => await editMeeting(row => { row.status = 'approved'; row.agendaApprovedAt = new Date().toISOString(); row.feedback = undefined; }, 'Agenda goedgekeurd en vrijgegeven.')}><Check size={16}/>Agenda goedkeuren</button>
            <button className="cms-button" type="button" aria-expanded={showFeedback} onClick={() => setShowFeedback(value => !value)}>Terug naar secretaris</button>
          </>}
          {meeting.status === 'approved' && isChair && <button className="cms-button primary" type="button" onClick={startMeeting}><Play size={15}/>Agenda vaststellen en starten</button>}
        </div>
        {showFeedback && isChair && meeting.status === 'review' && <form className="bp-form bp-stack" onSubmit={async event => {
          event.preventDefault();
          if (!agendaFeedback.trim()) return;
          if (await editMeeting(row => { row.status = 'draft'; row.agendaVersion++; row.feedback = agendaFeedback.trim(); }, 'Agenda teruggestuurd naar de secretaris.')) {
            setAgendaFeedback('');
            setShowFeedback(false);
          }
        }}><Field label="Welke aanpassing is nodig?"><textarea value={agendaFeedback} onChange={event => setAgendaFeedback(event.target.value)} required rows={3}/></Field><div className="bp-toolbar"><button className="cms-button" type="submit">Aanpassing vragen</button></div></form>}
      </section>}
      <div className={point ? 'bp-split' : undefined}>
        <section className="bp-panel">
          <SectionTitle title="De agenda" description={meeting.status === 'live' ? 'Kies het huidige punt om direct vast te leggen wat is afgesproken.' : 'Onderwerpen staan per gewenste behandeling bij elkaar.'}/>
          {!meeting.points.length && <p className="bp-empty">Voeg een voorstel, vervolgpunt of los agendapunt toe.</p>}
          {point && <div className="bp-meeting-agenda-mobile">
            <Field label="Kies een agendapunt"><select value={point.id} onChange={event => setSelectedPointId(event.target.value)}>
              {pointKinds.map(kind => {
                const group = meeting.points.filter(item => item.kind === kind);
                return !!group.length && <optgroup key={kind} label={pointLabels[kind]}>{group.map(item => <option value={item.id} key={item.id}>{item.title}{item.outcome ? ` · ${outcomeLabels[item.outcome]}` : ''}</option>)}</optgroup>;
              })}
            </select></Field>
            <button className="cms-button" type="button" onClick={() => focusMeetingPanel(pointPanel)}>Ga naar dit punt <ArrowDown size={15}/></button>
          </div>}
          <div className="bp-meeting-agenda-desktop">{pointKinds.map(kind => {
            const group = meeting.points.filter(item => item.kind === kind);
            if (!group.length) return null;
            return <div className="bp-list" key={kind}><h4 className="bp-kicker">{pointLabels[kind]} · {group.length}</h4>{group.map(item => <button key={item.id} className="bp-row" type="button" aria-current={item.id === point?.id ? 'true' : undefined} onClick={() => setSelectedPointId(item.id)}>
              <span className="bp-row-icon">{item.outcome ? <Check size={17}/> : <FileText size={17}/>}</span>
              <span className="bp-row-main"><strong>{item.title}</strong><small>{item.code}{item.outcome ? ` · ${outcomeLabels[item.outcome]}` : ''}</small></span><ChevronRight size={16}/>
            </button>)}</div>;
          })}</div>
        </section>
        {point && <div className="bp-meeting-point bp-meeting-target" ref={pointPanel} tabIndex={-1} role="region" aria-label={`Agendapunt ${point.title}`}>
          <PointRoom key={point.id} {...props} point={point} canEditAgenda={canEditAgenda} updatePoint={updatePoint} onAdvance={() => {
            const next = openPoints.find(item => item.id !== point.id);
            if (next) openPoint(next.id);
            else openSummary();
          }}/>
        </div>}
      </div>
      {canEditAgenda && <div className="bp-meeting-target" ref={workQueue} tabIndex={-1} role="region" aria-label="Werkvoorraad voor deze agenda"><AgendaBuilder {...props} onSelect={setSelectedPointId}/></div>}
    </>}
    {view === 'summary' && <section className="bp-panel bp-stack bp-meeting-target" ref={summaryPanel} tabIndex={-1} aria-label="Afronding van de vergadering">
      <SectionTitle title="Besluiten & acties" description="Loop de vastlegging samen na voordat je de vergadering afsluit."/>
      {meeting.points.length ? <div className="bp-list">{meeting.points.map(item => <button className="bp-row" key={item.id} type="button" onClick={() => openPoint(item.id)}><span className="bp-row-icon"><ClipboardList size={17}/></span><span className="bp-row-main"><strong>{item.title}</strong><small>{item.result || (item.outcome ? 'Behandeld' : 'Uitkomst nog vastleggen')}{item.dueDate ? ` · ${nameFor(item.ownerId)} · ${dateLabel(item.dueDate)}` : ''}</small></span><span className="bp-pill">{item.outcome ? outcomeLabels[item.outcome] : 'Open'}</span><ChevronRight size={15}/></button>)}</div> : <p className="bp-empty">Er zijn nog geen agendapunten.</p>}
      {meeting.status === 'live' && isChair && <div className="bp-toolbar"><button className="cms-button primary" type="button" disabled={completed < meeting.points.length} onClick={closeMeeting}><Check size={16}/>Vergadering afsluiten</button>{completed < meeting.points.length && <small>Leg eerst bij elk agendapunt de uitkomst vast.</small>}</div>}
    </section>}
    {view === 'minutes' && <div className="bp-meeting-target" ref={minutesPanel} tabIndex={-1} role="region" aria-label="Notulen van de vergadering"><Minutes {...props} editMeeting={editMeeting}/></div>}
  </div>;
}

function AgendaBuilder({ board, meeting, actor, people, change, onSelect }: RoomProps & { onSelect: (id: string) => void }) {
  const [addManual, setAddManual] = useState(false);
  const scheduledIds = new Set(meeting.points.map(point => point.proposalId));
  const carriedIds = new Set(board.meetings.flatMap(row => row.points.map(point => point.carriedFrom)));
  const proposals = board.proposals.filter(proposal => proposal.status === 'ready' && !scheduledIds.has(proposal.id));
  const carryovers = board.meetings.filter(row => row.status === 'closed' && row.date <= meeting.date).flatMap(row => row.points.filter(point => point.outcome === 'deferred' && !carriedIds.has(point.id) && (!point.dueDate || point.dueDate <= meeting.date)));
  const portfolios = board.portfolios.filter(portfolio => portfolio.update.trim() && !meeting.points.some(point => point.portfolioId === portfolio.id));

  type PointDraft = Pick<MeetingPoint, 'title' | 'kind' | 'description' | 'ownerId'> & Partial<Pick<MeetingPoint, 'proposalId' | 'carriedFrom' | 'committeeId' | 'portfolioId'>>;

  async function addPoints(points: PointDraft[]) {
    let firstId = '';
    const saved = await change(draft => {
      const target = draft.meetings.find(item => item.id === meeting.id);
      if (target?.status !== 'draft') return;
      for (const data of points) {
        if (target.points.some(point => (data.proposalId && point.proposalId === data.proposalId) || (data.carriedFrom && point.carriedFrom === data.carriedFrom) || (data.portfolioId && point.portfolioId === data.portfolioId))) continue;
        const base = makeBase(draft, 'point');
        firstId ||= base.id;
        target.points.push({ ...base, ...data, notes: '', privateNotes: {}, votes: {} });
        const proposal = draft.proposals.find(item => item.id === data.proposalId);
        if (proposal?.status === 'ready') proposal.status = 'scheduled';
      }
    }, points.length === 1 ? 'Agendapunt toegevoegd.' : 'Conceptagenda aangevuld met de suggesties.');
    if (saved && firstId) onSelect(firstId);
    return saved;
  }

  const addPoint = (point: PointDraft) => addPoints([point]);
  const proposalPoints = proposals.map(row => ({ title: row.title, kind: row.kind, description: row.summary, ownerId: row.ownerId, proposalId: row.id, committeeId: row.committeeId }));
  const carriedPoints = carryovers.map(row => ({ title: row.title, kind: row.kind, description: row.result || row.description, ownerId: row.ownerId, carriedFrom: row.id, proposalId: row.proposalId, committeeId: row.committeeId }));
  const portfolioPoints = portfolios.map(row => ({ title: row.title, kind: row.status === 'issue' ? 'risk' as const : row.status, description: row.update, ownerId: row.ownerId, portfolioId: row.id, committeeId: row.committeeId }));
  const suggestions = [...proposalPoints, ...carriedPoints, ...portfolioPoints];

  async function onManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    if (!title) return;
    if (await addPoint({ title, kind: data.get('kind') as PointKind, description: String(data.get('description') || '').trim(), ownerId: String(data.get('ownerId') || actor.id) })) setAddManual(false);
  }

  return <section className="bp-panel bp-stack">
    <SectionTitle title="Werkvoorraad voor deze agenda" description="Kies de vrijgegeven voorstellen, geplande vervolgpunten en updates die op de agenda thuishoren.">
      <div className="bp-toolbar">{suggestions.length > 1 && <button className="cms-button primary" type="button" onClick={() => addPoints(suggestions)}><ClipboardList size={16}/>Conceptagenda aanvullen</button>}<button className="cms-button" type="button" onClick={() => setAddManual(value => !value)}><Plus size={16}/>{addManual ? 'Formulier sluiten' : 'Los agendapunt'}</button></div>
    </SectionTitle>
    {addManual && <form className="bp-form bp-stack" onSubmit={onManualSubmit}>
      <Field label="Titel"><input name="title" required maxLength={160} placeholder="Nieuw agendapunt"/></Field>
      <div className="bp-form-grid">
        <Field label="Behandeling"><select name="kind" defaultValue="discussion">{pointKinds.map(kind => <option key={kind} value={kind}>{pointLabels[kind]}</option>)}</select></Field>
        <Field label="Ingebracht door"><select name="ownerId" defaultValue={actor.id}>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
      </div>
      <Field label="Toelichting"><textarea name="description" rows={3}/></Field>
      <div className="bp-toolbar"><button className="cms-button primary" type="submit"><Plus size={15}/>Toevoegen aan agenda</button></div>
    </form>}
    {!proposals.length && !carryovers.length && !portfolios.length && <p className="bp-empty">Er staan geen nieuwe suggesties klaar voor deze datum.</p>}
    <div className="bp-list">
      {proposals.map((proposal, index) => <div className="bp-row" key={proposal.id}><span className="bp-row-icon"><FileText size={17}/></span><span className="bp-row-main"><strong>{proposal.title}</strong><small>{proposal.code} · {pointLabels[proposal.kind]} · Vrijgegeven voorstel</small></span><button className="cms-button" type="button" onClick={() => addPoint(proposalPoints[index])}><Plus size={15}/>Agenderen</button></div>)}
      {carryovers.map((point, index) => <div className="bp-row" key={point.id}><span className="bp-row-icon"><Flag size={17}/></span><span className="bp-row-main"><strong>{point.title}</strong><small>Doorgeschoven · {dateLabel(point.dueDate || '')} · {point.result}</small></span><button className="cms-button" type="button" onClick={() => addPoint(carriedPoints[index])}><Plus size={15}/>Agenderen</button></div>)}
      {portfolios.map((portfolio, index) => <div className="bp-row" key={portfolio.id}><span className="bp-row-icon"><UsersRound size={17}/></span><span className="bp-row-main"><strong>{portfolio.title}</strong><small>{portfolio.status === 'info' ? 'Ter kennisname' : portfolio.status === 'issue' ? 'Knelpunt' : 'Besluit nodig'} · {portfolio.update}</small></span><button className="cms-button" type="button" onClick={() => addPoint(portfolioPoints[index])}><Plus size={15}/>Agenderen</button></div>)}
    </div>
  </section>;
}

type PointRoomProps = RoomProps & {
  point: MeetingPoint;
  canEditAgenda: boolean;
  updatePoint: (id: string, recipe: (row: MeetingPoint) => void, message?: string) => Promise<boolean>;
  onAdvance: () => void;
};

function PointRoom(props: PointRoomProps) {
  const { board, meeting, point, actor, people, change, canEditAgenda, updatePoint, onAdvance, onNavigate } = props;
  const [outcome, setOutcome] = useState<Followup>();
  const [discuss, setDiscuss] = useState(false);
  const [discussReason, setDiscussReason] = useState(point.reviewReason || '');
  const [edit, setEdit] = useState(false);
  const proposal = board.proposals.find(item => item.id === point.proposalId);
  const canRun = meeting.status === 'live' && (actor.role === 'chair' || actor.role === 'secretary');
  const canRequestDiscussion = meeting.status === 'draft' && point.kind === 'info' && actor.role !== 'committee';
  const sameGroup = meeting.points.filter(row => row.kind === point.kind);
  const index = sameGroup.findIndex(row => row.id === point.id);

  async function reorder(delta: -1 | 1) {
    const other = sameGroup[index + delta];
    if (!other) return;
    await change(draft => {
      const row = draft.meetings.find(item => item.id === meeting.id);
      if (row?.status !== 'draft') return;
      const from = row.points.findIndex(item => item.id === point.id);
      const to = row.points.findIndex(item => item.id === other.id);
      if (from >= 0 && to >= 0) [row.points[from], row.points[to]] = [row.points[to], row.points[from]];
    }, 'Volgorde binnen het agendablok opgeslagen.');
  }

  async function removePoint() {
    await change(draft => {
      const row = draft.meetings.find(item => item.id === meeting.id);
      if (row?.status !== 'draft') return;
      row.points = row.points.filter(item => item.id !== point.id);
      const source = draft.proposals.find(item => item.id === point.proposalId);
      const stillScheduled = draft.meetings.some(item => item.points.some(other => other.proposalId === source?.id));
      if (source?.status === 'scheduled' && !stillScheduled) source.status = 'ready';
    }, 'Agendapunt teruggezet naar de werkvoorraad.');
  }

  return <section className="bp-panel bp-stack">
    <div className="bp-toolbar"><span className="bp-pill">{pointLabels[point.kind]}</span><span className="bp-code">{point.code}</span>{point.carriedFrom && <span className="bp-pill">Vervolgpunt</span>}</div>
    <SectionTitle title={point.title} description={point.description}/>
    {point.reviewReason && <p className="bp-callout"><strong>Toch bespreken</strong> {point.reviewReason}</p>}
    {proposal && <div className="bp-callout"><strong>Voorstel {proposal.code}</strong>{proposal.request && <p>{proposal.request}</p>}{proposal.attachment && <p>Bijlage · {proposal.attachment}</p>}<button className="cms-button" type="button" onClick={() => onNavigate('proposals', proposal.id)}>Open voorstel <ArrowRight size={15}/></button></div>}
    {canRequestDiscussion && <>
      <div className="bp-toolbar">
        <button className="cms-button primary" type="button" onClick={() => { setDiscussReason(point.reviewReason || ''); setDiscuss(value => !value); }}><MessageSquare size={15}/>Toch bespreken</button>
        {canEditAgenda && point.reviewReason && <button className="cms-button" type="button" onClick={async () => await updatePoint(point.id, row => { row.reviewReason = undefined; }, 'Ter kennisname behouden.')}>Ter kennisname behouden</button>}
      </div>
      {discuss && <form className="bp-form bp-stack" onSubmit={async event => {
        event.preventDefault();
        if (!discussReason.trim()) return;
        const message = canEditAgenda ? 'Het punt staat nu bij Ter bespreking.' : 'Bespreekverzoek bij de conceptagenda gezet.';
        if (await updatePoint(point.id, row => { if (canEditAgenda) row.kind = 'discussion'; row.reviewReason = discussReason.trim(); }, message)) setDiscuss(false);
      }}><Field label="Waarom wil je dit punt bespreken?"><textarea rows={3} required value={discussReason} onChange={event => setDiscussReason(event.target.value)}/></Field><div className="bp-toolbar"><button className="cms-button primary" type="submit">{canEditAgenda ? 'Verplaatsen naar Ter bespreking' : 'Bespreekverzoek vastleggen'}</button></div></form>}
    </>}
    {canEditAgenda && <>
      <div className="bp-toolbar">
        <button className="cms-button" type="button" onClick={() => setEdit(value => !value)}>{edit ? 'Bewerken sluiten' : 'Punt bewerken'}</button>
        <button className="cms-button" type="button" disabled={index <= 0} aria-label="Agendapunt omhoog" onClick={() => reorder(-1)}><ArrowUp size={15}/></button>
        <button className="cms-button" type="button" disabled={index >= sameGroup.length - 1} aria-label="Agendapunt omlaag" onClick={() => reorder(1)}><ArrowDown size={15}/></button>
        <button className="cms-button" type="button" aria-label="Agendapunt verwijderen" onClick={removePoint}><Trash2 size={15}/></button>
      </div>
      {edit && <form className="bp-form bp-stack" onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const title = String(data.get('title') || '').trim();
        if (!title) return;
        if (await updatePoint(point.id, row => { row.title = title; row.kind = data.get('kind') as PointKind; row.description = String(data.get('description') || '').trim(); row.ownerId = String(data.get('ownerId')); }, 'Agendapunt gewijzigd.')) setEdit(false);
      }}>
        <Field label="Titel"><input name="title" required maxLength={160} defaultValue={point.title}/></Field>
        <div className="bp-form-grid"><Field label="Behandeling"><select name="kind" defaultValue={point.kind}>{pointKinds.map(kind => <option key={kind} value={kind}>{pointLabels[kind]}</option>)}</select></Field><Field label="Ingebracht door"><select name="ownerId" defaultValue={point.ownerId}>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field></div>
        <Field label="Toelichting"><textarea name="description" rows={3} defaultValue={point.description}/></Field><div className="bp-toolbar"><button className="cms-button primary" type="submit">Opslaan</button></div>
      </form>}
    </>}
    {(canRun || point.notes) && <NoteEditor key={`shared-${point.id}`} initial={point.notes} editable={canRun} privateNote={false} onSave={async text => await updatePoint(point.id, row => { row.notes = text; }, 'Notitie bij de conceptnotulen opgeslagen.')}/>}
    <NoteEditor key={`private-${point.id}-${actor.id}`} initial={point.privateNotes[actor.id] || ''} editable privateNote onSave={async text => await updatePoint(point.id, row => { if (text) row.privateNotes[actor.id] = text; else delete row.privateNotes[actor.id]; }, 'Privénotitie opgeslagen.')}/>
    {point.outcome && <div className="bp-callout">
      <span className="bp-pill">{outcomeLabels[point.outcome]}</span><p>{point.result || 'Voor kennisname behandeld.'}</p>
      {point.dueDate && <p>Vervolg op {dateLabel(point.dueDate)}</p>}
      {votingSummary(point.votes) && <p>Stemregistratie · {votingSummary(point.votes)}</p>}
      <div className="bp-toolbar">
        {point.decisionId && <button className="cms-button" type="button" onClick={() => onNavigate('decisions', point.decisionId)}>Bekijk besluit <ArrowRight size={14}/></button>}
        {point.actionId && <button className="cms-button" type="button" onClick={() => onNavigate('actions', point.actionId)}>Bekijk actie <ArrowRight size={14}/></button>}
        {point.alvItemId && <button className="cms-button" type="button" onClick={() => onNavigate('alv', point.alvItemId)}>Bekijk ALV-punt <ArrowRight size={14}/></button>}
      </div>
    </div>}
    {canRun && !point.outcome && <>
      <SectionTitle title="Uitkomst vastleggen" description="Kies hoe het punt wordt afgehandeld. Een vervolg krijgt meteen een eigenaar en datum."/>
      <div className="bp-toolbar">
        {(['decided', 'work', 'deferred', 'alv'] as const).map(value => <button key={value} className={`cms-button${outcome === value ? ' primary' : ''}`} type="button" aria-pressed={outcome === value} onClick={() => setOutcome(value)}>{outcomeLabels[value]}</button>)}
        {point.kind === 'info' && <button className="cms-button" type="button" onClick={async () => {
          const saved = await change(draft => {
            const row = draft.meetings.find(item => item.id === meeting.id);
            const target = row?.points.find(item => item.id === point.id);
            if (row?.status !== 'live' || !target || target.outcome) return;
            target.outcome = 'noted';
            const source = draft.proposals.find(item => item.id === target.proposalId);
            if (source) source.status = 'handled';
          }, 'Voor kennisname vastgelegd.');
          if (saved) onAdvance();
        }}><Check size={15}/>Kennisgenomen</button>}
      </div>
      {outcome && <OutcomeForm key={outcome} {...props} outcome={outcome} onSave={onAdvance}/>}
    </>}
  </section>;
}

function NoteEditor({ initial, editable, privateNote, onSave }: { initial: string; editable: boolean; privateNote: boolean; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState(initial);
  const heading = privateNote ? 'Mijn privénotitie' : 'Notitie voor de conceptnotulen';
  if (!editable) return <div className="bp-callout"><strong>{heading}</strong><p>{initial}</p></div>;
  return <details className="bp-detail" open={!privateNote || !!initial || undefined}>
    <summary className="bp-meeting-note">{privateNote ? <LockKeyhole size={15}/> : <MessageSquare size={15}/>} {heading}</summary>
    <form className="bp-form bp-stack" onSubmit={async event => { event.preventDefault(); if (await onSave(text.trim())) setText(text.trim()); }}>
      <Field label={privateNote ? 'Persoonlijke aantekening' : 'Wat is besproken?'}><textarea rows={3} maxLength={privateNote ? 20000 : 50000} value={text} onChange={event => setText(event.target.value)} placeholder={privateNote ? 'Alleen zichtbaar voor jou.' : 'Kern van de bespreking, aandachtspunten of afspraak.'}/></Field>
      <div className="bp-toolbar"><button className="cms-button" type="submit" disabled={text.trim() === initial}>{privateNote ? 'Privénotitie opslaan' : 'Notitie opslaan'}</button></div>
    </form>
  </details>;
}

type Followup = 'decided' | 'work' | 'deferred' | 'alv';

function OutcomeForm({ board, meeting, point, actor, people, committees, change, outcome, onSave }: PointRoomProps & { outcome: Followup; onSave: () => void }) {
  const proposal = board.proposals.find(item => item.id === point.proposalId);
  const [text, setText] = useState(outcome === 'decided' ? proposal?.request || '' : '');
  const [ownerId, setOwnerId] = useState(point.ownerId || actor.id);
  const [committeeId, setCommitteeId] = useState(point.committeeId || proposal?.committeeId || '');
  const [createAction, setCreateAction] = useState(false);
  const [recordVotes, setRecordVotes] = useState(false);
  const [votes, setVotes] = useState<MeetingPoint['votes']>({});
  const [starts, setStarts] = useState(meeting.date);
  const [error, setError] = useState('');
  const eligiblePeople = committeeId ? people.filter(person => person.committeeIds.includes(committeeId)) : people;
  const eligible = eligiblePeople.some(person => person.id === ownerId);
  const needsAction = outcome === 'work' || outcome === 'deferred' || (outcome === 'decided' && createAction);
  const needsFollowup = needsAction || outcome === 'alv';
  const voteAttendees = meeting.attendeeIds.filter(id => people.some(person => person.id === id && person.role && person.role !== 'committee'));
  const replaceable = board.decisions.filter(decision => decision.outcome === 'adopted' && proposal?.dossierId && decision.dossierId === proposal.dossierId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = text.trim();
    const dueDate = String(data.get('dueDate') || '');
    const effectiveUntil = String(data.get('effectiveUntil') || '');
    const actionTitle = String(data.get('actionTitle') || '').trim();
    if (!description || (needsFollowup && !ownerId) || (needsAction && !dueDate)) {
      setError('Vul de afspraak en de verplichte vervolggegevens in.');
      return;
    }
    if (outcome === 'deferred' && dueDate <= meeting.date) {
      setError('Kies een terugkomdatum na deze vergadering.');
      return;
    }
    if (effectiveUntil && effectiveUntil < starts) {
      setError('De einddatum hoort op of na de ingangsdatum.');
      return;
    }
    if (recordVotes && voteAttendees.some(id => !votes[id])) {
      setError('Registreer per aanwezige een stem of de status Afwezig bij dit punt.');
      return;
    }
    const recordedVotes = recordVotes ? Object.fromEntries(voteAttendees.map(id => [id, votes[id]])) : {};
    const saved = await change(draft => {
      const row = draft.meetings.find(item => item.id === meeting.id);
      const target = row?.points.find(item => item.id === point.id);
      if (row?.status !== 'live' || !target || target.outcome) return;
      target.outcome = outcome;
      target.result = description;
      if (needsFollowup) target.ownerId = ownerId;
      if (dueDate) target.dueDate = dueDate;
      if (committeeId && needsAction) target.committeeId = committeeId;
      if (outcome === 'decided') {
        const decision = makeBase(draft, 'decision');
        const resolution = data.get('resolution') === 'rejected' ? 'rejected' : 'adopted';
        const replacesId = String(data.get('replacesId') || '');
        draft.decisions.push({ ...decision, title: point.title, text: description, effectiveFrom: starts,
          effectiveUntil, source: 'bestuur', meetingId: meeting.id, pointId: point.id,
          proposalId: proposal?.id, dossierId: proposal?.dossierId, outcome: resolution,
          replacesId: resolution === 'adopted' && replacesId ? replacesId : undefined,
          votes: votingSummary(recordedVotes) || undefined });
        target.decisionId = decision.id;
        target.votes = recordedVotes;
        target.voteText = recordVotes ? description : undefined;
      }
      if (needsAction) {
        const action = makeBase(draft, 'action');
        const portfolio = draft.portfolios.find(item => item.id === point.portfolioId || (committeeId && item.committeeId === committeeId));
        draft.actions.push({ ...action, title: actionTitle || `${outcomeLabels[outcome]} · ${point.title}`, description,
          ownerId, committeeId, portfolioOwnerId: portfolio?.ownerId || actor.id, dueDate, status: 'pending',
          progress: '', decisionId: target.decisionId, meetingId: meeting.id, pointId: point.id, proposalId: proposal?.id });
        target.actionId = action.id;
      }
      if (outcome === 'alv') {
        const item = makeBase(draft, 'alvItem');
        const kind = data.get('alvKind');
        draft.alvItems.push({ ...item, title: point.title, description, ownerId, status: 'work',
          kind: kind === 'info' || kind === 'discussion' ? kind : 'decision', meetingId: meeting.id, pointId: point.id,
          stance: '', document: '', question: '', checklist: { stance: false, document: false, question: false }, notes: '' });
        target.alvItemId = item.id;
      }
      if (proposal && outcome !== 'deferred') {
        const source = draft.proposals.find(item => item.id === proposal.id);
        if (source) source.status = 'handled';
      }
    }, `${outcomeLabels[outcome]} vastgelegd.`);
    if (saved) onSave();
  }

  return <form className="bp-form bp-stack" onSubmit={handleSubmit}>
    <Field label={outcome === 'decided' ? 'Exacte besluittekst' : outcome === 'deferred' ? 'Wat ontbreekt voor de vervolgbehandeling?' : 'Wat is afgesproken?'}>
      <textarea rows={4} required maxLength={5000} value={text} onChange={event => {
        setText(event.target.value);
        if (Object.keys(votes).length) setVotes({});
      }}/>
    </Field>
    {outcome === 'decided' && <>
      <div className="bp-form-grid">
        <Field label="Uitkomst"><select name="resolution" defaultValue="adopted"><option value="adopted">Aangenomen</option><option value="rejected">Afgewezen</option></select></Field>
        <Field label="Geldt vanaf"><input type="date" required value={starts} onChange={event => setStarts(event.target.value)}/></Field>
        <Field label="Geldt tot en met"><input type="date" min={starts} name="effectiveUntil"/></Field>
      </div>
      {replaceable.length > 0 && <Field label="Vervangt een eerder besluit"><select name="replacesId" defaultValue=""><option value="">Geen vervanging</option>{replaceable.map(decision => <option key={decision.id} value={decision.id}>{decision.code} · {decision.title}</option>)}</select></Field>}
      <div className="bp-checklist">
        <label><input type="checkbox" checked={createAction} onChange={event => setCreateAction(event.target.checked)}/> Een uitvoeringsactie koppelen</label>
        <label><input type="checkbox" checked={recordVotes} onChange={event => { setRecordVotes(event.target.checked); setVotes({}); }} disabled={!voteAttendees.length}/> Stemmen per aanwezige registreren</label>
      </div>
      {!voteAttendees.length && <small>Vink eerst aanwezigen aan om de stemregistratie te openen.</small>}
      {recordVotes && <fieldset className="bp-checklist"><legend><Vote size={15}/> Stemregistratie bij deze besluittekst</legend>
        {voteAttendees.map(id => <Field key={id} label={people.find(person => person.id === id)?.name || id}><select value={votes[id] || ''} onChange={event => {
          const value = event.target.value;
          setVotes(current => {
            const next = { ...current };
            if (value) next[id] = value as MeetingPoint['votes'][string];
            else delete next[id];
            return next;
          });
        }} required disabled={!text.trim()}><option value="">Kies de stem</option>{votingOptions.map(value => <option value={value} key={value}>{value === 'afwezig' ? 'Afwezig bij dit punt' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></Field>)}
        <small>{votingSummary(votes) || 'Na een wijziging in de besluittekst vul je de stemmen opnieuw in.'}</small>
      </fieldset>}
    </>}
    {needsFollowup && <div className="bp-form-grid">
      {needsAction && <Field label="Commissie"><select value={committeeId} onChange={event => {
        const next = event.target.value;
        setCommitteeId(next);
        if (next && !people.find(person => person.id === ownerId)?.committeeIds.includes(next)) setOwnerId('');
      }}><option value="">Rechtstreeks aan persoon</option>{committees.map(committee => <option key={committee.id} value={committee.id}>{committee.name}</option>)}</select></Field>}
      <Field label={outcome === 'alv' ? 'Eigenaar ALV-punt' : 'Actiehouder'}><select value={needsAction && !eligible ? '' : ownerId} onChange={event => setOwnerId(event.target.value)} required><option value="">Kies een persoon</option>{(needsAction ? eligiblePeople : people).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
      {outcome !== 'alv' && <Field label={outcome === 'deferred' ? 'Terugkomdatum' : 'Deadline'}><input type="date" name="dueDate" min={meeting.date} required/></Field>}
      {outcome === 'alv' && <Field label="Behandeling op de ALV"><select name="alvKind" defaultValue={point.kind === 'risk' ? 'discussion' : point.kind}><option value="info">Informeren</option><option value="discussion">Bespreken</option><option value="decision">Besluiten</option></select></Field>}
    </div>}
    {needsAction && <Field label="Titel van de uitvoeringsactie"><input name="actionTitle" placeholder={point.title} maxLength={160}/></Field>}
    {error && <p className="bp-callout" role="alert">{error}</p>}
    <div className="bp-toolbar"><button className="cms-button primary" type="submit"><Check size={16}/>Vastleggen en verder</button></div>
  </form>;
}

function Minutes({ board, meeting, actor, people, editMeeting }: RoomProps & { editMeeting: (recipe: (row: Meeting) => void, message?: string) => Promise<boolean> }) {
  const [summary, setSummary] = useState(meeting.minutesSummary);
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const isChair = actor.role === 'chair';
  const isSecretary = actor.role === 'secretary';
  const version = meeting.minutesVersion;
  const code = meeting.minutesCode || meeting.code;
  const reference = `${code} · Versie ${version} · ${dateLabel(meeting.date)} · ${meeting.time} uur · ${meeting.location}`;
  const personLabel = (id: string) => people.find(person => person.id === id)?.name;
  const attendance = meeting.minutesSnapshot?.attendance ?? meeting.attendeeIds.map(personLabel).filter(Boolean).join(', ');

  if (meeting.status !== 'closed') return <section className="bp-panel"><SectionTitle title="Conceptnotulen" description="Notities per agendapunt, besluiten en actiepunten komen hier samen zodra de vergadering is afgesloten."/></section>;
  if (meeting.minutesStatus === 'draft' && !isSecretary) return <section className="bp-panel"><SectionTitle title="Conceptnotulen" description="De secretaris werkt de notulen uit en stuurt ze daarna ter goedkeuring naar de voorzitter."/></section>;
  if (meeting.minutesStatus === 'review' && !isSecretary && !isChair) return <section className="bp-panel"><SectionTitle title="Notulen ter goedkeuring" description="Na het akkoord van de voorzitter worden de notulen hier zichtbaar."/></section>;

  const rows = meeting.minutesSnapshot?.sections ?? pointKinds.flatMap(kind => meeting.points.filter(point => point.kind === kind)).map(point => {
    const decision = board.decisions.find(item => item.id === point.decisionId);
    const action = board.actions.find(item => item.id === point.actionId);
    const alvItem = board.alvItems.find(item => item.id === point.alvItemId);
    const voteText = votingSummary(point.votes);
    return {
      heading: `${point.code} · ${point.title}`,
      text: [point.notes, point.outcome && `Uitkomst · ${outcomeLabels[point.outcome]}`,
        point.result, decision && `${decision.code} · ${decision.outcome === 'adopted' ? 'Aangenomen' : 'Afgewezen'}`,
        voteText && `Stemregistratie · ${voteText}`,
        action && `${action.code} · ${action.title} · ${personLabel(action.ownerId) || 'Actiehouder'} · ${dateLabel(action.dueDate)}`,
        alvItem && `${alvItem.code} · Voorbereiding voor de ALV`].filter(Boolean).join('\n') || 'Geen aantekeningen.'
    };
  });

  async function download() {
    setExporting(true);
    setError('');
    try {
      await downloadBoardPdf('minutes',meeting.id);
    } catch {
      setError('De PDF kon niet worden gemaakt. Probeer opnieuw.');
    } finally {
      setExporting(false);
    }
  }

  return <section className="bp-panel bp-stack">
    <SectionTitle title={meeting.minutesStatus === 'approved' ? 'Goedgekeurde notulen' : 'Conceptnotulen'} description={reference}>
      {meeting.minutesStatus === 'approved' && <button className="cms-button primary" type="button" onClick={download} disabled={exporting}><Download size={16}/>{exporting ? 'PDF maken…' : 'Notulen als PDF'}</button>}
    </SectionTitle>
    <div className="bp-toolbar"><span className="bp-pill">{meeting.minutesStatus === 'draft' ? 'Concept' : meeting.minutesStatus === 'review' ? 'Akkoord secretaris · naar voorzitter' : 'Akkoord secretaris en voorzitter'}</span><span>{attendance ? `Aanwezig · ${attendance}` : 'Geen aanwezigen geregistreerd.'}</span></div>
    {meeting.minutesStatus === 'draft' && meeting.feedback && <p className="bp-callout"><strong>Correctie gevraagd</strong> {meeting.feedback}</p>}
    {meeting.minutesStatus === 'draft' && isSecretary && <form className="bp-form bp-stack" onSubmit={async event => {
      event.preventDefault();
      await editMeeting(row => { row.minutesSummary = summary.trim(); row.minutesSnapshot = { attendance, sections: rows }; row.minutesStatus = 'review'; row.minutesSubmittedAt = new Date().toISOString(); row.feedback = undefined; }, 'Akkoord secretaris vastgelegd. De voorzitter kan de notulen beoordelen.');
    }}><Field label="Algemeen verslag"><textarea rows={5} value={summary} onChange={event => setSummary(event.target.value)} placeholder="Kern van de vergadering en overige afspraken."/></Field>
      <div className="bp-toolbar"><button className="cms-button" type="button" disabled={summary.trim() === meeting.minutesSummary} onClick={async () => await editMeeting(row => { row.minutesSummary = summary.trim(); }, 'Conceptnotulen opgeslagen.')}>Concept opslaan</button><button className="cms-button primary" type="submit"><Send size={15}/>Akkoord secretaris en indienen</button></div>
    </form>}
    {meeting.minutesStatus !== 'draft' && meeting.minutesSummary && <div className="bp-callout"><strong>Algemeen verslag</strong><p>{meeting.minutesSummary}</p></div>}
    {meeting.minutesStatus === 'review' && isChair && <div className="bp-toolbar">
      <button className="cms-button primary" type="button" onClick={async () => await editMeeting(row => { row.minutesStatus = 'approved'; row.minutesApprovedAt = new Date().toISOString(); }, 'Notulen goedgekeurd en beschikbaar gemaakt.')}><Check size={16}/>Notulen goedkeuren</button>
      <button className="cms-button" type="button" onClick={() => setShowReason(value => !value)}>Correctie vragen</button>
    </div>}
    {meeting.minutesStatus === 'review' && isChair && showReason && <form className="bp-form bp-stack" onSubmit={async event => {
      event.preventDefault();
      if (!reason.trim()) return;
      if (await editMeeting(row => { row.minutesStatus = 'draft'; row.minutesVersion++; row.minutesSnapshot = undefined; row.minutesSubmittedAt = undefined; row.feedback = reason.trim(); }, 'Notulen teruggestuurd naar de secretaris.')) { setShowReason(false); setReason(''); }
    }}><Field label="Welke correctie is nodig?"><textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} required/></Field><div className="bp-toolbar"><button className="cms-button" type="submit">Retour naar secretaris</button></div></form>}
    {error && <p className="bp-callout" role="alert">{error}</p>}
    <div className="bp-list">{rows.map(row => <article className="bp-row" key={row.heading}><span className="bp-row-icon"><FileText size={17}/></span><div className="bp-row-main"><strong>{row.heading}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{row.text}</p></div></article>)}</div>
  </section>;
}

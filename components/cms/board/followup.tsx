'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Archive, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp,
  ClipboardList, FileText, Flag, Mail, Plus, Search,
} from 'lucide-react';
import { boardToday, formatBoardDate, makeBase, type Action, type BoardPageProps, type Communication, type Decision } from '@/lib/cms/board';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="cms-field bp-field"><span>{label}</span>{children}</label>;
}

function SectionTitle({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="bp-section-head"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{children}</header>;
}

function formatDate(value: string | undefined) {
  return value ? formatBoardDate(value) : 'Geen datum';
}

type DecisionPageProps = BoardPageProps & {
  stagePlanning: (decision: Decision, date: string) => Promise<string | undefined>;
  canStagePlanning:boolean;canSaveCommunication:boolean;
  openCommunication:(id:string)=>void;
  openPlanning: (id: string) => void;
  lookupPlanning: (id: string) => { date: string; title: string } | undefined;
};

type DecisionFilter = 'current' | 'upcoming' | 'archive';
const decisionFilters: { key: DecisionFilter; label: string }[] = [
  { key: 'current', label: 'Geldt vandaag' },
  { key: 'upcoming', label: 'Binnenkort' },
  { key: 'archive', label: 'Archief' },
];

const actionLabels: Record<Action['status'], string> = {
  pending: 'Wacht op bevestiging', open: 'Open', progress: 'Bezig', blocked: 'Hulp nodig', done: 'Afgerond',
};

function startDate(decision: Decision) {
  return (decision.effectiveFrom || decision.createdAt).slice(0, 10);
}

function decisionStatus(decision: Decision, all: Decision[], date: string): { filter: DecisionFilter; label: string; replacement?: Decision } {
  if (decision.outcome === 'rejected') return { filter: 'archive', label: 'Afgewezen' };
  const replacement = all.find(item => item.outcome === 'adopted' && item.replacesId === decision.id && startDate(item) <= date);
  if (replacement) return { filter: 'archive', label: 'Vervangen', replacement };
  if (startDate(decision) > date) return { filter: 'upcoming', label: 'Toekomstig' };
  if (decision.effectiveUntil && decision.effectiveUntil.slice(0, 10) < date) return { filter: 'archive', label: 'Verlopen' };
  return { filter: 'current', label: 'Geldend' };
}

function replacementCycle(candidate: Decision, decision: Decision, all: Decision[]) {
  const seen = new Set([decision.id]);
  let cursor: Decision | undefined = candidate;
  while (cursor) {
    if (seen.has(cursor.id)) return true;
    seen.add(cursor.id);
    cursor = all.find(item => item.id === cursor?.replacesId);
  }
  return false;
}

function canReplaceDecision(candidate: Decision, decision: Decision, all: Decision[]) {
  return candidate.source === decision.source && candidate.outcome === 'adopted'
    && !replacementCycle(candidate, decision, all)
    && !all.some(item => item.id !== decision.id && item.outcome === 'adopted' && item.replacesId === candidate.id);
}

function ActionTag({ status }: { status: Action['status'] }) {
  const tone = status === 'done' ? 'success' : status === 'blocked' || status === 'pending' ? 'warning' : 'blue';
  return <span className={`bp-tag ${tone}`}>{actionLabels[status]}</span>;
}

function DecisionRules({ decision, board, change, onClose }: Pick<BoardPageProps, 'board' | 'change'> & { decision: Decision; onClose: () => void }) {
  const [effectiveFrom, setFrom] = useState(startDate(decision));
  const [effectiveUntil, setUntil] = useState(decision.effectiveUntil.slice(0, 10));
  const [replacesId, setReplacesId] = useState(decision.replacesId || '');
  const options = board.decisions.filter(item => canReplaceDecision(item, decision, board.decisions));
  const previous = options.find(item => item.id === replacesId);
  const invalidRange = !!effectiveUntil && effectiveUntil < effectiveFrom;
  const successor = board.decisions.find(item => item.outcome === 'adopted' && item.replacesId === decision.id);
  const invalidReplacement = (!!previous && startDate(previous) > effectiveFrom)
    || (!!successor && startDate(successor) < effectiveFrom);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidRange || invalidReplacement) return;
    if (await change(draft => {
      const row = draft.decisions.find(item => item.id === decision.id);
      const replaced = draft.decisions.find(item => item.id === replacesId);
      if (!row || row.outcome !== 'adopted') throw new Error('Dit besluit is niet meer beschikbaar.');
      if (replacesId && (!replaced || !canReplaceDecision(replaced, row, draft.decisions) || startDate(replaced) > effectiveFrom)) {
        throw new Error('Deze vervanging is inmiddels gewijzigd. Open de geldigheid opnieuw.');
      }
      if (draft.decisions.some(item => item.outcome === 'adopted' && item.replacesId === row.id && startDate(item) < effectiveFrom)) {
        throw new Error('De ingangsdatum moet op of vóór die van het opvolgende besluit liggen.');
      }
      row.effectiveFrom = effectiveFrom;
      row.effectiveUntil = effectiveUntil;
      row.replacesId = replacesId || undefined;
    }, `Geldigheid ${decision.code} bijgewerkt`)) onClose();
  }

  return <form className="bp-panel bp-stack" onSubmit={save}>
    <SectionTitle title="Geldigheid instellen" description="Leg vast wanneer dit besluit ingaat en welke eerdere afspraak het vervangt." />
    <div className="bp-fields">
      <Field label="Geldig vanaf"><input type="date" required value={effectiveFrom} onChange={event => setFrom(event.target.value)} /></Field>
      <Field label="Geldig tot en met"><input type="date" min={effectiveFrom} value={effectiveUntil} onChange={event => setUntil(event.target.value)} /></Field>
      <Field label="Vervangt besluit"><select value={replacesId} onChange={event => setReplacesId(event.target.value)}>
        <option value="">Geen eerder besluit</option>
        {options.map(item => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
      </select></Field>
    </div>
    {(invalidRange || invalidReplacement) && <p role="alert" className="bp-callout">Kies een ingangsdatum die past bij de einddatum en de gekoppelde besluiten.</p>}
    <div className="bp-actions"><button type="button" className="cms-button" onClick={onClose}>Annuleren</button><button className="cms-button primary" disabled={invalidRange || invalidReplacement}>Geldigheid opslaan</button></div>
  </form>;
}

export function Decisions(props: DecisionPageProps) {
  const { board, actor, focusId, onNavigate } = props;
  const [date,setDate]=useState(boardToday);
  const [filter, setFilter] = useState<DecisionFilter>('current');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(focusId || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!focusId) return;
    const item = board.decisions.find(row => row.id === focusId);
    if (item) {
      setSelected(focusId);
      setFilter(decisionStatus(item, board.decisions, date).filter);
      setQuery('');
      setEditing(false);
    }
  }, [focusId]);

  if (actor.role === 'committee') return null;
  const matches = board.decisions.filter(item => {
    const status = decisionStatus(item, board.decisions, date);
    return status.filter === filter && `${item.code} ${item.title} ${item.text}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => startDate(b).localeCompare(startDate(a)) || b.code.localeCompare(a.code));
  const decision = board.decisions.find(item => item.id === selected);
  const selectedStatus = decision && decisionStatus(decision, board.decisions, date);
  const previous = decision?.replacesId ? board.decisions.find(item => item.id === decision.replacesId) : undefined;
  const meeting = decision?.meetingId ? board.meetings.find(item => item.id === decision.meetingId) : undefined;
  const proposal = decision?.proposalId ? board.proposals.find(item => item.id === decision.proposalId) : undefined;
  const alvItem = decision?.alvItemId ? board.alvItems.find(item => item.id === decision.alvItemId) : undefined;
  const dossier = decision?.dossierId ? board.dossiers.find(item => item.id === decision.dossierId) : undefined;
  const canEdit = actor.role === 'chair' || actor.role === 'secretary';

  function open(id: string) {
    const item = board.decisions.find(row => row.id === id);
    if (!item) return;
    setFilter(decisionStatus(item, board.decisions, date).filter);
    setSelected(id);
    setEditing(false);
  }

  return <div className="bp-stack">
    <section className="bp-panel bp-stack">
      <SectionTitle title="Besluitenregister" description="Vind de actuele afspraak, het besluitnummer en de vergadering waarin het is vastgelegd." />
      <div className="bp-actions">
        {decisionFilters.map(item => <button type="button" className={`cms-button ${filter === item.key ? 'primary' : ''}`} aria-pressed={filter === item.key} key={item.key} onClick={() => { setFilter(item.key); setSelected(''); setEditing(false); }}>
          {item.key === 'archive' && <Archive size={15} />} {item.label}
        </button>)}
        <Field label="Peildatum"><input type="date" required value={date} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></Field>
      </div>
      <Field label="Zoek op besluitnummer, onderwerp of afspraak"><input type="search" value={query} placeholder="Bijvoorbeeld kantineverhuur" onChange={event => setQuery(event.target.value)} /></Field>
      {matches.length ? <div className="bp-list">{matches.map(item => {
        const status = decisionStatus(item, board.decisions, date);
        return <button className="bp-list-row" type="button" aria-pressed={selected === item.id} key={item.id} onClick={() => open(item.id)}>
          <span className="bp-row-icon"><FileText size={18} /></span>
          <span className="bp-row-copy"><b>{item.title}</b><small>{item.code} · {item.source === 'alv' ? 'ALV' : 'Bestuur'} · {formatDate(startDate(item))}</small></span>
          <span className={`bp-tag ${status.filter === 'current' ? 'success' : status.filter === 'upcoming' ? 'blue' : ''}`}>{status.label}</span>
          <ChevronRight size={17} />
        </button>;
      })}</div> : <div className="bp-empty"><Search size={22} /><p>{query.trim() ? 'Geen besluiten gevonden met deze zoekterm.' : 'Hier staan nog geen besluiten.'}</p></div>}
    </section>
    {decision && selectedStatus && <section className="bp-panel bp-stack" aria-label="Besluitdetails">
      <SectionTitle title={decision.title} description={`${decision.code} · ${decision.source === 'alv' ? 'Algemene ledenvergadering' : 'Bestuur'}`}>
        <span className={`bp-tag ${selectedStatus.filter === 'current' ? 'success' : ''}`}>{selectedStatus.label}</span>
      </SectionTitle>
      <p className="bp-note-text">{decision.text}</p>
      <div className="bp-actions">
        {decision.outcome === 'adopted' && <span className="bp-tag">Vanaf {formatDate(startDate(decision))}{decision.effectiveUntil ? ` t/m ${formatDate(decision.effectiveUntil)}` : ''}</span>}
        {decision.votes && <span className="bp-tag">{decision.votes}</span>}
      </div>
      <div className="bp-actions">
        {proposal && <button className="cms-button" onClick={() => onNavigate('proposals', proposal.id)}>Voorstel {proposal.code} <ArrowRight size={15} /></button>}
        {meeting && <button className="cms-button" onClick={() => onNavigate('meetings', meeting.id)}>Vergadering {meeting.code} <ArrowRight size={15} /></button>}
        {alvItem && <button className="cms-button" onClick={() => onNavigate('alv', alvItem.id)}>ALV-punt {alvItem.code} <ArrowRight size={15} /></button>}
        {dossier && <button className="cms-button" onClick={() => onNavigate('dossiers', dossier.id)}>Dossier {dossier.code} <ArrowRight size={15} /></button>}
        {previous && <button className="cms-button" onClick={() => open(previous.id)}><ArrowLeft size={15} /> Vervangt {previous.code}</button>}
        {selectedStatus.replacement && <button className="cms-button" onClick={() => open(selectedStatus.replacement!.id)}>Vervangen door {selectedStatus.replacement.code} <ArrowRight size={15} /></button>}
        {canEdit && decision.outcome === 'adopted' && !editing && <button className="cms-button" onClick={() => setEditing(true)}>Geldigheid instellen</button>}
      </div>
      {editing && <DecisionRules key={decision.id} decision={decision} board={board} change={props.change} onClose={() => setEditing(false)} />}
      {decision.outcome === 'adopted' && <DecisionImplementation key={decision.id} {...props} decision={decision} />}
    </section>}
  </div>;
}

type ImplementationForm = '' | 'planning' | 'action' | 'communication';
function DecisionImplementation({ decision, stagePlanning, openPlanning, lookupPlanning, canStagePlanning, canSaveCommunication, openCommunication, ...props }: DecisionPageProps & { decision: Decision }) {
  const { board, actor, onNavigate, change } = props;
  const [form, setForm] = useState<ImplementationForm>('');
  const [planningDate, setPlanningDate] = useState(() => {
    const date = boardToday();
    return startDate(decision) > date ? startDate(decision) : date;
  });
  const [communicationId, setCommunicationId] = useState('');
  const handoff = board.handoffs.find(row => row.decisionId === decision.id);
  const activity = handoff && lookupPlanning(handoff.activityId);
  const actions = board.actions.filter(row => row.decisionId === decision.id);
  const communications = board.communications.filter(row => row.decisionId === decision.id);
  const communication = communications.find(row => row.id === communicationId);
  const changedDate = !!handoff && !!activity && handoff.date !== activity.date;
  const canPlan = actor.role === 'chair' || actor.role === 'secretary';

  async function makePlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canPlan && planningDate && await stagePlanning(decision, planningDate)) setForm('');
  }

  async function reviewPlanningDate() {
    if (!activity || !handoff || !canPlan) return;
    await change(draft => {
      const row = draft.handoffs.find(item => item.id === handoff.id);
      if (row) row.date = activity.date;
    }, `Gewijzigde plandatum bij ${decision.code} gecontroleerd`);
  }

  return <div className="bp-panel bp-stack" aria-label="Uitvoering van het besluit">
    <SectionTitle title="Van besluit naar uitvoering" description="De agenda, taken en berichten blijven verbonden aan dit besluit." />
    {handoff && <div className="bp-stack">
      {activity ? <button type="button" className="bp-list-row" onClick={() => openPlanning(handoff.activityId)}>
        <span className="bp-row-icon"><CalendarDays size={18} /></span><span className="bp-row-copy"><b>{activity.title}</b><small>Jaaragenda · {formatDate(activity.date)}</small></span><ChevronRight size={17} />
      </button> : <p className="bp-callout">Het gekoppelde agenda-item is niet meer beschikbaar.</p>}
      {changedDate && <div className="bp-callout" role="status">
        <p><strong>Plandatum gewijzigd.</strong> Het agenda-item verschoof van {formatDate(handoff.date)} naar {formatDate(activity?.date)}. Controleer de acties en conceptberichten hieronder.</p>
        {canPlan && <button className="cms-button" type="button" onClick={reviewPlanningDate}><Check size={15} /> Datum gecontroleerd</button>}
      </div>}
    </div>}
    {actions.map(row => <button type="button" className="bp-list-row" key={row.id} onClick={() => onNavigate('actions', row.id)}>
      <span className="bp-row-icon"><ClipboardList size={18} /></span><span className="bp-row-copy"><b>{row.title}</b><small>{row.code} · {formatDate(row.dueDate)}</small></span><ActionTag status={row.status} /><ChevronRight size={17} />
    </button>)}
    {communications.map(row => <div key={row.id} className="bp-stack"><button type="button" className="bp-list-row" onClick={() => { setCommunicationId(row.id); setForm('communication'); }}>
      <span className="bp-row-icon"><Mail size={18} /></span><span className="bp-row-copy"><b>{row.title}</b><small>{row.code} · {row.audience}</small></span><span className={`bp-tag ${row.status === 'ready' ? 'success' : ''}`}>{row.status === 'ready' ? 'Klaar voor gebruik' : 'Concept'}</span><ChevronRight size={17} />
    </button>{row.campaignId&&canSaveCommunication&&<div className="bp-actions"><button type="button" className="cms-button" onClick={()=>openCommunication(row.campaignId!)}>Open concept in Clubpost <ArrowRight size={16}/></button></div>}</div>)}
    <div className="bp-actions">
      {canPlan && canStagePlanning && !activity && <button type="button" className="cms-button" onClick={() => setForm('planning')}><CalendarDays size={16} /> Jaaragenda-concept</button>}
      {canPlan && <button type="button" className="cms-button" onClick={() => setForm('action')}><Plus size={16} /> Commissietaak</button>}
      {canSaveCommunication&&<button type="button" className="cms-button" onClick={() => { setCommunicationId(''); setForm('communication'); }}><Mail size={16} /> Conceptbericht</button>}
    </div>
    {form === 'planning' && <form className="bp-stack" onSubmit={makePlanning}>
      <Field label="Voorlopige datum"><input required type="date" value={planningDate} onChange={event => setPlanningDate(event.target.value)} /></Field>
      <div className="bp-actions"><button type="button" className="cms-button" onClick={() => setForm('')}>Annuleren</button><button className="cms-button primary">Intern agenda-item klaarzetten</button></div>
    </form>}
    {canPlan && form === 'action' && <ActionEditor {...props} decision={decision} onClose={() => setForm('')} />}
    {form === 'communication' && <CommunicationEditor key={communicationId || 'new'} saveCommunication={props.saveCommunication} decision={decision} communication={communication} onClose={() => setForm('')} />}
  </div>;
}

function CommunicationEditor({ saveCommunication, decision, communication, onClose }: Pick<BoardPageProps, 'saveCommunication'> & { decision: Decision; communication?: Communication; onClose: () => void }) {
  const [title, setTitle] = useState(communication?.title || decision.title);
  const [audience, setAudience] = useState(communication?.audience || 'Vrijwilligers');
  const [body, setBody] = useState(communication?.body || `Beste vrijwilligers,\n\nHet bestuur heeft het volgende afgesproken.\n\n${decision.text}\n\nNamens Duindorp SV`);
  const [status, setStatus] = useState<Communication['status']>(communication?.status || 'draft');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !audience.trim() || !body.trim()) return;
    if(await saveCommunication({communicationId:communication?.id,decisionId:decision.id,title:title.trim(),audience:audience.trim(),body:body.trim(),status}))onClose();
  }

  return <form className="bp-stack" onSubmit={save}>
    <SectionTitle title={communication ? 'Bericht bewerken' : 'Conceptbericht opstellen'} />
    <div className="bp-fields">
      <Field label="Onderwerp"><input required value={title} onChange={event => { setTitle(event.target.value); setStatus('draft'); }} /></Field>
      <Field label="Doelgroep"><input required value={audience} placeholder="Bijvoorbeeld vrijwilligers of trainers" onChange={event => { setAudience(event.target.value); setStatus('draft'); }} /></Field>
    </div>
    <Field label="Bericht"><textarea rows={6} required value={body} onChange={event => { setBody(event.target.value); setStatus('draft'); }} /></Field>
    <Field label="Status"><select value={status} onChange={event => setStatus(event.target.value === 'ready' ? 'ready' : 'draft')}><option value="draft">Concept</option><option value="ready">Klaar voor gebruik</option></select></Field>
    <div className="bp-actions"><button type="button" className="cms-button" onClick={onClose}>Annuleren</button><button className="cms-button primary">Bericht opslaan</button></div>
  </form>;
}

function ActionEditor({ board, actor, people, committees, change, decision, action, onClose }: BoardPageProps & { decision?: Decision; action?: Action; onClose: () => void }) {
  const [title, setTitle] = useState(action?.title || (decision ? `Uitvoeren · ${decision.title}` : ''));
  const [description, setDescription] = useState(action?.description || '');
  const [committeeId, setCommittee] = useState(action?.committeeId || '');
  const [ownerId, setOwner] = useState(action?.ownerId || '');
  const [portfolioOwnerId, setPortfolioOwner] = useState(action?.portfolioOwnerId || actor.id);
  const [dueDate, setDue] = useState(action?.dueDate || '');
  const scopedPeople = people.filter(person => person.committeeIds.includes(committeeId));
  const otherPeople = people.filter(person => !person.committeeIds.includes(committeeId));

  function chooseCommittee(id: string) {
    setCommittee(id);
    const portfolio = board.portfolios.find(row => row.committeeId === id);
    setPortfolioOwner(portfolio?.ownerId || actor.id);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !description.trim() || !ownerId || !portfolioOwnerId || !dueDate || (decision && !committeeId)) return;
    if (await change(draft => {
      const values = { title: title.trim(), description: description.trim(), ownerId, committeeId, portfolioOwnerId, dueDate };
      if (action) {
        const row = draft.actions.find(item => item.id === action.id);
        if (!row) throw new Error('Deze actie is niet meer beschikbaar.');
        if (row.ownerId !== ownerId || row.committeeId !== committeeId) {
          row.status = 'pending';
          row.helpRequest = undefined;
        }
        Object.assign(row, values);
      } else {
        draft.actions.push({
          ...makeBase(draft, 'action'), ...values,
          status: 'pending', progress: '', decisionId: decision?.id,
          meetingId: decision?.meetingId, pointId: decision?.pointId, proposalId: decision?.proposalId,
        });
      }
    }, action ? `Toewijzing ${action.code} opgeslagen` : 'Actie toegewezen en klaar voor bevestiging')) onClose();
  }

  return <form className="bp-panel bp-stack" onSubmit={save}>
    <SectionTitle title={action ? 'Toewijzing wijzigen' : 'Actie toewijzen'} description="Wijs één aanspreekbare persoon aan. De portefeuillehouder ontvangt het hulpverzoek in dit portaal." />
    <Field label="Titel"><input required value={title} onChange={event => setTitle(event.target.value)} /></Field>
    <Field label="Gewenst resultaat"><textarea rows={3} required value={description} onChange={event => setDescription(event.target.value)} /></Field>
    <div className="bp-fields">
      <Field label="Commissie"><select required={!!decision} value={committeeId} onChange={event => chooseCommittee(event.target.value)}><option value="">{decision ? 'Kies een commissie' : 'Individuele actie'}</option>{committees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
      <Field label="Verantwoordelijke"><select required value={ownerId} onChange={event => setOwner(event.target.value)}>
        <option value="">Kies een persoon</option>
        {!!scopedPeople.length && <optgroup label="In deze commissie">{scopedPeople.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</optgroup>}
        <optgroup label={committeeId ? 'Andere clubpersonen' : 'Clubpersonen'}>{otherPeople.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</optgroup>
      </select></Field>
      <Field label="Portefeuillehouder"><select required value={portfolioOwnerId} onChange={event => setPortfolioOwner(event.target.value)}><option value="">Kies een persoon</option>{people.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
      <Field label="Uiterste datum"><input type="date" required value={dueDate} onChange={event => setDue(event.target.value)} /></Field>
    </div>
    <div className="bp-actions"><button className="cms-button" type="button" onClick={onClose}>Annuleren</button><button className="cms-button primary">{action ? 'Toewijzing opslaan' : 'Actie toewijzen'}</button></div>
  </form>;
}

type ActionFilter = 'open' | 'mine' | 'help' | 'done';
const actionFilters: { key: ActionFilter; label: string }[] = [
  { key: 'open', label: 'Openstaand' }, { key: 'mine', label: 'Mijn acties' }, { key: 'help', label: 'Hulpvragen' }, { key: 'done', label: 'Afgerond' },
];

export function Actions(props: BoardPageProps) {
  const { actor, board, committees, people, focusId } = props;
  const [filter, setFilter] = useState<ActionFilter>('open');
  const [committeeId, setCommittee] = useState('');
  const [selected, setSelected] = useState(focusId || '');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const committeeView = actor.role === 'committee';
  const canManage = actor.role === 'chair' || actor.role === 'secretary';
  const available = board.actions.filter(row => !committeeView || row.ownerId === actor.id || (!!row.committeeId && actor.committeeIds.includes(row.committeeId)));

  useEffect(() => {
    if (!focusId) return;
    setSelected(focusId);
    setCommittee('');
    setEditing(false);
    setCreating(false);
    setFilter(board.actions.find(row => row.id === focusId)?.status === 'done' ? 'done' : 'open');
  }, [focusId]);

  const matches = available.filter(row => {
    if (committeeId && row.committeeId !== committeeId) return false;
    if (filter === 'done') return row.status === 'done';
    if (row.status === 'done') return false;
    if (filter === 'mine') return row.ownerId === actor.id;
    if (filter === 'help') return row.status === 'blocked' && (!!row.helpRequest && (committeeView || canManage || row.ownerId === actor.id || row.portfolioOwnerId === actor.id));
    return true;
  }).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.code.localeCompare(b.code));
  const action = available.find(item => item.id === selected);
  const findPerson = (id: string) => people.find(row => row.id === id)?.name || 'Persoon onbekend';
  const findCommittee = (id: string) => committees.find(row => row.id === id)?.name || (id ? 'Commissie onbekend' : 'Individuele actie');
  const shownCommittees = committees.filter(row => !committeeView || actor.committeeIds.includes(row.id));
  const date = boardToday();

  return <div className="bp-stack">
    <section className="bp-panel bp-stack">
      <SectionTitle title={committeeView ? 'Onze acties' : 'Acties en hulpvragen'} description={committeeView ? 'Volg de acties van je commissie, bevestig je opdracht en laat weten waar je vastloopt.' : 'Zie wie een opdracht oppakt, welke acties vertraging hebben en welke hulp het bestuur kan bieden.'}>
        {canManage && <button type="button" className="cms-button primary" onClick={() => { setCreating(true); setSelected(''); }}><Plus size={16} /> Nieuwe actie</button>}
      </SectionTitle>
      <div className="bp-actions">{actionFilters.map(item => <button type="button" className={`cms-button ${filter === item.key ? 'primary' : ''}`} aria-pressed={filter === item.key} key={item.key} onClick={() => { setFilter(item.key); setSelected(''); }}>
        {item.key === 'help' && <Flag size={15} />} {item.label}
      </button>)}</div>
      {!!shownCommittees.length && <Field label="Filter op commissie"><select value={committeeId} onChange={event => { setCommittee(event.target.value); setSelected(''); }}><option value="">Alle commissies</option>{shownCommittees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
      {matches.length ? <div className="bp-list">{matches.map(row => <button type="button" className="bp-list-row" aria-pressed={selected === row.id} key={row.id} onClick={() => { setSelected(row.id); setCreating(false); setEditing(false); }}>
        <span className="bp-row-icon"><ClipboardList size={18} /></span>
        <span className="bp-row-copy"><b>{row.title}</b><small>{row.code} · {findCommittee(row.committeeId)} · {findPerson(row.ownerId)} · {formatDate(row.dueDate)}</small></span>
        <ActionTag status={row.status} />
        {row.status !== 'done' && row.dueDate && row.dueDate < date && <span className="bp-tag warning">Te laat</span>}
        <ChevronRight size={17} />
      </button>)}</div> : <div className="bp-empty"><ClipboardList size={22} /><p>Hier staan nog geen acties.</p></div>}
    </section>
    {canManage && creating && <ActionEditor {...props} onClose={() => { setCreating(false); setFilter('open'); setCommittee(''); }} />}
    {action && <section className="bp-panel bp-stack" aria-label="Actiedetails">
      <SectionTitle title={action.title} description={`${action.code} · ${findCommittee(action.committeeId)}`}><ActionTag status={action.status} /></SectionTitle>
      <p className="bp-note-text">{action.description}</p>
      <div className="bp-actions">
        <span className="bp-tag">Verantwoordelijke · {findPerson(action.ownerId)}</span>
        <span className="bp-tag">Portefeuillehouder · {findPerson(action.portfolioOwnerId)}</span>
        <span className="bp-tag">Uiterlijk · {formatDate(action.dueDate)}</span>
      </div>
      {action.progress && <div className="bp-callout"><strong>Laatste voortgang</strong><p className="bp-note-text">{action.progress}</p></div>}
      {action.helpRequest && (committeeView || canManage || action.ownerId === actor.id || action.portfolioOwnerId === actor.id) && <div className="bp-callout" role="status"><strong>Hulp gevraagd aan {findPerson(action.portfolioOwnerId)}</strong><p className="bp-note-text">{action.helpRequest}</p></div>}
      {!committeeView && <div className="bp-actions">
        {action.decisionId && <button type="button" className="cms-button" onClick={() => props.onNavigate('decisions', action.decisionId)}>Open besluit <ArrowRight size={15} /></button>}
        {action.meetingId && <button type="button" className="cms-button" onClick={() => props.onNavigate('meetings', action.meetingId)}>Open vergadering <ArrowRight size={15} /></button>}
        {canManage && action.status !== 'done' && !editing && <button type="button" className="cms-button" onClick={() => setEditing(true)}>Toewijzing wijzigen</button>}
      </div>}
      {canManage && action.status !== 'done' && editing && <ActionEditor key={action.id} {...props} action={action} onClose={() => setEditing(false)} />}
      {!editing && <ActionProgress key={action.id} action={action} {...props} />}
    </section>}
  </div>;
}

function ActionProgress({ action, actor, change }: { action: Action } & Pick<BoardPageProps, 'actor' | 'change'>) {
  const [editor, setEditor] = useState<'progress' | 'help' | ''>('');
  const [progress, setProgress] = useState(action.progress);
  const [status, setStatus] = useState<Action['status']>(action.status);
  const [help, setHelp] = useState(action.helpRequest || '');
  const ownsAction = actor.id === action.ownerId;
  const canUpdate = ownsAction && action.status !== 'done';

  async function accept() {
    await change(draft => {
      const row = draft.actions.find(item => item.id === action.id);
      if (!row || row.ownerId !== actor.id || row.status !== 'pending') throw new Error('Deze opdracht kan niet meer worden bevestigd.');
      row.status = 'open';
    }, `${action.code} bevestigd door ${actor.name}`);
  }

  async function saveProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'done' && !progress.trim()) return;
    if (await change(draft => {
      const row = draft.actions.find(item => item.id === action.id);
      if (!row || row.status === 'pending') throw new Error('Bevestig deze opdracht eerst.');
      if (row.status === 'done') throw new Error('Deze opdracht is al afgerond.');
      if (row.ownerId !== actor.id) throw new Error('De opdracht is inmiddels overgedragen.');
      row.status = status;
      row.progress = progress.trim();
      if (status !== 'blocked') row.helpRequest = undefined;
    }, `Voortgang ${action.code} opgeslagen`)) setEditor('');
  }

  async function askForHelp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!help.trim()) return;
    if (await change(draft => {
      const row = draft.actions.find(item => item.id === action.id);
      if (!row || row.ownerId !== actor.id || row.status === 'pending' || row.status === 'done') throw new Error('Dit hulpverzoek kan niet meer worden bijgewerkt.');
      row.status = 'blocked';
      row.helpRequest = help.trim();
    }, `Hulpverzoek voor ${action.code} klaargezet bij de portefeuillehouder`)) setEditor('');
  }

  if (action.status === 'pending') return ownsAction ? <div className="bp-actions"><button type="button" className="cms-button primary" onClick={accept}><Check size={16} /> Ik pak dit op</button></div> : null;
  if (!canUpdate) return null;
  return <div className="bp-stack">
    <div className="bp-actions">
      <button type="button" className="cms-button primary" onClick={() => { setProgress(action.progress); setStatus(action.status); setEditor('progress'); }}>Voortgang bijwerken</button>
      {ownsAction && action.status !== 'done' && <button type="button" className="cms-button" onClick={() => { setHelp(action.helpRequest || ''); setEditor('help'); }}><CircleHelp size={16} /> Hulp nodig</button>}
    </div>
    {editor === 'progress' && <form className="bp-stack" onSubmit={saveProgress}>
      <Field label="Status"><select value={status} onChange={event => setStatus(event.target.value as Action['status'])}>
        <option value="open">Open</option><option value="progress">Bezig</option>{action.status === 'blocked' && <option value="blocked">Hulp nodig</option>}<option value="done">Afgerond</option>
      </select></Field>
      <Field label={status === 'done' ? 'Wat is er afgerond?' : 'Voortgang'}><textarea rows={3} required={status === 'done'} value={progress} onChange={event => setProgress(event.target.value)} /></Field>
      <div className="bp-actions"><button className="cms-button" type="button" onClick={() => setEditor('')}>Annuleren</button><button className="cms-button primary">Voortgang opslaan</button></div>
    </form>}
    {editor === 'help' && <form className="bp-stack" onSubmit={askForHelp}>
      <Field label="Welke informatie, hulp of beslissing heb je nodig?"><textarea rows={3} required value={help} onChange={event => setHelp(event.target.value)} /></Field>
      <div className="bp-actions"><button className="cms-button" type="button" onClick={() => setEditor('')}>Annuleren</button><button className="cms-button primary">Hulp vragen</button></div>
    </form>}
  </div>;
}

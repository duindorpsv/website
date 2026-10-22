'use client';
import {useDialogFocusReturn} from './dialog-focus';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowRight, ArrowUpRight, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, CloudDownload, Copy, HeartHandshake, History, Info, Link2, Mail, Plus, Search, ShieldCheck, Trash2, UserCheck, UserRound, UserRoundPlus, Users, X } from 'lucide-react';
import { useCMS } from './sponsor-workspace-provider';
import { ClubPeopleManager } from './club-people';
import { canAccessDirectory, canManageDirectory, readDirectory, getDirectoryRows, getDirectoryProfile, saveDirectoryPerson, createDirectoryInvitation, revokeDirectoryInvitation, invitationStatus, saveDirectoryGuardian, approveDirectoryGuardian, setDirectoryAccountActive, bindDirectoryAccount, saveDirectoryAssignment, removeDirectoryAssignment, importDirectoryPeople } from '@/lib/cms/directory';
import { readSponsorship } from '@/lib/cms/sponsorship';
import type { DirectoryProfile, DirectoryRow, DirectoryGuardian, DirectoryAssignment, DirectoryInvitation, DirectoryImportPerson, GuardianPermission, DirectoryLabel } from '@/lib/cms/directory-types';
import type { CmsPerson, CmsState } from '@/lib/cms/types';
import type { SponsorContactRole } from '@/lib/cms/sponsorship-types';
import { uid, now } from '@/lib/cms/model';
import './directory-manager.css';
import {Pagination} from './pagination';
import {DirectoryPersonPicker} from './directory-person-picker';
import {DirectoryImportPanel} from './directory-import-panel';
type DossierTab = 'details' | 'membership' | 'functions' | 'relations' | 'account' | 'history';
const memberLabels = { playing: 'Spelend lid', 'non-playing': 'Niet-spelend lid', none: 'Geen lidmaatschap' };
const personStatuses = { active: 'Actief', former: 'Gestopt', archived: 'Gearchiveerd' };
const invitationLabels = { pending: 'Uitnodiging open', accepted: 'Geactiveerd', revoked: 'Ingetrokken', expired: 'Uitnodiging verlopen' };
const labels: {
    id: DirectoryLabel;
    name: string;
}[] = [{ id: 'volunteer', name: 'Vrijwilliger' }, { id: 'donor', name: 'Donateur' }, { id: 'supporter', name: 'Supporter' }, { id: 'honorary', name: 'Erelid' }];
const guardianPermissions: {
    id: GuardianPermission;
    name: string;
    description: string;
}[] = [{ id: 'schedule', name: 'Programma & berichten', description: 'Team, programma en relevante clubberichten bekijken.' }, { id: 'attendance', name: 'Aanwezigheid', description: 'Aanwezigheid of afmelding namens dit kind doorgeven.' }, { id: 'forms', name: 'Formulieren', description: 'Toegestane formulieren namens dit kind invullen.' }, { id: 'profile', name: 'Gegevens', description: 'Wijzigingen aan de gegevens van dit kind aanvragen.' }, { id: 'finance', name: 'Financieel', description: 'Toegestane financiële informatie voor dit kind bekijken.' }];
const contactRoles: {
    id: SponsorContactRole;
    name: string;
}[] = [{ id: 'signer', name: 'Ondertekenen' }, { id: 'billing', name: 'Financiën' }, { id: 'marketing', name: 'Marketing & materiaal' }];
const functionKinds: Record<DirectoryAssignment['kind'], string> = { board: 'Bestuur', committee: 'Commissie', trainer: 'Trainer', manager: 'Teammanager', referee: 'Scheidsrechter', volunteer: 'Vrijwilliger' };
const relationshipLabels = { parent: 'Ouder', guardian: 'Voogd', carer: 'Verzorger' };
const stamp = (value: string) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const date = (value: string) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '—';
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
const clone = <T,>(value: T) => structuredClone(value);
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const exampleImport:DirectoryImportPerson[]=[];
function Field({ label, hint, children, full = false }: {
    label: string;
    hint?: string;
    children: ReactNode;
    full?: boolean;
}) { return <label className={`cms-field dr-field${full ? ' dr-full' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Badge({ children, tone = '' }: {
    children: ReactNode;
    tone?: string;
}) { return <span className={`dr-tag ${tone}`}>{children}</span>; }
function Note({ children, error = false }: {
    children: ReactNode;
    error?: boolean;
}) { return <div className={`dr-note${error ? ' error' : ''}`} role={error ? 'alert' : undefined}><Info size={17}/><div>{children}</div></div>; }
function Modal({ title, description, children, onClose, wide = false }: {
    title: string;
    description: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
}) { const focusReturn=useDialogFocusReturn(); return <Dialog.Root open onOpenChange={v => !v && onClose()}><Dialog.Portal><Dialog.Overlay className="dr-overlay"/><Dialog.Content {...focusReturn} className={`dr-modal${wide ? ' wide' : ''}`}><header className="dr-modal-head"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className="cms-button" aria-label="Registervenster sluiten"><X size={18}/></Dialog.Close></header><div className="dr-modal-body">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>; }
function accountStatus(row: DirectoryRow) {
    if (row.account)
        return row.account.active ? 'active' : 'blocked';
    return row.invitation ? invitationStatus(row.invitation) : 'none';
}
function AccountBadge({ row }: {
    row: DirectoryRow;
}) { const status = accountStatus(row); return <Badge tone={status === 'active' ? 'green' : status === 'blocked' ? 'red' : status === 'pending' ? 'blue' : status === 'expired' ? 'amber' : ''}>{status === 'active' ? 'Account actief' : status === 'blocked' ? 'Account geblokkeerd' : status === 'none' ? 'Zonder account' : row.invitation?.mailStatus==='prepared'?'Verzending in verwerking':invitationLabels[status as keyof typeof invitationLabels]}</Badge>; }
function defaultProfile(personId: string, sponsorId = ''): DirectoryProfile { return { personId, birthDate: '', membership: 'none', status: 'active', labels: [], teamIds: [], address: '', postalCode: '', city: '', source: 'manual', sourceUpdatedAt: '', updatedAt: now(), sponsorIds: sponsorId ? [sponsorId] : [] }; }
export function DirectoryManager({ initialPersonId, sponsorId }: {
    initialPersonId?: string;
    sponsorId?: string;
} = {}) {
    const { state, ready, update, userId, currentUser, can, notify, listing, query, setQuery, request, beginEdit } = useCMS();
    const all = canManageDirectory(state, userId), access = canAccessDirectory(state, userId), directory = readDirectory(state), sponsorship = readSponsorship(state);
    const rows = useMemo(() => getDirectoryRows(state, userId).filter(row => !sponsorId || row.sponsorIds.includes(sponsorId)).map(row => sponsorId ? { ...row, invitation: readDirectory(state).invitations.filter(invite => invite.personId === row.person.id && invite.scope === 'sponsor' && invite.sponsorId === sponsorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] } : row), [state, userId, sponsorId]);
    const [view, setView] = useState<'register' | 'website'>('register');
    const contextKey = `${userId}|${all}|${access}|${sponsorId || ''}`;
    const [renderContext, setRenderContext] = useState(contextKey);
    const [search, setSearch] = useState(''), [membership, setMembership] = useState('all'), [source, setSource] = useState('all'), [status, setStatus] = useState('all'), [page, setPage] = useState(1), [selected, setSelected] = useState<string[]>([]);
    const [person, setPerson] = useState<CmsPerson | null>(null), [profile, setProfile] = useState<DirectoryProfile | null>(null), [dossierTab, setDossierTab] = useState<DossierTab>('details');
    const [error, setError] = useState(''), [inviteIds, setInviteIds] = useState<string[] | null>(null), [inviteEmails, setInviteEmails] = useState<Record<string, string>>({}), [inviteSponsors, setInviteSponsors] = useState<Record<string, string>>({}), [inviteRoleIds, setInviteRoleIds] = useState<SponsorContactRole[]>(['marketing']), [inviteScope, setInviteScope] = useState<'club' | 'sponsor'>('club'), [createdInvites, setCreatedInvites] = useState<DirectoryInvitation[]>([]);
    const [guardian, setGuardian] = useState<DirectoryGuardian | null>(null), [assignment, setAssignment] = useState<DirectoryAssignment | null>(null), [importOpen, setImportOpen] = useState(false), [importIds, setImportIds] = useState(exampleImport.map(p => p.sportlinkId)), [boundUser, setBoundUser] = useState(''), [newSponsorId, setNewSponsorId] = useState(sponsorId || '');
    const [familyCode,setFamilyCode]=useState('');
    useEffect(()=>{if(guardian)beginEdit('guardian:'+guardian.id);if(assignment)beginEdit('assignment:'+assignment.id);},[guardian?.id,assignment?.id,beginEdit]);
    const initialOpened = useRef('');
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const currentRow = person ? rows.find(row => row.person.id === person.id) : undefined;
    const personVisible = !!person && (!state.people.some(row => row.id === person.id) || !!currentRow);
    const allowedSelected = selected.filter(id => rows.some(row => row.person.id === id));
    function matchesFeature(row: DirectoryRow) {
        if (membership === 'all')
            return true;
        if (membership === 'parent')
            return directory.guardians.some(g => g.guardianPersonId === row.person.id && g.status === 'approved');
        if (membership === 'committee')
            return row.committeeNames.length > 0 || directory.assignments.some(a => a.personId === row.person.id && a.kind === 'committee');
        if (membership === 'sponsor')
            return row.sponsorIds.length > 0;
        return row.profile.membership === membership || row.profile.labels.includes(membership as DirectoryLabel);
    }
    const filtered=listing?rows.filter(row=>listing.listingIds.includes(row.person.id)):rows;
    const pageCount=Math.max(1,Math.ceil((listing?.total||filtered.length)/(listing?.pageSize||25)));
    const pageRows=listing?filtered:filtered.slice((page-1)*25,page*25);
    useEffect(()=>{const timer=setTimeout(()=>setQuery({mode:'directory',companyId:sponsorId||'',search,feature:membership,source,account:status,page,personId:person&&state.people.some(p=>p.id===person.id)?person.id:initialPersonId||''}),250);return()=>clearTimeout(timer);},[search,membership,source,status,page,sponsorId,person?.id,initialPersonId,setQuery]);
    async function transact(recipe: (draft: CmsState) => void, message: string) {
        let failure = '';
        setError('');
        const ok = await update(draft => {
            try {
                recipe(draft);
            }
            catch (reason) {
                failure = reason instanceof Error ? reason.message : 'Deze wijziging kon niet worden opgeslagen.';
                throw reason;
            }
        }, message);
        if (ok)
            notify(message);
        else
            setError(failure || 'Opslaan is niet gelukt.');
        return ok;
    }
    function open(row: DirectoryRow) { beginEdit(['person:'+row.person.id,'profile:'+row.person.id]);setFamilyCode(''); setPerson(clone(row.person)); setProfile(clone(row.profile)); setDossierTab('details'); setBoundUser(row.account?.id || ''); setNewSponsorId(sponsorId || row.sponsorIds[0] || ''); setError(''); setGuardian(null); setAssignment(null); }
    function close() { setFamilyCode(''); setPerson(null); setProfile(null); setGuardian(null); setAssignment(null); setError(''); }
    useEffect(() => { close(); setSelected([]); setInviteIds(null); setCreatedInvites([]); setImportOpen(false); setSearch(''); setRenderContext(contextKey); }, [contextKey]);
    useEffect(() => {
        if (!initialPersonId || initialOpened.current === `${userId}:${initialPersonId}`)
            return;
        const row = rows.find(r => r.person.id === initialPersonId);
        if (row) {
            initialOpened.current = `${userId}:${initialPersonId}`;
            open(row);
        }
    }, [initialPersonId, userId, rows]);
    function add() {
        if (!access)
            return;
        const id = uid('person');
        setPerson({ id, name: '', role: '', group: '', teamId: '', bio: '', mediaId: '', email: '', phone: '', showContact: false, published: false, order: state.people.length });
        setProfile(defaultProfile(id, sponsorId));
        setNewSponsorId(sponsorId || '');
        setDossierTab('details');
        setError('');
    }
    async function save(event: FormEvent) {
        event.preventDefault();
        if (!person || !profile)
            return;
        const saved = await transact(draft => { saveDirectoryPerson(draft, userId, { person, profile, sponsorId: !all ? newSponsorId || sponsorId : undefined }); }, 'Persoonsdossier opgeslagen.');
        if (saved) {
            if (!currentRow) {
                setSearch(person.name);
                setPage(1);
            }
            close();
        }
    }
    function beginInvite(ids: string[]) {
        const selectedRows = rows.filter(row => ids.includes(row.person.id) && !row.account);
        if (!selectedRows.length) {
            notify('De geselecteerde personen hebben al een account.');
            return;
        }
        setInviteIds(selectedRows.map(row => row.person.id));
        setInviteEmails(Object.fromEntries(selectedRows.map(row => [row.person.id, row.person.email || ''])));
        setInviteSponsors(Object.fromEntries(selectedRows.map(row => [row.person.id, sponsorId || row.sponsorIds[0] || ''])));
        setInviteScope(all && !sponsorId ? 'club' : 'sponsor');
        setInviteRoleIds(['marketing']);
        setCreatedInvites([]);
        setError('');
    }
    async function invite(event: FormEvent) {
        event.preventDefault();
        if (!inviteIds)
            return;
        const targetRows = rows.filter(row => inviteIds.includes(row.person.id));
        if (!targetRows.length)
            return;
        const created: DirectoryInvitation[] = [];
        const ok = await transact(draft => {
            for (const row of targetRows) {
                const email = inviteEmails[row.person.id] || '';
                if (!emailValid(email))
                    throw new Error(`Vul een geldig inlogadres in voor ${row.person.name}.`);
                created.push(createDirectoryInvitation(draft, userId, { personId: row.person.id, email, scope: inviteScope, sponsorId: inviteScope === 'sponsor' ? inviteSponsors[row.person.id] : undefined, sponsorRoles: inviteScope === 'sponsor' ? inviteRoleIds : undefined }));
            }
        }, `${targetRows.length} uitnodiging${targetRows.length===1?'':'en'} per e-mail verzonden.`);
        if (ok) {
            setCreatedInvites(created);
            setSelected([]);
        }
    }
    
    async function copyPersonCode(){if(!person||!all)return;try{const result=await request<{code:string;message:string}>('/api/sponsorship/family',{action:'code',personId:person.id});setFamilyCode(result.code);await navigator.clipboard.writeText(result.code).catch(()=>{});notify(result.message);}catch(e){setError(e instanceof Error?e.message:'Code aanmaken is mislukt.');}}
    
    function newGuardian() {
        if (!person || !all)
            return;
        setGuardian({ id: uid('guardian'), guardianPersonId: '', childPersonId: person.id, relationship: 'parent', permissions: ['schedule', 'attendance', 'forms', 'profile'], status: 'pending', requestedAt: now(), requestedBy: userId, approvedAt: '', approvedBy: '' });
        setError('');
    }
    async function saveGuardian(event: FormEvent) {
        event.preventDefault();
        if (!guardian)
            return;
        const ok = await transact(draft => { saveDirectoryGuardian(draft, userId, guardian); }, 'Ouder/verzorger-koppeling opgeslagen.');
        if (ok)
            setGuardian(null);
    }
    function newAssignment() {
        if (!person || !all)
            return;
        setAssignment({ id: uid('function'), personId: person.id, kind: 'committee', name: '', teamId: '', committeeId: '', startsAt: '', endsAt: '' });
        setError('');
    }
    async function saveFunction(event: FormEvent) {
        event.preventDefault();
        if (!assignment)
            return;
        if (await transact(draft => { saveDirectoryAssignment(draft, userId, assignment); }, 'Clubfunctie opgeslagen.'))
            setAssignment(null);
    }
    
    const dossierInvites = person ? directory.invitations.filter(row => row.personId === person.id && (!sponsorId || row.scope === 'sponsor' && row.sponsorId === sponsorId) && (all || row.scope === 'sponsor' && rows.some(r => r.person.id === row.personId && r.sponsorIds.includes(row.sponsorId)))) : [];
    const parentLinks = person && all ? directory.guardians.filter(row => row.childPersonId === person.id || row.guardianPersonId === person.id) : [];
    const assignments = person && all ? directory.assignments.filter(row => row.personId === person.id) : [];
    const account = currentRow?.account;
    if (!ready)
        return <div className="cms-empty">Het register wordt geladen…</div>;
    if (renderContext !== contextKey)
        return <div className="cms-empty">De werkplek wordt aangepast aan je toegang…</div>;
    if (!access && can('people'))
        return <ClubPeopleManager />;
    if (!access)
        return <section className="cms-panel cms-empty"><ShieldCheck size={30}/><h2>Dit register is niet beschikbaar.</h2><p>Je account heeft geen toegang tot personenbeheer of sponsorcontacten.</p></section>;
    const topViews = can('people') ? <nav className="dr-topviews" aria-label="Register en websiteprofielen"><button aria-selected={view === 'register'} onClick={() => setView('register')}><Users size={15}/>Personen & gebruikers</button><button aria-selected={view === 'website'} onClick={() => setView('website')}><UserRound size={15}/>Websiteprofielen</button></nav> : null;
    if (view === 'website' && can('people'))
        return <div className="dr-root">{topViews}<ClubPeopleManager /></div>;
    return <div className="dr-root">{topViews}
  <div className="dr-hero"><div className="dr-hero-copy"><span className="dr-eyebrow">ÉÉN PERSOON. ALLE VERBINDINGEN.</span><h2>{all ? 'Iedereen verbonden met de club.' : 'De mensen achter onze partners.'}</h2><p>{all ? 'Leden, verzorgers, vrijwilligers en sponsorcontacten. Eén dossier per persoon, met een account zodra dat nodig is.' : 'Je beheert hier uitsluitend sponsorcontacten. Lidmaatschappen, jeugdleden, ouderrelaties en globale accountrechten blijven bij de bevoegde clubbeheerders.'}</p></div><div className="dr-hero-side"><Link2 size={24}/><strong>Van uitnodiging naar Mijn Duindorp.</strong><a className="cms-button" href="/portaal">Bekijk het portaal <ArrowUpRight size={14}/></a></div></div>
  {!all && <div className="dr-scope-banner"><ShieldCheck size={17}/><span>Beperkte werkplek · sponsorcontacten en uitnodigingen. Je kunt geen clubbrede rollen uitdelen of andere personen doorzoeken.</span></div>}
  <div className="dr-stats"><div className="dr-stat"><Users size={20}/><strong>{listing?.stats.total??rows.length}</strong><span>{all ? 'Personen in dit register' : 'Sponsorcontacten'}</span></div><div className="dr-stat"><UserCheck size={20}/><strong>{listing?.stats.active??rows.filter(row => row.account?.active).length}</strong><span>Actieve accounts</span></div><div className="dr-stat"><Mail size={20}/><strong>{listing?.stats.pending??rows.filter(row => row.invitation && invitationStatus(row.invitation) === 'pending').length}</strong><span>Uitnodiging staat open</span></div><div className="dr-stat"><UserRound size={20}/><strong>{listing?.stats.without_account??rows.filter(row => !row.account && !row.invitation).length}</strong><span>Nog zonder account</span></div></div>
  <div className="dr-toolbar"><div className="dr-actions">{all && <button className="cms-button" onClick={() => { setImportOpen(true); setError(''); }}><CloudDownload size={15}/>Sportlink-gegevens importeren</button>}<button className="cms-button primary" onClick={add}><UserRoundPlus size={15}/>{all ? 'Persoon toevoegen' : 'Sponsorcontact toevoegen'}</button></div>{all && can('users') && <a className="cms-button" href="/beheer#rollen"><ShieldCheck size={15}/>Rollen & toegangsrechten</a>}</div>
  <section className="dr-panel"><div className="dr-filter-row"><label className="dr-search"><Search size={17}/><input aria-label="Zoek in het personenregister" placeholder="Zoek naam, e-mailadres of functie…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></label>{all && <select aria-label="Filter lidmaatschap en kenmerken" value={membership} onChange={e => { setMembership(e.target.value); setPage(1); }}><option value="all">Alle kenmerken</option><option value="playing">Spelend lid</option><option value="non-playing">Niet-spelend lid</option><option value="none">Geen lidmaatschap</option><option value="parent">Ouder/verzorger</option><option value="committee">Commissielid</option><option value="sponsor">Sponsorcontact</option>{labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}<select aria-label="Filter bron" value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="all">Alle bronnen</option><option value="sportlink">Sportlink</option><option value="manual">Handmatig</option><option value="account">Bestaand account</option></select><select aria-label="Filter accountstatus" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">Elke accountstatus</option><option value="none">Zonder account</option><option value="active">Account actief</option><option value="blocked">Account geblokkeerd</option><option value="pending">Uitnodiging open</option><option value="expired">Uitnodiging verlopen</option></select></div>
   {allowedSelected.length > 0 && <div className="dr-selection"><span>{allowedSelected.length} personen geselecteerd</span><button className="cms-button" onClick={() => beginInvite(allowedSelected)}><Mail size={14}/>Uitnodigingen voorbereiden</button><button className="cms-button" onClick={() => setSelected([])}>Selectie wissen</button></div>}
   <div className="dr-table-wrap"><table className="dr-table"><thead><tr><th><input type="checkbox" aria-label="Selecteer personen op deze pagina" checked={pageRows.length > 0 && pageRows.every(row => allowedSelected.includes(row.person.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...allowedSelected, ...pageRows.map(row => row.person.id)])] : allowedSelected.filter(id => !pageRows.some(row => row.person.id === id)))}/></th><th>Persoon</th><th>{all ? 'Kenmerken & functie' : 'Sponsorbedrijf'}</th><th>Bron</th><th>Account</th><th /></tr></thead><tbody>{pageRows.map(row => <tr key={row.person.id}><td><input type="checkbox" aria-label={`Selecteer ${row.person.name}`} checked={allowedSelected.includes(row.person.id)} onChange={e => setSelected(e.target.checked ? [...allowedSelected, row.person.id] : allowedSelected.filter(id => id !== row.person.id))}/></td><td><button className="dr-person-name" onClick={() => open(row)}><span className="dr-avatar">{initials(row.person.name)}</span><span><strong>{row.person.name}</strong><small>{row.person.email || 'Geen contactadres'}</small></span></button></td><td><div className="dr-labels">{all && row.profile.membership !== 'none' && <Badge tone="blue">{memberLabels[row.profile.membership]}</Badge>}{all && row.profile.labels.map(label => <Badge key={label}>{labels.find(l => l.id === label)?.name}</Badge>)}{row.sponsorIds.map(id => <Badge key={id}>{sponsorship.sponsors.find(s => s.id === id)?.name || 'Sponsorcontact'}</Badge>)}{all && row.committeeNames.slice(0, 2).map(name => <Badge key={name}>{name}</Badge>)}{!row.sponsorIds.length && !row.committeeNames.length && row.profile.membership === 'none' && !row.profile.labels.length && <small className="dr-hint">{row.person.role || 'Nog geen kenmerken'}</small>}</div></td><td><span className="dr-source">{row.profile.source === 'sportlink' ? <CloudDownload size={13}/> : row.profile.source === 'account' ? <Link2 size={13}/> : <UserRound size={13}/>} {row.profile.source === 'sportlink' ? 'Sportlink' : row.profile.source === 'account' ? 'Account' : 'Handmatig'}</span></td><td><AccountBadge row={row}/></td><td><div className="dr-actions">{!row.account && <button className="cms-button" onClick={() => beginInvite([row.person.id])} aria-label={`Nodig ${row.person.name} uit`}><Mail size={14}/></button>}<button className="cms-button" onClick={() => open(row)} aria-label={`Open dossier ${row.person.name}`}><ChevronRight size={15}/></button></div></td></tr>)}</tbody></table></div>
   {!filtered.length && <div className="dr-empty"><Search size={28}/><h3>Geen personen gevonden.</h3><p>Pas je filters aan of voeg een {all ? 'persoon' : 'sponsorcontact'} toe.</p></div>}<Pagination label="Personenregister" total={listing?.total||rows.length} page={listing?.page||page} pageSize={query.pageSize} onPageChange={setPage} onPageSizeChange={size=>{setPage(1);setQuery({pageSize:size,page:1});}}/>
  </section>
  <Note>Persoonsgegevens en accounttoegang zijn apart vastgelegd. Een gedeeld contactadres maakt personen niet tot hetzelfde account.</Note>
  {error && !person && !inviteIds && !importOpen && <Note error>{error}</Note>}
  {person && profile && personVisible && <Modal title={person.name || 'Nieuwe persoon'} description={all ? 'Eén dossier voor contact, lidmaatschap, relaties en account.' : 'Sponsorcontact beheren binnen jouw beperkte werkplek.'} onClose={close} wide>
   <nav className="dr-tabbar" aria-label="Onderdelen van het persoonsdossier">{([{ id: 'details', label: 'Gegevens' }, { id: 'membership', label: 'Lidmaatschap & teams' }, { id: 'functions', label: 'Functies' }, { id: 'relations', label: 'Relaties' }, { id: 'account', label: 'Account & uitnodigingen' }, { id: 'history', label: 'Historie' }] as const).filter(t => all || ['details', 'account'].includes(t.id)).map(t => <button key={t.id} aria-selected={dossierTab === t.id} onClick={() => { setDossierTab(t.id); setError(''); }}>{t.label}</button>)}</nav>
   {(dossierTab === 'details' || dossierTab === 'membership') && <form onSubmit={save}><div className="dr-grid">{dossierTab === 'details' ? <><Field label="Volledige naam *"><input required maxLength={150} value={person.name} onChange={e => setPerson({ ...person, name: e.target.value })}/></Field><Field label="Contact-e-mailadres" hint="Een contactadres staat los van het geverifieerde inlogadres."><input type="email" value={person.email} onChange={e => setPerson({ ...person, email: e.target.value })}/></Field><Field label="Telefoonnummer"><input type="tel" value={person.phone} onChange={e => setPerson({ ...person, phone: e.target.value })}/></Field>{all ? <><Field label="Geboortedatum"><input type="date" value={profile.birthDate} onChange={e => setProfile({ ...profile, birthDate: e.target.value })}/></Field><Field label="Adres"><input value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })}/></Field><Field label="Postcode"><input value={profile.postalCode} onChange={e => setProfile({ ...profile, postalCode: e.target.value })}/></Field><Field label="Plaats"><input value={profile.city} onChange={e => setProfile({ ...profile, city: e.target.value })}/></Field><Field label="Algemene functie / omschrijving"><input value={person.role} onChange={e => setPerson({ ...person, role: e.target.value })}/></Field></> : <Field label="Sponsorbedrijf *" hint="Deze koppeling geeft uitsluitend toegang tot sponsorcontactbeheer."><select required disabled={!!sponsorId || !!currentRow} value={newSponsorId} onChange={e => setNewSponsorId(e.target.value)}><option value="">Kies een bedrijf…</option>{sponsorship.sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}{all && currentRow && <div className="dr-inline dr-full"><Field label="Persoonscode" hint="De ledenadministratie kan deze code gericht delen voor een ouder/verzorger-koppelverzoek."><input readOnly value={familyCode} placeholder="Maak een nieuwe persoonscode" onFocus={e => e.target.select()}/></Field><button type="button" className="cms-button" onClick={copyPersonCode}><Copy size={14}/>Code kopiëren</button></div>}{person.sportlinkId && <div className="dr-inline-note dr-full"><CloudDownload size={17}/><span>Sportlink-referentie <b>{person.sportlinkId}</b>. Importupdates veranderen de account- en ouderkoppelingen niet.</span></div>}</> : <><Field label="Lidmaatschap"><select value={profile.membership} onChange={e => setProfile({ ...profile, membership: e.target.value as DirectoryProfile['membership'] })}>{Object.entries(memberLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="Persoonsstatus"><select value={profile.status} onChange={e => setProfile({ ...profile, status: e.target.value as DirectoryProfile['status'] })}>{Object.entries(personStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><div className="dr-section dr-full"><h3>Betrokken bij de club</h3><div className="dr-permissions">{labels.map(label => <label key={label.id} className="dr-check"><input type="checkbox" checked={profile.labels.includes(label.id)} onChange={e => setProfile({ ...profile, labels: e.target.checked ? [...profile.labels, label.id] : profile.labels.filter(id => id !== label.id) })}/><span>{label.name}</span></label>)}</div></div><div className="dr-section dr-full"><h3>Teams</h3><div className="dr-permissions">{state.settings.teams.map(team => <label className="dr-check" key={team.id}><input type="checkbox" checked={profile.teamIds.includes(team.id)} onChange={e => setProfile({ ...profile, teamIds: e.target.checked ? [...profile.teamIds, team.id] : profile.teamIds.filter(id => id !== team.id) })}/><span>{team.name}</span></label>)}</div></div><Note>Een gestopt lid kan nog steeds ouder, vrijwilliger of sponsorcontact zijn. Het beëindigen van een lidmaatschap sluit het account niet automatisch.</Note></>}</div>{error && <Note error>{error}</Note>}<div className="dr-modal-footer"><button type="button" className="cms-button" onClick={close}>Sluiten</button><button type="submit" className="cms-button primary"><Check size={15}/>Dossier opslaan</button></div></form>}
   {dossierTab === 'functions' && all && <div className="dr-section"><div className="dr-toolbar"><div><h3>Functies binnen de club</h3><p>Een functie en backofficerechten worden bewust afzonderlijk toegekend.</p></div><button className="cms-button" disabled={!currentRow} onClick={newAssignment}><Plus size={14}/>Functie toevoegen</button></div>{!currentRow && <Note>Sla de persoon eerst op om een clubfunctie toe te voegen.</Note>}{assignments.length ? <div className="dr-list">{assignments.map(a => <div className="dr-row" key={a.id}><span className="dr-row-main"><strong>{a.name || functionKinds[a.kind]}</strong><small>{functionKinds[a.kind]}{a.teamId ? ` · ${state.settings.teams.find(t => t.id === a.teamId)?.name || a.teamId}` : ''}{a.startsAt ? ` · vanaf ${date(a.startsAt)}` : ''}{a.endsAt ? ` · tot ${date(a.endsAt)}` : ''}</small></span><button className="cms-button" onClick={() => setAssignment(clone(a))}>Wijzigen</button><button className="cms-button danger" aria-label={`Verwijder functie ${a.name}`} onClick={async () => await transact(draft => { removeDirectoryAssignment(draft, userId, a.id); }, 'Clubfunctie verwijderd.')}><Trash2 size={14}/></button></div>)}</div> : <div className="dr-empty"><Users size={28}/><p>Nog geen aanvullende clubfuncties.</p></div>}{currentRow?.committeeNames.length ? <Note>Bestaande commissie-indeling: {currentRow.committeeNames.join(', ')}. De commissieledenlijst blijft gekoppeld aan dezelfde persoon.</Note> : null}</div>}
   {dossierTab === 'relations' && all && <div className="dr-section"><div className="dr-toolbar"><div><h3>Ouders, verzorgers en jeugdleden</h3><p>Iedere volwassene heeft een eigen koppeling en eigen rechten per kind.</p></div><button className="cms-button" disabled={!currentRow} onClick={newGuardian}><Plus size={14}/>Koppeling toevoegen</button></div>{!currentRow && <Note>Sla de persoon eerst op om relaties toe te voegen.</Note>}{parentLinks.length ? parentLinks.map(link => { const isGuardian = link.guardianPersonId === person.id; const other = state.people.find(p => p.id === (isGuardian ? link.childPersonId : link.guardianPersonId)); return <article className="dr-guardian-card" key={link.id}><div className="dr-row"><span className="dr-avatar">{initials(other?.name || '')}</span><span className="dr-row-main"><strong>{other?.name || 'Persoon niet beschikbaar'}</strong><small>{isGuardian ? 'Jeugdlid' : relationshipLabels[link.relationship]} · {link.status === 'approved' ? 'Goedgekeurde koppeling' : link.status === 'pending' ? 'Wacht op beoordeling' : 'Koppeling ingetrokken'}</small></span><Badge tone={link.status === 'approved' ? 'green' : link.status === 'pending' ? 'amber' : ''}>{link.status === 'approved' ? 'Actief' : link.status === 'pending' ? 'Ter beoordeling' : 'Ingetrokken'}</Badge></div><div className="dr-labels">{link.permissions.map(p => <Badge key={p}>{guardianPermissions.find(v => v.id === p)?.name}</Badge>)}</div><div className="dr-actions"><button className="cms-button" onClick={() => setGuardian(clone(link))}>Rechten wijzigen</button>{link.status === 'pending' && <button className="cms-button primary" onClick={async () => await transact(draft => { approveDirectoryGuardian(draft, userId, link.id, true); }, 'Ouder/verzorger-koppeling goedgekeurd.')}><Check size={14}/>Goedkeuren</button>}{link.status !== 'revoked' && <button className="cms-button danger" onClick={async () => await transact(draft => { approveDirectoryGuardian(draft, userId, link.id, false); }, 'Ouder/verzorger-koppeling ingetrokken.')}>Intrekken</button>}</div></article>; }) : <div className="dr-empty"><HeartHandshake size={30}/><h3>Iedere relatie een eigen plek.</h3><p>Een kind kan meerdere verzorgers hebben; een verzorger kan aan meerdere jeugdleden gekoppeld zijn.</p></div>}<Note>Een OTP-code bevestigt een mailbox. Alleen een bevoegde clubmedewerker kan een ouder/verzorger-koppeling goedkeuren. Ouders krijgen via deze koppeling geen inzage in de andere ouder of diens andere kinderen.</Note></div>}
   {dossierTab === 'account' && <div className="dr-section"><div className="dr-account-card"><ShieldCheck size={24}/><div><h3>{account ? 'Gekoppeld clubaccount' : 'Een account wanneer het nodig is.'}</h3><p>{account ? `${account.name} · ${account.email || 'Nog geen inlogadres'}` : 'Deze persoon kan zonder login in het register staan. Een uitnodiging maakt de activatiestappen beschikbaar.'}</p>{account && <div className="dr-labels"><Badge tone={account.active ? 'green' : 'red'}>{account.active ? 'Actief' : 'Geblokkeerd'}</Badge>{all && <Badge>{state.roles.find(r => r.id === account.roleId)?.name || 'Portaalgebruiker'}</Badge>}</div>}</div></div>{currentRow && !account && <button className="cms-button primary" onClick={() => beginInvite([person.id])}><Mail size={15}/>{currentRow.invitation && invitationStatus(currentRow.invitation) === 'pending' ? 'Nieuwe uitnodigingslink maken' : 'Uitnodiging voorbereiden'}</button>}{!currentRow && <Note>Sla de persoon eerst op om een uitnodiging te maken.</Note>}{all && !can('users') && account && <Note>Gebruikersbeheer beheert blokkeren en activeren van bestaande accounts. Je kunt vanuit dit register wel nieuwe portaaluitnodigingen voorbereiden.</Note>}{all && can('users') && account && <div className="dr-actions"><button className={`cms-button${account.active ? ' danger' : ''}`} onClick={async () => await transact(draft => { setDirectoryAccountActive(draft, userId, account.id, !account.active); }, account.active ? 'Account gedeactiveerd; historie blijft behouden.' : 'Account opnieuw geactiveerd.')}>{account.active ? 'Account deactiveren' : 'Account activeren'}</button>{can('users') && <a className="cms-button" href="/beheer#rollen">Globale rechten beheren <ArrowUpRight size={14}/></a>}</div>}{can('users') && all && currentRow && !account && <section className="dr-section"><h4>Een bestaand account koppelen</h4><p className="dr-hint">Controleer de identiteit van de persoon. Een eenvoudig accountprofiel kan na je expliciete keuze worden overgezet naar dit dossier. Het eerdere lege profiel wordt gearchiveerd en accountrechten blijven gelijk. Uitgewerkte dossiers worden niet automatisch samengevoegd.</p><div className="dr-inline"><select aria-label="Bestaand clubaccount koppelen" value={boundUser} onChange={e => setBoundUser(e.target.value)}><option value="">Kies een bestaand account…</option>{state.members.map(m => { const linked = state.people.find(p => p.id !== person.id && (p.backofficeUserId === m.id || p.id === m.personId)); const placeholder = linked?.id === `person-account-${m.id}`; return <option key={m.id} value={m.id} disabled={!!linked && !placeholder}>{m.name} · {m.email || 'Geen inlogadres'}{!m.active ? ' · inactief' : ''}{linked ? (placeholder ? ' · eenvoudig accountprofiel overzetten' : ' · heeft al een uitgewerkt persoonsdossier') : ''}</option>; })}</select><button className="cms-button" disabled={!boundUser} onClick={async () => await transact(draft => { bindDirectoryAccount(draft, userId, person.id, boundUser); }, 'Persoon en bestaand account gekoppeld.')}><Link2 size={14}/>Koppelen</button></div></section>}
    <h4>Uitnodigingshistorie</h4>{dossierInvites.length ? dossierInvites.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(invite => <article className="dr-invite-card" key={invite.id}><div className="dr-row"><span className="dr-row-main"><strong>{invite.email}</strong><small>{invite.scope === 'sponsor' ? `Sponsorcontact · ${sponsorship.sponsors.find(s => s.id === invite.sponsorId)?.name || 'Bedrijf'}` : 'Duindorp SV-portaal'} · geldig tot {stamp(invite.expiresAt)}</small></span><Badge tone={invitationStatus(invite) === 'pending' ? 'blue' : ''}>{invitationLabels[invitationStatus(invite)]}</Badge></div>{invitationStatus(invite) === 'pending' && <><p className="dr-hint">De persoonlijke link is per e-mail verstuurd en wordt hier niet opgeslagen.</p><button className="cms-button danger" onClick={async () => await transact(draft => { revokeDirectoryInvitation(draft, userId, invite.id); }, 'Uitnodiging ingetrokken.')}>Uitnodiging intrekken</button></>}</article>) : <p className="dr-hint">Nog geen uitnodiging vastgelegd.</p>}{error && <Note error>{error}</Note>}</div>}
   {dossierTab === 'history' && all && <div className="dr-section"><h3>Wijzigingen in dit dossier</h3><div className="dr-timeline">{directory.events.filter(event => event.personId === person.id).slice().sort((a, b) => b.at.localeCompare(a.at)).map(event => <div key={event.id}><History size={15}/><span><strong>{event.action}</strong><small>{stamp(event.at)}</small></span></div>)}</div>{!directory.events.some(event => event.personId === person.id) && <div className="dr-empty"><History size={28}/><p>Nieuwe wijzigingen verschijnen hier.</p></div>}</div>}
  </Modal>}
  {inviteIds && <Modal title={createdInvites.length ? 'Uitnodigingen verzonden' : 'Uitnodiging voorbereiden'} description="Een persoonlijke activatielink met OTP-stap, binnen hetzelfde gebruikersregister." onClose={() => { setInviteIds(null); setCreatedInvites([]); setError(''); }} wide>
   {createdInvites.length ? <Note>De uitnodigingen zijn door de mailvoorziening geaccepteerd. De persoonlijke links blijven 72 uur geldig.</Note> : <form onSubmit={invite}><Note>Controleer voor iedere persoon het bedoelde eigen inlogadres. Jeugdleden kunnen zonder account via hun ouders/verzorgers worden vertegenwoordigd.</Note>{all && !sponsorId && <Field label="Toegang na activatie"><select value={inviteScope} onChange={e => setInviteScope(e.target.value as 'club' | 'sponsor')}><option value="club">Duindorp SV-portaal · bestaande clubrelaties</option><option value="sponsor">Sponsorportaal · specifieke bedrijfsrechten</option></select></Field>}{rows.filter(row => inviteIds.includes(row.person.id)).map(row => <div className="dr-invite-card" key={row.person.id}><div className="dr-row"><span className="dr-avatar">{initials(row.person.name)}</span><span className="dr-row-main"><strong>{row.person.name}</strong><small>Persoonsreferentie blijft behouden</small></span></div><div className="dr-grid"><Field label="Bedoeld inlogadres *"><input required type="email" value={inviteEmails[row.person.id] || ''} onChange={e => setInviteEmails({ ...inviteEmails, [row.person.id]: e.target.value })}/></Field>{inviteScope === 'sponsor' && <Field label="Sponsorbedrijf *"><select required value={inviteSponsors[row.person.id] || ''} onChange={e => setInviteSponsors({ ...inviteSponsors, [row.person.id]: e.target.value })}><option value="">Kies een gekoppeld bedrijf…</option>{sponsorship.sponsors.filter(s => all || row.sponsorIds.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}</div></div>)}{inviteScope === 'sponsor' && <div className="dr-section"><h4>Bedrijfsrechten na activatie</h4><div className="dr-permissions">{contactRoles.map(role => <label className="dr-check" key={role.id}><input type="checkbox" checked={inviteRoleIds.includes(role.id)} onChange={e => setInviteRoleIds(e.target.checked ? [...inviteRoleIds, role.id] : inviteRoleIds.filter(id => id !== role.id))}/><span>{role.name}</span></label>)}</div><p className="dr-hint">Deze uitnodiging geeft geen backofficerechten of toegang tot andere bedrijven.</p></div>}{error && <Note error>{error}</Note>}<div className="dr-modal-footer"><button type="button" className="cms-button" onClick={() => setInviteIds(null)}>Annuleren</button><button className="cms-button primary" disabled={inviteScope === 'sponsor' && !inviteRoleIds.length}><Mail size={15}/>Uitnodiging{inviteIds.length > 1 ? 'en' : ''} klaarzetten</button></div></form>}
  </Modal>}
  {guardian && all && <Modal title="Ouder/verzorger koppelen" description="Een afzonderlijke relatie met eigen rechten voor dit jeugdlid." onClose={() => { setGuardian(null); setError(''); }}><form onSubmit={saveGuardian}><div className="dr-grid"><Field label="Ouder/verzorger *"><DirectoryPersonPicker value={guardian.guardianPersonId} onChange={value=>setGuardian({...guardian,guardianPersonId:value})}/></Field><Field label="Jeugdlid *"><select required value={guardian.childPersonId} onChange={e => setGuardian({ ...guardian, childPersonId: e.target.value })}><option value="">Kies een jeugdlid…</option>{rows.filter(r => r.person.id !== guardian.guardianPersonId).map(r => <option key={r.person.id} value={r.person.id}>{r.person.name}</option>)}</select></Field><Field label="Relatie"><select value={guardian.relationship} onChange={e => setGuardian({ ...guardian, relationship: e.target.value as DirectoryGuardian['relationship'] })}>{Object.entries(relationshipLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field></div><div className="dr-section"><h4>Toegestane acties voor dit kind</h4><div className="dr-permissions">{guardianPermissions.map(permission => <label className="dr-check" key={permission.id}><input type="checkbox" checked={guardian.permissions.includes(permission.id)} onChange={e => setGuardian({ ...guardian, permissions: e.target.checked ? [...guardian.permissions, permission.id] : guardian.permissions.filter(id => id !== permission.id) })}/><span><strong>{permission.name}</strong><small>{permission.description}</small></span></label>)}</div></div><Note>Na opslaan kan een bevoegde registerbeheerder de koppeling goedkeuren. De rechten gelden uitsluitend voor deze combinatie van ouder/verzorger en kind.</Note>{error && <Note error>{error}</Note>}<div className="dr-modal-footer"><button type="button" className="cms-button" onClick={() => setGuardian(null)}>Annuleren</button><button className="cms-button primary"><Link2 size={15}/>Koppeling opslaan</button></div></form></Modal>}
  {assignment && all && <Modal title="Een clubfunctie vastleggen" description="Koppel een rol aan de persoon, eventueel binnen een team of commissie." onClose={() => { setAssignment(null); setError(''); }}><form onSubmit={saveFunction}><div className="dr-grid"><Field label="Functietype"><select value={assignment.kind} onChange={e => setAssignment({ ...assignment, kind: e.target.value as DirectoryAssignment['kind'] })}>{Object.entries(functionKinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="Functienaam *"><input required value={assignment.name} onChange={e => setAssignment({ ...assignment, name: e.target.value })} placeholder="Bijvoorbeeld lid sponsorcommissie"/></Field><Field label="Commissie"><select value={assignment.committeeId} onChange={e => setAssignment({ ...assignment, committeeId: e.target.value })}><option value="">Geen commissie</option>{state.planning.committees.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Team"><select value={assignment.teamId} onChange={e => setAssignment({ ...assignment, teamId: e.target.value })}><option value="">Clubbreed</option>{state.settings.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Vanaf"><input type="date" value={assignment.startsAt} onChange={e => setAssignment({ ...assignment, startsAt: e.target.value })}/></Field><Field label="Tot en met"><input type="date" value={assignment.endsAt} onChange={e => setAssignment({ ...assignment, endsAt: e.target.value })}/></Field></div><Note>Deze functie geeft op zichzelf geen backofficerechten. Globale accountrechten beheert de bevoegde beheerder apart.</Note>{error && <Note error>{error}</Note>}<div className="dr-modal-footer"><button type="button" className="cms-button" onClick={() => setAssignment(null)}>Annuleren</button><button className="cms-button primary"><Check size={15}/>Functie opslaan</button></div></form></Modal>}
  {importOpen && all && <DirectoryImportPanel onClose={()=>setImportOpen(false)}/>}
 </div>;
}

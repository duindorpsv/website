'use client';
import {useDialogFocusReturn} from './cms/dialog-focus';
import { useEffect, useMemo, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, CreditCard, FileCheck2, FileText, ImagePlus, LayoutDashboard, Mail, MapPin, MessageCircle, ShieldCheck, Sparkles, Upload, UserRound, Users, X } from 'lucide-react';
import { useCMS } from './cms/sponsor-workspace-provider';
import { acceptSponsorProposal, calculateSponsorTotals, cancelSponsorEvent, getSponsorAgreementHtml, getSponsorInvoiceHtml, getSponsorInvoiceTotals, getSponsorReminders, money, readSponsorship, registerSponsorEvent, requestSponsorProfile, canRequestSponsorBusinessChange, getSponsorBusinessDetails, getSponsorBusinessReadiness, requestSponsorBusinessChange, saveSponsorMaterial, trySignSponsorAgreement, requestSponsorSigningCode, simulateSponsorPayment, sponsorMemberships } from '@/lib/cms/sponsorship';
import type { SponsorAgreement, SponsorBusinessDetails, SponsorLine, SponsorProfile, SponsorProposalSnapshot, SponsorTotals } from '@/lib/cms/sponsorship-types';
import { SponsorBusinessForm, sponsorBusinessFields, sponsorBusinessFieldValue } from './cms/sponsor-business-form';
import { downloadSponsorAgreementPdf } from '@/lib/cms/sponsor-pdf';
import './sponsor-portal.css';
import {authClient} from '@/lib/auth-client';
type Tab = 'overview' | 'agreements' | 'invoices' | 'materials' | 'company' | 'events';
const tabs: {
    id: Tab;
    label: string;
    icon: typeof FileText;
}[] = [{ id: 'overview', label: 'Overzicht', icon: LayoutDashboard }, { id: 'agreements', label: 'Overeenkomsten', icon: FileCheck2 }, { id: 'invoices', label: 'Facturen', icon: CreditCard }, { id: 'materials', label: 'Materialen', icon: ImagePlus }, { id: 'company', label: 'Mijn bedrijf', icon: Building2 }, { id: 'events', label: 'Clubmomenten', icon: CalendarDays }];
const roleLabel = { signer: 'Ondertekenen', billing: 'Financiën', marketing: 'Communicatie & materiaal' };
const statusLabel: Record<string, string> = { 'awaiting-signature': 'Wacht op jouw handtekening', 'awaiting-club-signature': 'Wacht op ondertekening club', signed: 'Ondertekend', cancelled: 'Geannuleerd', open: 'Openstaand', paid: 'Betaald', draft: 'Concept', sent: 'Voorstel ontvangen', accepted: 'Geaccepteerd', converted: 'Overeenkomst gemaakt', declined: 'Afgewezen', pending: 'In beoordeling', approved: 'Goedgekeurd', rejected: 'Niet overgenomen', done: 'Uitgevoerd', 'in-progress': 'In uitvoering' };
const taxLabel: Record<string, string> = { '21': '21%', '9': '9%', '0': '0%', exempt: 'Vrijgesteld' };
const date = (value: string) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '—';
const shortDate = (value: string) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '—';
const time = (value: string) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const safeLink = (value: string) => /^(https:\/\/|\/(?!\/))[^\s<>"\\]*$/i.test(value);
function Pill({ status, children }: {
    status: string;
    children?: ReactNode;
}) { return <span className={`sp-pill ${status}`}>{children || statusLabel[status] || status}</span>; }
function Modal({ title, description, children, onClose, wide = false }: {
    title: string;
    description: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
}) { const focusReturn=useDialogFocusReturn(); return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="sp-overlay"/><Dialog.Content {...focusReturn} className={`sp-modal${wide ? ' wide' : ''}`}><header><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className="sp-close" aria-label="Venster sluiten"><X size={21}/></Dialog.Close></header><div className="sp-modal-body">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>; }
function Empty({ icon: Icon = FileText, title, children }: {
    icon?: typeof FileText;
    title: string;
    children: ReactNode;
}) { return <div className="sp-empty"><Icon size={30}/><h3>{title}</h3><p>{children}</p></div>; }
function DocumentLines({ lines, discountCents = 0, totals }: {
    lines: SponsorLine[];
    discountCents?: number;
    totals?: SponsorTotals;
}) { const total = totals || calculateSponsorTotals(lines, discountCents); return <><div className="sp-doc-scroll"><table className="sp-doc-lines"><thead><tr><th>Afspraak</th><th>Aantal</th><th>Bedrag excl.</th><th>Btw</th></tr></thead><tbody>{lines.map(line => <tr key={line.id}><td><strong>{line.name}</strong>{line.description && <small>{line.description}</small>}</td><td>{line.quantity}</td><td>{money(line.unitPriceCents * line.quantity)}</td><td>{taxLabel[line.taxRate]}</td></tr>)}</tbody></table></div><dl className="sp-doc-totals"><div><dt>Subtotaal excl. btw</dt><dd>{money(total.subtotalCents)}</dd></div>{total.discountCents > 0 && <div><dt>Pakketkorting / afspraak</dt><dd>− {money(total.discountCents)}</dd></div>}{total.taxGroups.map(group => <div key={group.taxRate}><dt>{group.taxRate === 'exempt' ? 'Vrijgestelde onderdelen' : `Btw ${taxLabel[group.taxRate]}`}</dt><dd>{group.taxRate === 'exempt' ? 'Vrijgesteld' : money(group.taxCents)}</dd></div>)}<div className="sp-doc-total"><dt>Totaal incl. btw</dt><dd>{money(total.totalCents)}</dd></div></dl></>; }
function SnapshotDocument({ snapshot, number, version, agreement }: {
    snapshot: SponsorProposalSnapshot;
    number: string;
    version?: number;
    agreement?: SponsorAgreement;
}) {
    const company = snapshot.contract?.company;
    return <article className="sp-document">
  <div className="sp-doc-head"><img src="/assets/logo.png" alt="Duindorp SV"/><div><span className="sp-eyebrow">ONZE WIJK. ONZE CLUB. ONZE TROTS.</span><h2>{number}</h2><p>{snapshot.contract?.title || snapshot.name}{version ? ` · versie ${version}` : ''}</p></div></div>
  <div className="sp-fields sp-doc-parties"><div><small>De vereniging</small><strong>Duindorp SV</strong><p>Sportpark Houtrust · Houtrustlaan 1 · 2566 ZW Den Haag</p></div><div><small>De sponsor</small><strong>{company?.legalName || snapshot.sponsorName}</strong><p>{snapshot.sponsorAddress}<br />{snapshot.sponsorEmail}{company && <><br />{company.registrationExempt ? 'Geen KVK-inschrijving' : `KVK ${company.companyNumber}`}{company.vatNumber && <> · Btw {company.vatNumber}</>}</>}</p></div></div>
  <div className="sp-doc-period"><span><small>Seizoen</small><b>{snapshot.season}</b></span><span><small>Looptijd</small><b>{date(snapshot.startDate)} – {date(snapshot.endDate)}</b></span>{snapshot.contract && <span><small>Vastgelegde template</small><b>{snapshot.contract.templateName} · v{snapshot.contract.templateVersion}</b></span>}</div>
  <DocumentLines lines={snapshot.lines} discountCents={snapshot.discountCents}/>
  {snapshot.contract ? <section className="sp-doc-clauses"><h3>Afspraken tussen club en sponsor</h3><div>{snapshot.contract.body}</div></section> : <><h3>Betalingsafspraken</h3><p className="sp-doc-terms">{snapshot.paymentTerms}</p><h3>Voorwaarden en tegenprestaties</h3><p className="sp-doc-terms">{snapshot.terms}</p></>}
  {agreement && <><div className="sp-signature"><ShieldCheck size={23}/><div><h3>{agreement.status === 'signed' ? (agreement.signingMode === 'dual-email-otp' ? 'Beide partijen hebben ondertekend' : 'Vastgelegde ondertekening') : agreement.status === 'awaiting-club-signature' ? 'De sponsor heeft getekend. De club is aan zet.' : 'Deze versie ligt klaar ter ondertekening'}</h3><p>Documentversie {agreement.version} · vastgelegd op {date(agreement.createdAt)}</p><small>Controlewaarde: {agreement.documentHash}</small></div></div>{agreement.signatures.map(signature => <div className="sp-signature-entry" key={signature.id}><strong>{signature.party === 'club' ? 'Namens Duindorp SV' : 'Namens de sponsor'} · {signature.name}</strong><span>{signature.function}</span><span>{date(signature.at)} om {time(signature.at)}</span><small>Verificatie: eenmalige e-mailcode{signature.email && ` · ${signature.email}`} · IP-adres: {signature.ipAddress}</small><small>Expliciete instemming en afzonderlijke e-mailverificatie vastgelegd</small></div>)}</>}
  <p className="sp-doc-disclaimer">Deze vastgelegde documentversie blijft bewaard met de afzonderlijke verificatiebewijzen.</p>
 </article>;
}
function BusinessValue({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <div className="sp-business-value"><dt>{label}</dt><dd>{children || 'Nog niet ingevuld'}</dd></div>; }
function BusinessSummary({ details }: {
    details: SponsorBusinessDetails;
}) {
    return <dl className="sp-business-details">
 <BusinessValue label="Statutaire bedrijfsnaam">{details.legalName}</BusinessValue><BusinessValue label="KVK">{details.registrationExempt ? `Geen inschrijving · ${details.registrationExemptionReason}` : details.companyNumber}</BusinessValue>
 <BusinessValue label="Vestigingsadres">{[details.address, `${details.postalCode} ${details.city}`.trim(), sponsorBusinessFieldValue(details, 'country')].filter(Boolean).join(', ')}</BusinessValue><BusinessValue label="Btw">{details.vatStatus === 'registered' ? details.vatNumber : details.vatStatus === 'exempt' ? 'Vrijgesteld' : 'Niet van toepassing'}</BusinessValue>
 <BusinessValue label="Contactpersoon">{[details.contactName, details.contactFunction].filter(Boolean).join(' · ')}</BusinessValue><BusinessValue label="Contact-e-mailadres">{details.contactEmail}</BusinessValue><BusinessValue label="Factuur-e-mailadres">{details.invoiceEmail}</BusinessValue><BusinessValue label="Telefoonnummer">{details.phone}</BusinessValue>
 </dl>;
}
export function SponsorPortal() {
    const { state, ready, update, currentUser, userId, can, query, setQuery, contextSignal, request, reload, notificationReadIds, notify, notice, storageError } = useCMS();
    const data = useMemo(() => readSponsorship(state), [state]);
    const links = sponsorMemberships(state, userId);
    const companyId=query.companyId;const setCompanyId=(id:string)=>setQuery({companyId:id});
    const sponsor = data.sponsors.find(company => company.id === companyId && links.some(link => link.sponsorId === company.id)) || data.sponsors.find(company => links.some(link => link.sponsorId === company.id));
    const membership = links.find(link => link.sponsorId === sponsor?.id);
    const accessContext = `${userId}|${sponsor?.id || ''}|${membership?.roles.slice().sort().join(',') || ''}`;
    const accessContextRef = useRef(accessContext), accessRevisionRef = useRef(0);
    if (accessContextRef.current !== accessContext) {
        accessContextRef.current = accessContext;
        accessRevisionRef.current += 1;
    }
    const [viewContext, setViewContext] = useState(accessContext);
    const contextReady = viewContext === accessContext;
    const [tab, setTab] = useState<Tab>('overview');
    const [modal, setModal] = useState<'agreement' | 'proposal' | 'invoice' | 'notifications' | 'business' | null>(null);
    const [documentId, setDocumentId] = useState('');
    const [name, setName] = useState(''), [job, setJob] = useState(''), [consent, setConsent] = useState(false), [code, setCode] = useState(''), [verificationRequested, setVerificationRequested] = useState(false);
    const [error, setError] = useState('');
    const [signingChallenge, setSigningChallenge] = useState<{
        id: string;
        emailHint: string;
        expiresAt: string;
    } | null>(null);
    const [businessDraft, setBusinessDraft] = useState<SponsorBusinessDetails | null>(null), [businessReason, setBusinessReason] = useState(''), [businessConsent, setBusinessConsent] = useState(false), [pdfBusy, setPdfBusy] = useState(false);
    const [profile, setProfile] = useState<SponsorProfile>({ name: '', description: '', website: '', logoUrl: '' });
    const [materialNote, setMaterialNote] = useState(''), [proofUrl, setProofUrl] = useState('');
    const [readIds, setReadIds] = useState<string[]>([]);
    const [eventGuests, setEventGuests] = useState<Record<string, number>>({});
    useEffect(()=>{setReadIds(notificationReadIds||[]);},[notificationReadIds]);
    useEffect(() => { setBusinessDraft(null); setBusinessReason(''); setBusinessConsent(false); setPdfBusy(false); setSigningChallenge(null); setProfile(sponsor ? { ...sponsor.publicProfile } : { name: '', description: '', website: '', logoUrl: '' }); setError(''); setModal(null); setDocumentId(''); setName(''); setJob(''); setCode(''); setConsent(false); setVerificationRequested(false); setMaterialNote(''); setProofUrl(''); setEventGuests({}); setViewContext(accessContext); }, [accessContext]);
    // Portal actions follow the actual company contact roles. A committee permission
    // grants backoffice access, not authority to act as a sponsor in this workspace.
    const signer = !!membership?.roles.includes('signer');
    const billing = !!membership?.roles.includes('billing');
    const marketing = !!membership?.roles.includes('marketing');
    const agreements = data.agreements.filter(row => row.sponsorId === sponsor?.id);
    const proposals = data.proposals.filter(row => row.sponsorId === sponsor?.id && row.status !== 'draft');
    const invoices = billing ? data.invoices.filter(row => row.sponsorId === sponsor?.id) : [];
    const tasks = data.tasks.filter(row => row.sponsorId === sponsor?.id && row.visibleToSponsor);
    const activities = data.activities.filter(row => row.sponsorId === sponsor?.id && !row.internal).slice().sort((a, b) => b.at.localeCompare(a.at));
    const requests = data.profileRequests.filter(row => row.sponsorId === sponsor?.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reminders = getSponsorReminders(state).filter(row => row.sponsorId === sponsor?.id && (billing || row.kind !== 'invoice') && (row.kind !== 'task' || tasks.some(task => task.id === row.referenceId)));
    const unread = reminders.filter(row => !readIds.includes(row.id));
    const activeAgreements = agreements.filter(row => row.status === 'signed' && row.snapshot.startDate <= new Date().toISOString().slice(0, 10) && row.snapshot.endDate >= new Date().toISOString().slice(0, 10));
    const awaiting = agreements.filter(row => row.status === 'awaiting-signature');
    const unpaid = invoices.filter(row => row.status === 'open');
    const complete = tasks.filter(row => row.status === 'done').length;
    const selectedAgreement = agreements.find(row => row.id === documentId);
    const selectedProposal = proposals.find(row => row.id === documentId);
    const selectedInvoice = invoices.find(row => row.id === documentId);
    const pendingProfile = requests.find(row => row.status === 'pending');
    const business = sponsor ? getSponsorBusinessDetails(sponsor) : null;
    const businessReadiness = sponsor ? getSponsorBusinessReadiness(sponsor) : { complete: false, confirmed: false, missing: [] as string[] };
    const businessRequests = (data.businessChangeRequests || []).filter(row => row.sponsorId === sponsor?.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pendingBusiness = businessRequests.find(row => row.status === 'pending');
    const mayRequestBusiness = !!membership && (signer || billing) && !!sponsor && canRequestSponsorBusinessChange(state, userId, sponsor.id);
    const hasBackoffice = can('sponsors') || can('users') || can('news') || can('pages') || can('people');
    async function action(recipe: (draft: typeof state) => void, message: string) {
        setError('');
        let failure: unknown;
        const saved = await update(draft => {
            try {
                recipe(draft);
            }
            catch (reason) {
                failure = reason;
                throw reason;
            }
        }, message);
        if (!saved) {
            setError(failure instanceof Error ? failure.message : 'Opslaan is niet gelukt. Probeer opnieuw.');
            return false;
        }
        notify(message);
        return true;
    }
    function openAgreement(agreement: SponsorAgreement) { setDocumentId(agreement.id); setModal('agreement'); setSigningChallenge(null); setName(currentUser?.name || ''); setJob(''); setConsent(false); setCode(''); setVerificationRequested(false); setError(''); }
    async function transferDocument(kind:'agreement'|'invoice',id:string,printing:boolean){
 const signal=contextSignal(),context=accessContext,popup=printing?window.open('','_blank'):null;if(popup)popup.opener=null;setError('');
 try{const response=await fetch('/api/sponsorship/'+(kind==='agreement'?'agreements':'invoices')+'/'+encodeURIComponent(id)+'/pdf',{cache:'no-store',signal});if(!response.ok){const issue=await response.json();throw Error(issue.message||'Document downloaden is mislukt.');}const blob=await response.blob();if(signal.aborted||accessContextRef.current!==context){popup?.close();return;}const url=URL.createObjectURL(blob);if(popup)popup.location.href=url;else{const link=document.createElement('a');link.href=url;link.download='Duindorp-SV-'+(kind==='invoice'?'Factuur':'Overeenkomst')+'.pdf';link.click();}setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){popup?.close();if(!signal.aborted)setError(e instanceof Error?e.message:'Document openen is mislukt.');}
 }
    async function printDocument(kind:'agreement'|'invoice',id:string){return transferDocument(kind,id,true);}
    async function downloadDocument(kind:'agreement'|'invoice',id:string){return transferDocument(kind,id,false);}
    function openBusinessRequest() {
        if (!sponsor || !mayRequestBusiness)
            return;
        const previous = businessRequests.find(row => row.status === 'pending' && row.userId === userId);
        setBusinessDraft(structuredClone(previous?.details || getSponsorBusinessDetails(sponsor)));
        setBusinessReason(previous?.reason || '');
        setBusinessConsent(false);
        setError('');
        setModal('business');
    }
    async function submitBusiness(event: FormEvent) {
        event.preventDefault();
        if (!sponsor || !businessDraft || !mayRequestBusiness)
            return;
        if (!businessConsent) {
            setError('Bevestig dat de commissie deze wijziging mag beoordelen.');
            return;
        }
        if (await action(draft => { requestSponsorBusinessChange(draft, userId, sponsor.id, businessDraft, businessReason); }, 'Wijzigingsvoorstel opgeslagen. De sponsorcommissie beoordeelt je bedrijfsgegevens.')) {
            setModal(null);
            setTab('company');
            setBusinessDraft(null);
            setBusinessReason('');
            setBusinessConsent(false);
        }
    }
    async function downloadAgreement(id: string) {
        const context = accessContext, revision = accessRevisionRef.current, signal=contextSignal();
        setError('');
        setPdfBusy(true);
        try {
            await downloadSponsorAgreementPdf(state, userId, id, {signal,shouldDownload: () => !signal.aborted&&accessContextRef.current === context && accessRevisionRef.current === revision });
        }
        catch (reason) {
            if (accessContextRef.current === context)
                setError(reason instanceof Error ? reason.message : 'De PDF kon niet worden gemaakt.');
        }
        finally {
            if (accessContextRef.current === context)
                setPdfBusy(false);
        }
    }
    async function requestSigningCode() {
        if (!selectedAgreement || !signer)
            return;
        let challenge: {
            id: string;
            emailHint: string;
            expiresAt: string;
        } | undefined;
        if (await action(draft => { challenge = requestSponsorSigningCode(draft, userId, selectedAgreement.id, 'sponsor'); }, 'Je persoonlijke ondertekeningscode is per e-mail verzonden.')) {
            setSigningChallenge(challenge || null);
            setVerificationRequested(true);
            setCode('');
        }
    }
    async function sign(event: FormEvent) {
        event.preventDefault();
        if (!selectedAgreement || !signer)
            return;
        setError('');
        let result: {
            ok: boolean;
            error?: string;
        } = { ok: false, error: 'De ondertekening kon niet worden verwerkt.' };
        const saved = await update(draft => { result = trySignSponsorAgreement(draft, userId, selectedAgreement.id, { name: currentUser?.name || name, function: job, consent, verificationCode: code, challengeId: signingChallenge?.id }); }, 'Verificatie voor sponsorondertekening verwerkt');
        if (!saved) {
            setError('De ondertekening kon niet worden opgeslagen. Probeer opnieuw.');
            return;
        }
        if (!result.ok) {
            setError(result.error || 'Controleer de verificatiecode.');
            return;
        }
        notify('Jouw ondertekening is vastgelegd. De sponsorcommissie ondertekent daarna namens de club.');
        setModal(null);
        setVerificationRequested(false);
        setSigningChallenge(null);
    }
    async function uploadLogo(file:File|undefined){if(!file||!sponsor||!marketing)return;setError('');if(file.size>15*1024*1024){setError('Kies een logo van maximaal 15 MB.');return;}const context=accessContext,signal=contextSignal();try{const response=await fetch('/api/sponsorship/companies/'+encodeURIComponent(sponsor.id)+'/materials',{method:'POST',signal,headers:{'Content-Type':file.type,'X-File-Name':file.name.replace(/[^a-zA-Z0-9._ -]/g,'_')},body:file});const result=await response.json();if(!response.ok)throw new Error(result.message||'Uploaden is mislukt.');if(!signal.aborted&&accessContextRef.current===context)setProfile(current=>({...current,logoUrl:'/api/sponsorship/logos/'+result.id}));}catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:'Uploaden is mislukt.');}}
    async function submitProfile(event: FormEvent) {
        event.preventDefault();
        if (!sponsor || !marketing)
            return;
        if (await action(draft => { requestSponsorProfile(draft, userId, sponsor.id, profile); }, 'Wijzigingsvoorstel opgeslagen. De commissie beoordeelt je bedrijfsprofiel.'))
            setTab('company');
    }
    async function readNotifications(){if(!sponsor)return;try{await request('/api/sponsorship/notifications',{companyId:sponsor.id,ids:reminders.map(r=>r.id)});setReadIds([...new Set([...readIds,...reminders.map(r=>r.id)])]);}catch(e){setError(e instanceof Error?e.message:'Meldingen opslaan is mislukt.');}}
    return <div className="sp-portal"><header className="sp-header"><a className="sp-brand" href="/clubmuur"><img src="/assets/logo.png" alt="Duindorp SV"/><span>DUINDORP SV<small>MIJN SPONSORING</small></span></a><div className="sp-header-actions"><a className="sp-btn ghost small" href="/portaal">Mijn club <ArrowUpRight size={15}/></a>{!currentUser && <a className="sp-btn small" href="/portaal/inloggen">Inloggen</a>}{hasBackoffice && <a className="sp-btn ghost small" href="/beheer#sponsoring"><ArrowLeft size={15}/>Clubbeheer</a>}<span className="sp-account"><UserRound size={14}/>{currentUser?.name}<button className="sp-btn small" onClick={async()=>{await authClient.signOut();location.assign("/portaal/inloggen");}}>Uitloggen</button></span><button className="sp-notification-button" onClick={() => { setModal('notifications'); setError(''); }} aria-label={`${unread.length} ongelezen meldingen`}><Bell size={20}/>{unread.length > 0 && <i>{unread.length}</i>}</button></div></header>
 <div className="sp-demo-note"><ShieldCheck size={15}/><span>Je persoonlijke sponsoromgeving · toegang per bedrijf en contactrol.</span></div>
 <main className="sp-main">{!ready || !contextReady ? <Empty icon={Clock3} title="Je sponsoromgeving wordt geladen">Een moment, we halen je persoonlijke werkplek op.</Empty> : !sponsor ? <section className="sp-card sp-welcome-empty"><span className="sp-eyebrow">EEN VERBINDING MET ONZE CLUB</span><h1>Welkom, {currentUser?.name?.split(' ')[0] || 'clubgenoot'}.</h1><p>Aan deze gebruiker is nog geen sponsorbedrijf gekoppeld. De sponsorcommissie beheert bedrijfstoegang vanuit het centrale gebruikersregister.</p><div className="sp-actions">{!currentUser && <a className="sp-btn primary" href="/portaal/inloggen">Inloggen in Mijn Duindorp <ArrowRight size={16}/></a>}<a className="sp-btn" href="/portaal">Naar Mijn Duindorp</a>{hasBackoffice && <a className="sp-btn" href="/beheer#sponsoring">Naar sponsorbeheer</a>}</div><div className="sp-empty-annotation"><ShieldCheck size={18}/><span>Een clubaccount krijgt alleen toegang tot een sponsorbedrijf na een gerichte bedrijfskoppeling.</span></div></section> : <>
 <div className="sp-companybar"><span><Building2 size={16}/>{sponsor.name}</span>{links.length > 1 && <label>Bedrijf<select value={sponsor.id} onChange={event => setCompanyId(event.target.value)}>{data.sponsors.filter(company => links.some(link => link.sponsorId === company.id)).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}<span className="sp-member-roles">{membership?.roles.map(role => <span key={role}>{roleLabel[role]}</span>)}</span></div>
 <section className="sp-hero"><div className="sp-hero-copy"><span className="sp-eyebrow">SAMEN ZIJN WE DUINDORP</span><h1>Mooi dat je<br />erbij bent, <em>{currentUser?.name?.split(' ')[0] || 'partner'}.</em></h1><p>Jouw bijdrage maakt het verschil. Hier regelen we onze samenwerking, van de eerste handtekening tot jouw plek langs de lijn.</p><div className="sp-hero-metrics"><span><b>{activeAgreements.length}</b><small>actieve samenwerking{activeAgreements.length === 1 ? '' : 'en'}</small></span><span><b>{complete}/{tasks.length}</b><small>afspraken uitgevoerd</small></span><span><b>{state.settings.season}</b><small>ons clubseizoen</small></span></div></div><div className="sp-hero-mark"><img src={sponsor.publicProfile.logoUrl || '/assets/logo.png'} alt={sponsor.publicProfile.name || sponsor.name}/><span>PARTNER VAN<br /><b>ONZE TROTS.</b></span></div></section>
 <nav className="sp-nav" aria-label="Mijn sponsoring">{tabs.map(item => <button className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} key={item.id} onClick={() => { setTab(item.id); setError(''); }}><item.icon size={17}/>{item.label}{item.id === 'agreements' && awaiting.length > 0 && <i>{awaiting.length}</i>}{item.id === 'invoices' && unpaid.length > 0 && <i>{unpaid.length}</i>}</button>)}</nav>
 {storageError && <p className="sp-error" role="alert">{storageError}</p>}{error && !modal && <p className="sp-error" role="alert">{error}</p>}
 {tab === 'overview' && <div className="sp-stack"><section className={`sp-business-banner ${pendingBusiness ? 'pending' : businessReadiness.complete && businessReadiness.confirmed ? 'confirmed' : ''}`}><span className="sp-business-banner-icon">{pendingBusiness ? <Clock3 size={21}/> : <Building2 size={21}/>}</span><div><strong>{pendingBusiness ? 'Je wijzigingsvoorstel wordt beoordeeld.' : businessReadiness.complete && businessReadiness.confirmed ? 'Bedrijfsgegevens vastgelegd.' : 'De commissie vult je bedrijfsgegevens aan.'}</strong><p>{pendingBusiness ? 'Tot de beoordeling blijven de huidige gegevens van toepassing.' : businessReadiness.complete && businessReadiness.confirmed ? 'Deze gegevens vormen de basis voor nieuwe overeenkomsten. Is er iets veranderd? Geef het aan ons door.' : 'Nieuwe overeenkomsten worden pas opgemaakt met complete, bevestigde bedrijfsgegevens.'}</p></div><button className="sp-btn small" onClick={() => setTab('company')}>Bekijk mijn bedrijf <ArrowRight size={14}/></button></section><section className="sp-actions-grid">{awaiting.length > 0 ? <button className="sp-action-card" onClick={() => openAgreement(awaiting[0])}><span className="sp-action-icon"><FileCheck2 size={24}/></span><span className="sp-eyebrow">{signer ? 'JOUW HANDTEKENING' : 'OVEREENKOMST'}</span><h3>{signer ? 'Klaar voor een mooi seizoen.' : 'Een overeenkomst ligt klaar.'}</h3><p>{signer ? 'Bekijk de afspraken en rond de ondertekening af.' : 'Je kunt de afspraken bekijken. Alleen een tekenbevoegde gebruiker ondertekent.'}</p><span className="sp-action-link">Bekijk overeenkomst <ArrowRight size={17}/></span></button> : <button className="sp-action-card" onClick={() => setTab('agreements')}><span className="sp-action-icon"><FileCheck2 size={24}/></span><span className="sp-eyebrow">ONZE SAMENWERKING</span><h3>Alle afspraken bij elkaar.</h3><p>Je voorstellen en bewaarde overeenkomsten op één plek.</p><span className="sp-action-link">Naar overeenkomsten <ArrowRight size={17}/></span></button>}
 <button className="sp-action-card" onClick={() => setTab(billing ? 'invoices' : 'materials')}><span className="sp-action-icon">{billing ? <CreditCard size={24}/> : <ImagePlus size={24}/>}</span><span className="sp-eyebrow">{billing ? 'FINANCIEEL' : 'JOUW UITSTRALING'}</span><h3>{billing ? (unpaid.length ? `${money(unpaid.reduce((sum, row) => sum + row.totalCents, 0))} staat nog open.` : 'Alles netjes op een rij.') : 'Laat je bedrijf zien.'}</h3><p>{billing ? 'Bekijk je facturen en betaalafspraken.' : 'Lever een logo of materiaal aan voor je sponsoruitingen.'}</p><span className="sp-action-link">{billing ? 'Bekijk facturen' : 'Materiaal aanleveren'} <ArrowRight size={17}/></span></button>
 <button className="sp-action-card" onClick={() => setTab('events')}><span className="sp-action-icon"><Users size={24}/></span><span className="sp-eyebrow">MEER DAN EEN LOGO</span><h3>Ontmoet de club.</h3><p>Bekijk de komende sponsoravonden en meld je aan.</p><span className="sp-action-link">Bekijk clubmomenten <ArrowRight size={17}/></span></button></section>
 <div className="sp-grid"><section className="sp-card"><div className="sp-card-head"><div><span className="sp-eyebrow">VAN AFSPRAAK NAAR ACTIE</span><h2>Dit doen we voor jou.</h2></div><span className="sp-pill">{complete} van {tasks.length} klaar</span></div><div className="sp-progress"><i style={{ width: `${tasks.length ? complete / tasks.length * 100 : 0}%` }}/></div>{tasks.length ? tasks.slice(0, 5).map(task => <div className="sp-task" key={task.id}><span className={`sp-task-check ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' ? <Check size={16}/> : <Clock3 size={16}/>}</span><div className="sp-row-main"><strong>{task.title}</strong><small>{task.note || `Verwacht: ${date(task.dueDate)}`}</small>{task.proofUrl && safeLink(task.proofUrl) && <a href={task.proofUrl} target="_blank" rel="noreferrer">Bekijk aangeleverd bewijs <ArrowUpRight size={13}/></a>}</div><Pill status={task.status}/></div>) : <Empty title="De uitvoering volgt">Zodra de samenwerking is vastgelegd, verschijnen de afgesproken sponsoruitingen hier.</Empty>}</section><div className="sp-stack"><section className="sp-card sp-contact-card"><span className="sp-eyebrow">EEN KORTE LIJN</span><h2>We helpen je graag.</h2><p>Vragen over je pakket, een nieuw idee of iets aanpassen? De sponsorcommissie denkt met je mee.</p><a className="sp-btn" href={`mailto:${data.settings.committeeEmail}`}><Mail size={16}/>Mail de sponsorcommissie</a></section><section className="sp-card"><div className="sp-card-head"><h2>Laatste updates</h2><Clock3 size={18}/></div>{activities.length ? activities.slice(0, 4).map(activity => <div className="sp-activity" key={activity.id}><i /><div><strong>{activity.title}</strong><p>{activity.detail}</p><small>{date(activity.at)}</small></div></div>) : <p className="sp-muted">Nieuwe afspraken en updates verschijnen hier.</p>}</section></div></div></div>}
 {tab === 'agreements' && <div className="sp-stack"><section className="sp-card"><div className="sp-card-head"><div><span className="sp-eyebrow">SAMENWERKEN MET VERTROUWEN</span><h2>Onze overeenkomsten</h2></div><ShieldCheck size={23}/></div>{agreements.length ? agreements.map(agreement => <div className="sp-row" key={agreement.id}><span className="sp-row-icon"><FileCheck2 size={21}/></span><div className="sp-row-main"><strong>{agreement.snapshot.name}</strong><small>{agreement.number} · versie {agreement.version} · {date(agreement.snapshot.startDate)} – {date(agreement.snapshot.endDate)}</small><span className="sp-money">{money(calculateSponsorTotals(agreement.snapshot.lines, agreement.snapshot.discountCents).totalCents)} <small>incl. btw</small></span></div><div className="sp-row-end"><Pill status={agreement.status}/><button className="sp-btn small" onClick={() => openAgreement(agreement)}>{agreement.status === 'awaiting-signature' && signer ? 'Bekijken & ondertekenen' : 'Bekijk document'}<ChevronRight size={15}/></button></div></div>) : <Empty title="Nog geen overeenkomst">Een overeenkomst verschijnt hier zodra de sponsorcommissie deze voor je heeft klaargezet.</Empty>}</section>{proposals.length > 0 && <section className="sp-card"><div className="sp-card-head"><h2>Voorstellen voor jouw bedrijf</h2></div>{proposals.map(proposal => <div className="sp-row" key={proposal.id}><FileText size={21}/><div className="sp-row-main"><strong>{proposal.name}</strong><small>{proposal.season} · ontvangen op {date(proposal.updatedAt)}</small></div><Pill status={proposal.status}/><button className="sp-btn small" onClick={() => { setDocumentId(proposal.id); setError(''); setModal('proposal'); }}>Bekijk voorstel <ArrowRight size={14}/></button></div>)}</section>}<p className="sp-muted">Ondertekende documentversies blijven afzonderlijk bewaard. Een wijziging aan een pakket verandert je bestaande afspraken niet.</p></div>}
 {tab === 'invoices' && <section className="sp-card"><div className="sp-card-head"><div><span className="sp-eyebrow">HELDERE AFSPRAKEN</span><h2>Facturen & betalingen</h2></div><CreditCard size={22}/></div>{!billing ? <Empty icon={ShieldCheck} title="Financiën zijn aan een andere contactrol gekoppeld">Deze gebruiker heeft geen financiële toegang voor {sponsor.name}. De commissie kan een gebruiker de contactrol Financiën geven.</Empty> : <><div className="sp-stats"><span><small>Openstaand</small><strong>{money(unpaid.reduce((sum, row) => sum + row.totalCents, 0))}</strong></span><span><small>Ontvangen betalingen</small><strong>{money(invoices.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.totalCents, 0))}</strong></span><span><small>Facturen</small><strong>{invoices.length}</strong></span></div>{invoices.length ? invoices.map(invoice => <div className="sp-row sp-invoice-row" key={invoice.id}><span className="sp-row-icon"><FileText size={20}/></span><div className="sp-row-main"><strong>{invoice.number}{invoice.installment && <small>Termijn {invoice.installment.index} van {invoice.installment.count}</small>}</strong><small>Factuurdatum {date(invoice.issueDate)} · vervalt {date(invoice.dueDate)}</small></div><span className="sp-money">{money(invoice.totalCents)}</span><Pill status={invoice.status}/><button className="sp-btn small" onClick={() => { setDocumentId(invoice.id); setError(''); setModal('invoice'); }}>Bekijk <ChevronRight size={14}/></button></div>) : <Empty icon={CreditCard} title="Nog geen factuur">Je facturen verschijnen hier zodra de commissie ze heeft klaargezet.</Empty>}</>}<p className="sp-muted">Online betalen is niet geconfigureerd. Volg de betaalafspraken op je factuur.</p></section>}
 {tab === 'materials' && <div className="sp-grid"><section className="sp-card"><div className="sp-card-head"><div><span className="sp-eyebrow">JOUW BEDRIJF IN BEELD</span><h2>Logo & materiaal aanleveren</h2></div><ImagePlus size={24}/></div>{marketing ? <><p className="sp-muted">Je materiaal wordt eerst door de commissie beoordeeld. Het goedgekeurde profiel blijft zichtbaar totdat de wijziging is overgenomen.</p><form onSubmit={submitProfile}><label className="sp-upload"><ImagePlus size={26}/><strong>Kies je bedrijfslogo</strong><span>PNG, JPG of WebP · maximaal 15 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => uploadLogo(event.target.files?.[0])}/></label>{profile.logoUrl && <div className="sp-logo-preview"><img src={profile.logoUrl.startsWith('/api/sponsorship/logos/')?profile.logoUrl.replace('/logos/','/previews/'):profile.logoUrl} alt="Logo in je wijzigingsvoorstel"/><span>Nieuw voorstel · nog niet gepubliceerd</span></div>}<label className="sp-field"><span>Publieke bedrijfsnaam</span><input value={profile.name} maxLength={150} required onChange={event => setProfile({ ...profile, name: event.target.value })}/></label><label className="sp-field"><span>Korte bedrijfsomschrijving</span><textarea rows={4} value={profile.description} maxLength={1500} onChange={event => setProfile({ ...profile, description: event.target.value })}/></label><label className="sp-field"><span>Website</span><input type="url" placeholder="https://" value={profile.website} onChange={event => setProfile({ ...profile, website: event.target.value })}/></label><button className="sp-btn primary" type="submit"><Upload size={16}/>Ter beoordeling aanleveren</button></form><div className="sp-material-note"><h3>Een toelichting of bestaand bestand delen</h3><label className="sp-field"><span>Toelichting voor de commissie</span><textarea rows={3} value={materialNote} onChange={event => setMaterialNote(event.target.value)} placeholder="Bijvoorbeeld: graag het witte logo gebruiken op het reclamebord."/></label><><label className="sp-field"><span>Link naar materiaal (optioneel)</span><input type="url" placeholder="https://" value={proofUrl} onChange={event => setProofUrl(event.target.value)}/></label><label className="sp-field"><span>Bestand aanleveren (afbeelding of PDF, maximaal 15 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={async event=>{const file=event.target.files?.[0];if(!file||!sponsor)return;const signal=contextSignal();try{const response=await fetch("/api/sponsorship/companies/"+encodeURIComponent(sponsor.id)+"/materials",{method:"POST",signal,headers:{"Content-Type":file.type,"X-File-Name":file.name.replace(/[^a-zA-Z0-9._ -]/g,"_")},body:file});const result=await response.json();if(!response.ok)throw Error(result.message);if(!signal.aborted)setProofUrl(result.url);}catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:"Uploaden is mislukt.");}}}/></label></><button className="sp-btn" disabled={!materialNote.trim() && !proofUrl.trim()} onClick={async () => {
                        if (await action(draft => { saveSponsorMaterial(draft, userId, sponsor.id, { note: materialNote, proofUrl }); }, 'Materiaalnotitie gedeeld met de sponsorcommissie.')) {
                            setMaterialNote('');
                            setProofUrl('');
                        }
                    }}><MessageCircle size={16}/>Deel toelichting</button></div></> : <Empty icon={ShieldCheck} title="Materiaal heeft een eigen contactrol">Deze gebruiker heeft geen rol Communicatie & materiaal voor dit bedrijf.</Empty>}</section><div className="sp-stack"><section className="sp-card"><span className="sp-eyebrow">NU GOEDGEKEURD</span><div className="sp-profile-preview"><img src={sponsor.publicProfile.logoUrl || '/assets/logo.png'} alt={sponsor.publicProfile.name}/><h3>{sponsor.publicProfile.name}</h3><p>{sponsor.publicProfile.description}</p></div></section><section className="sp-card"><h2>Jouw aanleveringen</h2>{requests.length ? requests.map(request => <div className="sp-row" key={request.id}><div className="sp-row-main"><strong>{request.profile.name}</strong><small>{date(request.createdAt)}</small></div><Pill status={request.status}/></div>) : <p className="sp-muted">Je hebt nog geen wijzigingen aangeleverd.</p>}{pendingProfile && <p className="sp-muted">De commissie ziet je openstaande wijzigingsvoorstel in het sponsordossier.</p>}</section></div></div>}
 {tab === 'company' && business && <div className="sp-grid sp-business-layout"><div className="sp-stack">
  <section className="sp-card sp-business-card"><div className="sp-card-head"><div><span className="sp-eyebrow">DE BASIS VAN ONZE AFSPRAKEN</span><h2>Bedrijfsgegevens</h2></div><Building2 size={24}/></div>
   <div className="sp-business-state"><Pill status={businessReadiness.complete && businessReadiness.confirmed ? 'approved' : 'pending'}>{businessReadiness.complete && businessReadiness.confirmed ? 'Bevestigd door de commissie' : 'Wordt aangevuld door de commissie'}</Pill>{business.confirmedAt && <small>Bevestigd op {date(business.confirmedAt)}</small>}</div>
   <BusinessSummary details={business}/>
   <div className="sp-business-explainer"><ShieldCheck size={18}/><p>De sponsorcommissie beheert deze gegevens. Je kunt een wijziging voorstellen; pas na goedkeuring worden de gegevens aangepast. Bestaande overeenkomsten behouden hun eigen vastgelegde versie.</p></div>
   <div className="sp-actions"><button className="sp-btn primary" disabled={!mayRequestBusiness} onClick={openBusinessRequest}><MessageCircle size={16}/>{pendingBusiness?.userId === userId ? 'Mijn voorstel aanvullen' : 'Wijziging doorgeven'}</button></div>
   {!mayRequestBusiness && <p className="sp-muted">Wijzigingen aan de contract- en factuurgegevens worden ingediend door een contactpersoon met de rol Ondertekenen of Financiën.</p>}
  </section>
  <section className="sp-card"><div className="sp-card-head"><div><span className="sp-eyebrow">VAN VOORSTEL NAAR VASTLEGGING</span><h2>Doorgegeven wijzigingen</h2></div><Clock3 size={21}/></div>
   {businessRequests.length ? businessRequests.map(request => <article className="sp-business-request" key={request.id}><div className="sp-business-request-head"><div><strong>{request.status === 'pending' ? 'Wijzigingsvoorstel in behandeling' : request.status === 'approved' ? 'Wijziging overgenomen' : 'Wijziging niet overgenomen'}</strong><small>Ingediend op {date(request.createdAt)}{request.reviewedAt && ` · beoordeeld op ${date(request.reviewedAt)}`}</small></div><Pill status={request.status}/></div>{request.reason && <p>{request.reason}</p>}{request.reviewNote && <div className="sp-business-review"><MessageCircle size={15}/><span><b>Reactie van de commissie</b>{request.reviewNote}</span></div>}<details className="sp-business-submitted"><summary>Bekijk de voorgestelde gegevens <ChevronRight size={14}/></summary><dl>{sponsorBusinessFields.filter(field => field.key !== 'registrationExemptionReason' || request.details.registrationExempt).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{sponsorBusinessFieldValue(request.details, field.key)}</dd></div>)}</dl></details></article>) : <div className="sp-business-empty"><CheckCircle2 size={23}/><div><strong>Er zijn nog geen wijzigingen doorgegeven.</strong><p>Een nieuw voorstel en de reactie van de commissie verschijnen hier.</p></div></div>}
  </section>
 </div><div className="sp-stack"><section className="sp-card"><span className="sp-eyebrow">TOEGANG TOT DIT BEDRIJF</span><h2>Jouw contactpersonen</h2><p className="sp-muted">Deze personen zijn gekoppelde gebruikers. De contactrol bepaalt welke acties iemand kan uitvoeren.</p>{data.memberships.filter(link => link.sponsorId === sponsor.id).map(link => { const member = state.members.find(row => row.id === link.userId); return <div className="sp-contact-member" key={link.id}><span className="sp-member-avatar"><UserRound size={20}/></span><div><strong>{member?.name || 'Gebruiker niet beschikbaar'}</strong><small>{member?.email}</small><div className="sp-role-grid">{link.roles.map(role => <span key={role}>{roleLabel[role]}</span>)}</div></div></div>; })}<a className="sp-btn" href={`mailto:${data.settings.committeeEmail}?subject=${encodeURIComponent(`Gebruikerstoegang: ${sponsor.name}`)}`}><Users size={16}/>Toegang laten aanpassen</a></section>
  <section className="sp-card"><span className="sp-eyebrow">ZO ZIET DE CLUB JOUW BEDRIJF</span><div className="sp-profile-preview"><img src={sponsor.publicProfile.logoUrl || '/assets/logo.png'} alt={sponsor.publicProfile.name}/><h3>{sponsor.publicProfile.name}</h3><p>{sponsor.publicProfile.description}</p><Pill status={sponsor.publicEnabled ? 'approved' : 'pending'}>{sponsor.publicEnabled ? 'Publicatie ingeschakeld' : 'Nog niet publiek'}</Pill></div><div className="sp-actions"><button className="sp-btn" disabled={!marketing} onClick={() => setTab('materials')}>Publiek profiel voorstellen <ArrowRight size={15}/></button></div><p className="sp-muted">Het publieke logo en de beschrijving staan los van de bedrijfsgegevens op je overeenkomst.</p></section>
 </div></div>}

 {tab === 'events' && <div className="sp-stack"><div className="sp-section-heading"><span className="sp-eyebrow">DE CLUB VERBINDT</span><h2>Meer dan een samenwerking.</h2><p>Ontmoet andere ondernemers en de mensen achter onze club.</p></div>{data.events.length ? data.events.map(event => { const own = event.registrations.find(registration => registration.userId === userId && registration.sponsorId === sponsor.id), occupied = (event as typeof event & {occupiedGuests?:number}).occupiedGuests ?? event.registrations.reduce((sum, row) => sum + row.guests, 0), full = event.capacity>0&&occupied >= event.capacity; return <section className="sp-card sp-event" key={event.id}><div className="sp-event-date"><strong>{new Date(event.date).getDate()}</strong><span>{new Intl.DateTimeFormat('nl-NL', { month: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date(event.date))}</span></div><div className="sp-event-content"><span className="sp-eyebrow">VOOR ONZE PARTNERS</span><h2>{event.title}</h2><p>{event.description}</p><div className="sp-event-meta"><span><CalendarDays size={15}/>{date(event.date)} · {time(event.date)}</span><span><MapPin size={15}/>{event.location}</span></div><div className="sp-actions">{own ? <><Pill status="approved"><Check size={13}/>Aangemeld met {own.guests} {own.guests === 1 ? 'persoon' : 'personen'}</Pill><button className="sp-btn small" onClick={async () => await action(draft => { cancelSponsorEvent(draft, userId, event.id, sponsor.id); }, 'Je aanmelding is ingetrokken.')}>Aanmelding intrekken</button></> : <><label className="sp-event-guests">Personen<select aria-label={`Aantal personen voor ${event.title}`} value={eventGuests[event.id] || 1} onChange={change => setEventGuests({ ...eventGuests, [event.id]: Number(change.target.value) })}>{[1, 2, 3, 4].map(count => <option key={count}>{count}</option>)}</select></label><button className="sp-btn primary" disabled={full} onClick={async () => await action(draft => { registerSponsorEvent(draft, userId, event.id, sponsor.id, eventGuests[event.id] || 1); }, 'Je aanmelding is opgeslagen.')}>{full ? 'Volgeboekt' : 'Ik ben erbij'} <ArrowRight size={16}/></button></>}</div></div></section>; }) : <section className="sp-card"><Empty icon={CalendarDays} title="Nieuwe clubmomenten volgen">Je ontvangt hier een uitnodiging zodra er een sponsoractiviteit is gepland.</Empty></section>}</div>}
 </>}</main><footer className="sp-footer"><a href="/clubmuur"><ArrowLeft size={15}/>Terug naar de clubwebsite</a><span>ONZE WIJK. ONZE CLUB. ONZE TROTS.</span><small>Duindorp SV · Sinds 1950</small></footer>{notice && <div className="sp-toast" role="status"><CheckCircle2 size={19}/>{notice}</div>}
 {contextReady && modal === 'business' && businessDraft && sponsor && mayRequestBusiness && <Modal title="Een wijziging doorgeven" description="Je doet een voorstel aan de sponsorcommissie. De opgeslagen bedrijfsgegevens veranderen pas wanneer de commissie de wijziging goedkeurt." onClose={() => setModal(null)} wide><form className="sp-business-form" onSubmit={submitBusiness}>
  <div className="sp-business-flow"><span><CheckCircle2 size={17}/>Jij geeft de wijziging door</span><ChevronRight size={15}/><span><Clock3 size={17}/>De commissie beoordeelt</span><ChevronRight size={15}/><span><ShieldCheck size={17}/>Gegevens worden bijgewerkt</span></div>
  <SponsorBusinessForm value={businessDraft} onChange={setBusinessDraft} prefix="sponsor-change" requireComplete/>
  <label className="sp-field sp-business-reason"><span>Toelichting voor de commissie</span><textarea rows={3} maxLength={1000} value={businessReason} onChange={event => setBusinessReason(event.target.value)} placeholder="Bijvoorbeeld: we zijn verhuisd of het factuuradres is veranderd."/></label>
  <label className="sp-check"><input type="checkbox" checked={businessConsent} onChange={event => setBusinessConsent(event.target.checked)} required/><span>Ik wil deze gegevens ter beoordeling voorleggen aan de sponsorcommissie. Ik begrijp dat bestaande overeenkomsten hierdoor niet wijzigen.</span></label>
  {error && <p className="sp-error" role="alert">{error}</p>}<div className="sp-actions sp-business-form-actions"><button type="button" className="sp-btn" onClick={() => setModal(null)}>Annuleren</button><button type="submit" className="sp-btn primary" disabled={!businessConsent}><MessageCircle size={16}/>Ter beoordeling doorgeven</button></div>
 </form></Modal>}
 {contextReady && modal === 'notifications' && <Modal title="Jouw meldingen" description="Acties en herinneringen voor het gekoppelde sponsorbedrijf." onClose={() => setModal(null)}><div className="sp-notification-head"><span className="sp-muted">{unread.length} nog niet gelezen</span><button className="sp-btn small" onClick={readNotifications}>Markeer als gelezen <Check size={14}/></button></div>{reminders.length ? reminders.map(reminder => <button className={`sp-reminder ${readIds.includes(reminder.id) ? 'read' : ''}`} key={reminder.id} onClick={() => {
                    setModal(null);
                    if (reminder.kind === 'signature') {
                        const agreement = agreements.find(row => row.id === reminder.referenceId);
                        if (agreement)
                            openAgreement(agreement);
                        else
                            setTab('agreements');
                    }
                    else
                        setTab(reminder.kind === 'invoice' ? 'invoices' : reminder.kind === 'task' ? 'overview' : 'agreements');
                }}><span className="sp-row-icon"><Bell size={18}/></span><span className="sp-row-main"><strong>{reminder.title}</strong><small>{date(reminder.dueDate)}</small></span><ChevronRight size={16}/></button>) : <Empty icon={Bell} title="Alles bijgewerkt">Er zijn voor deze gebruiker geen openstaande herinneringen.</Empty>}</Modal>}
 {contextReady && modal === 'agreement' && selectedAgreement && <Modal title={selectedAgreement.number} description={`Overeenkomst · versie ${selectedAgreement.version} · ${selectedAgreement.snapshot.sponsorName}`} onClose={() => setModal(null)} wide><SnapshotDocument snapshot={selectedAgreement.snapshot} number={selectedAgreement.number} version={selectedAgreement.version} agreement={selectedAgreement}/><div className="sp-actions sp-document-actions"><button className="sp-btn primary" disabled={pdfBusy} onClick={async () => await downloadAgreement(selectedAgreement.id)}><ArrowDownToLine size={15}/>{pdfBusy ? 'PDF wordt opgemaakt…' : 'Download overeenkomst als PDF'}</button><button className="sp-btn ghost" onClick={() => printDocument('agreement', selectedAgreement.id)}>Afdrukken</button></div>{selectedAgreement.status === 'awaiting-signature' && (signer ? <form className="sp-sign-form" onSubmit={sign}><span className="sp-eyebrow">JOUW AKKOORD</span><h3>Eerst jouw akkoord. Daarna de club.</h3><p>Je ondertekent met je eigen gebruikersnaam. Daarna ondertekent de sponsorcommissie namens Duindorp SV via een afzonderlijke verificatie. Iedere partij bevestigt de eigen ondertekening met een persoonlijke e-mailcode.</p><ol className="sp-signing-steps"><li className="current"><span>1</span><div><strong>De sponsor tekent</strong><small>Met je eigen account en verificatiecode</small></div></li><li><span>2</span><div><strong>De club tekent daarna</strong><small>De commissie gebruikt een eigen verificatiecode</small></div></li></ol><div className="sp-fields"><label className="sp-field"><span>Naam van je ingelogde account</span><input required readOnly value={currentUser?.name || name} maxLength={150}/></label><label className="sp-field"><span>Functie binnen het bedrijf</span><input required value={job} onChange={event => setJob(event.target.value)} placeholder="Bijvoorbeeld eigenaar" maxLength={100}/></label></div><label className="sp-field"><span>Verificatie naar je inlogadres</span><input type="email" readOnly value={currentUser?.email || ''}/></label><label className="sp-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required/><span>Ik heb deze documentversie en voorwaarden gelezen, ga ermee akkoord en verklaar bevoegd te zijn om namens {selectedAgreement.snapshot.sponsorName} te tekenen.</span></label>{!verificationRequested ? <button type="button" className="sp-btn primary" disabled={!name.trim() || !job.trim() || !consent} onClick={requestSigningCode}><Mail size={16}/>Verificatiecode per e-mail aanvragen</button> : <div className="sp-code"><div><strong>Je persoonlijke e-mailcode</strong><p>Bestemd voor {signingChallenge?.emailHint || currentUser?.email}. Geldig tot {signingChallenge ? time(signingChallenge.expiresAt) : '—'}. Je persoonlijke code is per e-mail verstuurd.</p><button className="sp-code-resend" type="button" onClick={requestSigningCode}>Nieuwe e-mailcode aanvragen</button></div><label className="sp-field"><span>Achtcijferige e-mailcode</span><input inputMode="numeric" maxLength={8} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required placeholder="00000000"/></label><button className="sp-btn primary" disabled={code.length !== 8 || !consent || !signingChallenge} type="submit"><FileCheck2 size={16}/>Ondertekenen als sponsor</button></div>}</form> : <p className="sp-proof"><ShieldCheck size={17}/>Je kunt deze overeenkomst bekijken. Alleen een gekoppelde gebruiker met de contactrol Ondertekenen kan akkoord geven.</p>)}{selectedAgreement.status === 'awaiting-club-signature' && <p className="sp-proof"><Clock3 size={18}/>Je ondertekening is vastgelegd. De sponsorcommissie rondt de overeenkomst af met een eigen verificatie en handtekening namens Duindorp SV.</p>}{error && <p className="sp-error" role="alert">{error}</p>}</Modal>}
 {contextReady && modal === 'proposal' && selectedProposal && <Modal title="Jouw sponsorvoorstel" description="Bekijk het vastgelegde voorstel van de sponsorcommissie." onClose={() => setModal(null)} wide>{selectedProposal.snapshot ? <SnapshotDocument snapshot={selectedProposal.snapshot} number="Sponsorvoorstel"/> : <Empty title="Voorstel niet beschikbaar">De commissie moet dit voorstel eerst vastleggen.</Empty>}{selectedProposal.status === 'sent' && signer && <div className="sp-proposal-accept"><p>Met je akkoord geef je aan dat je met dit voorstel verder wilt. De overeenkomst wordt daarna afzonderlijk ondertekend.</p><button className="sp-btn primary" onClick={async () => {
                    if (await action(draft => { acceptSponsorProposal(draft, userId, selectedProposal.id); }, 'Voorstel geaccepteerd. De commissie ziet je akkoord.'))
                        setModal(null);
                }}><CheckCircle2 size={16}/>Akkoord met dit voorstel</button></div>}{error && <p className="sp-error" role="alert">{error}</p>}</Modal>}
 {contextReady && modal === 'invoice' && selectedInvoice && billing && <Modal title={selectedInvoice.number} description="Je vaste factuurgegevens en betaalafspraken." onClose={() => setModal(null)} wide><article className="sp-document"><div className="sp-doc-head"><img src="/assets/logo.png" alt="Duindorp SV"/><div><span className="sp-eyebrow">ONZE CLUB. ONZE TROTS.</span><h2>Factuur {selectedInvoice.number}</h2><p>{sponsor?.name}{selectedInvoice.installment && <> · Termijn {selectedInvoice.installment.index} van {selectedInvoice.installment.count}</>}</p></div><Pill status={selectedInvoice.status}/></div><div className="sp-doc-period"><span><small>Factuurdatum</small><b>{date(selectedInvoice.issueDate)}</b></span><span><small>Vervaldatum</small><b>{date(selectedInvoice.dueDate)}</b></span></div><DocumentLines lines={selectedInvoice.lines} discountCents={selectedInvoice.discountCents} totals={getSponsorInvoiceTotals(selectedInvoice)}/>{selectedInvoice.status === 'paid' && <p className="sp-proof"><CheckCircle2 size={18}/>Ontvangst geregistreerd op {date(selectedInvoice.paidAt)}. Betaalwijze: {selectedInvoice.paymentMethod === 'mollie' ? 'Mollie' : 'Handmatig geregistreerd'}.</p>}</article><div className="sp-actions"><button className="sp-btn" onClick={() => printDocument('invoice', selectedInvoice.id)}><ArrowDownToLine size={15}/>Afdrukken / PDF</button><button className="sp-btn ghost" onClick={() => downloadDocument('invoice', selectedInvoice.id)}>Download HTML</button></div>{selectedInvoice.status === 'open' && !data.settings.mollieEnabled && <p className="sp-proof">Online betalen is niet geconfigureerd. De commissie registreert ontvangen bankbetalingen in het beheer.</p>}{error && <p className="sp-error" role="alert">{error}</p>}</Modal>}
 </div>;
}

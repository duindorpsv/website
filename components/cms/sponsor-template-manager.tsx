'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Braces, Check, Copy, FileSignature, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {Pagination,usePagination} from './pagination';
import { useCMS } from './sponsor-workspace-provider';
import { readSponsorship, readSponsorContractTemplates, saveSponsorContractTemplate, removeSponsorContractTemplate, getSponsorBusinessDetails, calculateSponsorTotals } from '@/lib/cms/sponsorship';
import { SPONSOR_CONTRACT_SHORTCODES, createDefaultSponsorContractTemplate, renderSponsorContractTemplate, getSponsorContractVariables, validateSponsorContractTemplate } from '@/lib/cms/sponsor-contracts';
import type { SponsorContractTemplate, SponsorProposalSnapshot } from '@/lib/cms/sponsorship-types';
import { uid, now } from '@/lib/cms/model';
import './sponsor-template-manager.css';
export function SponsorTemplateManager() {
    const { state, userId, can, update, notify,beginEdit } = useCMS();
    const data = readSponsorship(state), templates = readSponsorContractTemplates(state);
    const [draft, setDraft] = useState<SponsorContractTemplate>(() => structuredClone(templates[0] || createDefaultSponsorContractTemplate()));
    const paging=usePagination(templates);
    useEffect(()=>beginEdit('record:'+draft.id),[draft.id,beginEdit]);
    const [sponsorId, setSponsorId] = useState(data.sponsors[0]?.id || '');
    const [group, setGroup] = useState('Alle shortcodes'), [error, setError] = useState(''), [saved, setSaved] = useState(false);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { setDraft(structuredClone(readSponsorContractTemplates(state)[0] || createDefaultSponsorContractTemplate())); setError(''); setSaved(false); }, [userId]);
    const sponsor = data.sponsors.find(row => row.id === sponsorId) || data.sponsors[0];
    const preview = useMemo(() => {
        try {
            validateSponsorContractTemplate(draft);
            if (!sponsor)
                return { title: '', body: 'Voeg eerst een sponsor toe om een ingevuld voorbeeld te bekijken.', error: '' };
            const source = data.proposals.find(row => row.sponsorId === sponsor.id) || data.proposals[0];
            const company = getSponsorBusinessDetails(sponsor);
            const lines = source?.lines.length ? source.lines : data.items.filter(row => row.active).slice(0, 2).map(row => ({ id: row.id, itemId: row.id, name: row.name, description: row.description, quantity: 1, unitPriceCents: row.priceCents, taxRate: row.taxRate }));
            const snapshot: SponsorProposalSnapshot = { name: source?.name || 'Samenwerking seizoen 2026/2027', sponsorName: company.legalName || sponsor.name, sponsorAddress: [company.address, `${company.postalCode} ${company.city}`].filter(Boolean).join(', '), sponsorEmail: company.contactEmail, season: source?.season || state.settings.season, startDate: source?.startDate || '2026-07-01', endDate: source?.endDate || '2027-06-30', paymentTerms: source?.paymentTerms || data.settings.defaultPaymentTerms, terms: source?.terms || data.settings.defaultTerms, lines, discountCents: source?.discountCents || 0, capturedAt: now() };
            const pack = data.packages.find(row => row.id === source?.packageId);
            return { ...renderSponsorContractTemplate(draft, getSponsorContractVariables(snapshot, company, pack?.name || 'Maatwerk', calculateSponsorTotals(lines, snapshot.discountCents), state.settings.clubName)), error: '' };
        }
        catch (reason) {
            return { title: 'Controleer de template', body: 'De ingevulde tekst verschijnt zodra de template geldig is.', error: reason instanceof Error ? reason.message : 'Deze template is niet geldig.' };
        }
    }, [draft, sponsor, state]);
    function choose(value: SponsorContractTemplate) { beginEdit('record:'+value.id); setDraft(structuredClone(value)); setError(''); setSaved(false); }
    function newTemplate() { const value = createDefaultSponsorContractTemplate(); choose({ ...value, id: uid('sponsor-template'), name: 'Nieuwe overeenkomsttemplate', version: 1, updatedAt: now(), active: true }); }
    function duplicate() { choose({ ...structuredClone(draft), id: uid('sponsor-template'), name: `${draft.name} · kopie`, version: 1, updatedAt: now() }); }
    function insert(key: string) { const code = `{{${key}}}`, node = bodyRef.current, start = node?.selectionStart ?? draft.body.length, end = node?.selectionEnd ?? start; setDraft({ ...draft, body: draft.body.slice(0, start) + code + draft.body.slice(end) }); setSaved(false); requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(start + code.length, start + code.length); }); }
    async function save() {
        setError('');
        let failure = '';
        const ok = await update(value => {
            try {
                saveSponsorContractTemplate(value, userId, draft);
            }
            catch (reason) {
                failure = reason instanceof Error ? reason.message : 'Opslaan is niet gelukt.';
                throw reason;
            }
        }, 'Overeenkomsttemplate opgeslagen');
        if (!ok) {
            setError(failure || 'Opslaan is niet gelukt.');
            return;
        }
        setSaved(true);
        notify('Template opgeslagen. Alleen nieuwe documentversies nemen deze tekst over.');
    }
    async function remove() {
        setError('');
        let failure = '';
        const ok = await update(value => {
            try {
                removeSponsorContractTemplate(value, userId, draft.id);
            }
            catch (reason) {
                failure = reason instanceof Error ? reason.message : 'Verwijderen is niet gelukt.';
                throw reason;
            }
        }, 'Overeenkomsttemplate verwijderd');
        if (ok) {
            const next = templates.find(row => row.id !== draft.id);
            choose(next || { ...createDefaultSponsorContractTemplate(), id: uid('sponsor-template') });
            notify('Template verwijderd. Vastgezette overeenkomsten blijven bewaard.');
        }
        else
            setError(failure || 'Verwijderen is niet gelukt.');
    }
    if (!can('sponsors'))
        return null;
    const groups = ['Alle shortcodes', ...new Set(SPONSOR_CONTRACT_SHORTCODES.map(row => row.group))];
    return <div className="sct-root">
  <div className="sct-intro"><div><span className="sct-eyebrow">VASTE VORM. PERSOONLIJKE AFSPRAKEN.</span><h3>Een goede samenwerking begint op papier.</h3><p>Schrijf één keer je basis. Bedrijfsgegevens, items, pakketten en bedragen worden bij het vastzetten automatisch ingevuld.</p></div><button className="cms-button primary" onClick={newTemplate}><Plus size={15}/>Template maken</button></div>
  <div className="sct-layout"><aside className="sct-list"><div className="sct-list-head"><FileSignature size={17}/><strong>Jouw templates</strong><span>{templates.length}</span></div>{paging.items.map(row => <button key={row.id} className={row.id === draft.id ? 'active' : ''} onClick={() => choose(row)}><span className="sct-template-mark"><FileSignature size={18}/></span><span><strong>{row.name}</strong><small>Versie {row.version} · {row.active ? 'Beschikbaar' : 'Niet actief'}</small></span><ArrowUpRight size={14}/></button>)}{!templates.some(row => row.id === draft.id) && <div className="sct-unsaved">Nieuw concept<br /><strong>{draft.name}</strong></div>}<Pagination label="Templates" {...paging}/><div className="sct-list-note"><ShieldCheck size={16}/><p>Een opgeslagen overeenkomst bewaart de ingevulde tekst en templateversie. Latere wijzigingen overschrijven dat document niet.</p></div></aside>
  <div className="sct-workspace"><div className="sct-editor-head"><div><span className="sct-eyebrow">TEMPLATE-EDITOR</span><h4>{draft.name}</h4></div><button className="cms-button" onClick={duplicate}><Copy size={14}/>Dupliceren</button></div>
   <div className="sct-form-grid"><label>Interne naam<input maxLength={150} value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setSaved(false); }}/></label><label>Toelichting<input maxLength={500} value={draft.description} onChange={event => { setDraft({ ...draft, description: event.target.value }); setSaved(false); }}/></label><label className="sct-full">Documenttitel<input maxLength={300} value={draft.title} onChange={event => { setDraft({ ...draft, title: event.target.value }); setSaved(false); }} placeholder="Sponsorovereenkomst · {{bedrijf.naam}}"/><small>Ook in de titel kun je shortcodes gebruiken.</small></label></div>
   <div className="sct-codebar"><label><Braces size={16}/>Shortcodes<select aria-label="Categorie shortcodes" value={group} onChange={event => setGroup(event.target.value)}>{groups.map(value => <option key={value}>{value}</option>)}</select></label><div>{SPONSOR_CONTRACT_SHORTCODES.filter(row => group === 'Alle shortcodes' || row.group === group).map(row => <button type="button" key={row.key} title={`Voeg {{${row.key}}} in`} onClick={() => insert(row.key)}>{row.label}<code>{`{{${row.key}}}`}</code></button>)}</div><small>Klik op een shortcode om deze bij je cursor in de overeenkomsttekst te plaatsen.</small></div>
   <label className="sct-body-label">Overeenkomsttekst<textarea ref={bodyRef} rows={19} maxLength={40000} spellCheck value={draft.body} onChange={event => { setDraft({ ...draft, body: event.target.value }); setSaved(false); }}/><small>Gebruik korte alinea’s en genummerde koppen. De PDF voegt zelf clubbranding, itemtabel, bedragen en ondertekenregistratie toe.</small></label>
   <div className="sct-editor-foot"><label><input type="checkbox" checked={draft.active} onChange={event => { setDraft({ ...draft, active: event.target.checked }); setSaved(false); }}/>Beschikbaar voor nieuwe voorstellen</label><div>{templates.some(row => row.id === draft.id) && <button className="cms-button" onClick={remove}><Trash2 size={14}/>Verwijderen</button>}<button className="cms-button primary" disabled={!!preview.error} onClick={save}><Check size={14}/>{saved ? 'Opgeslagen' : 'Template opslaan'}</button></div></div>
   {(error || preview.error) && <p className="sct-error" role="alert">{error || preview.error}</p>}
   <section className="sct-preview-wrap"><div className="sct-preview-controls"><div><span className="sct-eyebrow">INGEVULD VOORBEELD</span><strong>Zo worden je shortcodes ingevuld.</strong></div><select aria-label="Voorbeeldsponsor" value={sponsorId} onChange={event => setSponsorId(event.target.value)}>{data.sponsors.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div><article className="sct-paper"><header><img src="/assets/logo.png" alt="Duindorp SV"/><span>ONZE CLUB.<br /><strong>ONZE TROTS.</strong></span></header><small>VOORBEELD · NIET VASTGEZET</small><h2>{preview.title}</h2><p>{preview.body}</p><footer>DUINDORP SV · SAMEN MAKEN WE DE CLUB</footer></article></section>
  </div></div>
 </div>;
}

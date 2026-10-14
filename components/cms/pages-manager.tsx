'use client';
import {useRevisions} from './use-revisions';
import {SchedulingControl} from './scheduling-control';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Clock3, Copy, ExternalLink, Eye, FileText, FolderTree, Globe, History, Menu, MoreHorizontal, Plus, RotateCcw, Save, Search, Send, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import type { CmsPage, CmsState, PageContent } from '@/lib/cms/types';
import { emptySEO, now, pageContent, publishPage, safeUrl, slugify, statusLabel, textDoc, uid, validatePage } from '@/lib/cms/model';
import { emptyLayout, cloneStructure } from '@/lib/cms/layout/document';
import {CmsProvider} from './provider';
import { useCMS } from './provider';
import { BlockEditor } from './block-editor';
import {ResponsivePreview} from './responsive-preview';
import { CmsPageView } from './public-content';
const hiddenSlugs = ['wedstrijden/oefenwedstrijd', 'media/club-tv'];
const groups = [['club', 'De club'], ['teams', 'Teams'], ['wedstrijden', 'Wedstrijden'], ['nieuws', 'Media'], ['overig', 'Overige pagina’s']];
const formatDate = (date: string) => new Date(date).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function uniqueSlug(state: CmsState, base: string) { let slug = base, index = 2; while (state.pages.some(p => p.slug === slug || p.live?.slug === slug)) {
    slug = `${base}-${index++}`;
} return slug; }
function isEmptyBody(page: CmsPage) { return !page.body.content?.some(node => node.type === 'cmsWidget' || node.content?.some(child => !!child.text?.trim() || !!child.content?.length)); }
function validateWidgets(page: CmsPage, state: CmsState) {
    const errors: string[] = [];
    for (const node of page.body.content || []) {
        if (node.type !== 'cmsWidget')
            continue;
        const kind = node.attrs?.kind, data = node.attrs?.data || {};
        if (['person', 'album', 'image', 'textImage', 'team', 'contact'].includes(kind) && !data.refId)
            errors.push('Koppel alle persoon-, foto-, album-, team- en contactblokken aan inhoud.');
        if (data.url && !safeUrl(data.url))
            errors.push('Een blok bevat een ongeldige link.');
        if (kind === 'person' && data.refId && !state.people.some(p => p.id === data.refId && p.published && !p.deletedAt))
            errors.push('Een persoonsblok verwijst naar een niet-gepubliceerde persoon.');
        if (['image', 'textImage'].includes(kind) && data.refId && !state.media.some(p => p.id === data.refId && p.published && !p.deletedAt))
            errors.push('Een fotoblok verwijst naar een niet-gepubliceerde foto.');
        if (kind === 'album' && data.refId && !state.albums.some(p => p.id === data.refId && p.published && !p.deletedAt))
            errors.push('Een albumblok verwijst naar een niet-gepubliceerd album.');
        if (kind === 'cta' && (!data.url || !data.label))
            errors.push('Vul de link en knoptekst van ieder oproepblok in.');
    }
    return [...new Set(errors)];
}
export function PagesManager() {
    const { state, update, can, notify, ready } = useCMS();
    const [selectedId, setSelectedId] = useState(''), [draft, setDraft] = useState<CmsPage | null>(null), [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [group, setGroup] = useState('all'), [panel, setPanel] = useState<'page' | 'seo' | 'revisions'>('page'), [preview, setPreview] = useState(false),[previewWidth,setPreviewWidth]=useState(768), [mobileSettings, setMobileSettings] = useState(false), [deleteConfirm, setDeleteConfirm] = useState(false), [errors, setErrors] = useState<string[]>([]), [savedAt, setSavedAt] = useState(''), [more, setMore] = useState(false);
    const canEdit = can('pages'), canPublish = canEdit && can('publish','','pages');
    const persisted = state.pages.find(p => p.id === selectedId);
    const currentId = useRef(selectedId);
    currentId.current = selectedId;
    const latestDraft = useRef(draft);
    latestDraft.current = draft;
    const writable = useRef(canEdit);
    writable.current = canEdit;
    useEffect(() => () => { const value = latestDraft.current; if (!value || value.deletedAt || !writable.current)
        return; const content = pageContent(value); void update(s => { const p = s.pages.find(x => x.id === value.id); if (p && !p.deletedAt && JSON.stringify(pageContent(p)) !== JSON.stringify(content))
        Object.assign(p, content, { updatedAt: now(), status: 'draft' }); }); }, [update]);
    const draftString = draft ? JSON.stringify(pageContent(draft)) : '';
    const workingChanged = !!draft && JSON.stringify(pageContent(draft)) !== JSON.stringify(persisted ? pageContent(persisted) : null);
    const unpublishedChanges = !!draft && (!persisted?.live || JSON.stringify(pageContent(draft)) !== JSON.stringify(persisted.live));
    useEffect(() => { if (!selectedId)
        return; const found = state.pages.find(p => p.id === selectedId); if (found) {
        setDraft(structuredClone(found));
        setSavedAt(found.updatedAt);
        setErrors([]);
        setDeleteConfirm(false);
        setPreview(false);
        setMore(false);
    } }, [selectedId]); // The working draft must not be reset by other CMS changes.
    useEffect(() => { if (!draft || !canEdit || draft.deletedAt)
        return; const content = pageContent(draft), id = draft.id; const timer = setTimeout(async () => { if (currentId.current !== id)
        return; const at = now(); let changed = false; const saved = await update(s => { const p = s.pages.find(x => x.id === id); if (!p || p.deletedAt || JSON.stringify(pageContent(p)) === JSON.stringify(content))
        return; Object.assign(p, content, { updatedAt: at, status: 'draft' }); changed = true; }); if (saved && changed)
        setSavedAt(at); }, 650); return () => clearTimeout(timer); }, [draftString, selectedId, canEdit, update]);
    useEffect(() => { if (ready && !selectedId && !draft) {
        const first = state.pages.filter(p => !p.deletedAt).sort((a, b) => a.order - b.order)[0];
        if (first)
            setSelectedId(first.id);
    } }, [state.pages, selectedId, draft, ready]);
    const patch = (values: Partial<PageContent>) => { if (!canEdit)
        return; setDraft(previous => previous ? { ...previous, ...values } : previous); setErrors([]); };
    const save = async (label = 'Handmatig opgeslagen', silent = false) => {
        if (!draft || !canEdit)
            return false;
        const at = now();
        const success = await update(s => { const p = s.pages.find(x => x.id === draft.id); if (!p || p.deletedAt)
            return; Object.assign(p, pageContent(draft), { updatedAt: at, status: 'draft' }); p.revisions.unshift({ id: uid('revision'), at, label, data: pageContent(p) }); p.revisions = p.revisions.slice(0, 25); }, `Pagina opgeslagen: ${draft.title}`);
        if (success) {
            setSavedAt(at);
            if (!silent)
                notify('Werkversie opgeslagen. De website verandert pas na publiceren.');
        }
        return success;
    };
    const selectPage = (id: string) => { if (workingChanged)
        save('Werkversie bewaard', true); setSelectedId(id); setPanel('page'); };
    const newPage = async () => { if (!canEdit)
        return; const previousDraft=draft;setDraft(null);const id = uid('page'), at = now(); const page: CmsPage = { id, title: 'Nieuwe pagina', slug: uniqueSlug(state, 'club/nieuwe-pagina'), intro: '', body: emptyLayout(), bodyFormat: 'page-layout-v2', parentId: '', menuGroup: 'club', menuVisible: false, order: state.pages.length + 1, seo: emptySEO(), useBuilder: true, status: 'draft', updatedAt: at, revisions: [] }; if (workingChanged)
        save('Werkversie bewaard', true); if (await update(s => s.pages.push(page), 'Nieuwe pagina aangemaakt')) {
        setSelectedId(id);
        setFilter('all');
        setQuery('');
        setGroup('all');
    }else setDraft(previousDraft); };
    const duplicate = async () => { if (!draft || !canEdit)
        return; const id = uid('page'); const copy: CmsPage = { ...pageContent(draft), body: cloneStructure(draft.body), id, title: `${draft.title} (kopie)`, slug: uniqueSlug(state, `${draft.slug}-kopie`), menuVisible: false, useBuilder: true, status: 'draft', updatedAt: now(), order: state.pages.length + 1, revisions: [] }; if (await update(s => s.pages.push(copy), `Pagina gedupliceerd: ${draft.title}`)) {
        setSelectedId(id);
        setFilter('all');
        setQuery('');
        notify('Kopie aangemaakt als concept.');
    } };
    const publish = async () => {
        if (!draft || !canPublish)
            return;
        const candidate = { ...draft, useBuilder: true, menuVisible: hiddenSlugs.includes(draft.slug) ? false : draft.menuVisible };
        const validation = [...validatePage(candidate, state), ...validateWidgets(candidate, state)];
        if (isEmptyBody(candidate))
            validation.push('Voeg eerst tekst of een widget toe voordat je deze pagina publiceert.');
        if (candidate.parentId && !state.pages.some(p => p.id === candidate.parentId && !p.deletedAt))
            validation.push('Kies een bestaande bovenliggende pagina.');
        if (validation.length) {
            setErrors(validation);
            setPanel('page');
            return;
        }
        const at = now();
        const success = await update(s => { const p = s.pages.find(x => x.id === draft.id); if (!p)
            return; p.revisions.unshift({ id: uid('revision'), at, label: 'Gepubliceerd', data: pageContent(candidate) }); p.revisions = p.revisions.slice(0, 25); Object.assign(p, pageContent(candidate)); publishPage(s, p.id); }, `Pagina gepubliceerd: ${draft.title}`);
        if (success) {
            setDraft({ ...candidate, status: 'published', updatedAt: at, live: pageContent(candidate) });
            setSavedAt(at);
            setErrors([]);
            notify('Pagina gepubliceerd in dit concept.');
        }
    };
    const review = async () => { if (!draft || !canEdit)
        return; const validation = validatePage(draft, state); if (validation.length) {
        setErrors(validation);
        return;
    } if (await update(s => { const p = s.pages.find(x => x.id === draft.id); if (p) {
        Object.assign(p, pageContent(draft));
        p.status = 'review';
        p.updatedAt = now();
    } }, `Pagina ter beoordeling: ${draft.title}`)) {
        setDraft({ ...draft, status: 'review' });
        notify('De pagina staat klaar voor beoordeling.');
    } };
    const unpublish = async () => { if (!draft || !canPublish)
        return; if (await update(s => { const p = s.pages.find(x => x.id === draft.id); if (p) {
        p.live = undefined;
        p.status = 'draft';
        p.updatedAt = now();
    } }, `Pagina offline gehaald: ${draft.title}`)) {
        setDraft({ ...draft, live: undefined, status: 'draft' });
        notify('Publicatie ingetrokken. De pagina is niet meer openbaar.');
        setMore(false);
    } };
    const trash = async () => { if (!draft || !canEdit || (persisted?.live && !canPublish))
        return; if (await update(s => { const p = s.pages.find(x => x.id === draft.id); if (p) {
        p.deletedAt = now();
        p.status = 'archived';
    } }, `Pagina naar prullenbak: ${draft.title}`)) {
        setDraft(null);
        setSelectedId('');
        setDeleteConfirm(false);
        notify('Pagina naar de prullenbak verplaatst. Je kunt hem herstellen.');
    } };
    const restore = async (id: string) => { if (!canEdit)
        return; if (await update(s => { const p = s.pages.find(x => x.id === id); if (p) {
        delete p.deletedAt;
        p.status = 'draft';
        p.live = undefined;
        p.updatedAt = now();
    } }, 'Pagina hersteld uit prullenbak')) {
        setFilter('all');
        if (draft?.id === id)
            setDraft({ ...draft, deletedAt: undefined, live: undefined, status: 'draft', updatedAt: now() });
        setSelectedId(id);
        notify('Pagina hersteld als concept.');
    } };
    const reorder = async (id: string, direction: -1 | 1) => { if (!canEdit)
        return; const p = state.pages.find(x => x.id === id); if (!p)
        return; const siblings = state.pages.filter(x => !x.deletedAt && x.parentId === p.parentId && x.menuGroup === p.menuGroup).sort((a, b) => a.order - b.order); const index = siblings.findIndex(x => x.id === id), other = siblings[index + direction]; if (!other)
        return; const ordered = [...siblings]; [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]]; if (await update(s => { ordered.forEach((item, i) => { const target = s.pages.find(x => x.id === item.id); if (target && target.order !== i + 1) {
        target.order = i + 1;
        target.updatedAt = now();
        if (target.status === 'published')
            target.status = 'draft';
    } }); }, 'Paginavolgorde aangepast')) {
        if (draft && ordered.some(x => x.id === draft.id))
            setDraft({ ...draft, order: ordered.findIndex(x => x.id === draft.id) + 1 });
        notify('Conceptvolgorde aangepast. Publiceer de pagina’s om het menu bij te werken.');
    } };
    const activePages = state.pages.filter(p => !p.deletedAt), trashCount = state.pages.filter(p => p.deletedAt).length;
    const shown = state.pages.filter(p => (filter === 'trash' ? !!p.deletedAt : !p.deletedAt) && (filter === 'all' || filter === 'trash' || p.status === filter) && (group === 'all' || p.menuGroup === group) && `${p.title} ${p.slug}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'nl'));
    const parentOptions = activePages.filter(p => p.id !== draft?.id);
    const {items:revisions,error:revisionError} = useRevisions<PageContent>('pages',selectedId,persisted?.version);
    return <section className="cms-pages-manager">
    <div className="cms-section-heading"><div><span className="cms-eyebrow">Inhoud & structuur</span><h1>Pagina’s</h1><p>Geef ieder verhaal een eigen plek. Bouw met tekst en herbruikbare blokken.</p></div><button type="button" className="cms-button primary" onClick={newPage} disabled={!canEdit}><Plus size={18}/> Nieuwe pagina</button></div>
    <div className="cms-pages-layout"><aside className="cms-panel cms-pages-directory"><div className="cms-pages-directory-head"><strong><FolderTree size={16}/> Paginabibliotheek</strong><span>{activePages.length}</span></div><label className="cms-pages-search"><Search size={16}/><input aria-label="Pagina’s doorzoeken" placeholder="Zoek een pagina…" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="cms-pages-filters"><select aria-label="Filter op status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Alle pagina’s</option><option value="draft">Concepten</option><option value="review">Ter beoordeling</option><option value="published">Gepubliceerd</option><option value="trash">Prullenbak ({trashCount})</option></select><select aria-label="Filter op menuonderdeel" value={group} onChange={e => setGroup(e.target.value)}><option value="all">Alle onderdelen</option>{groups.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></div><div className="cms-pages-list">{shown.length ? shown.map(p => <div key={p.id} className={`cms-pages-list-item ${selectedId === p.id ? 'selected' : ''}`}><button type="button" className="cms-page-select" aria-current={selectedId === p.id ? 'page' : undefined} onClick={() => selectPage(p.id)}><span className={`cms-page-icon ${p.live ? 'live' : ''}`}><FileText size={17}/></span><span><strong>{p.title}</strong><small>{p.deletedAt ? 'In prullenbak' : p.status === 'draft' && p.live ? 'Live · wijzigingen in concept' : statusLabel[p.status]}{!p.menuVisible ? ' · buiten menu' : ''}</small>{p.parentId && <small className="cms-page-parent">↳ {state.pages.find(x => x.id === p.parentId)?.title || 'Bovenliggende pagina'}</small>}</span><ChevronRight size={14}/></button>{filter !== 'trash' && canEdit && <span className="cms-page-order-buttons"><button type="button" title="Pagina omhoog in conceptvolgorde" aria-label={`${p.title} omhoog`} onClick={() => reorder(p.id, -1)}><ArrowUp size={12}/></button><button type="button" title="Pagina omlaag in conceptvolgorde" aria-label={`${p.title} omlaag`} onClick={() => reorder(p.id, 1)}><ArrowDown size={12}/></button></span>}</div>) : <div className="cms-empty"><FileText size={28}/><p>Geen pagina’s gevonden.</p><button type="button" className="cms-button" onClick={() => { setQuery(''); setFilter('all'); setGroup('all'); }}>Filters wissen</button></div>}</div><div className="cms-pages-directory-foot"><Menu size={14}/><span>Menu en volgorde worden bij publicatie bijgewerkt.</span></div></aside>
      <div className="cms-pages-main">{!draft ? <div className="cms-panel cms-empty"><FileText size={36}/><h2>Een plek voor elk clubverhaal</h2><p>Selecteer een pagina of begin met een nieuw concept.</p><button type="button" className="cms-button primary" onClick={newPage} disabled={!canEdit}><Plus size={16}/> Pagina aanmaken</button></div> : <>
        <div className="cms-panel cms-page-editor-head"><div className="cms-page-breadcrumb"><span>Pagina’s</span><ChevronRight size={13}/><strong>{draft.title || 'Naamloze pagina'}</strong><span className={`cms-status ${persisted?.status || draft.status}`}>{persisted?.deletedAt ? 'Prullenbak' : statusLabel[persisted?.status || draft.status]}</span></div><div className="cms-page-actions"><span className="cms-page-save-status" aria-live="polite">{workingChanged ? <><Clock3 size={14}/> Opslaan…</> : <><Check size={14}/>{savedAt ? `Bewaard om ${new Date(savedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : 'Opgeslagen'}</>}</span><button type="button" className="cms-button" onClick={() => setPreview(x => !x)} aria-pressed={preview}><Eye size={16}/>{preview ? 'Bewerken' : 'Voorbeeld'}</button><button type="button" className="cms-button" disabled={!canEdit || !!persisted?.deletedAt} onClick={() => save()}><Save size={16}/><span>Bewaren</span></button>{!persisted?.deletedAt && <button type="button" className="cms-button primary" disabled={!canPublish} onClick={publish}><Send size={16}/>{!draft.useBuilder ? 'Blokken publiceren' : 'Publiceren'}</button>}<div className="cms-page-more"><button type="button" className="cms-button" onClick={() => setMore(x => !x)} aria-label="Meer pagina-acties" aria-expanded={more}><MoreHorizontal size={18}/></button>{more && <div className="cms-page-action-menu"><button type="button" disabled={!canEdit} onClick={duplicate}><Copy size={15}/> Dupliceren</button><button type="button" disabled={!canEdit || !!persisted?.deletedAt} onClick={review}><ShieldCheck size={15}/> Ter beoordeling</button>{persisted?.live && <button type="button" disabled={!canPublish} onClick={unpublish}><Globe size={15}/> Publicatie intrekken</button>}{!persisted?.deletedAt && <button type="button" disabled={!canEdit || !!persisted?.live && !canPublish} className="danger" onClick={() => { setDeleteConfirm(true); setMore(false); }}><Trash2 size={15}/> Naar prullenbak</button>}</div>}</div><button type="button" className="cms-button cms-mobile-page-settings" aria-label="Pagina-instellingen openen" onClick={() => setMobileSettings(x => !x)}><Settings2 size={17}/></button></div></div>
        {errors.length > 0 && <div className="cms-page-alert error" role="alert"><strong>Controleer je pagina</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
        {persisted?.deletedAt ? <div className="cms-panel cms-empty"><Trash2 size={32}/><h2>Deze pagina staat in de prullenbak</h2><p>De inhoud is bewaard. Herstel de pagina om verder te werken.</p><button type="button" className="cms-button primary" onClick={() => restore(draft.id)} disabled={!canEdit}><RotateCcw size={16}/> Herstellen als concept</button></div> : <>
        {!draft.useBuilder && <div className="cms-page-alert"><FileText size={19}/><div><strong>Deze pagina gebruikt het bestaande ontwerp</strong><p>Werk hier aan een nieuwe indeling. Pas met ‘Blokken publiceren’ vervangt deze werkversie de huidige pagina. {!draft.body.content?.length || isEmptyBody(draft) ? 'De huidige pagina-inhoud blijft tot dat moment behouden.' : ''}</p></div><a href={`/clubmuur/${persisted?.live?.slug || draft.slug}`} target="_blank" rel="noreferrer" className="cms-button">Huidige pagina <ExternalLink size={13}/></a></div>}
        {preview ? <div className="cms-panel cms-page-preview"><div className="cms-page-preview-bar"><span><Eye size={15}/> Voorbeeld van je werkversie</span><button type="button" className="cms-button" onClick={() => setPreview(false)}><ArrowLeft size={15}/> Verder bewerken</button></div><div>{[320,390,768,1440].map(w=><button className="cms-button" key={w} onClick={()=>setPreviewWidth(w)}>{w}px</button>)}</div><ResponsivePreview width={previewWidth}><CmsProvider initialState={state} preview><CmsPageView page={pageContent(draft)}/></CmsProvider></ResponsivePreview></div> : <div className={`cms-pages-edit-layout ${mobileSettings ? 'show-settings' : ''}`}><div className="cms-panel cms-page-composer" data-page-id={draft.id}><div className="cms-page-title-fields"><label className="cms-field">Paginatitel<input className="cms-page-title-input" value={draft.title} placeholder="Geef je pagina een titel" disabled={!canEdit} onChange={e => patch({ title: e.target.value })}/></label><label className="cms-field">Introductie<textarea value={draft.intro} rows={2} placeholder="Een korte introductie, direct onder de titel." disabled={!canEdit} onChange={e => patch({ intro: e.target.value })}/></label></div><BlockEditor key={draft.id} value={draft.body} editable={canEdit} onChange={body => patch({ body, bodyFormat: 'page-layout-v2' })}/></div>
          <aside className="cms-panel cms-page-settings"><div className="cms-page-settings-tabs"><button type="button" className={panel === 'page' ? 'active' : ''} onClick={() => setPanel('page')}><Settings2 size={15}/> Pagina</button><button type="button" className={panel === 'seo' ? 'active' : ''} onClick={() => setPanel('seo')}><Search size={15}/> SEO</button><button type="button" className={panel === 'revisions' ? 'active' : ''} onClick={() => setPanel('revisions')} title="Revisies"><History size={16}/></button></div>{panel === 'page' ? <div className="cms-page-settings-body"><SchedulingControl key={draft.id} module="pages" record={{...draft,version:persisted?.version,scheduledAt:persisted?.scheduledAt,status:persisted?.status}} disabled={!canPublish}/><h3>Structuur & zichtbaarheid</h3><label className="cms-field">Paginapad / slug<div className="cms-slug-prefix">/clubmuur/</div><input value={draft.slug} disabled={!canEdit} onChange={e => patch({ slug: e.target.value.toLowerCase().replace(/^\/+/, '') })}/><small>Bij een gewijzigd pad maken we bij publicatie automatisch een doorverwijzing aan.</small></label><button type="button" className="cms-page-text-button" disabled={!canEdit} onClick={() => patch({ slug: `${draft.menuGroup === 'overig' ? 'club' : draft.menuGroup}/${slugify(draft.title)}` })}>Pad genereren uit titel</button><label className="cms-field">Bovenliggende pagina<select value={draft.parentId} disabled={!canEdit} onChange={e => patch({ parentId: e.target.value })}><option value="">Geen — hoofdniveau</option>{parentOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><small>De hiërarchie bepaalt de structuur; het pad beheer je hierboven.</small></label><label className="cms-field">Menuonderdeel<select value={draft.menuGroup} disabled={!canEdit} onChange={e => patch({ menuGroup: e.target.value })}>{groups.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="cms-checkbox"><input type="checkbox" checked={draft.menuVisible && !hiddenSlugs.includes(draft.slug)} disabled={!canEdit || hiddenSlugs.includes(draft.slug)} onChange={e => patch({ menuVisible: e.target.checked })}/><span>Weergeven in het menu</span></label>{hiddenSlugs.includes(draft.slug) && <p className="cms-meta">Deze pagina blijft voorlopig buiten het menu, zoals afgesproken.</p>}<label className="cms-field">Volgorde<input type="number" min={0} max={9999} value={draft.order} disabled={!canEdit} onChange={e => patch({ order: Math.max(0, Number(e.target.value) || 0) })}/></label><div className="cms-page-live-info"><Globe size={17}/><div><strong>{persisted?.live ? 'Er is een gepubliceerde versie' : 'Nog niet gepubliceerd'}</strong><p>{unpublishedChanges ? 'Je werkversie bevat wijzigingen die nog niet op de website staan.' : 'De werkversie is gelijk aan de gepubliceerde inhoud.'}</p>{persisted?.live && <a target="_blank" rel="noreferrer" href={`/clubmuur/${persisted.live.slug}`}>Open openbare pagina <ExternalLink size={12}/></a>}</div></div></div> : panel === 'seo' ? <div className="cms-page-settings-body"><h3>Vindbaarheid</h3><label className="cms-field">SEO-titel<input value={draft.seo.title} placeholder={draft.title} disabled={!canEdit} onChange={e => patch({ seo: { ...draft.seo, title: e.target.value } })}/><small>{(draft.seo.title || draft.title).length} tekens · richtlijn 50–60</small></label><label className="cms-field">Beschrijving<textarea rows={5} value={draft.seo.description} placeholder={draft.intro || 'Beschrijf kort waar deze pagina over gaat.'} disabled={!canEdit} onChange={e => patch({ seo: { ...draft.seo, description: e.target.value } })}/><small>{(draft.seo.description || draft.intro).length} tekens · richtlijn 150–160</small></label><label className="cms-checkbox"><input type="checkbox" checked={draft.seo.noIndex} disabled={!canEdit} onChange={e => patch({ seo: { ...draft.seo, noIndex: e.target.checked } })}/><span>Zoekmachines vragen deze pagina niet te indexeren</span></label><div className="cms-seo-preview"><span>duindorpsv.nl › {draft.slug.replaceAll('/', ' › ')}</span><strong>{draft.seo.title || draft.title || 'Paginatitel'} | Duindorp SV</strong><p>{draft.seo.description || draft.intro || 'Je paginabeschrijving verschijnt hier.'}</p></div><p className="cms-meta">Dit is een indicatief zoekresultaat. SEO-inhoud wordt bij publicatie in de serverrespons opgenomen.</p></div> : <div className="cms-page-settings-body"><h3>Revisies</h3><p className="cms-meta">Bij bewaren en publiceren maken we een herstelpunt. De laatste 30 worden hier getoond.</p>{revisionError&&<p role="alert">{revisionError}</p>}{revisions.length ? <div className="cms-page-revisions">{revisions.map(revision => <article key={revision.id}><History size={16}/><div><strong>{revision.label}</strong><small>{formatDate(revision.at)}</small><button type="button" disabled={!canEdit} onClick={() => { if (!draft)
                    return; setDraft({ ...draft, ...structuredClone(revision.data), status: 'draft' }); setErrors([]); notify('Revisie teruggezet in je werkversie. Publiceer om deze op de website te zetten.'); }}>Terugzetten als concept <RotateCcw size={12}/></button></div></article>)}</div> : <div className="cms-empty"><History size={28}/><p>Nog geen revisies. Bewaar een herstelpunt met ‘Bewaren’.</p></div>}</div>}</aside>
        </div>}
        </>}
      </>}</div>
    </div>
    {draft && <Dialog.Root open={deleteConfirm} onOpenChange={setDeleteConfirm}><Dialog.Portal><Dialog.Overlay className="cms-page-dialog-overlay"/><Dialog.Content className="cms-page-dialog"><button type="button" className="cms-dialog-close cms-icon-button" aria-label="Sluiten" onClick={() => setDeleteConfirm(false)}><X size={19}/></button><span className="cms-dialog-icon"><Trash2 size={25}/></span><Dialog.Title>Pagina naar de prullenbak?</Dialog.Title><Dialog.Description>‘{draft.title}’ verdwijnt uit het menu en uit de CMS-publicatie. Je kunt de inhoud later herstellen.</Dialog.Description>{draft.system && <p>Dit is een systeempagina. Controleer of andere pagina’s er nog naartoe verwijzen voordat je hem verwijdert.</p>}<div className="cms-toolbar"><button type="button" className="cms-button" onClick={() => setDeleteConfirm(false)}>Annuleren</button><button type="button" className="cms-button danger" onClick={trash}><Trash2 size={15}/> Naar prullenbak</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>}
  </section>;
}

'use client';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Download, ExternalLink, FileText, Layers, Plus, RotateCcw, Save, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { parseCmsState, useCMS } from './provider';
import { now, safeUrl, uid } from '@/lib/cms/model';
import { deleteMediaBlob, getMediaBlob, putMediaBlob, validateImageFile } from '@/lib/cms/media-storage';
import type { CmsDoc, CmsDocument, CmsState } from '@/lib/cms/types';
import { HeroEditor } from '@/components/hero-editor';
import { cmsArticlesForSite } from '@/lib/cms/adapters';
import { storyFormatLabel } from '@/lib/cms/content';
import { defaultHeroCards, validHeroCards, type HeroCardConfig } from '@/lib/clubmuur-config';
import { defaultClubNavigation, migrateClubNavigation, validClubNavigation, type ClubNavigationItem } from '@/lib/clubmuur-navigation';
type SelectionItem = {
    id: string;
    title: string;
    meta: string;
    src?: string;
};
function SelectionList({ title, intro, items, selected, onChange, disabled }: {
    title: string;
    intro: string;
    items: SelectionItem[];
    selected: string[];
    onChange: (ids: string[]) => void;
    disabled: boolean;
}) {
    const ordered = [...selected.map(id => items.find(item => item.id === id)).filter((item): item is SelectionItem => Boolean(item)), ...items.filter(item => !selected.includes(item.id))];
    function move(id: string, direction: number) { const ids = [...selected]; const i = ids.indexOf(id); const target = i + direction; if (i < 0 || target < 0 || target >= ids.length)
        return; [ids[i], ids[target]] = [ids[target], ids[i]]; onChange(ids); }
    return <section className="cms-panel cms-home-selection"><div className="cms-section-heading"><div><h3>{title}</h3><p className="cms-meta">{intro}</p></div><span className="cms-status">{selected.length} geselecteerd</span></div>
    {ordered.length ? <div className="cms-selection-list">{ordered.map(item => <div key={item.id} className={`cms-selection-row ${selected.includes(item.id) ? 'is-selected' : ''}`}><label><input type="checkbox" checked={selected.includes(item.id)} disabled={disabled} onChange={e => onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>{item.src ? <img src={item.src} alt=""/> : <span className="cms-selection-icon"><Layers size={20}/></span>}<span><strong>{item.title}</strong><small>{item.meta}</small></span></label>{selected.includes(item.id) && <div className="cms-selection-order"><button className="cms-icon-button" type="button" disabled={disabled || selected.indexOf(item.id) === 0} aria-label={`${item.title} eerder`} onClick={() => move(item.id, -1)}><ArrowUp size={15}/></button><button className="cms-icon-button" type="button" disabled={disabled || selected.indexOf(item.id) === selected.length - 1} aria-label={`${item.title} later`} onClick={() => move(item.id, 1)}><ArrowDown size={15}/></button></div>}</div>)}</div> : <div className="cms-empty"><p>Publiceer eerst inhoud om deze hier te kunnen uitlichten.</p></div>}
  </section>;
}
export function HomeManager() {
    const { state, update, can, notify } = useCMS();
    const [draft, setDraft] = useState(() => ({ heading: state.settings.homepageHeading, articles: state.settings.homepageArticleIds.filter(id => state.articles.some(a => a.id === id && a.live?.contentType === 'news' && !a.deletedAt)), stories: state.settings.homepageStoryIds.filter(id => state.articles.some(a => a.id === id && a.live?.contentType === 'story' && !a.deletedAt)), photos: [...state.settings.homepagePhotoIds], albums: [...state.settings.homepageAlbumIds] }));
    const [homeTab, setHomeTab] = useState<'selections' | 'hero'>('selections');
    const editable = can('pages') && can('publish');
    const articles = state.articles.filter(a => a.live?.contentType === 'news' && !a.deletedAt).map(a => ({ id: a.id, title: a.live!.title, meta: a.live!.category, src: state.media.find(m => m.id === a.live!.coverId && m.published && !m.deletedAt)?.src }));
    const stories = state.articles.filter(a => a.live?.contentType === 'story' && !a.deletedAt).map(a => ({ id: a.id, title: a.live!.title, meta: `${storyFormatLabel[a.live!.storyFormat]} · ${a.live!.author}`, src: state.media.find(m => m.id === a.live!.coverId && m.published && !m.deletedAt)?.src }));
    const photos = state.media.filter(m => m.published && !m.deletedAt && m.src).map(m => ({ id: m.id, title: m.name, meta: m.caption || m.alt, src: m.src }));
    const albums = state.albums.filter(a => a.published && !a.deletedAt).map(a => ({ id: a.id, title: a.title, meta: `${a.mediaIds.length} foto’s · ${a.season}`, src: state.media.find(m => m.id === a.coverId && m.published && !m.deletedAt)?.src }));
    return <div className="cms-home-manager"><div className="cms-toolbar"><button className={`cms-button ${homeTab === 'selections' ? 'primary' : ''}`} onClick={() => setHomeTab('selections')}>Uitgelichte inhoud</button><button className={`cms-button ${homeTab === 'hero' ? 'primary' : ''}`} disabled={!editable} onClick={() => setHomeTab('hero')}>Vier vakken bovenaan</button></div>{homeTab === 'hero' ? (editable ? <HeroEditor articles={cmsArticlesForSite(state).filter(a => articles.some(item => item.id === a.id))}/> : <div className="cms-panel">Voor deze instellingen zijn pagina- en publicatierechten nodig.</div>) : <><section className="cms-panel"><div className="cms-section-heading"><div><h3>Jouw club. Jouw voorpagina.</h3><p className="cms-meta">Bepaal wat bezoekers als eerste ontdekken. Alleen gepubliceerde inhoud is beschikbaar.</p></div><a className="cms-button" href="/clubmuur" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Bekijk homepage</a></div><label className="cms-field">Titel boven de fotomuur<input value={draft.heading} disabled={!editable} maxLength={100} onChange={e => setDraft({ ...draft, heading: e.target.value })}/></label></section>
    <SelectionList title="Uitgelicht nieuws" intro="Deze nieuwsberichten krijgen voorrang bij Nieuws op de homepage. Gebruik de pijlen om de volgorde te bepalen." items={articles} selected={draft.articles} disabled={!editable} onChange={ids => setDraft({ ...draft, articles: ids })}/>
    <SelectionList title="Uitgelichte verhalen" intro="Columns, interviews en clubverhalen krijgen een eigen plek op de homepage. Ze verschijnen niet tussen de nieuwsberichten." items={stories} selected={draft.stories} disabled={!editable} onChange={ids => setDraft({ ...draft, stories: ids })}/>
    <SelectionList title="Fotomuur" intro="Kies de beelden die het clubgevoel laten zien. De volgorde loopt van links naar rechts." items={photos} selected={draft.photos} disabled={!editable} onChange={ids => setDraft({ ...draft, photos: ids })}/>
    <SelectionList title="Albums op de homepage" intro="Laat bezoekers vanuit de homepage verder kijken in deze albums." items={albums} selected={draft.albums} disabled={!editable} onChange={ids => setDraft({ ...draft, albums: ids })}/>
    <div className="cms-toolbar"><button className="cms-button primary" disabled={!editable} onClick={async () => {
                if (!draft.heading.trim())
                    return notify('Vul een titel voor de fotomuur in.');
                if (await update(data => {
                    data.settings.homepageHeading = draft.heading.trim();
                    data.settings.homepageArticleIds = draft.articles.filter(id => data.articles.some(a => a.id === id && !a.deletedAt && a.live?.contentType === 'news'));
                    data.settings.homepageStoryIds = draft.stories.filter(id => data.articles.some(a => a.id === id && !a.deletedAt && a.live?.contentType === 'story'));
                    data.settings.homepagePhotoIds = draft.photos.filter(id => photos.some(m => m.id === id));
                    data.settings.homepageAlbumIds = draft.albums.filter(id => albums.some(a => a.id === id));
                    for (const m of data.media)
                        m.featured = data.settings.homepagePhotoIds.includes(m.id);
                    for (const article of data.articles) {
                        if (!article.live || article.deletedAt)
                            continue;
                        const featured = (article.live.contentType === 'story' ? data.settings.homepageStoryIds : data.settings.homepageArticleIds).includes(article.id);
                        if (article.status === 'published')
                            article.featured = featured;
                        article.live.featured = featured;
                    }
                }, 'Homepage-selecties bijgewerkt'))
                    notify('Homepage bijgewerkt in deze lokale site.');
            }}><Save size={17}/> Homepage opslaan</button><p className="cms-meta">Opgeslagen keuzes zijn direct zichtbaar in deze browser.</p></div></>}
  </div>;
}
type BackupBlob = {
    key: string;
    type: string;
    data: string;
};
type BackupAppearance = {
    heroCards: HeroCardConfig[];
    navigation: ClubNavigationItem[];
};
type Backup = {
    format: 'duindorp-cms-backup-v1';
    createdAt: string;
    state: CmsState;
    blobs: BackupBlob[];
    appearance: BackupAppearance;
};
type BackupPreview = {
    state: CmsState;
    blobs: BackupBlob[];
    name: string;
    createdAt: string;
    missing: number;
    appearance?: BackupAppearance;
};
function readAppearance(): BackupAppearance {
    let heroCards = defaultHeroCards;
    let navigation = defaultClubNavigation;
    try {
        const value = JSON.parse(localStorage.getItem('duindorp-hero-cards') || 'null');
        if (validHeroCards(value))
            heroCards = value;
    }
    catch { }
    try {
        const value = migrateClubNavigation(JSON.parse(localStorage.getItem('duindorp-clubmuur-navigation-v1') || 'null'));
        if (validClubNavigation(value))
            navigation = value;
    }
    catch { }
    return { heroCards, navigation };
}
const readDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Een fotobestand kon niet worden gelezen.')); reader.readAsDataURL(blob); });
function downloadJson(value: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
function decodeBackupBlob(entry: BackupBlob) { if (!entry || typeof entry.key !== 'string' || typeof entry.type !== 'string' || typeof entry.data !== 'string' || !['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(entry.type) || entry.data.length > 12000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data))
    throw new Error('De back-up bevat een ongeldig fotobestand.'); const decoded = atob(entry.data); const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0)); return new File([bytes], entry.key, { type: entry.type }); }
export function RecoveryManager() {
    const { state, update, can, notify, setRoleId } = useCMS();
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<BackupPreview | null>(null);
    const [replace, setReplace] = useState(false);
    const [activeTab, setActiveTab] = useState<'backup' | 'trash' | 'audit' | 'redirects'>('backup');
    const input = useRef<HTMLInputElement>(null);
    const admin = can('settings');
    const trash = [
        ...state.articles.filter(a => a.deletedAt).map(a => ({ id: a.id, type: 'Nieuws', name: a.title, at: a.deletedAt!, permission: 'news' as const, teamId: a.teamId })),
        ...state.pages.filter(a => a.deletedAt).map(a => ({ id: a.id, type: 'Pagina', name: a.title, at: a.deletedAt!, permission: 'pages' as const, teamId: '' })),
        ...state.media.filter(a => a.deletedAt).map(a => ({ id: a.id, type: 'Foto', name: a.name, at: a.deletedAt!, permission: 'media' as const, teamId: a.teamId })),
        ...state.albums.filter(a => a.deletedAt).map(a => ({ id: a.id, type: 'Album', name: a.title, at: a.deletedAt!, permission: 'media' as const, teamId: a.teamId })),
        ...state.people.filter(a => a.deletedAt).map(a => ({ id: a.id, type: 'Persoon', name: a.name, at: a.deletedAt!, permission: 'people' as const, teamId: a.teamId })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    async function exportBackup() {
        if (!admin || busy)
            return;
        setBusy(true);
        try {
            const data = structuredClone(state);
            const blobs: BackupBlob[] = [];
            const keys = Array.from(new Set(data.media.flatMap(m => m.blobKey ? [m.blobKey] : [])));
            let missing = 0;
            for (const key of keys) {
                const blob = await getMediaBlob(key);
                if (blob)
                    blobs.push({ key, type: blob.type, data: await readDataUrl(blob) });
                else
                    missing++;
            }
            data.media.forEach(m => { if (m.blobKey)
                m.src = ''; });
            const backup: Backup = { format: 'duindorp-cms-backup-v1', createdAt: now(), state: data, blobs, appearance: readAppearance() };
            downloadJson(backup, `duindorp-cms-${new Date().toISOString().slice(0, 10)}.json`);
            notify(missing ? `Back-up gedownload. ${missing} eerder ontbrekende fotobestanden konden niet worden meegenomen.` : `Back-up gedownload, inclusief ${blobs.length} geüploade fotobestanden.`);
        }
        catch (error) {
            notify(error instanceof Error ? error.message : 'Back-up maken is mislukt.');
        }
        finally {
            setBusy(false);
        }
    }
    async function readBackup(file?: File) {
        if (!file || !admin || busy)
            return;
        setBusy(true);
        setPreview(null);
        setReplace(false);
        try {
            if (file.size > 128 * 1024 * 1024)
                throw new Error('Deze back-up is groter dan 128 MB en kan niet in deze conceptomgeving worden geïmporteerd.');
            const value = JSON.parse(await file.text());
            const isBackup = value?.format === 'duindorp-cms-backup-v1';
            const data = parseCmsState(JSON.stringify(isBackup ? value.state : value));
            const blobs: BackupBlob[] = isBackup && Array.isArray(value.blobs) ? value.blobs : [];
            const seen = new Set<string>();
            for (const entry of blobs) {
                if (seen.has(entry.key))
                    throw new Error('De back-up bevat dubbele fotobestanden.');
                seen.add(entry.key);
                decodeBackupBlob(entry);
            }
            const missing = data.media.filter(m => m.blobKey && !seen.has(m.blobKey)).length;
            let appearance: BackupAppearance | undefined;
            if (isBackup && value.appearance) {
                const navigation = migrateClubNavigation(value.appearance.navigation);
                if (!validHeroCards(value.appearance.heroCards) || !validClubNavigation(navigation))
                    throw new Error('De hero- of navigatie-instellingen in deze back-up zijn ongeldig.');
                appearance = { heroCards: value.appearance.heroCards, navigation };
            }
            setPreview({ state: data, blobs, name: file.name, createdAt: isBackup && typeof value.createdAt === 'string' ? value.createdAt : '', missing, appearance });
        }
        catch (error) {
            notify(error instanceof Error ? error.message : 'Dit bestand kon niet worden gelezen.');
        }
        finally {
            setBusy(false);
            if (input.current)
                input.current.value = '';
        }
    }
    async function importBackup() {
        if (!preview || !replace || !admin || busy)
            return;
        setBusy(true);
        const created: {
            key: string;
            url: string;
        }[] = [];
        const previousAppearance = readAppearance();
        let appearanceWritten = false;
        try {
            const data = structuredClone(preview.state);
            const remap = new Map<string, {
                key: string;
                url: string;
            }>();
            for (const entry of preview.blobs) {
                const file = decodeBackupBlob(entry);
                const error = await validateImageFile(file);
                if (error)
                    throw new Error(`Een foto in de back-up is ongeldig: ${error}.`);
                const key = uid('imported-media');
                await putMediaBlob(key, file);
                const url = URL.createObjectURL(file);
                created.push({ key, url });
                remap.set(entry.key, { key, url });
            }
            for (const photo of data.media) {
                if (photo.blobKey) {
                    const stored = remap.get(photo.blobKey);
                    photo.blobKey = stored?.key || `missing-${uid()}`;
                    photo.src = stored?.url || '';
                }
            }
            if (preview.appearance) {
                appearanceWritten = true;
                localStorage.setItem('duindorp-hero-cards', JSON.stringify(preview.appearance.heroCards));
                localStorage.setItem('duindorp-clubmuur-navigation-v1', JSON.stringify(preview.appearance.navigation));
            }
            if (!await update(draft => { Object.assign(draft, data); }, `Back-up “${preview.name}” teruggezet`))
                throw new Error('De back-up kon niet als actieve inhoud worden opgeslagen. De bestaande inhoud is behouden.');
            if (preview.appearance) {
                window.dispatchEvent(new Event('duindorp-hero'));
                window.dispatchEvent(new Event('duindorp-navigation'));
            }
            setRoleId('admin');
            setPreview(null);
            setReplace(false);
            notify('Back-up teruggezet. Alle CMS-inhoud is vervangen in deze browser.');
        }
        catch (error) {
            if (appearanceWritten) {
                try {
                    localStorage.setItem('duindorp-hero-cards', JSON.stringify(previousAppearance.heroCards));
                    localStorage.setItem('duindorp-clubmuur-navigation-v1', JSON.stringify(previousAppearance.navigation));
                }
                catch { }
            }
            for (const item of created) {
                URL.revokeObjectURL(item.url);
                await deleteMediaBlob(item.key).catch(() => undefined);
            }
            notify(error instanceof Error ? error.message : 'Terugzetten is mislukt.');
        }
        finally {
            setBusy(false);
        }
    }
    async function restore(item: typeof trash[number]) {
        if (!can(item.permission, item.teamId))
            return notify('Je hebt geen rechten om deze inhoud te herstellen.');
        let restoredSrc = '';
        if (item.type === 'Foto') {
            const media = state.media.find(m => m.id === item.id);
            if (media?.blobKey) {
                try {
                    const blob = await getMediaBlob(media.blobKey);
                    if (blob)
                        restoredSrc = URL.createObjectURL(blob);
                }
                catch {
                    notify('Het fotobestand kon niet worden geladen.');
                    return;
                }
            }
        }
        await update(data => {
            if (item.type === 'Nieuws') {
                const row = data.articles.find(a => a.id === item.id);
                if (row) {
                    delete row.deletedAt;
                    delete row.live;
                    row.status = 'draft';
                    row.scheduledAt = '';
                    row.updatedAt = now();
                }
            }
            if (item.type === 'Pagina') {
                const row = data.pages.find(a => a.id === item.id);
                if (row) {
                    delete row.deletedAt;
                    delete row.live;
                    row.status = 'draft';
                    row.updatedAt = now();
                }
            }
            if (item.type === 'Foto') {
                const row = data.media.find(a => a.id === item.id);
                if (row) {
                    delete row.deletedAt;
                    row.published = false;
                    row.featured = false;
                    if (row.blobKey)
                        row.src = restoredSrc;
                }
            }
            if (item.type === 'Album') {
                const row = data.albums.find(a => a.id === item.id);
                if (row) {
                    delete row.deletedAt;
                    row.published = false;
                }
            }
            if (item.type === 'Persoon') {
                const row = data.people.find(a => a.id === item.id);
                if (row) {
                    delete row.deletedAt;
                    row.published = false;
                }
            }
        }, `${item.type} “${item.name}” hersteld als concept`);
    }
    return <div className="cms-recovery-manager"><div className="cms-toolbar">{([{ id: 'backup', label: 'Back-up & herstel' }, { id: 'trash', label: `Prullenbak (${trash.length})` }, { id: 'audit', label: 'Activiteitenlog' }, { id: 'redirects', label: 'Omleidingen' }] as const).map(t => <button key={t.id} className={`cms-button ${activeTab === t.id ? 'primary' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}</div>
    {activeTab === 'backup' && <><section className="cms-panel cms-backup-hero"><ShieldCheck size={36}/><div><h3>Neem je clubinhoud mee</h3><p>Bewaar een volledige kopie van je nieuws, pagina’s, instellingen en geüploade foto’s. De back-up bevat ook concepten, contactberichten en de prullenbak.</p><p className="cms-meta">Dit CMS gebruikt lokale browseropslag. Bewaar zelf regelmatig een back-up op een vertrouwde plek.</p></div></section><div className="cms-grid cms-backup-grid"><section className="cms-panel"><Download size={24}/><h3>Back-up downloaden</h3><p className="cms-meta">Eén JSON-bestand met alle CMS-inhoud, beschikbare fotobestanden, de vier hero-vakken en navigatie-instellingen.</p><button className="cms-button primary" disabled={!admin || busy} onClick={() => void exportBackup()}><Download size={16}/>{busy ? 'Even geduld…' : 'Volledige back-up maken'}</button></section><section className="cms-panel"><Upload size={24}/><h3>Back-up terugzetten</h3><p className="cms-meta">Selecteer een eerder gemaakte back-up. Je krijgt eerst een overzicht te zien voordat je de huidige inhoud vervangt. Maximaal 128 MB.</p><input ref={input} hidden type="file" accept="application/json,.json" onChange={e => void readBackup(e.target.files?.[0])}/><button className="cms-button" disabled={!admin || busy} onClick={() => input.current?.click()}><Upload size={16}/> Back-up selecteren</button></section></div>
    {preview && <section className="cms-panel cms-backup-preview"><div className="cms-section-heading"><h3>Controleer je back-up</h3><button className="cms-icon-button" aria-label="Import annuleren" disabled={busy} onClick={() => setPreview(null)}><X size={18}/></button></div><p><strong>{preview.name}</strong>{preview.createdAt && ` · ${new Date(preview.createdAt).toLocaleString('nl-NL')}`}</p><div className="cms-backup-counts"><span><strong>{preview.state.articles.length}</strong> nieuwsberichten</span><span><strong>{preview.state.pages.length}</strong> pagina’s</span><span><strong>{preview.state.albums.length}</strong> albums</span><span><strong>{preview.blobs.length}</strong> fotobestanden</span></div>{preview.missing > 0 && <p className="cms-warning">{preview.missing} geüploade foto’s hebben geen bijgevoegd bestand. Die beelden zijn na import niet beschikbaar.</p>}<label className="cms-check"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} disabled={busy}/> Ik wil de huidige CMS-inhoud in deze browser vervangen door deze back-up.</label><button className="cms-button primary" disabled={!replace || busy || !admin} onClick={() => void importBackup()}><RotateCcw size={16}/>{busy ? 'Back-up terugzetten…' : 'Bevestigen en terugzetten'}</button></section>}</>}
    {activeTab === 'trash' && <section className="cms-panel"><div className="cms-section-heading"><div><h3>Niets zomaar kwijt</h3><p className="cms-meta">Herstel verwijderde inhoud als concept. Je bepaalt daarna zelf wanneer deze weer gepubliceerd wordt.</p></div></div>{trash.length ? <div className="cms-record-list">{trash.map(item => <div className="cms-record-row" key={`${item.type}-${item.id}`}><span className="cms-status">{item.type}</span><div><strong>{item.name || 'Zonder titel'}</strong><small>{new Date(item.at).toLocaleString('nl-NL')}</small></div><button className="cms-button" disabled={!can(item.permission, item.teamId)} onClick={() => void restore(item)}><RotateCcw size={15}/> Herstellen</button></div>)}</div> : <div className="cms-empty"><Trash2 size={30}/><h3>De prullenbak is leeg</h3><p>Verwijderde nieuwsberichten, pagina’s, foto’s, albums en personen verschijnen hier.</p></div>}</section>}
    {activeTab === 'audit' && <section className="cms-panel"><h3>Wat is er veranderd?</h3><p className="cms-meta">De laatste 250 handelingen in dit lokale concept. De rol is een voorbeeldweergave, geen geverifieerde gebruiker.</p>{state.audit.length ? <div className="cms-record-list">{state.audit.map(entry => <div className="cms-record-row" key={entry.id}><span className="cms-audit-dot"/><div><strong>{entry.action}</strong><small>{new Date(entry.at).toLocaleString('nl-NL')} · {entry.role}</small></div></div>)}</div> : <div className="cms-empty"><p>Je eerste wijziging verschijnt hier.</p></div>}</section>}
    {activeTab === 'redirects' && <section className="cms-panel"><h3>Oude links blijven bruikbaar</h3><p className="cms-meta">Bij het opnieuw publiceren van een gewijzigde slug wordt automatisch een omleiding toegevoegd. In dit concept gebeurt die in de browser; serveromleidingen volgen op de VPS.</p>{state.redirects.length ? <div className="cms-record-list">{state.redirects.map((redirect, index) => <div className="cms-record-row" key={`${redirect.from}-${index}`}><span className="cms-status">301 voorbereid</span><div><strong>/{redirect.from}</strong><small>naar /{redirect.to}</small></div></div>)}</div> : <div className="cms-empty"><p>Er zijn nog geen slugs gewijzigd na publicatie.</p></div>}</section>}
  </div>;
}
function documentReferences(doc: CmsDoc, id: string): boolean { const data = doc.attrs?.data; return Boolean((doc.type === 'cmsWidget' && doc.attrs?.kind === 'documents' && data?.ids?.includes(id)) || doc.content?.some(child => documentReferences(child, id))); }
export function DocumentsManager() {
    const { state, update, can, notify } = useCMS();
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<CmsDocument | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const editable = can('pages');
    const publication = editable && can('publish');
    const existing = draft && state.documents.find(d => d.id === draft.id);
    const contentEditable = editable && (!existing?.published || publication);
    const references = draft ? state.pages.filter(p => !p.deletedAt && p.live && documentReferences(p.live.body, draft.id)) : [];
    async function save() {
        if (!draft || !contentEditable)
            return;
        if (!draft.title.trim())
            return notify('Vul een documenttitel in.');
        if (!safeUrl(draft.url) || /^(mailto|tel):/i.test(draft.url))
            return notify('Gebruik een geldige https-link of een intern bestandspad voor het document.');
        if (draft.published && !publication)
            return notify('Je hebt geen publicatierechten.');
        if (!draft.published && references.length)
            return notify(`Dit document wordt gebruikt op: ${references.map(p => p.live!.title).join(', ')}. Verwijder eerst de documentkoppeling.`);
        const saved = { ...draft, title: draft.title.trim() };
        if (await update(data => { const i = data.documents.findIndex(d => d.id === saved.id); if (i >= 0)
            data.documents[i] = saved;
        else
            data.documents.push(saved); }, `Documentlink “${saved.title}” opgeslagen`)) {
            setDraft(saved);
            notify('Documentlink opgeslagen.');
        }
    }
    return <div className="cms-documents-manager"><div className="cms-toolbar"><label className="cms-media-search"><Search size={16}/><input placeholder="Zoek documenten…" aria-label="Zoek documenten" value={query} onChange={e => setQuery(e.target.value)}/></label><button className="cms-button primary" disabled={!editable} onClick={() => { setDraft({ id: uid('document'), title: '', url: '', category: 'Clubdocumenten', published: false }); setConfirmDelete(false); }}><Plus size={16}/> Documentlink toevoegen</button></div><section className="cms-panel"><h3>Documenten voor je paginablokken</h3><p className="cms-meta">Beheer links naar reglementen, formulieren en andere documenten. Kies ze daarna in een documentenblok van de paginabouwer. De bestaande pagina Clubdocumenten blijft voorlopig zoals afgesproken.</p></section><div className={`cms-documents-layout ${draft ? 'has-editor' : ''}`}><section className="cms-panel">{state.documents.length ? <div className="cms-record-list">{state.documents.filter(d => `${d.title} ${d.category}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl'))).map(doc => <div key={doc.id} className="cms-record-row"><FileText size={20}/><div><strong>{doc.title}</strong><small>{doc.category} · {doc.published ? 'Gepubliceerd' : 'Concept'}</small></div><button className="cms-button" onClick={() => { setDraft(structuredClone(doc)); setConfirmDelete(false); }}>Bewerken</button></div>)}</div> : <div className="cms-empty"><FileText size={30}/><h3>Een vaste plek voor clubdocumenten</h3><p>Voeg de eerste documentlink toe om deze in pagina’s te gebruiken.</p></div>}</section>{draft && <section className="cms-panel"><div className="cms-section-heading"><h3>{existing ? 'Document bewerken' : 'Nieuw document'}</h3><button className="cms-icon-button" aria-label="Document sluiten" onClick={() => setDraft(null)}><X size={18}/></button></div><fieldset disabled={!contentEditable}><label className="cms-field">Titel<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label className="cms-field">Link naar bestand<input value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…/document.pdf"/></label><label className="cms-field">Categorie<input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}/></label><label className="cms-check"><input type="checkbox" checked={draft.published} disabled={!publication} onChange={e => setDraft({ ...draft, published: e.target.checked })}/> Beschikbaar in openbare documentenblokken</label></fieldset>{references.length > 0 && <p className="cms-meta">In gebruik op: {references.map(p => p.live!.title).join(', ')}.</p>}<div className="cms-toolbar"><button className="cms-button primary" disabled={!contentEditable} onClick={save}><Check size={16}/> Opslaan</button>{safeUrl(draft.url) && !/^(mailto|tel):/i.test(draft.url) && <a className="cms-button" href={draft.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Openen</a>}{existing && <button className="cms-button danger" disabled={!contentEditable} onClick={() => { if (references.length)
        return notify('Verwijder eerst de koppelingen op gepubliceerde pagina’s.'); setConfirmDelete(true); }}><Trash2 size={16}/> Verwijderen</button>}</div>{confirmDelete && <div className="cms-warning"><p>Documentlink “{draft.title}” verwijderen? Het externe bestand blijft bestaan.</p><div className="cms-toolbar"><button className="cms-button danger" onClick={async () => { if (await update(data => { data.documents = data.documents.filter(d => d.id !== draft.id); }, `Documentlink “${draft.title}” verwijderd`)) {
        setDraft(null);
        setConfirmDelete(false);
    } }}>Ja, link verwijderen</button><button className="cms-button" onClick={() => setConfirmDelete(false)}>Annuleren</button></div></div>}</section>}</div></div>;
}

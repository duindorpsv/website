'use client';
import {Pagination,usePagination} from './pagination';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Folder, FolderPlus, GripVertical, ImagePlus, Images, Plus, Search, Star, Trash2, Upload, X } from 'lucide-react';
import { useCMS } from './provider';
import { now, slugify, uid } from '@/lib/cms/model';
import { deleteMediaBlob, putMediaBlob, validateImageFile } from '@/lib/cms/media-storage';
import type { CmsAlbum, CmsDoc, CmsMedia, CmsState } from '@/lib/cms/types';
function docUsesMedia(doc: CmsDoc, id: string): boolean {
    const data = doc.attrs?.data;
    return Boolean((doc.type === 'image' && doc.attrs?.mediaId === id)
        || (data && ((['image', 'textImage'].includes(doc.attrs?.kind) && data.refId === id) || data.ids?.includes(id)))
        || doc.content?.some(child => docUsesMedia(child, id)));
}
export function mediaReferences(state: CmsState, id: string): string[] {
    return [
        ...state.articles.filter(a => !a.deletedAt && a.live && (a.live.coverId === id || docUsesMedia(a.live.body, id))).map(a => `Nieuws: ${a.live!.title}`),
        ...state.pages.filter(p => !p.deletedAt && p.live && docUsesMedia(p.live.body, id)).map(p => `Pagina: ${p.live!.title}`),
        ...state.people.filter(p => !p.deletedAt && p.published && p.mediaId === id).map(p => `Persoon: ${p.name}`),
        ...state.albums.filter(a => !a.deletedAt && a.published && (a.coverId === id || a.mediaIds.includes(id))).map(a => `Album: ${a.title}`),
        ...(state.settings.homepagePhotoIds.includes(id) ? ['Uitgelicht op de homepage'] : []),
    ];
}
export function MediaManager({ tab = 'media' }: {
    tab?: 'media' | 'albums';
}) {
    const { state,loadMoreMedia,mediaLoading, update, can, roleId, notify, reload } = useCMS();
    const [activeTab, setActiveTab] = useState(tab);
    const [query, setQuery] = useState('');
    const [folderId, setFolderId] = useState('all');
    const [teamFilter, setTeamFilter] = useState('all');
    const [selectedId, setSelectedId] = useState('');
    const [selectedAlbumId, setSelectedAlbumId] = useState('');
    const [newFolder, setNewFolder] = useState('');
    const [folderName, setFolderName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dropActive, setDropActive] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const allowedTeams = state.settings.teams.filter(t => can('media', t.id));
    const defaultTeam = can('media') ? '' : allowedTeams[0]?.id || '';
    const [uploadTeamId, setUploadTeamId] = useState(defaultTeam);
    const [uploadSeason, setUploadSeason] = useState(state.settings.season);
    useEffect(() => setActiveTab(tab), [tab]);
    useEffect(() => { setUploadTeamId(defaultTeam); }, [roleId, defaultTeam]);
    useEffect(() => { setFolderName(state.folders.find(f => f.id === folderId)?.name || ''); }, [folderId, state.folders]);
    const media = state.media.filter(m => !m.deletedAt);
    const folderPage=usePagination(state.folders);
    const albums = state.albums.filter(a => !a.deletedAt);
    const visibleMedia = media.filter(m => (folderId === 'all' || m.folderId === folderId)
        && (teamFilter === 'all' || m.teamId === teamFilter)
        && `${m.name} ${m.alt} ${m.caption}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl')));
    const mediaPage=usePagination(visibleMedia,JSON.stringify([query,folderId,teamFilter]));
    const albumPage=usePagination(albums.filter(a=>(teamFilter==='all'||a.teamId===teamFilter)&&`${a.title} ${a.description}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl'))).sort((a,b)=>a.order-b.order),JSON.stringify([query,teamFilter]));
    const selected = media.find(m => m.id === selectedId);
    const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
    const anyMediaPermission = can('media') || allowedTeams.length > 0;
    async function upload(files: FileList | File[] | null) {
        if (!files?.length || uploading)
            return;
        if (!can('media', uploadTeamId)) {
            notify('Je hebt geen uploadrechten voor dit team.');
            return;
        }
        setUploading(true);
        const added: CmsMedia[] = [];
        const errors: string[] = [];
        try {
            for (const file of Array.from(files)) {
                try {
                    const error = await validateImageFile(file);
                    if (error) {
                        errors.push(`${file.name}: ${error}.`);
                        continue;
                    }
                    const uploadData=new FormData();uploadData.append('file',file);uploadData.append('teamId',uploadTeamId);uploadData.append('season',uploadSeason);uploadData.append('folderId',folderId==='all'?'':folderId);
                    const response=await fetch('/api/cms/media/uploads',{method:'POST',body:uploadData});const result=await response.json();if(!response.ok)throw new Error(result.message);added.push(result);
                }
                catch (error) {
                    errors.push(`${file.name}: ${error instanceof Error ? error.message : 'opslaan mislukt'}`);
                }
            }
            if (added.length) {
                await reload();setSelectedId(added[0].id);notify(`${added.length} foto’s ontvangen. Verwerking gebeurt op de server; vul alt-tekst in voor publicatie.`);
            }
            if (errors.length)
                notify(errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\nEn ${errors.length - 3} andere bestanden.` : ''));
        }
        finally {
            setUploading(false);
            if (input.current)
                input.current.value = '';
        }
    }
    async function createFolder() {
        if (!can('media'))
            return notify('Alleen een clubbrede mediabeheerder kan mappen beheren.');
        const name = newFolder.trim();
        if (!name)
            return;
        if (state.folders.some(f => f.name.toLocaleLowerCase('nl') === name.toLocaleLowerCase('nl')))
            return notify('Er bestaat al een map met deze naam.');
        const id = uid('folder');
        if (await update(draft => { draft.folders.push({ id, name }); }, `Map “${name}” aangemaakt`)) {
            setFolderId(id);
            setNewFolder('');
        }
    }
    async function createAlbum() {
        if (!can('media', uploadTeamId))
            return notify('Kies een team waarvoor je albums mag beheren.');
        const id = uid('album');
        const title = 'Nieuw album';
        const suffix = albums.length + 1;
        const album: CmsAlbum = { id, title, slug: `nieuw-album-${suffix}-${id.slice(-5)}`, description: '', date: new Date().toISOString().slice(0, 10), teamId: uploadTeamId,
            season: uploadSeason, coverId: '', mediaIds: [], published: false, order: albums.length };
        if (await update(draft => { draft.albums.push(album); }, 'Album aangemaakt'))
            setSelectedAlbumId(id);
    }
    return <div className="cms-media-workspace"><button className="cms-button" disabled={mediaLoading} onClick={()=>void loadMoreMedia()}>{mediaLoading?'Mediabibliotheek laden…':'Mediabibliotheek vernieuwen'}</button>
    <div className="cms-toolbar cms-media-toolbar">
      <div className="cms-media-tabs" role="tablist" aria-label="Mediabeheer">
        <button className={activeTab === 'media' ? 'is-active' : ''} role="tab" aria-selected={activeTab === 'media'} onClick={() => { setActiveTab('media'); setQuery(''); }}><Images size={17}/> Mediabibliotheek <span>{media.length}</span></button>
        <button className={activeTab === 'albums' ? 'is-active' : ''} role="tab" aria-selected={activeTab === 'albums'} onClick={() => { setActiveTab('albums'); setQuery(''); }}><Folder size={17}/> Albums <span>{albums.length}</span></button>
      </div>
      <label className="cms-media-search"><Search size={17}/><input aria-label={activeTab === 'media' ? 'Zoek foto’s' : 'Zoek albums'} placeholder={activeTab === 'media' ? 'Zoek foto’s…' : 'Zoek albums…'} value={query} onChange={e => setQuery(e.target.value)}/></label>
    </div>
    <div className="cms-panel cms-media-intro"><div><strong>{activeTab === 'media' ? 'Alle beelden. Eén vertrouwde plek.' : 'Herinneringen om te delen.'}</strong><p>{activeTab === 'media' ? 'Orden je bestanden in mappen, koppel ze aan teams en kies welke foto’s op de site mogen verschijnen.' : 'Maak openbare albums uit je mediabibliotheek. Een foto kan in meerdere albums staan.'}</p></div><span className="cms-status">Lokale conceptomgeving</span></div>
    <div className="cms-toolbar cms-media-filters">
      <label className="cms-field">Team<select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}><option value="all">Alle teams</option><option value="">Club algemeen</option>{state.settings.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="cms-field">Nieuw materiaal voor<select value={uploadTeamId} onChange={e => setUploadTeamId(e.target.value)} disabled={!anyMediaPermission}><option value="" disabled={!can('media')}>Club algemeen</option>{allowedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="cms-field">Seizoen<input value={uploadSeason} onChange={e => setUploadSeason(e.target.value)} placeholder="2026–2027"/></label>
      {activeTab === 'albums' && <button className="cms-button primary" disabled={!can('media', uploadTeamId)} onClick={createAlbum}><Plus size={17}/> Nieuw album</button>}
    </div>
    {activeTab === 'media' ? <div className="cms-media-layout">
      <aside className="cms-panel cms-folder-sidebar">
        <h3>Mappen</h3>
        <button className={folderId === 'all' ? 'is-active' : ''} onClick={() => setFolderId('all')}><Images size={16}/> Alle foto’s <span>{media.length}</span></button>
        <button className={folderId === '' ? 'is-active' : ''} onClick={() => setFolderId('')}><Folder size={16}/> Losse bestanden <span>{media.filter(m => !m.folderId).length}</span></button>
        {folderPage.items.map(f => <button key={f.id} className={folderId === f.id ? 'is-active' : ''} onClick={() => setFolderId(f.id)}><Folder size={16}/><span className="cms-folder-name">{f.name}</span><span>{media.filter(m => m.folderId === f.id).length}</span></button>)}
        <Pagination label="Mappen" {...folderPage}/>
        {can('media') && <form className="cms-folder-form" onSubmit={e => { e.preventDefault(); createFolder(); }}><label className="cms-field">Nieuwe map<input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Bijv. Jeugd / seizoen 26–27" maxLength={80}/></label><button className="cms-button" type="submit" disabled={!newFolder.trim()}><FolderPlus size={15}/> Map maken</button></form>}
        {folderId && folderId !== 'all' && can('media') && <div className="cms-folder-edit"><label className="cms-field">Mapnaam<input value={folderName} onChange={e => setFolderName(e.target.value)} maxLength={80}/></label><button className="cms-button" onClick={async () => {
                    const name = folderName.trim();
                    if (!name)
                        return notify('Vul een mapnaam in.');
                    if (state.folders.some(f => f.id !== folderId && f.name.toLocaleLowerCase('nl') === name.toLocaleLowerCase('nl')))
                        return notify('Deze mapnaam bestaat al.');
                    await update(draft => { const f = draft.folders.find(x => x.id === folderId); if (f)
                        f.name = name; }, 'Map hernoemd');
                }}>Hernoemen</button><button className="cms-button danger" onClick={async () => {
                    if (state.media.some(m => m.folderId === folderId))
                        return notify('Deze map bevat nog foto’s, ook mogelijk in de prullenbak. Verplaats die eerst naar een andere map.');
                    if (await update(draft => { draft.folders = draft.folders.filter(f => f.id !== folderId); }, 'Lege map verwijderd'))
                        setFolderId('all');
                }}><Trash2 size={14}/> Lege map verwijderen</button></div>}
      </aside>
      <div className="cms-media-main">
        <div className={`cms-upload-zone ${dropActive ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (anyMediaPermission)
            setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={e => { e.preventDefault(); setDropActive(false); void upload(e.dataTransfer.files); }}>
          <Upload size={25}/><div><strong>{uploading ? 'Foto’s worden opgeslagen…' : 'Sleep je foto’s hierheen'}</strong><p>JPG, PNG, WebP, AVIF of GIF · maximaal 8 MB per foto</p></div><button className="cms-button" disabled={uploading || !can('media', uploadTeamId)} onClick={() => input.current?.click()}><ImagePlus size={16}/>{uploading ? 'Bezig…' : 'Bestanden kiezen'}</button><input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple onChange={e => void upload(e.target.files)}/>
        </div>
        <p className="cms-meta">Uploads worden in deze browser bewaard. Gedeelde opslag wordt op de VPS aangesloten.</p>
        {visibleMedia.length ? <div className="cms-media-grid">{mediaPage.items.map(m => <button key={m.id} className={`cms-media-tile ${selectedId === m.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(m.id)} aria-pressed={selectedId === m.id}>
          <div className="cms-media-thumb">{m.src ? <img src={m.src} alt={m.alt || m.name} style={{ objectPosition: `${m.focusX}% ${m.focusY}%` }}/> : <Images size={28}/>}<span className={`cms-photo-badge ${m.published ? 'published' : ''}`}>{m.published ? 'Gepubliceerd' : 'Concept'}</span>{m.featured && <span className="cms-featured-star" aria-label="Uitgelicht"><Star size={14} fill="currentColor"/></span>}</div>
          <strong>{m.name}</strong><span className="cms-meta">{m.alt || 'Alt-tekst ontbreekt'}</span>
        </button>)}</div> : <div className="cms-empty"><Images size={30}/><h3>Hier is nog ruimte voor mooie beelden</h3><p>{query ? 'Geen foto’s gevonden. Pas je zoekopdracht aan.' : 'Upload foto’s of kies een andere map.'}</p></div>}
        <Pagination label="Afbeeldingen" {...mediaPage}/>
      </div>
      {selected && <MediaDetails key={selected.id} media={selected} onClose={() => setSelectedId('')}/>}
    </div> : <div className={`cms-album-layout ${selectedAlbum ? 'has-editor' : ''}`}>
      <div className="cms-album-list">{albumPage.items.map(a => <button key={a.id} className={`cms-album-card ${a.id === selectedAlbumId ? 'is-selected' : ''}`} onClick={() => setSelectedAlbumId(a.id)}>
        <div className="cms-album-cover">{media.find(m => m.id === a.coverId)?.src ? <img src={media.find(m => m.id === a.coverId)!.src} alt=""/> : <Images size={30}/>}<span className={`cms-photo-badge ${a.published ? 'published' : ''}`}>{a.published ? 'Gepubliceerd' : 'Concept'}</span></div>
        <div><strong>{a.title}</strong><p>{a.mediaIds.length} foto’s · {a.season || 'Geen seizoen'}</p><span className="cms-meta">{state.settings.teams.find(t => t.id === a.teamId)?.name || 'Club algemeen'}</span></div>
      </button>)}{!albums.length && <div className="cms-empty"><FolderPlus size={30}/><h3>Het eerste album begint hier</h3><p>Maak een album en selecteer foto’s uit de mediabibliotheek.</p><button className="cms-button primary" onClick={createAlbum} disabled={!can('media', uploadTeamId)}>Nieuw album</button></div>}</div>
      <Pagination label="Albums" {...albumPage}/>
      {selectedAlbum && <AlbumDetails key={selectedAlbum.id} album={selectedAlbum} onClose={() => setSelectedAlbumId('')}/>}
    </div>}
  </div>;
}
function MediaDetails({ media, onClose }: {
    media: CmsMedia;
    onClose: () => void;
}) {
    const { state, update, can, notify, reload } = useCMS();
    const [draft, setDraft] = useState(() => structuredClone(media));
    const editable = can('media', media.teamId);
    const publicationRights = editable && can('publish', media.teamId) && can('publish', draft.teamId);
    const contentEditable = editable;
    const references = useMemo(() => mediaReferences(state, media.id), [state, media.id]);
    const dirty = JSON.stringify(media) !== JSON.stringify(draft);
    const patch = (value: Partial<CmsMedia>) => setDraft(current => ({ ...current, ...value }));
    async function save() {
        if (!contentEditable || !can('media', draft.teamId))
            return notify('Je hebt geen bewerkrechten voor dit team.');
        if (!draft.name.trim())
            return notify('Vul een naam in.');
        if ((draft.published || draft.featured) && !draft.alt.trim())
            return notify('Een gepubliceerde foto heeft een beschrijvende alt-tekst nodig.');
        if (draft.published && !draft.src)
            return notify('Het fotobestand is niet beschikbaar in deze browser. Upload het bestand opnieuw.');
        if (draft.published !== media.published && !publicationRights)
            return notify('Je hebt geen publicatierechten.');
        if (draft.featured !== media.featured && !publicationRights)
            return notify('Je hebt geen rechten om de homepage te wijzigen.');
        const blockingReferences = references.filter(ref => ref !== 'Uitgelicht op de homepage');
        if (!draft.published && blockingReferences.length)
            return notify(`Deze foto wordt nog gebruikt: ${blockingReferences.join(', ')}. Verwijder eerst die koppelingen.`);
        const next = { ...draft, name: draft.name.trim(), featured: draft.published && draft.featured };
        if (await update(data => {
            const index = data.media.findIndex(m => m.id === media.id);
            if (index >= 0)
                data.media[index] = next;
            data.settings.homepagePhotoIds = next.featured ? Array.from(new Set([...data.settings.homepagePhotoIds, media.id])) : data.settings.homepagePhotoIds.filter(id => id !== media.id);
        }, `Foto “${next.name}” bijgewerkt`,next.published&&publicationRights?{[media.id]:{action:'publish'}}:undefined)) {
            setDraft(next);
            notify('Foto opgeslagen.');
        }
    }
    return <aside className="cms-panel cms-media-details">
    <div className="cms-editor-heading"><h3>Fotogegevens</h3><button className="cms-icon-button" aria-label="Fotogegevens sluiten" onClick={onClose}><X size={18}/></button></div>
    <div className="cms-media-detail-preview">{draft.src ? <img src={draft.src} alt={draft.alt || draft.name} style={{ objectPosition: `${draft.focusX}% ${draft.focusY}%` }}/> : <Images size={36}/>}</div>
    <fieldset disabled={!contentEditable}>
      <label className="cms-field">Naam<input value={draft.name} onChange={e => patch({ name: e.target.value })}/></label>
      <label className="cms-field">Alt-tekst <span className="cms-meta">Beschrijf wat er op de foto staat.</span><textarea rows={2} value={draft.alt} onChange={e => patch({ alt: e.target.value })} placeholder="Spelers van JO13 vieren samen een doelpunt"/></label>
      <label className="cms-field">Bijschrift<textarea rows={2} value={draft.caption} onChange={e => patch({ caption: e.target.value })}/></label>
      <label className="cms-field">Fotograaf / naamsvermelding<input value={draft.credit} onChange={e => patch({ credit: e.target.value })}/></label>
      <label className="cms-field">Map<select value={draft.folderId} onChange={e => patch({ folderId: e.target.value })}><option value="">Losse bestanden</option>{state.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="cms-field">Team<select value={draft.teamId} onChange={e => patch({ teamId: e.target.value })}><option value="" disabled={!can('media')}>Club algemeen</option>{state.settings.teams.map(t => <option key={t.id} value={t.id} disabled={!can('media', t.id)}>{t.name}</option>)}</select></label>
      <label className="cms-field">Seizoen<input value={draft.season} onChange={e => patch({ season: e.target.value })}/></label>
      <div className="cms-focus-controls"><strong>Uitsnede</strong><label>Horizontaal <input type="range" min={0} max={100} value={draft.focusX} onChange={e => patch({ focusX: Number(e.target.value) })}/></label><label>Verticaal <input type="range" min={0} max={100} value={draft.focusY} onChange={e => patch({ focusY: Number(e.target.value) })}/></label></div>
      <label className="cms-check"><input type="checkbox" checked={draft.published} disabled={!publicationRights} onChange={e => patch({ published: e.target.checked, featured: e.target.checked && draft.featured })}/> Beschikbaar op de openbare site</label>
      <label className="cms-check"><input type="checkbox" checked={draft.featured} disabled={!publicationRights || !draft.published} onChange={e => patch({ featured: e.target.checked })}/> Uitlichten op de fotomuur van de homepage</label>
    </fieldset>
    {!!references.length && <div className="cms-media-usage"><strong>In gebruik</strong>{references.map(ref => <span key={ref}>{ref}</span>)}</div>}
    {media.published && <p className="cms-meta">Opgeslagen wijzigingen zijn direct zichtbaar op deze lokale site.</p>}
    <div className="cms-toolbar"><button className="cms-button primary" disabled={!contentEditable || !dirty} onClick={save}><Check size={16}/>{dirty ? 'Opslaan' : 'Opgeslagen'}</button><button className="cms-button danger" disabled={!editable} onClick={async () => {
            if (references.length)
                return notify(`Verwijderen kan nog niet. In gebruik bij: ${references.join(', ')}.`);
            if (await update(data => { const item = data.media.find(m => m.id === media.id); if (item) {
                item.deletedAt = now();
                item.published = false;
                item.featured = false;
            } data.settings.homepagePhotoIds = data.settings.homepagePhotoIds.filter(id => id !== media.id); }, `Foto “${media.name}” naar prullenbak`))
                onClose();
        }}><Trash2 size={15}/> Prullenbak</button></div>
  </aside>;
}
function AlbumDetails({ album, onClose }: {
    album: CmsAlbum;
    onClose: () => void;
}) {
    const { state, update, can, notify, reload } = useCMS();
    const [draft, setDraft] = useState(() => structuredClone(album));
    const [pickerQuery, setPickerQuery] = useState('');
    const [pickerFolder, setPickerFolder] = useState('all');
    const [draggedId, setDraggedId] = useState('');
    const editable = can('media', album.teamId);
    const publishAllowed = editable && can('publish', album.teamId) && can('publish', draft.teamId);
    const media = state.media.filter(m => !m.deletedAt);
    const selectedMedia = draft.mediaIds.map(id => media.find(m => m.id === id)).filter((m): m is CmsMedia => Boolean(m));
    const selectedPage=usePagination(selectedMedia);
    const pickerPage=usePagination(media.filter(m=>(pickerFolder==='all'||m.folderId===pickerFolder)&&`${m.name} ${m.alt}`.toLocaleLowerCase('nl').includes(pickerQuery.toLocaleLowerCase('nl'))),JSON.stringify([pickerFolder,pickerQuery]));
    const selectedMissing = draft.mediaIds.filter(id => !media.some(m => m.id === id));
    const dirty = JSON.stringify(album) !== JSON.stringify(draft);
    const patch = (value: Partial<CmsAlbum>) => setDraft(current => ({ ...current, ...value }));
    function togglePhoto(id: string) {
        if (!editable)
            return;
        const ids = draft.mediaIds.includes(id) ? draft.mediaIds.filter(x => x !== id) : [...draft.mediaIds, id];
        patch({ mediaIds: ids, coverId: ids.includes(draft.coverId) ? draft.coverId : ids[0] || '' });
    }
    function movePhoto(id: string, direction: number) {
        const ids = [...draft.mediaIds];
        const i = ids.indexOf(id);
        const target = i + direction;
        if (i < 0 || target < 0 || target >= ids.length || !editable)
            return;
        [ids[i], ids[target]] = [ids[target], ids[i]];
        patch({ mediaIds: ids });
    }
    function onDrop(event: DragEvent, targetId: string) {
        event.preventDefault();
        if (!editable || !draggedId || draggedId === targetId)
            return;
        const ids = draft.mediaIds.filter(id => id !== draggedId);
        const index = ids.indexOf(targetId);
        ids.splice(index, 0, draggedId);
        patch({ mediaIds: ids });
        setDraggedId('');
    }
    async function save(published = draft.published) {
        if (!editable || !can('media', draft.teamId))
            return notify('Je hebt geen albumrechten voor dit team.');
        if (!draft.title.trim())
            return notify('Vul een albumtitel in.');
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug))
            return notify('Gebruik een slug met kleine letters, cijfers en streepjes.');
        if (state.albums.some(a => !a.deletedAt && a.id !== album.id && a.slug === draft.slug))
            return notify('Deze album-slug is al in gebruik.');
        if (published !== album.published && !publishAllowed)
            return notify('Voor wijzigingen aan een gepubliceerd album zijn publicatierechten nodig.');
        if (published && (!draft.mediaIds.length || selectedMissing.length))
            return notify('Selecteer ten minste één beschikbare foto voordat je publiceert.');
        if (published && selectedMedia.some(m => !m.published || !m.alt.trim() || !m.src))
            return notify('Publiceer eerst alle geselecteerde foto’s en vul hun alt-tekst in via de mediabibliotheek. Controleer of de foto’s beschikbaar en gepubliceerd zijn.');
        if (published && !draft.mediaIds.includes(draft.coverId))
            return notify('Kies een omslagfoto uit dit album.');
        const next = { ...draft, title: draft.title.trim(), published };
        if (await update(data => {
            const i = data.albums.findIndex(a => a.id === album.id);
            if (i >= 0)
                data.albums[i] = next;
            if (album.published && published && album.slug !== next.slug) {
                const from = `media/fotos/${album.slug}`;
                data.redirects = data.redirects.filter(r => r.from !== from);
                data.redirects.push({ from, to: `media/fotos/${next.slug}` });
            }
            if (!published)
                data.settings.homepageAlbumIds = data.settings.homepageAlbumIds.filter(id => id !== album.id);
        }, `Album “${next.title}” ${published ? 'gepubliceerd' : 'opgeslagen'}`,published&&publishAllowed?{[album.id]:{action:'publish'}}:undefined)) {
            setDraft(next);
            notify(published ? 'Album gepubliceerd op de website.' : 'Album opgeslagen als concept.');
        }
    }
    return <section className="cms-panel cms-album-editor">
    <div className="cms-editor-heading"><div><span className="cms-meta">ALBUM BEWERKEN</span><h3>{draft.title || 'Nieuw album'}</h3></div><button className="cms-icon-button" aria-label="Album sluiten" onClick={onClose}><X size={18}/></button></div>
    <fieldset disabled={!editable}>
      <div className="cms-grid cms-album-fields"><label className="cms-field">Titel<input value={draft.title} onChange={e => patch({ title: e.target.value })}/></label><label className="cms-field">Datum<input type="date" value={draft.date} onChange={e => patch({ date: e.target.value })}/></label></div>
      <label className="cms-field">Beschrijving<textarea rows={3} value={draft.description} onChange={e => patch({ description: e.target.value })} placeholder="Vertel het verhaal achter deze dag…"/></label>
      <label className="cms-field">URL-slug<div className="cms-slug-input"><input value={draft.slug} onChange={e => patch({ slug: e.target.value })}/><button type="button" className="cms-button" onClick={() => patch({ slug: slugify(draft.title) })}>Uit titel</button></div><span className="cms-meta">/clubmuur/media/fotos/{draft.slug}</span></label>
      <div className="cms-grid cms-album-fields"><label className="cms-field">Team<select value={draft.teamId} onChange={e => patch({ teamId: e.target.value })}><option value="" disabled={!can('media')}>Club algemeen</option>{state.settings.teams.map(t => <option key={t.id} value={t.id} disabled={!can('media', t.id)}>{t.name}</option>)}</select></label><label className="cms-field">Seizoen<input value={draft.season} onChange={e => patch({ season: e.target.value })}/></label><label className="cms-field">Volgorde<input type="number" min={0} value={draft.order} onChange={e => patch({ order: Math.max(0, Number(e.target.value)) })}/></label></div>
      <div className="cms-album-selection-heading"><div><h4>Foto’s in dit album <span>{draft.mediaIds.length}</span></h4><p>Sleep om te ordenen, of gebruik de pijlen. De ster bepaalt de omslag.</p></div></div>
      {selectedMissing.length > 0 && <div className="cms-media-warning">{selectedMissing.length} foto’s staan in de prullenbak. <button type="button" onClick={() => { const ids = selectedMedia.map(m => m.id); patch({ mediaIds: ids, coverId: ids.includes(draft.coverId) ? draft.coverId : ids[0] || '' }); }}>Verwijder ontbrekende foto’s uit dit album</button></div>}
      {selectedMedia.length ? <div className="cms-album-selected">{selectedPage.items.map(m => <div key={m.id} className={`cms-album-photo ${draft.coverId === m.id ? 'is-cover' : ''}`} draggable={editable} onDragStart={() => setDraggedId(m.id)} onDragEnd={() => setDraggedId('')} onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, m.id)}>
        <div className="cms-album-photo-image"><img src={m.src} alt={m.alt || m.name}/><GripVertical className="cms-photo-drag" size={17}/>{!m.published && <span className="cms-photo-badge">Nog concept</span>}</div><strong>{m.name}</strong><div className="cms-album-photo-actions"><button type="button" aria-label={`Maak ${m.name} de omslagfoto`} aria-pressed={draft.coverId === m.id} onClick={() => patch({ coverId: m.id })}><Star size={15} fill={draft.coverId === m.id ? 'currentColor' : 'none'}/></button><button type="button" aria-label={`${m.name} eerder`} disabled={draft.mediaIds.indexOf(m.id) === 0} onClick={() => movePhoto(m.id, -1)}><ArrowUp size={15}/></button><button type="button" aria-label={`${m.name} later`} disabled={draft.mediaIds.indexOf(m.id) === draft.mediaIds.length - 1} onClick={() => movePhoto(m.id, 1)}><ArrowDown size={15}/></button><button type="button" aria-label={`Verwijder ${m.name} uit album`} onClick={() => togglePhoto(m.id)}><X size={15}/></button></div>
      </div>)}</div> : <div className="cms-empty cms-album-empty"><ImagePlus size={24}/><p>Selecteer hieronder de eerste foto’s voor dit album.</p></div>}
      <Pagination label="Foto’s in album" {...selectedPage}/>
      <details className="cms-album-picker" open><summary>Foto’s toevoegen uit de bibliotheek</summary><div className="cms-toolbar"><label className="cms-field">Zoeken<input value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} placeholder="Zoek op naam of beschrijving"/></label><label className="cms-field">Map<select value={pickerFolder} onChange={e => setPickerFolder(e.target.value)}><option value="all">Alle mappen</option><option value="">Losse bestanden</option>{state.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div><div className="cms-album-picker-grid">{pickerPage.items.map(m => <button type="button" key={m.id} className={draft.mediaIds.includes(m.id) ? 'is-selected' : ''} onClick={() => togglePhoto(m.id)} aria-pressed={draft.mediaIds.includes(m.id)} aria-label={`${draft.mediaIds.includes(m.id) ? 'Verwijder' : 'Selecteer'} ${m.name}`}><img src={m.src} alt={m.alt || m.name}/><span>{m.name}</span>{draft.mediaIds.includes(m.id) && <Check size={15}/>}</button>)}</div>{!media.length && <p className="cms-meta">Upload eerst foto’s via de mediabibliotheek.</p>}<Pagination label="Albumfoto’s kiezen" {...pickerPage}/></details>
    </fieldset>
    {album.published && <p className="cms-meta">Dit album staat live op de website. Conceptwijzigingen verschijnen na een nieuwe publicatie.</p>}
    <div className="cms-toolbar cms-album-save"><button className="cms-button primary" disabled={!editable || !dirty } onClick={() => save()}><Check size={16}/>{dirty ? 'Wijzigingen opslaan' : 'Opgeslagen'}</button><button className="cms-button" disabled={!publishAllowed} onClick={() => save(!album.published)}>{album.published ? 'Terug naar concept' : 'Album publiceren'}</button>{album.published && <a className="cms-button" href={`/clubmuur/media/fotos/${album.slug}`} target="_blank" rel="noreferrer">Bekijk album</a>}<button className="cms-button danger" disabled={!editable} onClick={async () => {
            if (await update(data => { const a = data.albums.find(x => x.id === album.id); if (a) {
                a.deletedAt = now();
                a.published = false;
            } data.settings.homepageAlbumIds = data.settings.homepageAlbumIds.filter(id => id !== album.id); }, `Album “${album.title}” naar prullenbak`))
                onClose();
        }}><Trash2 size={15}/> Prullenbak</button></div>
  </section>;
}

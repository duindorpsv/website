'use client';
import {Pagination,usePagination} from './pagination';
import {MediaPicker} from './media-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Clock, Copy, Eye, FileText, History, ImagePlus, Newspaper, Plus, Save, Search, Send, Trash2 } from 'lucide-react';
import type { ArticleContent, CmsArticle, ContentStatus, ContentType, StoryFormat } from '@/lib/cms/types';
import { contentHref, contentPath, contentTypeLabel, storyFormatLabel } from '@/lib/cms/content';
import { articleContent, docText, emptySEO, now, slugify, statusLabel, textDoc, uid, validateArticle } from '@/lib/cms/model';
import {equalContent} from '@/lib/cms/compare';
import {newsPublicationCandidate,newsPublicationState} from '@/lib/cms/import-publication';
import {publishNewsSelection,type NewsPublicationResult} from '@/lib/cms/bulk-news';
import {defaultFeaturedUntil,featuredExpiry,isFeatured} from '@/lib/cms/featured';
import {planningInput,planningInstant} from '@/lib/cms/planning';
import {useNewsClock} from '@/hooks/use-news-clock';
import { useCMS } from './provider';
import { RichEditor } from './rich-editor';
import './news.css';
import {useRevisions} from './use-revisions';
import {SchedulingControl} from './scheduling-control';
import {NewsImporter,NewsImportProvenance} from './news-importer';
function dateLabel(date: string) { return date ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : 'Nog niet gepubliceerd'; }
export function NewsManager({ contentType = 'news' }: {
    contentType?: ContentType;
} = {}) {
    const { state, update, can, notify, storageError,storageConflictId,clearStorageError,reload,saving } = useCMS();
    const clock=useNewsClock();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [importOpen,setImportOpen]=useState(false);
    useEffect(()=>{if(contentType==='news'&&new URLSearchParams(location.search).has('newsImport'))setImportOpen(true);},[contentType]);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'all' | ContentStatus>('all');
    const [teamFilter, setTeamFilter] = useState('');
    const [formatFilter, setFormatFilter] = useState<'' | StoryFormat>('');
    const [bulkIds,setBulkIds]=useState<string[]>([]);
    const [bulkProgress,setBulkProgress]=useState<{published:number;total:number}|null>(null);
    const [bulkResult,setBulkResult]=useState<NewsPublicationResult|null>(null);
    const bulkRunning=useRef(false),bulkMounted=useRef(true),selectAllRef=useRef<HTMLInputElement>(null);
    useEffect(()=>{bulkMounted.current=true;return()=>{bulkMounted.current=false;};},[]);
    useEffect(()=>{if(!bulkRunning.current){setBulkIds([]);setBulkResult(null);}},[query,filter,teamFilter,contentType,selectedId]);
    const [preview, setPreview] = useState(false);
    const [inspector, setInspector] = useState<'details' | 'seo' | 'revisions'>('details');
    const [errors, setErrors] = useState<string[]>([]);
    const [trashConfirm, setTrashConfirm] = useState(false);
    const editedIds = useRef(new Set<string>());
    const persisted = state.articles.find(a => a.id === selectedId && !a.deletedAt);
    const [local,setLocal]=useState<CmsArticle|null>(null);
    const base=useRef<CmsArticle|null>(null);
    const autosave=useRef<ReturnType<typeof setTimeout>|null>(null);
    const cancelAutosave=useCallback(()=>{if(autosave.current)clearTimeout(autosave.current);autosave.current=null;},[]);
    const [conflict,setConflict]=useState<CmsArticle|null>(null);
    const [conflictRefresh,setConflictRefresh]=useState(0);
    const selected=local?.id===selectedId?{...local,version:persisted?.version,live:persisted?.live,status:persisted?.status||local.status}:persisted;
    const {items:serverRevisions,error:revisionError}=useRevisions<ArticleContent>('articles',selectedId||undefined,persisted?.version);
    useEffect(()=>{
        const previous=base.current;
        base.current=persisted?structuredClone(persisted):null;
        setLocal(current=>{
            if(!persisted)return null;
            if(current?.id!==persisted.id||!previous||previous.id!==persisted.id)return structuredClone(persisted);
            if(storageConflictId===persisted.id)return current;
            // Adopt server-generated fields, preserving typing made while a save was in flight.
            const merged=structuredClone(persisted),before=articleContent(previous),draft=articleContent(current);
            for(const key of [...new Set([...Object.keys(before),...Object.keys(draft)])] as (keyof ArticleContent)[])
                if(!equalContent(draft[key],before[key]))Object.assign(merged,{[key]:draft[key]});
            return merged;
        });
    },[selectedId,persisted?.version,storageConflictId]);
    useEffect(()=>{
        setConflict(null);
        if(!selectedId||storageConflictId!==selectedId)return;
        let active=true;
        fetch(`/api/cms/articles/${encodeURIComponent(selectedId)}`,{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(record=>{if(active)setConflict(record);}).catch(()=>{});
        return()=>{active=false;};
    },[selectedId,storageConflictId,storageError,conflictRefresh]);
    const articles = state.articles.filter(a => !a.deletedAt && a.contentType === contentType);
    const moduleTitle = contentType === 'story' ? 'Verhalen' : 'Nieuws';
    const allLabel = contentType === 'story' ? 'Alle verhalen' : 'Alle nieuwsberichten';
    const createLabel = contentType === 'story' ? 'Nieuw verhaal' : 'Nieuw nieuwsbericht';
    const isStory = (selected?.contentType || contentType) === 'story';
    const noun = isStory ? 'verhaal' : 'nieuwsbericht';
    useEffect(() => { const id=contentType==='news'?new URLSearchParams(location.search).get('newsId'):null;setSelectedId(id&&state.articles.some(a=>a.id===id&&a.contentType==='news')?id:null); setQuery(''); setFilter('all'); setFormatFilter(''); setTeamFilter(''); setErrors([]); setTrashConfirm(false); }, [contentType]);
    const media = state.media.filter(m => !m.deletedAt);
    const editable = !!selected && can(isStory?'stories':'news', selected.teamId);
    const publishable = !!selected && editable && can('publish', selected.teamId,isStory?'stories':'news');
    const teamOptions = state.settings.teams;
    const canCreate = can(contentType==='story'?'stories':'news') || teamOptions.some(t => can(contentType==='story'?'stories':'news', t.id));
    const visible = articles.filter(a => (filter === 'all' || a.status === filter) && (!teamFilter || a.teamId === teamFilter) && (!formatFilter || a.storyFormat === formatFilter) && `${a.title} ${a.author} ${a.category} ${a.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const pagination=usePagination(visible,JSON.stringify([query,filter,teamFilter,formatFilter,contentType]));
    const canBulkPublish=(article:CmsArticle)=>can('news',article.teamId)&&can('publish',article.teamId,'news');
    const selectable=contentType==='news'?visible.filter(canBulkPublish):[];
    const allSelected=selectable.length>0&&selectable.every(article=>bulkIds.includes(article.id));
    const bulkBusy=bulkProgress!==null;
    useEffect(()=>{if(selectAllRef.current)selectAllRef.current.indeterminate=!allSelected&&bulkIds.length>0;},[allSelected,bulkIds]);
    function toggleBulk(id:string){setBulkIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);}
    async function publishBulk(){
        if(bulkRunning.current||saving||!bulkIds.length)return;
        bulkRunning.current=true;setBulkResult(null);setBulkProgress({published:0,total:bulkIds.length});
        try{
            const result=await publishNewsSelection({state,ids:bulkIds,can,update,
                onProgress:(published,total)=>{if(bulkMounted.current)setBulkProgress({published,total});},
                shouldContinue:()=>bulkMounted.current});
            if(bulkMounted.current){
                setBulkResult(result);setBulkIds(current=>current.filter(id=>!result.published.includes(id)));
                notify(`${result.published.length} nieuwsbericht${result.published.length===1?'':'en'} gepubliceerd.${result.issues.length?` ${result.issues.length===1?'1 heeft':`${result.issues.length} hebben`} aandacht nodig; bekijk de uitleg in het overzicht.`:''}`);
            }
        }finally{bulkRunning.current=false;if(bulkMounted.current)setBulkProgress(null);}
    }
    function open(id: string) { setSelectedId(id); setPreview(false); setInspector('details'); setErrors([]); setTrashConfirm(false); editedIds.current.delete(id); }
    async function create() { if (!canCreate)
        return; const stamp = now(); const teamId = can(contentType==='story'?'stories':'news') ? '' : teamOptions.find(t => can(contentType==='story'?'stories':'news', t.id))?.id || ''; const article: CmsArticle = { id: uid('article'), contentType, storyFormat: contentType === 'story' ? 'column' : 'story', title: '', slug: '', intro: '', body: textDoc(['']), coverId: '', author: 'Redactie Duindorp SV', category: state.settings.newsCategories[0] || 'Clubnieuws', tags: [], teamId, season: state.settings.season, seo: emptySEO(), featured: false, publishedAt: '', status: 'draft', updatedAt: stamp, scheduledAt: '', revisions: [] }; if (await update(d => { d.articles.unshift(article); }, `${moduleTitle}concept aangemaakt`))
        open(article.id); }
    function change(fields: Partial<ArticleContent>) {
        if(!selected||!editable)return;
        if(fields.teamId!==undefined&&!can(isStory?'stories':'news',fields.teamId)){notify('Deze rol kan alleen berichten voor de eigen teams bewerken.');return;}
        setLocal({...selected,...fields,status:selected.status==='scheduled'?'scheduled':'draft',updatedAt:now()});setErrors([]);
    }
    const localContent=local?JSON.stringify(articleContent(local)):'';
    useEffect(()=>{cancelAutosave();if(!local||local.id!==selectedId||!editable||storageConflictId===selectedId)return;const snapshot=articleContent(local);if(persisted&&equalContent(articleContent(persisted),snapshot))return;autosave.current=setTimeout(()=>{void update(d=>{const a=d.articles.find(x=>x.id===local.id);if(a&&!equalContent(articleContent(a),snapshot))Object.assign(a,snapshot,{updatedAt:now(),status:a.status==='scheduled'?'scheduled':'draft'});});},650);return cancelAutosave;},[localContent,selectedId,editable,update,storageConflictId,cancelAutosave]);
    async function saveRevision() { if (!selected || !editable)
        return; cancelAutosave();if (await update(d => { const a = d.articles.find(x => x.id === selected.id)!; Object.assign(a,articleContent(selected));a.revisions.unshift({ id: uid('rev'), at: now(), label: 'Handmatig opgeslagen', data: articleContent(a) }); a.revisions = a.revisions.slice(0, 30); a.updatedAt = now();a.status=a.status==='scheduled'?'scheduled':'draft'; }, `Concept opgeslagen: ${selected.title || 'Zonder titel'}`)) {
        editedIds.current.delete(selected.id);
        notify('Concept en revisie opgeslagen. Een bestaande publicatie blijft behouden.');
    } }
    async function publish() { if (!selected || !publishable)
        return; cancelAutosave();const publication=newsPublicationCandidate(selected);const problems = validateArticle(publication, newsPublicationState(state,publication)); if (problems.length) {
        setErrors(problems);
        return;
    } if (await update(d => { const a = d.articles.find(x => x.id === selected.id)!; Object.assign(a,articleContent(publication));a.status='published';a.scheduledAt=''; }, `${contentTypeLabel[selected.contentType]} gepubliceerd: ${selected.title}`,{[selected.id]:{action:'publish'}})) {
        editedIds.current.delete(selected.id);
        setErrors([]);
        notify(`Het ${noun} staat op de website.`);
    } }
    async function review() { if (!selected || !editable)
        return; cancelAutosave();const problems = validateArticle(selected, state); if (problems.length) {
        setErrors(problems);
        return;
    } if (await update(d => { const a = d.articles.find(x => x.id === selected.id)!; Object.assign(a,articleContent(selected));a.status = 'review'; a.scheduledAt = ''; a.updatedAt = now(); }, `Ter beoordeling: ${selected.title}`))
        notify('Het concept staat klaar voor beoordeling.'); }
    async function unpublish() { if (!selected || !publishable)
        return; cancelAutosave();if (await update(d => { const a = d.articles.find(x => x.id === selected.id)!; Object.assign(a,articleContent(selected));a.live = undefined; a.status = 'draft'; a.scheduledAt = ''; a.updatedAt = now(); }, `Publicatie ingetrokken: ${selected.title}`))
        notify('Publicatie ingetrokken; het concept blijft bewaard.'); }
    async function duplicate() { if (!selected || !editable)
        return; const copy = structuredClone(selected); copy.id = uid('article'); copy.title = `${copy.title || 'Zonder titel'} (kopie)`; const base = slugify(copy.title); let slug = base, count = 2; while (state.articles.some(a => a.slug === slug || a.live?.slug === slug))
        slug = `${base}-${count++}`; copy.slug = slug; copy.live = undefined; copy.status = 'draft'; copy.publishedAt = ''; copy.scheduledAt = ''; copy.updatedAt = now(); copy.revisions = []; copy.demo = false; if (await update(d => { d.articles.unshift(copy); }, `Concept gedupliceerd: ${selected.title}`))
        open(copy.id); }
    async function trash() { if (!selected || !editable || selected.live && !publishable)
        return; if (await update(d => { const a = d.articles.find(x => x.id === selected.id)!; a.deletedAt = now(); a.status = 'archived'; a.scheduledAt = ''; }, `Naar prullenbak: ${selected.title}`)) {
        setSelectedId(null);
        setTrashConfirm(false);
        notify(`Het ${noun} is verplaatst naar de prullenbak. Daar kun je het herstellen.`);
    } }
    async function restore(data: ArticleContent) { if (!selected || !editable)
        return; if (!can(data.contentType==='story'?'stories':'news', data.teamId)) {
        notify('Deze revisie hoort bij een team buiten je rol.');
        return;
    } if (await update(d => { const a = d.articles.find(x => x.id === selected.id)!; a.revisions.unshift({ id: uid('rev'), at: now(), label: 'Voor terugzetten revisie', data: articleContent(a) }); a.revisions = a.revisions.slice(0, 30); Object.assign(a, structuredClone(data)); a.status = 'draft'; a.scheduledAt = ''; a.updatedAt = now(); }, `Revisie teruggezet: ${selected.title}`)) {
        setLocal({...selected,...structuredClone(data),status:'draft'});notify('Revisie teruggezet als concept. Publiceer om deze versie zichtbaar te maken.');
        setInspector('details');
        setErrors([]);
    } }
    async function useServerVersion(){
        cancelAutosave();downloadWorkVersion();await reload();base.current=null;setLocal(null);clearStorageError();
        notify('De serverversie is geladen. De download van je werkversie is gestart.');
    }
    async function keepWorkVersion(){
        if(!selected||!conflict||typeof conflict.version!=='number')return;
        cancelAutosave();const snapshot=articleContent(selected),id=selected.id,version=conflict.version;
        await reload();
        const saved=await update(data=>{
            const record=data.articles.find(article=>article.id===id);
            if(record)Object.assign(record,snapshot,{status:record.status==='scheduled'?'scheduled':'draft'});
        },'Je werkversie is als concept opgeslagen.',{[id]:{action:'save',expectedVersion:version}});
        if(!saved)setConflictRefresh(value=>value+1);
    }
    function downloadWorkVersion(){
        if(!selected)return;
        const url=URL.createObjectURL(new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download=`nieuws-werkversie-${selected.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    if(importOpen&&contentType==='news'&&canCreate)return <NewsImporter onClose={()=>setImportOpen(false)}/>;
    if (!selected)
        return <div className="cms-news-manager" aria-busy={bulkBusy}><fieldset className="cms-news-overview-controls" disabled={bulkBusy}><legend className="cms-sr-only">{moduleTitle}overzicht</legend>
    <div className="cms-news-intro"><div><span className="cms-meta">REDACTIE · {moduleTitle.toUpperCase()}</span><h2>{moduleTitle}</h2><p>{contentType === 'story' ? 'Columns, interviews en persoonlijke verhalen uit de club. Deze hebben een eigen plek, los van het actuele nieuws.' : 'Actueel clubnieuws, wedstrijdverslagen en mededelingen. Columns en andere verhalen beheer je bij Verhalen.'}</p></div><div className="cms-toolbar">{contentType==='news'&&<button className="cms-button" disabled={!canCreate} onClick={()=>setImportOpen(true)}>Nieuws importeren</button>}<button className="cms-button primary" disabled={!canCreate} onClick={create}><Plus size={18}/>{createLabel}</button></div></div>
    <div className="cms-news-summary">{([{ status: 'all', name: allLabel, value: articles.length }, { status: 'draft', name: 'Concepten', value: articles.filter(a => a.status === 'draft').length }, { status: 'review', name: 'Ter beoordeling', value: articles.filter(a => a.status === 'review').length }, { status: 'published', name: 'Gepubliceerd', value: articles.filter(a => a.status === 'published').length }, { status: 'scheduled', name: 'Ingepland', value: articles.filter(a => a.status === 'scheduled').length }] as const).map(item => <button key={item.status} className={filter === item.status ? 'active' : ''} aria-pressed={filter === item.status} onClick={() => setFilter(item.status)}><span>{item.name}</span><strong>{item.value}</strong></button>)}</div>
    <div className="cms-panel"><div className="cms-toolbar cms-news-search"><label className="cms-news-searchbox"><Search size={18}/><input aria-label={`Zoek in ${moduleTitle.toLowerCase()}`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek op titel, auteur, categorie of tag…"/></label>{contentType === 'story' && <select aria-label="Filter op verhaalvorm" value={formatFilter} onChange={e => setFormatFilter(e.target.value as '' | StoryFormat)}><option value="">Alle verhaalvormen</option>{(Object.entries(storyFormatLabel) as [
            StoryFormat,
            string
        ][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}<select aria-label="Filter op team" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}><option value="">Alle teams</option>{teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    {contentType==='news'&&<>
        <div className="cms-news-bulk-toolbar">
            <label className="cms-news-bulk-select"><input ref={selectAllRef} type="checkbox" aria-label="Selecteer alle gefilterde nieuwsberichten" checked={allSelected} disabled={!selectable.length||saving} onChange={()=>setBulkIds(allSelected?[]:selectable.map(article=>article.id))}/><span>Alle gefilterde berichten selecteren (ook op andere pagina’s)</span></label>
            <span className="cms-news-bulk-count">{bulkIds.length} geselecteerd</span>
            <div className="cms-news-bulk-buttons"><button className="cms-button" disabled={!bulkIds.length||saving} onClick={()=>setBulkIds([])}>Selectie wissen</button><button className="cms-button primary" disabled={!bulkIds.length||saving||!!bulkResult?.stopped} onClick={publishBulk}><Send size={16}/>Selectie publiceren ({bulkIds.length})</button></div>
            {bulkIds.length>0&&<p>De geselecteerde werkversies komen direct online. Bijbehorende geïmporteerde foto’s worden meegepubliceerd. Een bestaande planning vervalt.</p>}
        </div>
        {bulkProgress&&<p className="cms-news-bulk-progress" role="status">Bezig met publiceren: {bulkProgress.published} van {bulkProgress.total} nieuwsberichten. Houd deze pagina open.</p>}
        {bulkResult&&<section className="cms-news-bulk-result" aria-label="Resultaat bulkpublicatie">
            <p role="status">{bulkResult.published.length} nieuwsbericht{bulkResult.published.length===1?'':'en'} gepubliceerd.{bulkResult.issues.length>0&&` ${bulkResult.issues.length===1?'1 heeft':`${bulkResult.issues.length} hebben`} aandacht nodig.`}</p>
            {bulkResult.issues.length>0&&<details open><summary>Deze berichten hebben aandacht nodig</summary><ul>{bulkResult.issues.map(issue=><li key={issue.id}><strong>{issue.title}</strong><p>{issue.messages.join(' ')}</p>{articles.some(article=>article.id===issue.id)&&<button className="cms-button" onClick={()=>open(issue.id)}>Bericht openen<span className="cms-sr-only">: {issue.title}</span></button>}</li>)}</ul>{bulkResult.stopped&&<button className="cms-button" onClick={async()=>{try{await reload();clearStorageError();setBulkResult(null);}catch{notify('Het overzicht kon niet opnieuw worden geladen. Probeer het opnieuw.');}}}>Overzicht opnieuw laden</button>}</details>}
        </section>}
    </>}
    {visible.length ? <div className="cms-news-list">{pagination.items.map(a => {
        const image = media.find(m => m.id === a.coverId);
        const item=<button className="cms-news-item" key={a.id} onClick={() => open(a.id)}><div className="cms-news-thumb">{image?.src ? <img src={image.src} alt=""/> : <Newspaper size={27}/>}</div><div className="cms-news-item-copy"><span>{a.contentType === 'story' ? `${storyFormatLabel[a.storyFormat]} · ` : ''}{a.category}</span><h3>{a.title || 'Zonder titel'}</h3><p>{a.intro || 'Voeg een korte inleiding toe.'}</p><small>{a.author} · Bewerkt {dateLabel(a.updatedAt)}</small></div><div className="cms-news-item-end"><span className={`cms-news-status ${a.status}`}>{statusLabel[a.status]}</span>{a.live && a.status !== 'published' && <small>Vorige versie staat live{a.live.contentType !== a.contentType ? ` bij ${contentTypeLabel[a.live.contentType]}` : ''}</small>}<ArrowUpRight size={20}/></div></button>;
        return contentType==='news'?<div className={`cms-news-row${bulkIds.includes(a.id)?' is-selected':''}`} key={a.id}><label className="cms-news-row-select" title={canBulkPublish(a)?'Selecteren voor publicatie':'Je hebt geen publicatierechten voor dit bericht.'}><input type="checkbox" aria-label={`Selecteer nieuwsbericht: ${a.title||'Zonder titel'}`} checked={bulkIds.includes(a.id)} disabled={!canBulkPublish(a)||saving} onChange={()=>toggleBulk(a.id)}/></label>{item}</div>:item;
    })}</div> : <div className="cms-empty"><Newspaper size={32}/><h3>{contentType === 'story' ? 'Hier begint een nieuw verhaal' : 'Het volgende nieuws begint hier'}</h3><p>{query || filter !== 'all' || teamFilter || formatFilter ? 'Er zijn geen berichten die bij je filters passen.' : contentType === 'story' ? 'Maak een column, interview of clubverhaal.' : 'Schrijf het eerste nieuwsbericht voor de club.'}</p>{(query || filter !== 'all' || teamFilter || formatFilter) ? <button className="cms-button" onClick={() => { setQuery(''); setFilter('all'); setTeamFilter(''); setFormatFilter(''); }}>Filters wissen</button> : <button className="cms-button primary" onClick={create} disabled={!canCreate}>{createLabel}</button>}</div>}</div>
  <Pagination label={moduleTitle} {...pagination} disabled={bulkBusy}/></fieldset></div>;
    const publicationLabel = selected.status==='scheduled' ? 'Ingepland' : selected.live ? equalContent(articleContent(selected),selected.live) ? 'Gepubliceerd' : 'Live · wijzigingen in concept' : statusLabel[selected.status];
    const cover = media.find(m => m.id === selected.coverId);
    const words = docText(selected.body).trim().split(/\s+/).filter(Boolean).length;
    const categories = [...new Set([...state.settings.newsCategories, selected.category])].filter(Boolean);
    return <div className="cms-news-manager"><div className="cms-news-editbar"><button className="cms-button" onClick={() => { setSelectedId(null); setErrors([]); }}><ArrowLeft size={16}/>{allLabel}</button><span className="cms-news-autosave"><Check size={14}/>{storageError ? 'Opslaan niet gelukt' : saving ? 'Bezig met opslaan…' : local&&persisted&&!equalContent(articleContent(local),articleContent(persisted)) ? 'Wijzigingen worden opgeslagen…' : 'Opgeslagen op de server'}</span><div className="cms-news-edit-actions"><button className="cms-button" aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={16}/>{preview ? 'Terug naar editor' : 'Voorbeeld'}</button><button className="cms-button" disabled={!editable||saving||storageConflictId===selected.id} onClick={saveRevision}><Save size={16}/>Concept bewaren</button><button className="cms-button primary" disabled={!publishable||saving||storageConflictId===selected.id} onClick={publish}><Send size={16}/>{selected.live ? 'Publicatie nu bijwerken' : 'Nu publiceren'}</button></div></div>{storageConflictId===selected.id&&<section className="cms-news-conflict" role="alert"><h3>Er staat een nieuwere versie op de server.</h3><p>Je invoer is bewaard. Bekijk de serverversie en kies welke versie je wilt gebruiken. Automatisch opslaan is tijdelijk gepauzeerd. Als je de serverversie kiest, wordt je werkversie eerst gedownload.</p>{conflict?<details><summary>Serverversie bekijken</summary><div className="cms-news-conflict-preview"><h4>{conflict.title}</h4><p>{conflict.intro}</p><p>{docText(conflict.body)}</p></div></details>:<p>De serverversie wordt opgehaald…</p>}<div className="cms-toolbar"><button className="cms-button" disabled={saving||!conflict} onClick={()=>void useServerVersion()}>Serverversie gebruiken</button><button className="cms-button primary" disabled={saving||!conflict||!editable} onClick={()=>void keepWorkVersion()}>Mijn werkversie opslaan</button><button className="cms-button" onClick={downloadWorkVersion}>Werkversie downloaden</button></div></section>}{errors.length > 0 && <div className="cms-news-errors" role="alert"><strong>Dit heeft nog aandacht nodig</strong><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}{!editable && <p className="cms-news-notice">Deze rol kan dit {noun} bekijken. Kies een rol met redactierechten voor dit team om het te bewerken.</p>}<div className="cms-news-workspace"><section className="cms-news-sheet">{preview ? <article className="cms-news-preview">{cover?.src && <img className="cms-news-preview-cover" src={cover.src} alt={cover.alt}/>}<span className="cms-meta">{isStory ? `${storyFormatLabel[selected.storyFormat]} · ` : ''}{selected.category} · {selected.author}</span><h1>{selected.title || `Titel van je ${noun}`}</h1><p className="cms-news-preview-intro">{selected.intro}</p><RichEditor value={selected.body} onChange={() => { }} readOnly/><footer>{words} woorden · {Math.max(1, Math.ceil(words / 200))} minuten leestijd · Voorbeeld van het concept</footer></article> : <><label className="cms-news-title-field"><span>{isStory ? 'TITEL VAN JE VERHAAL' : 'TITEL VAN JE NIEUWSBERICHT'}</span><textarea rows={2} maxLength={160} value={selected.title} placeholder={isStory ? 'Een verhaal om te delen.' : 'Wat is het nieuws?'} disabled={!editable} onChange={e => { const title = e.target.value; change({ title, ...(!selected.slug || selected.slug === slugify(selected.title) ? { slug: slugify(title) } : {}) }); }}/></label><label className="cms-news-intro-field"><span>KORTE INLEIDING</span><textarea rows={3} value={selected.intro} maxLength={400} placeholder={`Neem de lezer mee. Waar gaat jouw ${noun} over?`} disabled={!editable} onChange={e => change({ intro: e.target.value })}/><small>{selected.intro.length}/400 tekens</small></label><RichEditor key={selected.id} value={selected.body} onChange={body => change({ body })} readOnly={!editable}/><div className="cms-news-wordcount">{words} woorden · ongeveer {Math.max(1, Math.ceil(words / 200))} minuten leestijd</div></>}</section><aside className="cms-news-inspector"><div className="cms-news-inspector-tabs" role="tablist" aria-label="Berichtinstellingen">{([{ id: 'details', label: 'Bericht', icon: FileText }, { id: 'seo', label: 'SEO', icon: Search }, { id: 'revisions', label: 'Revisies', icon: History }] as const).map(t => <button key={t.id} type="button" role="tab" aria-selected={inspector === t.id} onClick={() => setInspector(t.id)}><t.icon size={15}/>{t.label}</button>)}</div>{inspector === 'details' && <div className="cms-news-inspector-body">{selected.contentType==='news'&&<NewsImportProvenance recordId={selected.id}/>}<section><span className={`cms-news-status ${selected.status}`}>{publicationLabel}</span><p className="cms-meta">{selected.live ? 'Er staat een gepubliceerde versie op de website.' : 'Dit concept is nog niet zichtbaar op de website.'}</p>{selected.live && <a className="cms-news-live-link" href={contentHref(selected.live)} target="_blank" rel="noreferrer">Bekijk publicatie<ArrowUpRight size={15}/></a>}<label className="cms-field">Publicatietype<select value={selected.contentType} disabled={!editable} onChange={e => change({ contentType: e.target.value as ContentType })}><option value="news">Nieuwsbericht</option><option value="story">Verhaal</option></select><small>Nieuws verschijnt in het nieuwsoverzicht; verhalen krijgen een eigen overzicht.</small></label>{isStory && <label className="cms-field">Verhaalvorm<select value={selected.storyFormat} disabled={!editable} onChange={e => change({ storyFormat: e.target.value as StoryFormat })}>{(Object.entries(storyFormatLabel) as [
        StoryFormat,
        string
    ][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}{selected.contentType !== contentType && <p className="cms-news-type-note">Dit concept staat nu bij {contentTypeLabel[selected.contentType]}. Je kunt hier verder bewerken.</p>}{selected.live && selected.live.contentType !== selected.contentType && <p className="cms-news-type-note">De gepubliceerde versie blijft bij {contentTypeLabel[selected.live.contentType]} tot je deze wijziging publiceert.</p>}<label className="cms-field">Auteur uit personen<select value={selected.authorId||''} disabled={!editable} onChange={e=>{const person=state.people.find(p=>p.id===e.target.value);change({authorId:e.target.value,...(person?{author:person.name}:{})});}}><option value="">Historische / eigen naamsvermelding</option>{state.people.filter(p=>!p.deletedAt).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="cms-field">Auteur<input value={selected.author} disabled={!editable} onChange={e => change({ author: e.target.value })}/></label><label className="cms-field">Categorie<select value={selected.category} disabled={!editable} onChange={e => change({ category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="cms-field">Tags <small>Gescheiden door komma’s</small><input value={selected.tags.join(', ')} disabled={!editable} onChange={e => change({ tags: e.target.value.split(',').map(t => t.trimStart()) })} onBlur={() => change({ tags: selected.tags.map(t => t.trim()).filter(Boolean) })} placeholder="Jeugd, clubleven, zaterdag"/></label><div className="cms-news-field-pair"><label className="cms-field">Team<select disabled={!editable} value={selected.teamId} onChange={e => change({ teamId: e.target.value })}><option value="" disabled={!can(isStory?'stories':'news')}>Hele vereniging</option>{teamOptions.map(t => <option key={t.id} value={t.id} disabled={!can(contentType==='story'?'stories':'news', t.id)}>{t.name}</option>)}</select></label><label className="cms-field">Seizoen<input value={selected.season} disabled={!editable} placeholder="2026/2027" onChange={e => change({ season: e.target.value })}/></label></div></section><section><h3><ImagePlus size={17}/>Omslagfoto</h3>{cover?.src && <img className="cms-news-cover" src={cover.src} alt={cover.alt} style={{ objectPosition: `${cover.focusX}% ${cover.focusY}%` }}/>}<label className="cms-field"><span className="cms-sr-only">Kies een omslagfoto</span><select value={selected.coverId} disabled={!editable} onChange={e => change({ coverId: e.target.value })}><option value="">Zonder omslagfoto</option>{media.map(m => <option key={m.id} value={m.id}>{m.name}{m.published ? '' : ' (nog niet gepubliceerd)'}</option>)}</select></label><fieldset disabled={!editable} className="cms-news-cover-picker"><MediaPicker label={cover?'Andere omslagfoto kiezen':'Omslagfoto kiezen'} value={selected.coverId} onSelect={media=>change({coverId:media.id})}/></fieldset>{cover && !cover.published && <small className="cms-news-warning">Publiceer deze foto in Media voordat je het artikel publiceert.</small>}<label className="cms-news-check"><input type="checkbox" checked={isStory?selected.featured:isFeatured(selected,clock)} disabled={!editable} onChange={e => change({ featured: e.target.checked,...(!isStory?{featuredUntil:e.target.checked?defaultFeaturedUntil():''}:{}) })}/>{isStory ? 'Uitlichten bij Verhalen op de homepage' : 'Uitlichten bij Nieuws op de homepage'}</label>{!isStory&&selected.featured&&<label className="cms-field">Uitgelicht tot en met<input type="date" aria-label="Uitgelicht tot en met" disabled={!editable} value={planningInput(new Date(featuredExpiry(selected)||Date.parse(defaultFeaturedUntil(clock))).toISOString()).slice(0,10)} onChange={event=>{if(event.target.value)change({featured:true,featuredUntil:new Date(planningInstant(event.target.value+'T23:59:59')).toISOString()});}}/><small>{isFeatured(selected,clock)?'Standaard zeven dagen bovenaan. Pas deze datum aan om de periode te veranderen.':'Uitlichten is verlopen. Kies een nieuwe einddatum om dit bericht opnieuw bovenaan te zetten.'}</small></label>}</section><section><h3><Clock size={17}/>Publicatie</h3><button className="cms-button" disabled={!editable} onClick={review}>Klaarzetten voor beoordeling</button><details className="cms-news-planning"><summary>Later inplannen</summary><SchedulingControl key={selected.id} module="articles" record={{...selected,version:persisted?.version,status:persisted?.status,scheduledAt:persisted?.scheduledAt}} disabled={!publishable||storageConflictId===selected.id}/></details>{selected.live && <button className="cms-button" disabled={!publishable} onClick={unpublish}>Publicatie intrekken</button>}</section><section><button className="cms-button" disabled={!editable} onClick={duplicate}><Copy size={15}/>Dupliceren als concept</button><button className="cms-button danger" disabled={!editable || !!selected.live && !publishable} onClick={() => setTrashConfirm(true)}><Trash2 size={15}/>Naar prullenbak</button>{trashConfirm && <div className="cms-news-trash-confirm"><p>Dit {noun} verdwijnt van de website. Je kunt het later herstellen vanuit de prullenbak.</p><button className="cms-button danger" onClick={trash}>Verplaatsen</button><button className="cms-button" onClick={() => setTrashConfirm(false)}>Annuleren</button></div>}</section></div>}{inspector === 'seo' && <div className="cms-news-inspector-body"><section><h3>Vindbaar en deelbaar</h3><label className="cms-field">URL-slug<input value={selected.slug} disabled={!editable} onChange={e => change({ slug: e.target.value.toLowerCase().replace(/\s/g, '-') })}/><small>{contentHref({ ...selected, slug: selected.slug || 'jouw-bericht' })}</small></label>{selected.live && contentPath(selected.live) !== contentPath(selected) && <p className="cms-meta">Bij publicatie bewaren we een doorverwijzing vanaf de vorige URL.</p>}<label className="cms-field">SEO-titel<input value={selected.seo.title} disabled={!editable} maxLength={100} placeholder={selected.title} onChange={e => change({ seo: { ...selected.seo, title: e.target.value } })}/><small>{selected.seo.title.length}/100 tekens</small></label><label className="cms-field">Meta-omschrijving<textarea rows={4} value={selected.seo.description} disabled={!editable} maxLength={200} placeholder={selected.intro || 'Een korte samenvatting voor zoekmachines.'} onChange={e => change({ seo: { ...selected.seo, description: e.target.value } })}/><small>{selected.seo.description.length}/200 tekens</small></label><label className="cms-news-check"><input type="checkbox" checked={selected.seo.noIndex} disabled={!editable} onChange={e => change({ seo: { ...selected.seo, noIndex: e.target.checked } })}/>Niet laten indexeren door zoekmachines</label></section><section><h3>Zoekresultaat · voorbeeld</h3><div className="cms-news-seo-preview"><small>duindorpsv.nl › {isStory ? 'verhalen' : 'nieuws'} › {selected.slug}</small><strong>{selected.seo.title || selected.title || `Titel van het ${noun}`}</strong><p>{selected.seo.description || selected.intro || `Hier verschijnt de omschrijving van je ${noun}.`}</p></div><p className="cms-meta">Deze metadata staat in de serverrespons van de liveversie.</p></section></div>}{inspector === 'revisions' && <div className="cms-news-inspector-body"><section><h3>Versiegeschiedenis</h3><p className="cms-meta">De laatste 30 versies worden hier getoond. Terugzetten maakt een concept en verandert de liveversie niet.</p>{revisionError&&<p role="alert">{revisionError}</p>}{serverRevisions.length ? <div className="cms-news-revisions">{serverRevisions.map(r => <div key={r.id}><History size={17}/><div><strong>{({save:'Werkversie bewaard',publish:'Gepubliceerd',unpublish:'Publicatie ingetrokken',schedule:'Publicatie ingepland',restore:'Hersteld'} as Record<string,string>)[r.label]||r.label}</strong><small>{dateLabel(r.at)}</small><span>{r.data.title || 'Zonder titel'}</span><button className="cms-button" disabled={!editable} onClick={() => restore(r.data)}>Terugzetten als concept</button></div></div>)}</div> : <p>Bewaar het concept om een eerste revisie vast te leggen.</p>}</section></div>}</aside></div></div>;
}

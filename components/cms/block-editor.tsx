'use client';

import {useEffect, useMemo, useState} from 'react';
import {Node, mergeAttributes, type Editor} from '@tiptap/core';
import {EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps} from '@tiptap/react';
import {NodeSelection} from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {ArrowDown, ArrowUp, Bold, Check, ChevronDown, Columns3, Copy, FileText, GripVertical, Heading2, ImageIcon, Italic, LayoutGrid, Link2, List, ListOrdered, Mail, Newspaper, Plus, Quote, Redo2, Trash2, Undo2, Users, X} from 'lucide-react';
import type {CmsDoc, WidgetData, WidgetKind} from '@/lib/cms/types';
import {safeUrl} from '@/lib/cms/model';
import {useCMS} from './provider';

export const widgetLabels: Record<WidgetKind,string> = {person:'Persoon',people:'Personen / commissie',image:'Afbeelding',textImage:'Tekst met afbeelding',columns:'Kolommen',album:'Fotoalbum',news:'Nieuws of verhalen',documents:'Documenten',faq:'Veelgestelde vragen',timeline:'Tijdlijn',cta:'Oproep & knop',team:'Team',contact:'Contactformulier'};
const widgetLabel=(kind:WidgetKind,data:WidgetData)=>kind==='news'?(data.contentType==='story'?'Verhalenselectie':'Nieuwsselectie'):widgetLabels[kind];
const widgetIcons = {person:Users,people:Users,image:ImageIcon,textImage:ImageIcon,columns:Columns3,album:LayoutGrid,news:Newspaper,documents:FileText,faq:Quote,timeline:List,cta:Link2,team:Users,contact:Mail};
const defaultData=(kind:WidgetKind):WidgetData=>({title:kind==='cta'?'Doe mee bij Duindorp SV':kind==='faq'?'Veelgestelde vragen':kind==='timeline'?'Onze geschiedenis':kind==='columns'?'Samen zijn we Duindorp':'',text:'',refId:'',ids:[],url:kind==='cta'?'/clubmuur/club/contact':'',label:kind==='cta'?'Neem contact op':'',layout:'',contentType:kind==='news'?'news':undefined,items:['columns','faq','timeline'].includes(kind)?[{title:kind==='columns'?'Eerste kolom':kind==='faq'?'Een vraag':'Een mijlpaal',text:''},{title:kind==='columns'?'Tweede kolom':kind==='faq'?'Nog een vraag':'De volgende stap',text:''}]:[]});

function moveWidget(editor:Editor,pos:number,direction:-1|1){
  const nodes:{pos:number;node:typeof editor.state.doc}[]=[];
  editor.state.doc.forEach((node,offset)=>nodes.push({pos:offset,node}));
  const index=nodes.findIndex(item=>item.pos===pos),other=index+direction;
  if(index<0||other<0||other>=nodes.length)return;
  const list=nodes.map(item=>item.node);[list[index],list[other]]=[list[other],list[index]];
  const nextDoc=editor.schema.node('doc',editor.state.doc.attrs,list);
  const nextPos=list.slice(0,other).reduce((sum,node)=>sum+node.nodeSize,0);
  editor.view.dispatch(editor.state.tr.replaceWith(0,editor.state.doc.content.size,nextDoc.content).setSelection(NodeSelection.create(nextDoc,nextPos)));
  editor.view.focus();
}

function WidgetView({node,selected,editor,getPos,deleteNode}:NodeViewProps){
  const {state}=useCMS();
  const kind=node.attrs.kind as WidgetKind,data=node.attrs.data as WidgetData;
  const Icon=widgetIcons[kind]||LayoutGrid;
  const person=state.people.find(p=>p.id===data.refId&&!p.deletedAt),media=state.media.find(m=>m.id===data.refId&&!m.deletedAt),album=state.albums.find(a=>a.id===data.refId&&!a.deletedAt);
  const people=state.people.filter(p=>!p.deletedAt&&((data.ids?.length&&data.ids.includes(p.id))||(!data.ids?.length&&(!data.layout||p.group===data.layout)))).slice(0,4);
  const source=kind==='person'?state.media.find(m=>m.id===person?.mediaId)?.src:media?.src;
  const position=()=>typeof getPos()==='number'?getPos() as number:null;
  const select=()=>{const pos=position();if(pos!==null&&editor.isEditable)editor.chain().focus().setNodeSelection(pos).run();};
  return <NodeViewWrapper className={`cms-widget ${selected?'is-selected':''} ${!editor.isEditable?'is-readonly':''}`} data-widget-kind={kind}>
    <div contentEditable={false} onClick={select}>
      <div className="cms-widget-top"><span className="cms-widget-kind"><Icon size={14}/>{widgetLabel(kind,data)||'Widget'}</span>{editor.isEditable&&<span className="cms-widget-actions"><button type="button" className="cms-widget-drag" data-drag-handle aria-label="Sleep blok om te verplaatsen" title="Sleep om te verplaatsen"><GripVertical size={16}/></button><button type="button" title="Blok omhoog" aria-label="Blok omhoog" onClick={e=>{e.stopPropagation();const pos=position();if(pos!==null)moveWidget(editor,pos,-1);}}><ArrowUp size={14}/></button><button type="button" title="Blok omlaag" aria-label="Blok omlaag" onClick={e=>{e.stopPropagation();const pos=position();if(pos!==null)moveWidget(editor,pos,1);}}><ArrowDown size={14}/></button><button type="button" title="Blok dupliceren" aria-label="Blok dupliceren" onClick={e=>{e.stopPropagation();const pos=position();if(pos!==null)editor.chain().focus().insertContentAt(pos+node.nodeSize,node.toJSON()).run();}}><Copy size={14}/></button><button type="button" title="Blok verwijderen" aria-label="Blok verwijderen" onClick={e=>{e.stopPropagation();deleteNode();}}><Trash2 size={14}/></button></span>}</div>
      <div className={`cms-widget-body cms-widget-${kind}`}>
        {data.title&&<h3>{data.title}</h3>}
        {kind==='person'&&<div className="cms-widget-person">{source?<img src={source} alt=""/>:<div className="cms-widget-avatar">{person?.name.split(' ').map(part=>part[0]).slice(0,2).join('')||<Users size={25}/>}</div>}<div><strong>{person?.name||'Kies een persoon'}</strong><p>{person?.role||'Koppel een centraal beheerd profiel.'}</p>{person?.bio&&<small>{person.bio}</small>}</div></div>}
        {kind==='people'&&<div className="cms-widget-people">{people.length?people.map(p=><div key={p.id}><span className="cms-widget-avatar">{p.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><strong>{p.name}</strong><small>{p.role}</small></div>):<p>Kies personen of een groep in de blokinstellingen.</p>}</div>}
        {(kind==='image'||kind==='textImage')&&<div className="cms-widget-image-body">{source?<img src={source} alt={media?.alt||''}/>:<div className="cms-widget-image-empty"><ImageIcon size={32}/><span>Kies een afbeelding uit de mediabibliotheek</span></div>}{kind==='textImage'&&<p>{data.text||'Tekst naast de afbeelding'}</p>}{kind==='image'&&media?.caption&&<small>{media.caption}</small>}</div>}
        {kind==='album'&&<div className="cms-widget-reference"><LayoutGrid size={28}/><div><strong>{album?.title||'Kies een fotoalbum'}</strong><p>{album?`${album.mediaIds.length} foto’s · ${album.season||'Alle seizoenen'}`:'Alle wijzigingen in het album verschijnen hier automatisch.'}</p></div></div>}
        {kind==='news'&&<div className="cms-widget-reference"><Newspaper size={28}/><div><strong>{data.layout||(data.contentType==='story'?'Verhalen & columns':'Het laatste clubnieuws')}</strong><p>Automatisch de nieuwste gepubliceerde {data.contentType==='story'?'verhalen en columns':'nieuwsberichten'}{data.layout?` uit ${data.layout}`:''}.</p></div></div>}
        {kind==='documents'&&<div className="cms-widget-documents">{(data.ids?.length?state.documents.filter(d=>data.ids?.includes(d.id)):state.documents.filter(d=>d.published)).slice(0,5).map(d=><div key={d.id}><FileText size={16}/>{d.title}</div>)}{!state.documents.length&&<p>Voeg documenten toe via de mediabibliotheek.</p>}</div>}
        {(kind==='columns'||kind==='faq'||kind==='timeline')&&<div className={`cms-widget-items ${kind==='columns'?'as-columns':''}`}>{(data.items||[]).map((item,i)=><div key={i}><strong>{item.title||`Onderdeel ${i+1}`}</strong><p>{item.text||'Voeg de inhoud toe in de blokinstellingen.'}</p></div>)}</div>}
        {kind==='cta'&&<><p>{data.text||'Nodig bezoekers uit om een volgende stap te zetten.'}</p><span className="cms-widget-faux-button">{data.label||'Lees meer'} →</span></>}
        {kind==='team'&&<div className="cms-widget-reference"><Users size={28}/><div><strong>{state.settings.teams.find(t=>t.id===data.refId)?.name||'Kies een team'}</strong><p>{data.text||'Een directe verwijzing naar de teampagina.'}</p></div></div>}
        {kind==='contact'&&<div className="cms-widget-reference"><Mail size={28}/><div><strong>{state.departments.find(d=>d.id===data.refId)?.name||'Kies een afdeling'}</strong><p>{data.text||'Contact met de juiste mensen binnen de club.'}</p></div></div>}
      </div>
    </div>
  </NodeViewWrapper>;
}

const CmsWidget=Node.create({
  name:'cmsWidget',group:'block',atom:true,draggable:true,selectable:true,
  addAttributes(){return{kind:{default:'cta'},data:{default:{}}};},
  parseHTML(){return[{tag:'section[data-cms-widget]',getAttrs:element=>{try{return{kind:element.getAttribute('data-cms-widget'),data:JSON.parse(element.getAttribute('data-cms-payload')||'{}')};}catch{return false;}}}];},
  renderHTML({node,HTMLAttributes}){return['section',mergeAttributes(HTMLAttributes,{'data-cms-widget':node.attrs.kind,'data-cms-payload':JSON.stringify(node.attrs.data)})];},
  addNodeView(){return ReactNodeViewRenderer(WidgetView);}
});

function WidgetInspector({kind,data,onChange,onClose}:{kind:WidgetKind;data:WidgetData;onChange:(data:WidgetData)=>void;onClose:()=>void}){
  const {state}=useCMS();
  const patch=(value:Partial<WidgetData>)=>onChange({...data,...value});
  const field=(label:string,key:'title'|'text'|'url'|'label',multiline=false)=><label className="cms-field">{label}{multiline?<textarea value={data[key]||''} onChange={e=>patch({[key]:e.target.value})} rows={4}/>:<input value={data[key]||''} onChange={e=>patch({[key]:e.target.value})}/>}</label>;
  const refs=kind==='person'?state.people.filter(x=>!x.deletedAt).map(x=>({id:x.id,name:`${x.name} · ${x.role}`})):kind==='album'?state.albums.filter(x=>!x.deletedAt).map(x=>({id:x.id,name:x.title})):kind==='image'||kind==='textImage'?state.media.filter(x=>!x.deletedAt).map(x=>({id:x.id,name:x.name})):kind==='team'?state.settings.teams:kind==='contact'?state.departments.filter(x=>x.active).map(x=>({id:x.id,name:x.name})):[];
  return <aside className="cms-block-inspector"><div className="cms-block-inspector-heading"><div><small>Geselecteerd blok</small><h3>{widgetLabel(kind,data)}</h3></div><button type="button" className="cms-icon-button" onClick={onClose} aria-label="Blokinstellingen sluiten"><X size={18}/></button></div>
    {field('Kop boven het blok','title')}
    {['person','image','textImage','album','team','contact'].includes(kind)&&<label className="cms-field">{kind==='person'?'Persoon':kind==='album'?'Fotoalbum':kind==='team'?'Team':kind==='contact'?'Afdeling':'Afbeelding'}<select value={data.refId||''} onChange={e=>patch({refId:e.target.value})}><option value="">Maak een keuze</option>{refs.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}
    {kind==='people'&&<><label className="cms-field">Groep<select value={data.layout||''} onChange={e=>patch({layout:e.target.value,ids:[]})}><option value="">Alle personen</option>{[...new Set(state.people.filter(p=>!p.deletedAt).map(p=>p.group))].filter(Boolean).map(group=><option key={group} value={group}>{group}</option>)}</select></label><fieldset className="cms-widget-checklist"><legend>Of selecteer personen</legend>{state.people.filter(p=>!p.deletedAt).map(p=><label key={p.id}><input type="checkbox" checked={data.ids?.includes(p.id)||false} onChange={e=>patch({ids:e.target.checked?[...(data.ids||[]),p.id]:(data.ids||[]).filter(id=>id!==p.id)})}/><span>{p.name}<small>{p.role}</small></span></label>)}</fieldset></>}
    {['textImage','cta','team','contact'].includes(kind)&&field('Tekst','text',true)}
    {kind==='textImage'&&<label className="cms-field">Positie van de foto<select value={data.layout||'left'} onChange={e=>patch({layout:e.target.value})}><option value="left">Links</option><option value="right">Rechts</option></select></label>}
    {kind==='news'&&<><label className="cms-field">Inhoudstype<select value={data.contentType||'news'} onChange={e=>patch({contentType:e.target.value==='story'?'story':'news',layout:''})}><option value="news">Nieuwsberichten</option><option value="story">Verhalen & columns</option></select><small>Nieuws en verhalen worden apart getoond.</small></label><label className="cms-field">Categorie<select value={data.layout||''} onChange={e=>patch({layout:e.target.value})}><option value="">Alle categorieën</option>{state.settings.newsCategories.map(category=><option key={category}>{category}</option>)}</select></label></>}
    {kind==='documents'&&<fieldset className="cms-widget-checklist"><legend>Documenten (leeg = alle gepubliceerde)</legend>{state.documents.map(d=><label key={d.id}><input type="checkbox" checked={data.ids?.includes(d.id)||false} onChange={e=>patch({ids:e.target.checked?[...(data.ids||[]),d.id]:(data.ids||[]).filter(id=>id!==d.id)})}/><span>{d.title}</span></label>)}</fieldset>}
    {['columns','faq','timeline'].includes(kind)&&<div className="cms-widget-item-editor">{(data.items||[]).map((item,index)=><section key={index}><div className="cms-widget-item-heading"><strong>{kind==='columns'?'Kolom':kind==='faq'?'Vraag':'Moment'} {index+1}</strong><button className="cms-icon-button" type="button" onClick={()=>patch({items:data.items?.filter((_,i)=>i!==index)})} aria-label={`Onderdeel ${index+1} verwijderen`}><Trash2 size={14}/></button></div><label className="cms-field">{kind==='timeline'?'Jaar / titel':'Titel'}<input value={item.title} onChange={e=>patch({items:data.items?.map((x,i)=>i===index?{...x,title:e.target.value}:x)})}/></label><label className="cms-field">{kind==='faq'?'Antwoord':'Inhoud'}<textarea rows={3} value={item.text} onChange={e=>patch({items:data.items?.map((x,i)=>i===index?{...x,text:e.target.value}:x)})}/></label></section>)}<button className="cms-button" type="button" onClick={()=>patch({items:[...(data.items||[]),{title:'',text:''}]})}><Plus size={15}/> Onderdeel toevoegen</button></div>}
    {kind==='cta'&&<>{field('Knoptekst','label')}{field('Link (https://… of /clubmuur/…)','url')}{data.url&&!safeUrl(data.url)&&<p className="cms-validation">Gebruik een geldige web-, mail-, telefoon- of interne link.</p>}</>}
    {['person','people','album','image','textImage'].includes(kind)&&<p className="cms-meta">Dit blok verwijst naar centraal beheerde inhoud. Alleen gepubliceerde personen, albums en media verschijnen op de website.</p>}
    {kind==='contact'&&<p className="cms-meta">Afdelingen worden beheerd bij Formulieren. De e-mailafhandeling wordt op de VPS aangesloten.</p>}
  </aside>;
}

export function BlockEditor({value,onChange,editable=true}:{value:CmsDoc;onChange:(doc:CmsDoc)=>void;editable?:boolean}){
  const [palette,setPalette]=useState(false),[selection,setSelection]=useState<{pos:number;kind:WidgetKind;data:WidgetData}|null>(null),[linkOpen,setLinkOpen]=useState(false),[linkValue,setLinkValue]=useState(''),[linkError,setLinkError]=useState(''),[,refresh]=useState(0);
  const extensions=useMemo(()=>[StarterKit.configure({heading:{levels:[2,3,4]},link:{openOnClick:false}}),Placeholder.configure({placeholder:'Schrijf je verhaal… of voeg een blok toe.'}),CmsWidget],[]);
  const editor=useEditor({extensions,content:value,editable,immediatelyRender:false,onUpdate:({editor:instance})=>onChange(instance.getJSON()),onSelectionUpdate:({editor:instance})=>{const picked=instance.state.selection;if(picked instanceof NodeSelection&&picked.node.type.name==='cmsWidget')setSelection({pos:picked.from,kind:picked.node.attrs.kind as WidgetKind,data:picked.node.attrs.data as WidgetData});else setSelection(null);refresh(x=>x+1);},onTransaction:({editor:instance})=>{const picked=instance.state.selection;if(picked instanceof NodeSelection&&picked.node.type.name==='cmsWidget')setSelection({pos:picked.from,kind:picked.node.attrs.kind as WidgetKind,data:picked.node.attrs.data as WidgetData});refresh(x=>x+1);}});
  useEffect(()=>{if(editor&&JSON.stringify(editor.getJSON())!==JSON.stringify(value))editor.commands.setContent(value,{emitUpdate:false});},[value,editor]);
  useEffect(()=>{editor?.setEditable(editable);},[editable,editor]);
  const insert=(kind:WidgetKind)=>{if(!editor)return;editor.chain().focus().insertContent([{type:'cmsWidget',attrs:{kind,data:defaultData(kind)}},{type:'paragraph'}]).run();setPalette(false);const {from}=editor.state.selection;const resolved=editor.state.doc.resolve(from);const before=resolved.before(1);const prev=editor.state.doc.resolve(before).nodeBefore;if(prev?.type.name==='cmsWidget')editor.commands.setNodeSelection(before-prev.nodeSize);};
  const tools=[{label:'Vet',Icon:Bold,active:editor?.isActive('bold'),run:()=>editor?.chain().focus().toggleBold().run()},{label:'Cursief',Icon:Italic,active:editor?.isActive('italic'),run:()=>editor?.chain().focus().toggleItalic().run()},{label:'Tussenkop',Icon:Heading2,active:editor?.isActive('heading',{level:2}),run:()=>editor?.chain().focus().toggleHeading({level:2}).run()},{label:'Opsomming',Icon:List,active:editor?.isActive('bulletList'),run:()=>editor?.chain().focus().toggleBulletList().run()},{label:'Genummerde lijst',Icon:ListOrdered,active:editor?.isActive('orderedList'),run:()=>editor?.chain().focus().toggleOrderedList().run()},{label:'Citaat',Icon:Quote,active:editor?.isActive('blockquote'),run:()=>editor?.chain().focus().toggleBlockquote().run()}];
  return <div className={`cms-block-editor ${editable?'':'is-readonly'}`}>
    {editable&&<><div className="cms-block-toolbar" role="toolbar" aria-label="Pagina opmaken">{tools.map(({label,Icon,active,run})=><button key={label} type="button" aria-label={label} title={label} aria-pressed={!!active} className={active?'active':''} onClick={run}><Icon size={17}/></button>)}<button type="button" aria-label="Link invoegen" title="Link invoegen" aria-pressed={!!editor?.isActive('link')} onClick={()=>{setLinkValue(editor?.getAttributes('link').href||'');setLinkError('');setLinkOpen(x=>!x);}}><Link2 size={17}/></button><span className="cms-toolbar-spacer"/><button type="button" disabled={!editor?.can().undo()} title="Ongedaan maken" aria-label="Ongedaan maken" onClick={()=>editor?.chain().focus().undo().run()}><Undo2 size={17}/></button><button type="button" disabled={!editor?.can().redo()} title="Opnieuw" aria-label="Opnieuw" onClick={()=>editor?.chain().focus().redo().run()}><Redo2 size={17}/></button><button type="button" className="cms-add-block-button" onClick={()=>setPalette(x=>!x)} aria-expanded={palette}><Plus size={17}/> Blok <ChevronDown size={14}/></button></div>
      {linkOpen&&<div className="cms-inline-link"><label className="cms-field">Link<input autoFocus placeholder="https://… of /clubmuur/…" value={linkValue} onChange={e=>setLinkValue(e.target.value)}/></label><button type="button" className="cms-button" onClick={()=>{if(linkValue&&!safeUrl(linkValue)){setLinkError('Gebruik een geldige link.');return;}if(linkValue)editor?.chain().focus().extendMarkRange('link').setLink({href:linkValue}).run();else editor?.chain().focus().extendMarkRange('link').unsetLink().run();setLinkOpen(false);}}><Check size={15}/> Toepassen</button><button type="button" className="cms-icon-button" aria-label="Sluiten" onClick={()=>setLinkOpen(false)}><X size={17}/></button>{linkError&&<span className="cms-validation">{linkError}</span>}</div>}
      {palette&&<div className="cms-block-palette"><div className="cms-palette-label">Bouw je pagina, blok voor blok<span>Tekst typ je direct in de pagina.</span></div><div>{(Object.keys(widgetLabels) as WidgetKind[]).map(kind=>{const Icon=widgetIcons[kind];return <button key={kind} type="button" onClick={()=>insert(kind)}><Icon size={20}/><span>{widgetLabels[kind]}</span><Plus size={14}/></button>;})}</div></div>}
    </>}
    <div className={`cms-block-workspace ${selection&&editable?'has-inspector':''}`}><div className="cms-block-canvas"><EditorContent editor={editor}/>{editable&&<button type="button" className="cms-block-bottom-add" onClick={()=>setPalette(true)}><Plus size={17}/> Blok toevoegen</button>}</div>{editable&&selection&&<WidgetInspector key={`${selection.pos}-${selection.kind}`} kind={selection.kind} data={selection.data} onClose={()=>{setSelection(null);editor?.commands.blur();}} onChange={data=>{if(!editor)return;const pos=selection.pos,node=editor.state.doc.nodeAt(pos);if(node?.type.name!=='cmsWidget')return;editor.commands.command(({tr})=>{tr.setNodeMarkup(pos,undefined,{...node.attrs,data});return true;});setSelection({...selection,data});}}/>}</div>
    {editable&&<div className="cms-block-footnote"><GripVertical size={14}/><span>Sleep blokken met de greep, of gebruik de pijlen. Klik op een blok voor de instellingen.</span></div>}
  </div>;
}

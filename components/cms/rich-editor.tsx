'use client';
import {Pagination,usePagination} from './pagination';

import {useEffect,useMemo,useRef,useState} from 'react';
import {EditorContent,useEditor,useEditorState} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import {TableKit} from '@tiptap/extension-table';
import {AlignCenter,AlignLeft,AlignRight,Bold,ImagePlus,Italic,Link2,List,ListOrdered,Quote,Redo2,Table2,Underline,Undo2,X} from 'lucide-react';
import type {CmsDoc} from '@/lib/cms/types';
import {safeUrl} from '@/lib/cms/model';
import {useCMS} from './provider';
import './news.css';

export type RichEditorProps={value:CmsDoc;onChange:(doc:CmsDoc)=>void;placeholder?:string;readOnly?:boolean};
const CmsImage=Image.extend({addAttributes(){return {...this.parent?.(),mediaId:{default:null,parseHTML:element=>element.getAttribute('data-media-id'),renderHTML:attributes=>attributes.mediaId?{'data-media-id':attributes.mediaId}:{}}};}});

export function RichEditor({value,onChange,placeholder='Hier begint jouw verhaal…',readOnly=false}:RichEditorProps){
  const {state}=useCMS();
  const changeRef=useRef(onChange);
  changeRef.current=onChange;
  const [picker,setPicker]=useState<'image'|'link'|null>(null);
  const [link,setLink]=useState('');
  const [error,setError]=useState('');
  const resolvedDoc=useMemo(()=>{function resolve(node:CmsDoc):CmsDoc{const source=node.type==='image'&&node.attrs?.mediaId?state.media.find(m=>m.id===node.attrs?.mediaId&&!m.deletedAt)?.src:undefined;return {...node,...(source?{attrs:{...node.attrs,src:source}}:{}),...(node.content?{content:node.content.map(resolve)}:{})};}return resolve(value);},[value,state.media]);
  const editor=useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({heading:{levels:[2,3,4]},link:{openOnClick:false,autolink:true,HTMLAttributes:{rel:'noopener noreferrer'}}}),CmsImage.configure({allowBase64:false}),Placeholder.configure({placeholder}),TextAlign.configure({types:['heading','paragraph']}),TableKit.configure({table:{resizable:false}})],
    content:resolvedDoc,
    editable:!readOnly,
    editorProps:{attributes:{class:'cms-prose',role:'textbox','aria-label':'Inhoud van het verhaal','aria-multiline':'true'}},
    onUpdate:({editor:active})=>changeRef.current(active.getJSON()),
  });
  const formatting=useEditorState({editor,selector:({editor:active})=>active?{bold:active.isActive('bold'),italic:active.isActive('italic'),underline:active.isActive('underline'),bullet:active.isActive('bulletList'),ordered:active.isActive('orderedList'),quote:active.isActive('blockquote'),link:active.isActive('link'),heading:[2,3,4].find(level=>active.isActive('heading',{level}))||0,table:active.isActive('table')}:null});
  useEffect(()=>{if(editor&&JSON.stringify(editor.getJSON())!==JSON.stringify(resolvedDoc))editor.commands.setContent(resolvedDoc,{emitUpdate:false});},[editor,resolvedDoc]);
  useEffect(()=>{editor?.setEditable(!readOnly);if(readOnly)setPicker(null);},[editor,readOnly]);
  function applyLink(){if(!editor)return;const url=link.trim();if(url&&!safeUrl(url)){setError('Gebruik een volledige https://-link, mailto:, tel: of een intern pad.');return;}if(url)editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();else editor.chain().focus().extendMarkRange('link').unsetLink().run();setPicker(null);setError('');}
  const selectableMedia=state.media.filter(m=>!m.deletedAt&&m.published&&m.src);
  const mediaPage=usePagination(selectableMedia);
  return <div className={`cms-rich-editor${readOnly?' is-readonly':''}`}>
    {!readOnly&&<div className="cms-rich-toolbar" role="toolbar" aria-label="Tekstopmaak">
      <select aria-label="Tekststijl" value={formatting?.heading||0} onChange={e=>{const level=Number(e.target.value);if(level)editor?.chain().focus().setHeading({level:level as 2|3|4}).run();else editor?.chain().focus().setParagraph().run();}} disabled={!editor}><option value={0}>Alinea</option><option value={2}>Kop 2</option><option value={3}>Kop 3</option><option value={4}>Kop 4</option></select>
      <span className="cms-rich-divider"/>
      <button type="button" aria-label="Vet" title="Vet (Ctrl/⌘ B)" aria-pressed={!!formatting?.bold} onClick={()=>editor?.chain().focus().toggleBold().run()}><Bold size={17}/></button>
      <button type="button" aria-label="Cursief" title="Cursief (Ctrl/⌘ I)" aria-pressed={!!formatting?.italic} onClick={()=>editor?.chain().focus().toggleItalic().run()}><Italic size={17}/></button>
      <button type="button" aria-label="Onderstrepen" title="Onderstrepen" aria-pressed={!!formatting?.underline} onClick={()=>editor?.chain().focus().toggleUnderline().run()}><Underline size={17}/></button>
      <button type="button" aria-label="Opsomming" title="Opsomming" aria-pressed={!!formatting?.bullet} onClick={()=>editor?.chain().focus().toggleBulletList().run()}><List size={17}/></button>
      <button type="button" aria-label="Genummerde lijst" title="Genummerde lijst" aria-pressed={!!formatting?.ordered} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={17}/></button>
      <button type="button" aria-label="Citaat" title="Citaat" aria-pressed={!!formatting?.quote} onClick={()=>editor?.chain().focus().toggleBlockquote().run()}><Quote size={17}/></button>
      <span className="cms-rich-divider"/>
      <button type="button" aria-label="Links uitlijnen" title="Links uitlijnen" onClick={()=>editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={17}/></button>
      <button type="button" aria-label="Centreren" title="Centreren" onClick={()=>editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={17}/></button>
      <button type="button" aria-label="Rechts uitlijnen" title="Rechts uitlijnen" onClick={()=>editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={17}/></button>
      <button type="button" aria-label="Link toevoegen" title="Link toevoegen" aria-pressed={!!formatting?.link} onClick={()=>{setLink(editor?.getAttributes('link').href||'');setError('');setPicker(picker==='link'?null:'link');}}><Link2 size={17}/></button>
      <button type="button" aria-label="Foto uit mediabibliotheek" title="Foto uit mediabibliotheek" onClick={()=>setPicker(picker==='image'?null:'image')}><ImagePlus size={17}/></button>
      <button type="button" aria-label="Tabel invoegen" title="Tabel invoegen" onClick={()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()}><Table2 size={17}/></button>
      <span className="cms-rich-divider"/>
      <button type="button" aria-label="Ongedaan maken" title="Ongedaan maken" disabled={!editor?.can().undo()} onClick={()=>editor?.chain().focus().undo().run()}><Undo2 size={17}/></button>
      <button type="button" aria-label="Opnieuw" title="Opnieuw" disabled={!editor?.can().redo()} onClick={()=>editor?.chain().focus().redo().run()}><Redo2 size={17}/></button>
    </div>}
    {!readOnly&&formatting?.table&&<div className="cms-rich-table-tools"><span>Tabel bewerken</span><button type="button" onClick={()=>editor?.chain().focus().addRowAfter().run()}>+ Rij</button><button type="button" onClick={()=>editor?.chain().focus().addColumnAfter().run()}>+ Kolom</button><button type="button" onClick={()=>editor?.chain().focus().deleteRow().run()}>Rij verwijderen</button><button type="button" onClick={()=>editor?.chain().focus().deleteColumn().run()}>Kolom verwijderen</button><button type="button" onClick={()=>editor?.chain().focus().deleteTable().run()}>Tabel verwijderen</button></div>}
    {picker==='link'&&<div className="cms-rich-popover"><label className="cms-field">Linkadres<input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();applyLink();}}}/></label><div className="cms-toolbar"><button className="cms-button primary" type="button" onClick={applyLink}>Link toepassen</button><button className="cms-button" type="button" onClick={()=>{editor?.chain().focus().extendMarkRange('link').unsetLink().run();setPicker(null);}}>Link verwijderen</button><button type="button" className="cms-button" onClick={()=>setPicker(null)}>Sluiten</button></div>{error&&<p role="alert" className="cms-news-errors">{error}</p>}</div>}
    {picker==='image'&&<div className="cms-rich-popover"><div className="cms-toolbar"><strong>Kies een gepubliceerde foto</strong><button type="button" className="cms-button" aria-label="Fotokiezer sluiten" onClick={()=>setPicker(null)}><X size={16}/></button></div>{selectableMedia.length?<div className="cms-rich-media">{mediaPage.items.map(m=><button type="button" key={m.id} onClick={()=>{editor?.chain().focus().insertContent({type:'image',attrs:{src:m.src,mediaId:m.id,alt:m.alt,title:m.caption||m.name}}).run();setPicker(null);}}><img src={m.src} alt={m.alt||m.name}/><span>{m.name}</span></button>)}</div>:<p>Publiceer eerst een foto in de mediabibliotheek.</p>}<Pagination label="Afbeelding in tekst" {...mediaPage}/></div>}
    <EditorContent editor={editor}/>
    {!editor&&<div className="cms-rich-loading">Editor laden…</div>}
    {!readOnly&&<div className="cms-rich-footnote">TipTap Editor · Selecteer tekst om je verhaal op te maken.</div>}
  </div>;
}

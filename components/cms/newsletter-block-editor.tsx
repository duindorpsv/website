'use client';

import {useState,type DragEvent} from 'react';
import {ArrowDown,ArrowUp,Check,ChevronDown,ChevronUp,Copy,GripVertical,ImagePlus,Link2,Minus,Newspaper,Plus,Space,Trash2,Type} from 'lucide-react';
import type {NewsletterBlock,NewsletterBlockType} from '@/lib/cms/newsletter-types';
import {createBlock,validNewsletterLink,newsletterImageUrl} from '@/lib/cms/newsletter';
import {docText,textDoc,uid} from '@/lib/cms/model';
import {useCMS} from './provider';
import {Pagination,usePagination} from './pagination';
import {RichEditor} from './rich-editor';
import './newsletter-block-editor.css';

const blockTypes=[
 {type:'text',label:'Tekst',description:'Schrijf en maak op',Icon:Type},
 {type:'article',label:'Nieuwsbericht',description:'Uit het gepubliceerde nieuws',Icon:Newspaper},
 {type:'image',label:'Afbeelding',description:'Foto met alt-tekst',Icon:ImagePlus},
 {type:'button',label:'Knop',description:'Een duidelijke oproep',Icon:Link2},
 {type:'divider',label:'Scheidingslijn',description:'Rust tussen onderdelen',Icon:Minus},
 {type:'spacer',label:'Witruimte',description:'Laat inhoud ademen',Icon:Space},
] as const;
const labelFor=(type:NewsletterBlockType)=>blockTypes.find(item=>item.type===type)!.label;
const imageSource=(value?:string)=>value&&validNewsletterLink(value)?value:undefined;

function BlockPreview({block}:{block:NewsletterBlock}){
 if(block.type==='text')return <div className="nlb-text-preview">{block.body&&docText(block.body).trim()||'Klik om je tekst te schrijven. Gebruik bijvoorbeeld {{voornaam}} voor een persoonlijke aanhef.'}</div>;
 if(block.type==='article')return <div className="nlb-article-preview">{imageSource(block.imageUrl)&&<img src={imageSource(block.imageUrl)} alt=""/>}<div><small>NIEUWS UIT DE CLUB</small><strong>{block.title||'Nieuwsbericht'}</strong><p>{block.text||'Een korte introductie van het nieuwsbericht.'}</p><span>{block.body?'Volledige artikeltekst opgenomen · ':''}Lees het hele bericht →</span></div></div>;
 if(block.type==='image')return imageSource(block.imageUrl)?<img className="nlb-image-preview" src={imageSource(block.imageUrl)} alt={block.imageAlt||''}/>:<div className="nlb-placeholder"><ImagePlus size={22}/><span>Kies een foto uit de mediabibliotheek</span></div>;
 if(block.type==='button')return <div className="nlb-button-preview"><span>{block.title||'Bekijk meer'}</span></div>;
 if(block.type==='divider')return <div className="nlb-divider-preview"><hr/></div>;
 return <div className="nlb-space-preview" style={{minHeight:Math.min(120,Math.max(0,block.gap??24))}}><span>{block.gap??24} px witruimte</span></div>;
}

export function NewsletterBlockEditor({blocks,onChange,editable=true,onPickArticle}:{blocks:NewsletterBlock[];onChange:(blocks:NewsletterBlock[])=>void;editable?:boolean;onPickArticle:()=>void}){
 const {state}=useCMS();
 const [selected,setSelected]=useState<string|null>(null),[dragged,setDragged]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<string|null>(null),[mediaPicker,setMediaPicker]=useState<string|null>(null),[announcement,setAnnouncement]=useState('');
 const media=state.media.filter(item=>item.published&&!item.deletedAt&&imageSource(item.src)).map(item=>({...item,src:newsletterImageUrl(item.src)}));
 const mediaPage=usePagination(media);
 const mediaWithoutPublicUrl=state.media.filter(item=>item.published&&!item.deletedAt&&item.src&&!imageSource(item.src)).length;
 function patch(id:string,change:Partial<NewsletterBlock>){if(!editable)return;onChange(blocks.map(block=>block.id===id?{...block,...change}:block));}
 function add(type:NewsletterBlockType){if(!editable)return;if(type==='article'){onPickArticle();return;}const block=createBlock(type);onChange([...blocks,block]);setSelected(block.id);setAnnouncement(`${labelFor(type)} toegevoegd.`);}
 function move(id:string,offset:number){if(!editable)return;const from=blocks.findIndex(block=>block.id===id),to=from+offset;if(from<0||to<0||to>=blocks.length)return;const next=[...blocks],block=next.splice(from,1)[0];next.splice(to,0,block);onChange(next);setAnnouncement(`${labelFor(block.type)} verplaatst naar positie ${to+1}.`);}
 function duplicate(block:NewsletterBlock){if(!editable)return;const copy={...structuredClone(block),id:uid('mail-block')},index=blocks.findIndex(item=>item.id===block.id);onChange([...blocks.slice(0,index+1),copy,...blocks.slice(index+1)]);setSelected(copy.id);setAnnouncement(`${labelFor(block.type)} gedupliceerd.`);}
 function remove(id:string){if(!editable)return;onChange(blocks.filter(block=>block.id!==id));if(selected===id)setSelected(null);if(mediaPicker===id)setMediaPicker(null);setAnnouncement('Blok verwijderd.');}
 function drop(event:DragEvent<HTMLElement>,target:string){event.preventDefault();if(!editable||!dragged)return;const from=blocks.findIndex(block=>block.id===dragged),to=blocks.findIndex(block=>block.id===target);if(from>=0&&to>=0&&from!==to){const next=[...blocks],block=next.splice(from,1)[0];next.splice(to,0,block);onChange(next);setAnnouncement(`${labelFor(block.type)} verplaatst naar positie ${to+1}.`);}setDragged(null);setDropTarget(null);}
 return <section className={`nlb-editor${!editable?' nlb-readonly':''}`} aria-label="Nieuwsbrief blokbouwer">
  <div className="nlb-builder-heading"><div><span>OPBOUW VAN JE E-MAIL</span><p>{blocks.length} {blocks.length===1?'blok':'blokken'} · Klik om te bewerken</p></div><span className="nlb-tiptap-badge"><Type size={13}/>TipTap</span></div>
  <p className="nlb-sr" role="status" aria-live="polite">{announcement}</p>
  <p className="nlb-sr" id="newsletter-block-drag-help">Sleep met de greep om de volgorde te wijzigen. Gebruik de pijltjesknoppen of Alt plus pijl omhoog of omlaag.</p>
  <div className="nlb-block-list">{blocks.map((block,index)=>{
   const active=selected===block.id,Icon=blockTypes.find(item=>item.type===block.type)!.Icon;
   return <section className={`nlb-block${active?' is-selected':''}${dragged===block.id?' is-dragging':''}${dropTarget===block.id&&dragged!==block.id?' is-drop-target':''}`} key={block.id} aria-label={`${labelFor(block.type)}, blok ${index+1}`} onDragOver={event=>{if(editable&&dragged){event.preventDefault();event.dataTransfer.dropEffect='move';setDropTarget(block.id);}}} onDrop={event=>drop(event,block.id)}>
    <header className="nlb-block-header"><div className="nlb-block-kind">{editable&&<button type="button" draggable className="nlb-drag" aria-label={`${labelFor(block.type)} verslepen`} aria-describedby="newsletter-block-drag-help" title="Sleep om te verplaatsen · Alt + ↑ / ↓" onDragStart={event=>{event.dataTransfer.setData('text/plain',block.id);event.dataTransfer.effectAllowed='move';setDragged(block.id);}} onDragEnd={()=>{setDragged(null);setDropTarget(null);}} onKeyDown={event=>{if(event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();move(block.id,event.key==='ArrowUp'?-1:1);}}}><GripVertical size={16}/></button>}<Icon size={15}/><span>{labelFor(block.type)}</span><small>{String(index+1).padStart(2,'0')}</small></div><div className="nlb-block-actions">{editable&&<><button type="button" onClick={()=>move(block.id,-1)} disabled={index===0} aria-label={`${labelFor(block.type)} omhoog`} title="Omhoog"><ArrowUp size={14}/></button><button type="button" onClick={()=>move(block.id,1)} disabled={index===blocks.length-1} aria-label={`${labelFor(block.type)} omlaag`} title="Omlaag"><ArrowDown size={14}/></button><button type="button" onClick={()=>duplicate(block)} aria-label={`${labelFor(block.type)} dupliceren`} title="Dupliceren"><Copy size={14}/></button><button type="button" className="nlb-delete" onClick={()=>remove(block.id)} aria-label={`${labelFor(block.type)} verwijderen`} title="Verwijderen"><Trash2 size={14}/></button><span className="nlb-action-divider"/><button type="button" aria-label={`${labelFor(block.type)} ${active?'inklappen':'bewerken'}`} aria-expanded={active} onClick={()=>{setSelected(active?null:block.id);setMediaPicker(null);}}>{active?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button></>}</div></header>
    {active&&editable?<div className="nlb-block-fields">
     {block.type==='text'&&<><RichEditor emailMode value={block.body||textDoc([''])} onChange={body=>patch(block.id,{body})} placeholder="Schrijf je boodschap voor de club…"/><p className="nlb-field-note">Persoonlijke aanhef: <code>{'{{voornaam}}'}</code>. Zonder naam tonen we ‘supporter’.</p></>}
     {block.type==='article'&&<><div className="nlb-snapshot-note"><Newspaper size={15}/><span>Kopie van een gepubliceerd bericht. Latere wijzigingen op de website veranderen dit e-mailblok niet.</span></div><label><span>Titel</span><input maxLength={500} value={block.title||''} onChange={event=>patch(block.id,{title:event.target.value})}/></label><label><span>Introductie</span><textarea rows={3} maxLength={10000} value={block.text||''} onChange={event=>patch(block.id,{text:event.target.value})}/></label><label><span>Link naar het bericht</span><input maxLength={4000} value={block.url||''} onChange={event=>patch(block.id,{url:event.target.value})} placeholder="/clubmuur/nieuws/bericht"/></label><BlockPreview block={block}/>{block.body&&<div className="nlb-article-body"><h4>Volledige artikeltekst</h4><RichEditor emailMode value={block.body} onChange={body=>patch(block.id,{body})} placeholder="De gepubliceerde artikeltekst…"/><p className="nlb-field-note">Dit is een bewerkbare kopie voor deze e-mail. Het nieuwsbericht op de website blijft zelfstandig beheerd.</p></div>}</>}
     {block.type==='image'&&<><div className="nlb-image-fields"><div><label><span>Afbeeldingsadres</span><input maxLength={4000} value={block.imageUrl||''} onChange={event=>patch(block.id,{imageUrl:event.target.value})} placeholder="https://… of /assets/…"/></label><label><span>Alt-tekst</span><input maxLength={500} value={block.imageAlt||''} onChange={event=>patch(block.id,{imageAlt:event.target.value})} placeholder="Beschrijf kort wat er op de foto staat"/></label></div><button className="nlb-media-button" type="button" onClick={()=>setMediaPicker(mediaPicker===block.id?null:block.id)} aria-expanded={mediaPicker===block.id}><ImagePlus size={17}/>Mediabibliotheek</button></div>{block.imageUrl&&!validNewsletterLink(block.imageUrl)&&<p className="nlb-field-error" role="alert">Gebruik een openbaar webadres of gepubliceerde foto. Een blob:-URL werkt alleen in je eigen browser.</p>}{mediaPicker===block.id&&<div className="nlb-media-picker">{media.length?mediaPage.items.map(item=><button key={item.id} type="button" onClick={()=>{patch(block.id,{imageUrl:item.src,imageAlt:item.alt||item.name});setMediaPicker(null);}}><img src={item.src} alt=""/><span>{item.name}</span>{block.imageUrl===item.src&&<Check size={14}/>}</button>):<p>Hier verschijnen gepubliceerde foto's met een openbaar afbeeldingsadres.</p>}<Pagination label="Nieuwsbrieffoto’s" {...mediaPage}/>{mediaWithoutPublicUrl>0&&<p>{mediaWithoutPublicUrl} foto('s) hebben nog geen publiek afbeeldingsadres en kunnen nog niet in een e-mail worden gebruikt.</p>}</div>}<BlockPreview block={block}/></>}
     {block.type==='button'&&<><div className="nlb-field-pair"><label><span>Knoptekst</span><input maxLength={500} value={block.title||''} onChange={event=>patch(block.id,{title:event.target.value})} placeholder="Bekijk de clubagenda"/></label><label><span>Bestemming</span><input maxLength={4000} value={block.url||''} onChange={event=>patch(block.id,{url:event.target.value})} placeholder="https://… of /clubmuur/…"/></label></div>{block.url&&!validNewsletterLink(block.url)&&<p className="nlb-field-error" role="alert">Gebruik een geldige web- of interne link.</p>}<BlockPreview block={block}/></>}
     {block.type==='divider'&&<><BlockPreview block={block}/><p className="nlb-field-note">Een rustige lijn in de standaard clubkleuren.</p></>}
     {block.type==='spacer'&&<><label className="nlb-gap-field"><span>Hoogte van de witruimte</span><select value={block.gap??24} onChange={event=>patch(block.id,{gap:Number(event.target.value)})}>{[0,8,16,24,32,48,64,96,120].map(gap=><option key={gap} value={gap}>{gap} px</option>)}</select></label><BlockPreview block={block}/></>}
    </div>:editable?<button type="button" className="nlb-preview-button" onClick={()=>setSelected(block.id)} aria-label={`${labelFor(block.type)} bewerken`}><BlockPreview block={block}/></button>:<div className="nlb-readonly-preview"><BlockPreview block={block}/></div>}
   </section>;
  })}</div>
  {!blocks.length&&<div className="nlb-empty"><Type size={27}/><strong>Een goed verhaal begint met één blok.</strong><p>Voeg tekst, nieuws of een afbeelding toe aan je nieuwsbrief.</p></div>}
  {editable&&<div className="nlb-palette"><div className="nlb-palette-title"><Plus size={14}/>Blok toevoegen</div><div>{blockTypes.map(({type,label,description,Icon})=><button type="button" key={type} onClick={()=>add(type)} title={description}><Icon size={18}/><span>{label}</span></button>)}</div></div>}
 </section>;
}

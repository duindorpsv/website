'use client';
import {useEffect,useRef,useState} from 'react';
import {Save,RotateCcw,LayoutGrid,Eye,ImageIcon,ChevronDown} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useHeroCards} from '@/hooks/use-club';
import {useCMS} from './cms/provider';
import {MediaPicker} from './cms/media-picker';
import {teams,type Article} from '@/lib/club-data';
import {defaultHeroCards,heroImages,heroPositions,validHeroCards,type HeroCardConfig,type HeroCardKind} from '@/lib/clubmuur-config';
import styles from './hero-editor.module.css';
import {heroPageOptions,resolveHeroPage} from '@/lib/cms/hero-pages';
const pageTemplate:HeroCardConfig={id:'top-left',kind:'page',target:'club',title:'Onze club',kicker:'MEER DAN EEN CLUB',description:'',image:'/assets/clubmuur-portrait.webp',layout:'photo'};
export function HeroEditor({articles}:{articles:Article[]}){
 const {state,reload,recordVersion,ready,can}=useCMS(),cards=useHeroCards(),pages=heroPageOptions(state.pages);
 const pageTarget=(card:HeroCardConfig)=>resolveHeroPage(card.target,state.redirects);
 const [draft,setDraft]=useState(cards),[notice,setNotice]=useState(''),[reset,setReset]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const version=useRef(recordVersion('site-hero')),lock=useRef(false),edited=useRef(false),cardsKey=JSON.stringify(cards),dirty=cardsKey!==JSON.stringify(draft);
 useEffect(()=>{if(!edited.current){setDraft(cards);version.current=recordVersion('site-hero');}},[cardsKey,recordVersion]);
 const editable=ready&&can('pages')&&can('publish',undefined,'pages');
 const update=(i:number,patch:Partial<HeroCardConfig>)=>{edited.current=true;setDraft(current=>current.map((card,index)=>index===i?{...card,...patch}:card));setNotice('');setFailed(false);};
 const changeKind=(i:number,kind:HeroCardKind)=>{const sample=kind==='article'?{...pageTemplate,kind,target:articles[0]?.id||'',title:articles[0]?.title.slice(0,64)||'Nieuwsbericht'}:defaultHeroCards.find(card=>card.kind===kind)??pageTemplate;update(i,{...sample,id:draft[i].id});};
 const targetExists=(card:HeroCardConfig)=>card.kind==='match'||card.kind==='news'||(card.kind==='page'?pages.some(page=>page.value===pageTarget(card)):(card.kind==='team'?teams:articles).some(item=>item.id===card.target));
 const canSave=validHeroCards(draft)&&draft.every(targetExists);
 async function save(next:HeroCardConfig[]){
  if(lock.current||!editable)return;lock.current=true;setBusy(true);setNotice('');setFailed(false);
  try{
   const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),changes:[{module:'hero',id:'site-hero',expectedVersion:version.current,action:'publish',data:{items:next}}]})}),data=await response.json();
   if(!response.ok)throw new Error(response.status===409?'De vier vakken zijn door een andere redacteur gewijzigd. Je wijzigingen blijven hieronder staan. Laad de serverversie opnieuw om verder te gaan.':data.message||'Opslaan is niet gelukt.');
   version.current=data.versions?.['site-hero']??version.current+1;
   edited.current=false;await reload();setDraft(next);setNotice('De vier hero-vakken zijn op de server gepubliceerd.');setReset(false);
  }catch(error){setFailed(true);setNotice(error instanceof Error?error.message:'Opslaan is niet gelukt.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className={`hero-editor ${styles.editor}`}>
  <div className={`hero-editor-intro cms-panel ${styles.intro}`}><div><LayoutGrid size={24}/><div><h3>Vier vakken. Jouw clubverhaal.</h3><p>Kies per plek de inhoud, tekst en afbeelding. De indeling van de homepage blijft behouden.</p></div></div><a className="cms-button" href="/clubmuur" target="_blank" rel="noreferrer"><Eye size={17}/>Bekijk homepage</a></div>
  <form onSubmit={event=>{event.preventDefault();if(canSave)void save(draft);}}>
   <fieldset className={styles.fieldset} disabled={!editable||busy}><legend className={styles.srOnly}>Vier vakken bovenaan bewerken</legend><div className={`hero-editor-grid ${styles.grid}`}>{draft.map((card,index)=><section className={`cms-panel hero-slot-editor ${styles.slot}`} key={card.id}>
    <div className={`hero-slot-heading ${styles.slotHeading}`}><span>{String(index+1).padStart(2,'0')}</span><div><small>Plek op de homepage</small><h2>{heroPositions[index]}</h2></div></div>
    <label className="cms-field">Inhoud<select aria-label={`${heroPositions[index]}: inhoud`} value={card.kind} onChange={event=>changeKind(index,event.target.value as HeroCardKind)}><option value="page">Pagina</option><option value="article">Nieuwsbericht</option><option value="news">Laatste drie nieuwsberichten</option><option value="team">Teamwidget</option><option value="match">Volgende wedstrijd</option></select></label>
    {card.kind!=='match'&&card.kind!=='news'&&<label className="cms-field">{card.kind==='page'?'Pagina':card.kind==='article'?'Nieuwsbericht':'Team'}<select aria-label={`${heroPositions[index]}: bestemming`} value={card.kind==='page'?pageTarget(card):card.target} onChange={event=>update(index,{target:event.target.value})}>{!targetExists(card)&&<option value={card.kind==='page'?pageTarget(card):card.target}>Niet meer beschikbaar</option>}{(card.kind==='page'?pages:card.kind==='article'?articles.map(article=>({value:article.id,label:article.title})):teams.map(team=>({value:team.id,label:team.name}))).map(target=><option value={target.value} key={target.value}>{target.label}</option>)}</select></label>}
    {card.kind==='page'&&<p className={styles.hint}>Kies uit alle gepubliceerde pagina’s, ook pagina’s die niet in het menu staan. Publiceer een nieuwe pagina eerst bij Pagina’s.</p>}
    {card.kind==='news'&&<p className={styles.hint}>Toont automatisch de nieuwste nieuwsberichten, met actieve uitgelichte berichten bovenaan. Bezoekers kunnen de wisseling pauzeren.</p>}
    {card.kind==='match'&&<p className={styles.hint}>De volgende wedstrijd en actuele wedstrijdgegevens worden automatisch bijgewerkt.</p>}
    <label className="cms-field">Titel<textarea aria-label={`${heroPositions[index]}: titel`} required maxLength={64} rows={2} value={card.title} onChange={event=>update(index,{title:event.target.value})}/></label>
    {card.kind!=='news'&&<label className="cms-field">Bovenregel<input aria-label={`${heroPositions[index]}: bovenregel`} maxLength={40} value={card.kicker} onChange={event=>update(index,{kicker:event.target.value})}/></label>}
    <div className={`hero-media-choice ${styles.media}`}><div className={styles.mediaHeading}><ImageIcon size={17}/><strong>Afbeelding voor dit vak</strong></div><img src={card.image} alt={card.imageId?'Gekozen hero-afbeelding':'Standaard hero-afbeelding'}/><div className={styles.mediaActions}><MediaPicker value={card.imageId} label="Kiezen uit mediabibliotheek" onSelect={media=>update(index,{imageId:media.id,image:media.src.replace(/^\/api\/cms\/media\/(.*?)\/file$/, '/api/media/$1')})}/>{card.imageId&&<button type="button" className="cms-button" onClick={()=>update(index,{imageId:undefined,image:defaultHeroCards[index].image})}>Standaardafbeelding gebruiken</button>}</div>
     <details className={styles.defaults}><summary>Andere standaardafbeelding<ChevronDown size={14}/></summary><label className="cms-field">Standaardafbeelding<select aria-label={`${heroPositions[index]}: standaardafbeelding`} value={card.imageId?'':card.image} onChange={event=>update(index,{image:event.target.value,imageId:undefined})}>{card.imageId&&<option value="" disabled>Afbeelding uit mediabibliotheek gekozen</option>}{heroImages.map(image=><option key={image.value} value={image.value}>{image.label}</option>)}</select></label></details>
    </div>
    {card.kind!=='match'&&card.kind!=='news'&&<><label className="cms-field">Weergave<select aria-label={`${heroPositions[index]}: weergave`} value={card.layout} onChange={event=>update(index,{layout:event.target.value as 'photo'|'split'})}><option value="photo">Foto met titel</option><option value="split">Foto naast tekst</option></select></label>{card.layout==='split'&&<label className="cms-field">Korte tekst<textarea aria-label={`${heroPositions[index]}: korte tekst`} maxLength={100} rows={2} value={card.description} onChange={event=>update(index,{description:event.target.value})}/></label>}</>}
    {!targetExists(card)&&<p role="alert" className={styles.error}>Deze bestemming is niet meer beschikbaar. Kies een andere bestemming voordat je publiceert.</p>}
   </section>)}</div></fieldset>
   <div className={`hero-editor-actions ${styles.actions}`}><button type="button" className="cms-button" disabled={!editable||busy} onClick={()=>setReset(true)}><RotateCcw size={16}/>Herstel standaard</button><span>{busy?'Publiceren…':dirty?'Niet-gepubliceerde wijzigingen':'Alle wijzigingen gepubliceerd'}</span><button type="submit" className="cms-button primary" disabled={!editable||busy||!canSave||!dirty}><Save size={17}/>Vier vakken opslaan</button></div>
   {notice&&<div className={`cms-status ${failed?'error':''}`} role={failed?'alert':'status'}>{notice}{failed&&<button type="button" className="cms-button" disabled={busy} onClick={async()=>{if(!window.confirm('Je niet-gepubliceerde wijzigingen vervangen door de serverversie?'))return;setBusy(true);try{const response=await fetch('/api/cms/hero/site-hero',{cache:'no-store'});const fresh=await response.json();if(!response.ok&&response.status!==404)throw new Error(fresh.message||'Opnieuw laden mislukt.');const next=response.ok?fresh.items:defaultHeroCards;if(!validHeroCards(next))throw new Error('Controleer de serverversie van de vier vakken.');edited.current=false;version.current=fresh.version||0;setDraft(next);await reload();setNotice('Serverversie geladen.');setFailed(false);}catch(error){setNotice(error instanceof Error?error.message:'Opnieuw laden mislukt.');}finally{setBusy(false);}}}>Serverversie opnieuw laden</button>}</div>}
  </form>
  <Dialog open={reset} onOpenChange={setReset}><DialogContent className="club-dialog"><DialogHeader><DialogTitle>Standaard hero herstellen?</DialogTitle><DialogDescription>De vier vakken krijgen de oorspronkelijke inhoud terug na publicatie.</DialogDescription></DialogHeader><div className={styles.mediaActions}><button type="button" className="cms-button" disabled={busy} onClick={()=>setReset(false)}>Annuleren</button><button type="button" className="cms-button primary" disabled={busy} onClick={()=>void save(defaultHeroCards)}>{busy?'Herstellen…':'Herstellen'}</button></div></DialogContent></Dialog>
 </section>;
}

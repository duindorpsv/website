'use client';

import {useEffect,useId,useState} from 'react';
import {ArrowDown,ArrowUp,Check,ChevronRight,Eye,Link2,Plus,RotateCcw,Save,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {useClubNavigation,saveClubNavigation} from '@/hooks/use-club-navigation';
import {clubNavigationDestinations,defaultClubNavigation,isSafeClubNavigationHref,maxClubNavigationChildren,validClubNavigation,type ClubNavigationItem,type ClubNavigationLink} from '@/lib/clubmuur-navigation';

export function NavigationEditor(){
 const saved=useClubNavigation(true);
 const [draft,setDraft]=useState<ClubNavigationItem[]>(saved);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [reset,setReset]=useState(false);
 const suggestionId=useId();
 useEffect(()=>setDraft(saved),[saved]);
 const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
 const normalized=draft.map(group=>({...group,children:group.children?.map(link=>({...link,label:link.label.trim(),href:link.href.trim()}))}));
 const canSave=validClubNavigation(normalized);
 function updateGroup(groupId:string,change:(children:ClubNavigationLink[])=>ClubNavigationLink[]){
  setDraft(current=>current.map(group=>group.id===groupId?{...group,children:change(group.children||[])}:group));
  setNotice('');setError('');
 }
 function updateLink(groupId:string,id:string,patch:Partial<ClubNavigationLink>){updateGroup(groupId,children=>children.map(link=>link.id===id?{...link,...patch}:link));}
 function move(groupId:string,index:number,direction:-1|1){
  updateGroup(groupId,children=>{const next=[...children];const destination=index+direction;if(destination<0||destination>=next.length)return children;[next[index],next[destination]]=[next[destination],next[index]];return next;});
 }
 function save(next:ClubNavigationItem[]){
  try{saveClubNavigation(next);setDraft(next);setError('');setNotice('Het mobiele menu is opgeslagen in deze browser. Open de Clubmuur om je wijzigingen te bekijken.');return true;}
  catch(reason){setError(reason instanceof Error?reason.message:'Opslaan is niet gelukt.');setNotice('');return false;}
 }
 return <section className="cm-navigation-editor">
  <div className="cm-navigation-intro"><div><Link2 size={22}/><p>Geef iedere subpagina een duidelijke naam en een plek onder het juiste menuonderdeel. Wijzigingen zijn alleen zichtbaar op dit apparaat. Je voegt hier links toe; de bestemmingspagina moet al bestaan.</p></div><a className="btn btn-outline" href="/clubmuur" target="_blank" rel="noreferrer"><Eye size={17}/>Bekijk Clubmuur</a></div>
  <form onSubmit={event=>{event.preventDefault();if(canSave)save(normalized);}}>
   <datalist id={suggestionId}>{clubNavigationDestinations.map(destination=><option value={destination.href} key={destination.href}>{destination.label}</option>)}</datalist>
   <div className="cm-navigation-groups">{draft.map((group,groupIndex)=><section className="cms-panel cm-navigation-group" key={group.id} aria-labelledby={`nav-editor-${group.id}`}>
    <header className="cm-navigation-group-heading"><span>{String(groupIndex+1).padStart(2,'0')}</span><div><h2 id={`nav-editor-${group.id}`}>{group.label}</h2><p>{(group.children||[]).length} van {maxClubNavigationChildren} subpagina’s</p></div><ChevronRight size={20}/></header>
    <div className="cm-navigation-parent"><span>Hoofdpagina</span><code>{group.href}</code></div>
    <div className="cm-navigation-links">{(group.children||[]).map((link,index)=><div className="cm-navigation-link" key={link.id}>
     <div className="cm-navigation-link-heading"><b>Subpagina {index+1}</b><div className="cm-navigation-link-actions"><button type="button" title="Omhoog verplaatsen" aria-label={`${link.label||'Subpagina '+(index+1)} omhoog verplaatsen`} disabled={index===0} onClick={()=>move(group.id,index,-1)}><ArrowUp size={16}/></button><button type="button" title="Omlaag verplaatsen" aria-label={`${link.label||'Subpagina '+(index+1)} omlaag verplaatsen`} disabled={index===(group.children?.length||0)-1} onClick={()=>move(group.id,index,1)}><ArrowDown size={16}/></button><button type="button" className="cm-navigation-delete" title="Subpagina verwijderen" aria-label={`${link.label||'Subpagina '+(index+1)} verwijderen`} onClick={()=>updateGroup(group.id,children=>children.filter(item=>item.id!==link.id))}><Trash2 size={16}/></button></div></div>
     <div className="cm-navigation-fields"><label className="form-label">Naam in het menu<Input required maxLength={60} autoFocus={link.label===''} value={link.label} onChange={event=>updateLink(group.id,link.id,{label:event.target.value})} placeholder="Bijvoorbeeld: Onze clubwaarden"/></label><label className="form-label">Bestemming<Input required maxLength={300} list={suggestionId} value={link.href} onChange={event=>updateLink(group.id,link.id,{href:event.target.value})} placeholder="Kies of typ een /clubmuur-link" spellCheck={false} autoCapitalize="none" aria-invalid={!!link.href&&!isSafeClubNavigationHref(link.href.trim())} aria-describedby={!isSafeClubNavigationHref(link.href.trim())?`nav-link-hint-${link.id}`:undefined}/>{!isSafeClubNavigationHref(link.href.trim())&&<span className="cm-navigation-field-hint" id={`nav-link-hint-${link.id}`}>Gebruik een bestaande Clubmuur-pagina uit de suggesties.</span>}</label></div>
    </div>)}</div>
    {!group.children?.length&&<p className="cm-navigation-empty">Dit onderdeel gaat direct naar de hoofdpagina. Voeg subpagina’s toe om het uitklapbaar te maken.</p>}
    <button type="button" className="cm-navigation-add" disabled={(group.children?.length||0)>=maxClubNavigationChildren} onClick={()=>updateGroup(group.id,children=>[...children,{id:`nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,label:'',href:group.href}])}><Plus size={17}/>Subpagina toevoegen</button>
   </section>)}</div>
   <div className="cm-navigation-save"><Button type="button" className="btn btn-outline" onClick={()=>setReset(true)}><RotateCcw size={16}/>Herstel standaard</Button><span>{dirty?'Niet-opgeslagen wijzigingen':'Alle wijzigingen opgeslagen'}</span><Button type="submit" className="btn btn-blue" disabled={!dirty||!canSave}><Save size={17}/>Menu opslaan</Button></div>
   {notice&&<p className="cms-status cm-navigation-notice" role="status"><Check size={18}/>{notice}</p>}{error&&<p className="cm-navigation-error" role="alert">{error}</p>}
  </form>
  <Dialog open={reset} onOpenChange={setReset}><DialogContent className="club-dialog"><DialogHeader><DialogTitle>Standaardmenu herstellen?</DialogTitle><DialogDescription>Je eigen menulinks in deze browser worden vervangen door de oorspronkelijke indeling. De pagina’s zelf blijven behouden.</DialogDescription></DialogHeader><div className="form-actions"><Button className="btn btn-outline" onClick={()=>setReset(false)}>Annuleren</Button><Button className="btn btn-blue" onClick={()=>{if(save(defaultClubNavigation))setReset(false);}}>Menu herstellen</Button></div></DialogContent></Dialog>
 </section>;
}

'use client';

import {useEffect,useState} from 'react';
import {Accordion,Dialog as DialogPrimitive} from 'radix-ui';
import {ArrowDown,ArrowRight,ArrowUpRight,MapPin,X} from 'lucide-react';
import {DialogClose,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {useClubNavigation} from '@/hooks/use-club-navigation';

const descriptions:Record<string,string>={home:'Terug naar de clubmuur',club:'Het verhaal achter onze kleuren',teams:'Elke generatie. Eén Duindorp.',wedstrijden:'Van aftrap tot eindstand',nieuws:'Het laatste uit de club'};

export function ClubmuurMobileMenu({open,section,onNavigate,openJoin}:{open:boolean;section:string;onNavigate:()=>void;openJoin:()=>void}){
  const items=useClubNavigation();
  const [expanded,setExpanded]=useState('club');
  const [current,setCurrent]=useState('');
  useEffect(()=>{if(open){setExpanded(section==='home'?'club':section);setCurrent(window.location.pathname+window.location.search+window.location.hash);}},[open,section]);
  const isCurrent=(href:string)=>href===current;
  // This sheet must not inherit the shared dialog's 50% centering utilities.
  // A body portal and dedicated viewport bounds keep it aligned after scrolling.
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="cm-mobile-menu-overlay"/>
    <DialogPrimitive.Content className="cm-mobile-menu">
    <DialogTitle className="sr-only">Menu van Duindorp SV</DialogTitle>
    <DialogDescription className="sr-only">Open een rubriek om de onderliggende pagina’s te bekijken.</DialogDescription>
    <header className="cm-menu-masthead">
      <a href="/clubmuur" className="cm-menu-brand" onClick={onNavigate} aria-label="Duindorp SV — naar home">
        <img src="/assets/logo.png" alt="" width={42} height={49}/>
        <span><strong>DUINDORP SV</strong><small>MEER DAN EEN CLUB</small></span>
      </a>
      <DialogClose className="cm-menu-close" aria-label="Menu sluiten"><X size={23}/></DialogClose>
      <div className="cm-menu-motto"><span>ONZE WIJK. ONZE CLUB. ONZE TROTS.</span><span>EST. 1950</span></div>
    </header>
    <div className="cm-menu-scroll">
      <div className="cm-menu-section-label"><span>ONTDEK DUINDORP</span><span>MENU</span></div>
      <nav aria-label="Mobiele navigatie">
        <Accordion.Root type="single" collapsible value={expanded} onValueChange={setExpanded} className="cm-menu-tree">
          {items.map((item,index)=>item.children?.length?<Accordion.Item key={item.id} value={item.id} className={`cm-menu-group${section===item.id?' is-current':''}`}>
            <Accordion.Header className="cm-menu-heading">
              <Accordion.Trigger className="cm-menu-parent">
                <span className="cm-menu-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
                <span className="cm-menu-parent-copy"><span className="cm-menu-parent-title">{item.label}</span><span className="cm-menu-parent-description">{descriptions[item.id]}</span></span>
                <span className="cm-menu-parent-toggle" aria-hidden="true"><ArrowDown size={18}/></span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="cm-menu-children">
              <div className="cm-menu-children-inner">{!item.children.some(child=>child.href===item.href)&&<a href={item.href} aria-current={isCurrent(item.href)?'page':undefined} onClick={onNavigate}><span>Naar het overzicht</span><ArrowUpRight size={17}/></a>}{item.children.map(child=><a key={child.id} href={child.href} aria-current={isCurrent(child.href)?'page':undefined} onClick={onNavigate}><span>{child.label}</span><ArrowUpRight size={17}/></a>)}</div>
            </Accordion.Content>
          </Accordion.Item>:<div className={`cm-menu-group${section===item.id?' is-current':''}`} key={item.id}>
            <a className="cm-menu-parent" href={item.href} aria-current={isCurrent(item.href)?'page':undefined} onClick={onNavigate}>
              <span className="cm-menu-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
              <span className="cm-menu-parent-copy"><span className="cm-menu-parent-title">{item.label}</span><span className="cm-menu-parent-description">{descriptions[item.id]}</span></span>
              <span className="cm-menu-direct-arrow" aria-hidden="true"><ArrowUpRight size={19}/></span>
            </a>
          </div>)}
        </Accordion.Root>
      </nav>
      <a href="/clubmuur/club/accommodatie" className="cm-menu-visit" onClick={onNavigate}><MapPin size={18}/><span><strong>Tot op Houtrust.</strong><small>Houtrustlaan 1 · Den Haag</small></span><ArrowUpRight size={18}/></a>
    </div>
    <footer className="cm-menu-footer">
      <button type="button" className="cm-menu-join" onClick={openJoin}><span>Word deel van Duindorp<small>Word lid of steun de club als sponsor.</small></span><span>Lid worden <ArrowRight size={19}/></span></button>
    </footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}

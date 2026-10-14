'use client';

import {useEffect,useState} from 'react';
import {NavigationMenu} from 'radix-ui';
import {ArrowUpRight,ChevronDown} from 'lucide-react';
import {useClubNavigation} from '@/hooks/use-club-navigation';

const introductions:Record<string,string>={
  club:'Het verhaal achter onze kleuren.',
  teams:'Elke generatie. Eén Duindorp.',
  wedstrijden:'Van aftrap tot eindstand.',
  nieuws:'De verhalen van onze club.',
};

export function ClubmuurDesktopNav({section}:{section:string}){
  const items=useClubNavigation();
  const [open,setOpen]=useState('');
  const [current,setCurrent]=useState('');

  useEffect(()=>{
    const updateCurrent=()=>setCurrent(window.location.pathname+window.location.search+window.location.hash);
    updateCurrent();
    window.addEventListener('hashchange',updateCurrent);
    window.addEventListener('popstate',updateCurrent);
    return()=>{window.removeEventListener('hashchange',updateCurrent);window.removeEventListener('popstate',updateCurrent);};
  },[]);

  return <NavigationMenu.Root className="cm-main-nav cm-desktop-nav" aria-label="Hoofdnavigatie" value={open} onValueChange={setOpen} delayDuration={120} skipDelayDuration={250}>
    <NavigationMenu.List className="cm-desktop-list">
      {items.map(item=>{
        const children=item.children?.length?item.children:null;
        const links=children&&!children.some(child=>child.href===item.href)
          ?[{id:`${item.id}-overview`,label:'Naar het overzicht',href:item.href},...children]
          :children;

        return <NavigationMenu.Item key={item.id} value={item.id} className="cm-desktop-item">
          {links?<>
            <NavigationMenu.Trigger className="cm-desktop-top-link" data-current={section===item.id||undefined}>
              {item.label}<ChevronDown size={13} aria-hidden="true"/>
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className={`cm-desktop-panel${links.length>8?' cm-desktop-panel-wide':''}`}>
              <div className="cm-desktop-panel-heading">
                <span className="cm-desktop-panel-kicker">ONTDEK DUINDORP <span>EST. 1950</span></span>
                <strong>{item.label}</strong>
                <p>{introductions[item.id]}</p>
              </div>
              <ul className="cm-desktop-sublist">
                {links.map((child,index)=><li key={child.id}>
                  <NavigationMenu.Link className="cm-desktop-sub-link" href={child.href} active={current===child.href} onSelect={()=>setOpen('')}>
                    <span className="cm-desktop-sub-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
                    <span className="cm-desktop-sub-label">{child.label}</span>
                    <ArrowUpRight size={17} aria-hidden="true"/>
                  </NavigationMenu.Link>
                </li>)}
              </ul>
              <div className="cm-desktop-panel-motto">ONZE WIJK. ONZE CLUB. ONZE TROTS.</div>
            </NavigationMenu.Content>
          </>:<NavigationMenu.Link className="cm-desktop-top-link" href={item.href} active={section===item.id} onSelect={()=>setOpen('')}>{item.label}</NavigationMenu.Link>}
        </NavigationMenu.Item>;
      })}
    </NavigationMenu.List>
  </NavigationMenu.Root>;
}

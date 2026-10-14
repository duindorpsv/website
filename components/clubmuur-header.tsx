'use client';
import {useEffect,useState} from 'react';
import {Menu,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger} from '@/components/ui/dialog';
import {ClubmuurMobileMenu} from '@/components/clubmuur-mobile-menu';
import {ClubmuurDesktopNav} from '@/components/clubmuur-desktop-nav';
import {headerDesigns,type HeaderDesign} from '@/lib/clubmuur-config';
export function ClubmuurHeader({section='home',openJoin=()=>{},variant='clubband',preview=false}:{section?:string;openJoin?:()=>void;variant?:HeaderDesign;preview?:boolean}){
 const [menu,setMenu]=useState(false);
 useEffect(()=>{const desktop=window.matchMedia('(min-width: 1000px)');const closeOnDesktop=()=>{if(desktop.matches)setMenu(false);};desktop.addEventListener('change',closeOnDesktop);return()=>desktop.removeEventListener('change',closeOnDesktop);},[]);
 const design=headerDesigns.find(d=>d.id===variant)??headerDesigns[0];
 return <Dialog open={menu} onOpenChange={setMenu}><header className={`cm-header cm-header--${design.id}`} inert={preview||undefined}>
  <div className="cm-header-inner">
   <a className="cm-brand" href="/clubmuur" aria-label="Duindorp SV — home"><img src="/assets/logo.png" alt="Duindorp SV" width={68} height={79}/><span className="cm-brand-lockup"><span className="cm-brand-copy"><strong>DUINDORP SV</strong><small>{design.id==='clubband'?<><span>ONZE WIJK.</span>{' '}<span>ONZE CLUB.</span>{' '}<span>ONZE TROTS.</span></>:design.slogan}</small></span><span className="cm-brand-year"><span>EST.</span><b>1950</b></span></span></a>
   <ClubmuurDesktopNav section={section}/>
   <div className="cm-header-controls"><Button className="cm-join" onClick={openJoin}>Lid worden<Plus size={16}/></Button><DialogTrigger asChild><button type="button" className="cm-menu" aria-label="Menu openen"><Menu size={23}/></button></DialogTrigger></div>
  </div>
 </header>{!preview&&<ClubmuurMobileMenu open={menu} section={section} onNavigate={()=>setMenu(false)} openJoin={()=>{setMenu(false);openJoin();}}/>}</Dialog>;
}

import {ArrowUpRight} from 'lucide-react';
import {ClubPageFrame} from '@/components/clubmuur-page-kit';

const pages:Record<string,{title:string;group:'club'|'teams'|'nieuws'}>={
 'club/commissies':{title:'Commissies',group:'club'},
 'teams/walking-football':{title:'Walking Football',group:'teams'},
 'club/accommodatie':{title:'Accommodatie & route',group:'club'},
 'media/club-tv':{title:'Duindorp SV-TV',group:'nieuws'},
};

export function isPlaceholderPage(path:string){return Object.hasOwn(pages,path);}

export function ClubPlaceholderPage({path}:{path:string}){
 const page=pages[path];
 return <ClubPageFrame group={page.group} kicker="ONZE WIJK. ONZE CLUB. ONZE TROTS." title={page.title} intro="Deze pagina wordt binnenkort aangevuld.">
  <section className="cp-placeholder">
   <img src="/assets/logo.png" alt="Duindorp SV" width={74} height={87}/>
   <div><span className="cp-kicker">BINNENKORT MEER</span><h2>Ons verhaal gaat verder.</h2><p>De informatie voor deze pagina volgt. Neem voor vragen gerust contact op met het secretariaat.</p><a href="mailto:secretariaat@duindorpsv.nl">secretariaat@duindorpsv.nl <ArrowUpRight size={16}/></a></div>
  </section>
 </ClubPageFrame>;
}

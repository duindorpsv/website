import {HeartHandshake,ArrowUpRight} from 'lucide-react';
import {ClubPageFrame} from '@/components/clubmuur-page-kit';
import story from '@/lib/clubmuur-volunteer-story.json';

const emphasis=/(Duindorp SV is een vereniging, geen bedrijf\.|we waarderen jullie enorm\.)/g;

export function ClubVolunteerStory(){return <ClubPageFrame group="club" kicker="DE MENSEN ACHTER ONZE CLUB" title="Een vereniging" accent="zijn we samen." intro="Voor en door onze leden. Met waardering voor iedereen die tijd vrijmaakt voor Duindorp SV.">
 <div className="vs-layout">
  <aside className="vs-aside"><HeartHandshake size={42} strokeWidth={1.3}/><span className="cp-kicker">IEDERE BIJDRAGE TELT</span><p>JOUW TIJD.<br/>ONZE CLUB.<br/><strong>SAMEN DUINDORP.</strong></p><img src="/assets/logo.png" alt="Duindorp SV" width={58} height={68}/></aside>
  <article className="vs-article" aria-label={story.title}>
   {story.paragraphs.map((paragraph,index)=>index===story.paragraphs.length-1?<p className="vs-closing" key={index}><strong>{paragraph}</strong></p>:<p className={index===0?'vs-lead':undefined} key={index}>{paragraph.split(emphasis).map((part,i)=>i%2===1?<strong key={i}>{part}</strong>:part)}</p>)}
   <footer className="vs-footer"><span className="cp-kicker">OOK IETS BETEKENEN?</span><p>Laat het ons weten. Samen kijken we wat bij je past.</p><a className="cp-button" href="mailto:secretariaat@duindorpsv.nl">Neem contact op met het secretariaat <ArrowUpRight size={17}/></a></footer>
  </article>
 </div>
 </ClubPageFrame>;}

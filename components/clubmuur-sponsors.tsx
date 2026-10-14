'use client';

import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';

// Tightly cropped originals: equal artwork height, without stretching wordmarks.
const sponsors=[
  {name:'BNU',file:'bnu.svg',width:778.375,height:778.75},
  {name:'Kwaliteit Kozijnen Holland',file:'kwaliteit-kozijnen-holland.svg',width:548.375,height:198.5},
  {name:'Deelman daktechniek',file:'deelman-daktechniek.svg',width:1536,height:454.375},
  {name:'DG Webservices',file:'dg-webservices.svg',width:1799.75,height:220.875},
  {name:'RW Repair',file:'rw-repair.png',width:226,height:226},
  {name:'Proto Tegelzetbedrijf',file:'proto-tegelzetbedrijf.svg',width:643.625,height:230.75},
];

export function ClubmuurSponsors(){
  const group=useRef<HTMLUListElement>(null);
  const track=useRef<HTMLDivElement>(null);
  const [paused,setPaused]=useState(false);

  useEffect(()=>{
    const list=group.current;
    if(!list)return;
    // A constant 28 px/s keeps the motion calm on every screen size.
    const measure=()=>track.current?.style.setProperty('--cm-sponsor-duration',`${list.getBoundingClientRect().width/28}s`);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(list);
    return()=>observer.disconnect();
  },[]);

  return <section className="cm-sponsor-strip" id="clubmuur-sponsors" aria-label="Onze sponsoren" data-paused={paused}>
    <div className="cm-sponsor-viewport" tabIndex={0} aria-label="Sponsorlogo’s. Focus pauzeert de beweging.">
      <div className="cm-sponsor-track" ref={track}>
        {[false,true].map(duplicate=><ul key={String(duplicate)} className="cm-sponsor-group" ref={duplicate?undefined:group} aria-hidden={duplicate||undefined}>
          {sponsors.map(sponsor=><li key={sponsor.file}><img src={`/assets/sponsors/${sponsor.file}`} alt={duplicate?'':sponsor.name} width={sponsor.width} height={sponsor.height} decoding="async" fetchPriority="low"/></li>)}
        </ul>)}
      </div>
    </div>
    <button type="button" className="cm-sponsor-pause" onClick={()=>setPaused(value=>!value)} aria-label={paused?'Sponsorlogo’s hervatten':'Sponsorlogo’s pauzeren'} aria-pressed={paused}>
      {paused?<Play size={13} fill="currentColor" aria-hidden="true"/>:<Pause size={13} aria-hidden="true"/>}
    </button>
  </section>;
}

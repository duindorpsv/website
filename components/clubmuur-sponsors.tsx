'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';

import {defaultSponsors} from '@/lib/cms/site-sponsors';
import {useCMS} from './cms/provider';

export function ClubmuurSponsors(){
  const {state}=useCMS();
  const sponsors=useMemo(()=>(state.settings.sponsors??defaultSponsors).flatMap(sponsor=>{const media=sponsor.imageId?state.media.find(media=>media.id===sponsor.imageId&&media.published&&!media.deletedAt):null;if(sponsor.imageId&&!media)return [];return [{...sponsor,src:media?.src||sponsor.src}];}),[state.settings.sponsors,state.media]);
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
  },[sponsors]);

  if(!sponsors.length)return null;
  return <section className="cm-sponsor-strip" id="clubmuur-sponsors" aria-label="Onze sponsoren" data-paused={paused}>
    <div className="cm-sponsor-viewport" tabIndex={0} aria-label="Sponsorlogo’s. Focus pauzeert de beweging.">
      <div className="cm-sponsor-track" ref={track}>
        {[false,true].map(duplicate=><ul key={String(duplicate)} className="cm-sponsor-group" ref={duplicate?undefined:group} aria-hidden={duplicate||undefined}>
          {sponsors.map((sponsor,index)=>{const image=<img src={sponsor.src} alt={duplicate?'':sponsor.name} width={sponsor.width} height={sponsor.height} decoding="async" fetchPriority="low"/>;return <li key={index}>{sponsor.url&&!duplicate?<a href={sponsor.url} target="_blank" rel="noreferrer">{image}</a>:image}</li>;})}
        </ul>)}
      </div>
    </div>
    <button type="button" className="cm-sponsor-pause" onClick={()=>setPaused(value=>!value)} aria-label={paused?'Sponsorlogo’s hervatten':'Sponsorlogo’s pauzeren'} aria-pressed={paused}>
      {paused?<Play size={13} fill="currentColor" aria-hidden="true"/>:<Pause size={13} aria-hidden="true"/>}
    </button>
  </section>;
}

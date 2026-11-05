'use client';

import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowLeft,ArrowRight,ArrowUpRight,Camera,Expand,X} from 'lucide-react';

const moments=[
  {id:'supporters',label:'Langs de lijn',title:'Hier hoor je erbij.',caption:'Samen kijken. Samen meeleven. Dat is het clubgevoel.',alt:'supporters met blauw-witte sjaals langs een amateurvoetbalveld',position:'50% 45%'},
  {id:'youth',label:'De volgende generatie',title:'Grote dromen. Kleine stappen.',caption:'De eerste bal, nieuwe vrienden en plezier voorop.',alt:'jonge voetballers samen op het trainingsveld',position:'50% 45%'},
  {id:'canteen',label:'Achter de schermen',title:'De koffie staat klaar.',caption:'De mensen die van een zaterdag een clubdag maken.',alt:'vrijwilligers die koffie schenken in een clubkantine',position:'50% 48%'},
  {id:'walking',label:'Een leven lang',title:'Het spel blijft verbinden.',caption:'Nog een potje. Nog een verhaal. Nog lang niet uitgevoetbald.',alt:'oudere voetballers die samen napraten op het veld',position:'50% 45%'},
];

export function ClubmuurPhotoWall(){
  const [selected,setSelected]=useState<number|null>(null);
  const [visible,setVisible]=useState(0);
  const rail=useRef<HTMLDivElement>(null);
  const returnFocus=useRef<HTMLButtonElement|null>(null);
  const active=selected===null?null:moments[selected];
  useEffect(()=>{
    const el=rail.current;if(!el)return;
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const box=el.getBoundingClientRect();const children=Array.from(el.children);let nearest=0;let distance=Infinity;children.forEach((item,i)=>{const d=Math.abs(item.getBoundingClientRect().left-box.left-20);if(d<distance){nearest=i;distance=d;}});setVisible(nearest);});};
    el.addEventListener('scroll',update,{passive:true});return()=>{el.removeEventListener('scroll',update);cancelAnimationFrame(frame);};
  },[]);
  const open=(index:number,button:HTMLButtonElement)=>{returnFocus.current=button;setSelected(index);};
  const step=(amount:number)=>setSelected(current=>current===null?null:(current+amount+moments.length)%moments.length);
  const scroll=(amount:number)=>{const el=rail.current;if(!el)return;const index=Math.max(0,Math.min(moments.length-1,visible+amount));const card=el.children[index] as HTMLElement;el.scrollTo({left:el.scrollLeft+card.getBoundingClientRect().left-el.getBoundingClientRect().left-20,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};

  return <>
    <section className="cm-life" aria-labelledby="cm-life-title" id="dit-zijn-wij">
      <div className="cm-life-heading reveal">
        <div><span className="cm-life-eyebrow"><span/>MEER DAN NEGENTIG MINUTEN</span><h2 id="cm-life-title">DIT ZIJN <span className="brush">WIJ.</span></h2></div>
        <div className="cm-life-intro"><p>Op het veld, langs de lijn en aan de bar.<br/><strong>De mooiste momenten maken we samen.</strong></p><button type="button" onClick={event=>open(0,event.currentTarget)}>Open de fotomuur <ArrowUpRight size={18}/></button></div>
      </div>
      <div className="cm-life-rail" ref={rail} aria-label="Fotomuur met vier clubmomenten">
        {moments.map((moment,i)=><button type="button" className={`cm-life-photo cm-life-photo-${i+1} reveal`} key={moment.id} onClick={event=>open(i,event.currentTarget)} aria-label={`Bekijk foto: ${moment.title}`}>
          <img src={`/assets/club-life-v28/${moment.id}-1280.webp`} srcSet={`/assets/club-life-v28/${moment.id}-640.webp 640w, /assets/club-life-v28/${moment.id}-1280.webp 1280w`} sizes="(max-width: 759px) 85vw, (max-width: 1100px) 30vw, 34vw" width={1280} height={853} loading="lazy" decoding="async" alt={moment.alt} style={{objectPosition:moment.position}}/>
          <span className="cm-life-photo-top"><span>0{i+1} / HET CLUBGEVOEL</span><Expand size={16}/></span>
          <span className="cm-life-photo-copy"><small>{moment.label}</small><strong>{moment.title}</strong><span className="cm-life-photo-arrow"><ArrowUpRight size={22}/></span></span>
        </button>)}
      </div>
      <div className="cm-life-caption"><span><Camera size={15}/><span>Vier momenten. <strong>Eén Duindorp.</strong></span></span><div className="cm-life-rail-controls"><button type="button" onClick={()=>scroll(-1)} disabled={visible===0} aria-label="Vorige foto in fotomuur"><ArrowLeft size={17}/></button><span aria-live="polite">0{visible+1}<i>/ 04</i></span><button type="button" onClick={()=>scroll(1)} disabled={visible===moments.length-1} aria-label="Volgende foto in fotomuur"><ArrowRight size={17}/></button></div></div>
    </section>
    <Dialog.Root open={selected!==null} onOpenChange={value=>{if(!value)setSelected(null);}}>
      <Dialog.Portal><Dialog.Overlay className="cm-life-overlay"/><Dialog.Content className="cm-life-lightbox" onCloseAutoFocus={event=>{event.preventDefault();returnFocus.current?.focus();}} onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();step(1);}if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}}}>
        {active&&<><header><span><Camera size={17}/> DIT ZIJN WIJ.</span><Dialog.Close className="cm-life-close" aria-label="Fotomuur sluiten"><X size={23}/></Dialog.Close></header>
          <div className="cm-life-lightbox-image"><img key={active.id} src={`/assets/club-life-v28/${active.id}-1280.webp`} alt={active.alt} width={1280} height={853}/></div>
          <div className="cm-life-lightbox-bottom"><div><small>{active.label}</small><Dialog.Title>{active.title}</Dialog.Title><Dialog.Description>{active.caption}</Dialog.Description></div><nav aria-label="Foto’s bekijken"><button type="button" onClick={()=>step(-1)} aria-label="Vorige foto"><ArrowLeft size={20}/></button><span aria-live="polite">0{selected!+1} / 04</span><button type="button" onClick={()=>step(1)} aria-label="Volgende foto"><ArrowRight size={20}/></button></nav></div>
        </>}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}

'use client';

import {useEffect,useRef} from 'react';
import {CalendarDays,Users,House,Newspaper,Plus} from 'lucide-react';
import {useHeroCards} from '@/hooks/use-club';
import {useSportlink} from '@/hooks/use-sportlink';
import {heroTeamHref} from '@/lib/clubmuur-destinations';
import {useCMS} from '@/components/cms/provider';
import {contentHref} from '@/lib/cms/content';
import {type HeroCardConfig} from '@/lib/clubmuur-config';
import {ClubmuurBackground} from './clubmuur-background';
import {ClubmuurSponsors} from './clubmuur-sponsors';
import {ClubmuurCompetition} from './clubmuur-competition';
import {ClubmuurLiveMatch} from './clubmuur-live-match';
import {ClubmuurHeroMatch} from './clubmuur-hero-match';
import {ClubmuurNewsTile} from './clubmuur-news-tile';
import {heroPhotos,HERO_VISIT_COOKIE,HERO_PHOTO_COOKIE,HERO_VISIT_SECONDS,type HeroLayout,type HeroPhotoId} from '@/lib/clubmuur-layouts';
export {ClubmuurHeader} from './clubmuur-header';
import {type Article,type Team} from '@/lib/club-data';

type Actions={openArticle:(a:Article)=>void;openTeam:(t:Team)=>void;openJoin:()=>void;openMatch:()=>void};

export function ClubmuurHero({actions,items,layout='01',photo='01-trots',preview=false}:{actions:Actions;items:Article[];layout?:HeroLayout;photo?:HeroPhotoId;preview?:boolean}){
  const openStory=(id:string,event:React.MouseEvent<HTMLAnchorElement>)=>{const article=items.find(a=>a.id===id);if(article){event.preventDefault();actions.openArticle(article);}};
  const cards=useHeroCards();
  const scene=useRef<HTMLDivElement>(null);
  const portrait=heroPhotos.find(item=>item.id===photo)!;
  const players=portrait.kind;
  const photoSeries='series' in portrait?portrait.series:'v14';
  const photoBase=`/assets/clubmuur-portraits-${photoSeries}/${photo}`;
  const photoSrcSet=[`${photoBase}-640.webp ${Math.min(640,portrait.width)}w`,`${photoBase}-1280.webp ${Math.min(1280,portrait.width)}w`,...(portrait.width>1280?[`${photoBase}-1920.webp ${Math.min(1920,portrait.width)}w`]:[])].join(', ');
  useEffect(()=>{
    if(preview)return;
    // Sliding 30-minute visit window. Selection is made on the server so the
    // first paint already has the right layout and requests only its players.
    const remember=()=>{const flags=`; Path=/; Max-Age=${HERO_VISIT_SECONDS}; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;document.cookie=`${HERO_VISIT_COOKIE}=${layout}${flags}`;document.cookie=`${HERO_PHOTO_COOKIE}=${photo}${flags}`;};
    remember();
    const refresh=()=>{if(document.visibilityState==='visible')remember();};
    const timer=window.setInterval(refresh,5*60*1000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[layout,photo,preview]);
  useEffect(()=>{
    const el=scene.current;
    const media=matchMedia('(min-width: 1000px) and (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
    if(!el)return;
    let frame=0;
    const reset=()=>{cancelAnimationFrame(frame);el.style.setProperty('--cm-px','0');el.style.setProperty('--cm-py','0');};
    const move=(e:PointerEvent)=>{
      if(!media.matches)return;
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{const r=el.getBoundingClientRect();el.style.setProperty('--cm-px',String((e.clientX-r.left)/r.width-.5));el.style.setProperty('--cm-py',String((e.clientY-r.top)/r.height-.5));});
    };
    el.addEventListener('pointermove',move,{passive:true});el.addEventListener('pointerleave',reset);media.addEventListener('change',reset);
    return()=>{cancelAnimationFrame(frame);el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',reset);media.removeEventListener('change',reset);};
  },[]);
  return <div className="cm-opening" data-hero-layout={layout} data-hero-players={players} data-hero-photo={photo}>
    <div className="cm-first-screen" ref={scene}>
    <section className="cm-wall" aria-labelledby="cm-title">
      <ClubmuurBackground/>
      <div className="cm-composition">
        <div className="cm-player" aria-hidden="true"><img src={`${photoBase}-1280.webp`} srcSet={photoSrcSet} sizes={`(max-width: 999px) 100vw, ${players==='solo'?'38vw':'64vw'}`} alt="" fetchPriority="high" decoding="async" width={portrait.width} height={portrait.height}/></div>
        <div className="cm-headline">
          <h1 id="cm-title"><span className="sr-only">Onze Trots.</span><span className="cm-title-brush" aria-hidden="true"/></h1>
        </div>
        <div className="cm-hero-fixture"><HeroTile card={cards.find(card=>card.id==='top-right')!} actions={actions} items={items} featured/></div>
        <div className="cm-tile-grid">{['top-left','bottom-left','bottom-right'].map(id=>cards.find(card=>card.id===id)!).map(card=><HeroTile key={card.id} card={card} actions={actions} items={items}/>)}</div>
      </div>
    </section>
    <div className="cm-together"><div><h2>ONZE CLUB. ONZE TROTS.</h2><span className="cm-band-line" aria-hidden="true"/><span className="cm-band-since">SINDS 1950</span></div></div>
    </div>
    <ClubmuurSponsors/>
    <ClubmuurCompetition/>
    <div className="cm-newsline" id="clubmuur-nieuws">
      {items.slice(0,2).map(item=><a key={item.id} href="/clubmuur/nieuws" onClick={event=>openStory(item.id,event)}><div className="cm-newsline-photo"><img src={item.image} alt="" width={200} height={200}/></div><div><span>{item.category}</span><h3>{item.title}</h3><p>{item.intro}</p></div><span className="cm-circle"><Plus size={17}/></span></a>)}
      <a href="/clubmuur/teams"><div className="cm-newsline-photo"><img src="/assets/team.png" alt="Duindorp SV spelers" width={200} height={200}/></div><div><span>TEAMS</span><h3>Van jeugd tot<br/>Walking Football</h3><p>Voor iedereen die van voetbal houdt.</p></div><span className="cm-circle"><Plus size={17}/></span></a>
    </div>
  </div>;
}

function HeroTile({card,actions,items,featured=false}:{card:HeroCardConfig;actions:Actions;items:Article[];featured?:boolean}){
 const {data}=useSportlink();
 const {state}=useCMS();
 if(card.kind==='match')return featured?<ClubmuurHeroMatch card={card}/>:<ClubmuurLiveMatch card={card}/>;
 if(card.kind==='news')return <ClubmuurNewsTile card={card} items={items} onOpen={actions.openArticle}/>;
 const split=card.layout==='split';
 const photoClass=card.image.includes('portrait')?'cm-portrait':card.image.includes('team.png')?'cm-volunteers':'';
 const content=split?<><div className={`cm-walking-photo ${card.image.includes('walking')?'is-walking':''}`}><img src={card.image} alt=""/></div><div className="cm-walking-copy"><span className="cm-walking-kicker">{card.kicker}</span><h3>{card.title}</h3><p>{card.description}</p><span className="cm-circle"><Plus size={18}/></span></div></>:<><img src={card.image} alt=""/><span className="cm-card-kicker">{card.kicker}</span><div className="cm-story-label"><h3>{card.title}</h3><span className="cm-circle"><Plus size={19}/></span></div></>;
 const className=split?'cm-walking':`cm-story ${photoClass}`;
 if(card.kind==='page')return <a data-slot-id={card.id} className={className} href={`/clubmuur/${card.target}`}>{content}</a>;
 if(card.kind==='team')return <a data-slot-id={card.id} className={className} href={heroTeamHref(card.target,data?.teams||[],data?.firstTeam)}>{content}</a>;
 const article=state.articles.find(item=>item.id===card.target&&!item.deletedAt&&item.live);
 return <a data-slot-id={card.id} className={className} href={article?.live?contentHref(article.live):'/clubmuur/nieuws'}>{content}</a>;
}

export function ClubmuurMobileNav({section}:{section:string}){
  const links=[{id:'home',label:'Home',icon:House},{id:'nieuws',label:'Nieuws',icon:Newspaper},{id:'teams',label:'Teams',icon:Users},{id:'wedstrijden',label:'Wedstrijden',icon:CalendarDays}];
  return <nav className="cm-mobile-dock" aria-label="Snelle navigatie">{links.map(({id,label,icon:Icon})=><a key={id} href={`/clubmuur${id==='home'?'':'/'+id}`} aria-current={section===id?'page':undefined}><Icon size={22} strokeWidth={1.8}/><span>{label}</span></a>)}</nav>;
}

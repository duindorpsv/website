'use client';
import {useEffect,useMemo,useState} from 'react';
import {type Article} from '@/lib/club-data';
import {useCMS} from '@/components/cms/provider';
import {cmsArticlesForSite} from '@/lib/cms/public-adapters';
import {defaultHeroCards,validHeroCards,type HeroCardConfig} from '@/lib/clubmuur-config';
export function useClubTheme(defaultDark=false,forceLight=false){
 const [preferredDark,setDark]=useState(defaultDark);
 const dark=forceLight?false:preferredDark;
 useEffect(()=>{if(forceLight)return;try{const saved=localStorage.getItem('duindorp-theme');if(saved)setDark(saved==='dark');}catch{}},[forceLight]);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';},[dark]);
 function toggle(){setDark(v=>{try{localStorage.setItem('duindorp-theme',v?'light':'dark')}catch{}return !v;});}
 return {dark,toggle};
}
export function useDemoArticles(){
 const {state}=useCMS();
 return cmsArticlesForSite(state);
}
export function saveDemoArticles(items:Article[]){localStorage.setItem('duindorp-demo-articles',JSON.stringify(items));window.dispatchEvent(new Event('duindorp-content'));}

// Four stable slots can later be backed by a production CMS without changing the view.
const previousDefaultClubCard:HeroCardConfig={id:'top-left',kind:'page',target:'club',title:'Samen\nop Houtrust',kicker:'HET CLUBGEVOEL',description:'',image:'/assets/clubmuur-portrait.webp',layout:'photo'};
const previousDefaultVolunteerCard:HeroCardConfig={id:'bottom-left',kind:'article',target:'vrijwilligers',title:'De kracht van\nvrijwilligers',kicker:'ONZE MENSEN',description:'',image:'/assets/team.png',layout:'photo'};
function migrateHeroCards(cards:HeroCardConfig[]){
 return cards.map(card=>{
  const previous=card.id==='top-left'?previousDefaultClubCard:card.id==='bottom-left'?previousDefaultVolunteerCard:null;
  const unchangedDefault=previous&&Object.keys(card).length===Object.keys(previous).length&&(Object.keys(previous) as (keyof HeroCardConfig)[]).every(key=>card[key]===previous[key]);
  return unchangedDefault?{...defaultHeroCards.find(value=>value.id===card.id)!}:card;
 });
}
export function useHeroCards(){const {state}=useCMS();return useMemo(()=>(state.appearance?.hero||defaultHeroCards).map(card=>{if(!card.imageId)return card;const media=state.media.find(media=>media.id===card.imageId&&media.published&&!media.deletedAt);return {...card,image:media?.src.replace(/^\/api\/cms\/media\/(.*?)\/file$/, '/api/media/$1')||defaultHeroCards.find(item=>item.id===card.id)!.image};}),[state.appearance?.hero,state.media]);}
export async function saveHeroCards(cards:HeroCardConfig[]){if(!validHeroCards(cards))throw new Error('Controleer de vier vakken.');const current=await fetch('/api/cms/hero/site-hero').then(r=>r.ok?r.json():null);const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),changes:[{module:'hero',id:'site-hero',expectedVersion:current?.version||0,action:'publish',data:{items:cards}}]})});const data=await response.json();if(!response.ok)throw new Error(data.message);window.dispatchEvent(new Event('duindorp-hero'));}

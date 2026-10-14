'use client';
import {useEffect,useState} from 'react';
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
export function useHeroCards(){
 const [cards,setCards]=useState<HeroCardConfig[]>(defaultHeroCards);
 useEffect(()=>{const read=()=>{try{const v=JSON.parse(localStorage.getItem('duindorp-hero-cards')||'null');setCards(validHeroCards(v)?migrateHeroCards(v):defaultHeroCards);}catch{setCards(defaultHeroCards)}};read();window.addEventListener('storage',read);window.addEventListener('duindorp-hero',read);return()=>{window.removeEventListener('storage',read);window.removeEventListener('duindorp-hero',read)}},[]);
 return cards;
}
export function saveHeroCards(cards:HeroCardConfig[]){if(!validHeroCards(cards))throw new Error('Controleer de vier vakken.');localStorage.setItem('duindorp-hero-cards',JSON.stringify(cards));window.dispatchEvent(new Event('duindorp-hero'));}

'use client';

import {useEffect,useState} from 'react';
import {defaultClubNavigation,migrateClubNavigation,validClubNavigation,type ClubNavigationItem} from '@/lib/clubmuur-navigation';
import {useCMS} from '@/components/cms/provider';
import {cmsNavigation} from '@/lib/cms/navigation';
import {createCmsSeed} from '@/lib/cms/seed';

const seedNavigationPages=createCmsSeed().pages;

const STORAGE_KEY='duindorp-clubmuur-navigation-v1';
const CONTENT_EVENT='duindorp-navigation';
const legacyDefault:ClubNavigationItem[] = [
 {id:'home',label:'HOME',href:'/clubmuur'},
 {id:'club',label:'ONZE CLUB',href:'/clubmuur/club',children:[
  {id:'club-verhaal',label:'Ons verhaal',href:'/clubmuur/club'},
  {id:'club-waarden',label:'Onze clubwaarden',href:'/clubmuur/club#clubwaarden'},
  {id:'club-bezoek',label:'Bezoek Houtrust',href:'/clubmuur/club#bezoek'},
 ]},
 {id:'teams',label:'ONZE TEAMS',href:'/clubmuur/teams',children:[
  {id:'teams-alle',label:'Alle teams',href:'/clubmuur/teams'},
  {id:'teams-eerste',label:'Ons eerste',href:'/clubmuur#clubmuur-eerste'},
 ]},
 {id:'wedstrijden',label:'WEDSTRIJDEN',href:'/clubmuur/wedstrijden',children:[
  {id:'wedstrijden-programma',label:'Programma',href:'/clubmuur/wedstrijden'},
  {id:'wedstrijden-uitslagen',label:'Uitslagen',href:'/clubmuur/wedstrijden#uitslagen'},
  {id:'wedstrijden-stand',label:'Stand van het eerste',href:'/clubmuur#clubmuur-eerste'},
 ]},
 {id:'nieuws',label:'MEDIA',href:'/clubmuur/nieuws',children:[
  {id:'nieuws-alle',label:'Nieuws & verhalen',href:'/clubmuur/nieuws'},
  {id:'nieuws-club',label:'Clubnieuws',href:'/clubmuur/nieuws?categorie=Clubnieuws'},
  {id:'nieuws-jeugd',label:'Jeugdnieuws',href:'/clubmuur/nieuws?categorie=Jeugd'},
 ]},
];

export function useClubNavigation(baseOnly=false):ClubNavigationItem[]{
 const {state}=useCMS();
 const [items,setItems]=useState<ClubNavigationItem[]>(defaultClubNavigation);
 useEffect(()=>{
  const read=()=>{
   try{
    const stored=localStorage.getItem(STORAGE_KEY);
    const value=stored&&stored.length<=40000?JSON.parse(stored):null;
    const oldDefault=Array.isArray(value)&&JSON.stringify(value)===JSON.stringify(legacyDefault);
    const migrated=migrateClubNavigation(value);
    setItems(validClubNavigation(migrated)&&!oldDefault?migrated:defaultClubNavigation);
   }catch{setItems(defaultClubNavigation);}
  };
  const onStorage=(event:StorageEvent)=>{if(event.key===STORAGE_KEY||event.key===null)read();};
  read();window.addEventListener('storage',onStorage);window.addEventListener(CONTENT_EVENT,read);
  return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener(CONTENT_EVENT,read);};
 },[]);
 return baseOnly?items:cmsNavigation(items,state,seedNavigationPages);
}

export function saveClubNavigation(items:ClubNavigationItem[]):void{
 if(!validClubNavigation(items))throw new Error('Controleer de namen en bestemmingen. Kies bestaande Clubmuur-pagina’s en maximaal 13 subpagina’s per onderdeel.');
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}
 catch{throw new Error('Opslaan is niet gelukt. Controleer of lokale opslag in deze browser is toegestaan.');}
 window.dispatchEvent(new Event(CONTENT_EVENT));
}

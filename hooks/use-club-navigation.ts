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
 const items=state.appearance?.navigation||defaultClubNavigation;
 return baseOnly?items:cmsNavigation(items,state,seedNavigationPages);
}

export async function saveClubNavigation(items:ClubNavigationItem[]):Promise<void>{
 if(!validClubNavigation(items))throw new Error('Controleer namen en bestemmingen.');
 const current=await fetch('/api/cms/navigation/site-navigation').then(r=>r.ok?r.json():null);
 const response=await fetch('/api/cms/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),changes:[{module:'navigation',id:'site-navigation',expectedVersion:current?.version||0,action:'publish',data:{items}}]})});
 const data=await response.json();if(!response.ok)throw new Error(data.message);window.dispatchEvent(new Event(CONTENT_EVENT));
}

export const heroLayouts = [
  {id:'01',name:'Clubposter',players:'solo'},
  {id:'02',name:'Samen centraal',players:'duo'},
  {id:'04',name:'Samen juichen',players:'trio'},
  {id:'05',name:'Vier hoeken',players:'solo'},
  {id:'08',name:'Omgekeerde tribune',players:'duo'},
] as const;

export type HeroLayout = typeof heroLayouts[number]['id'];
export const HERO_VISIT_COOKIE='duindorp-hero-visit';
export const HERO_VISIT_SECONDS=30*60;
export const HERO_PHOTO_COOKIE='duindorp-hero-photo-v1';

/** Each photo is assigned only to compositions that suit its silhouette. */
export const heroPhotos = [
  {id:'01-trots',name:'Trots · speler 8401',kind:'solo',layouts:['01','05'],width:1024,height:1536},
  {id:'02-strijd',name:'Strijd · speler 8245',kind:'solo',layouts:['01','05'],width:1024,height:1536},
  {id:'03-vreugde',name:'Vreugde · speler 8229',kind:'solo',layouts:['01','05'],width:1024,height:1536},
  {id:'04-samen',name:'Samen · 8228 en 8401',kind:'duo',layouts:['02','08'],width:1122,height:1402},
  {id:'05-juichen',name:'Juichen · drie spelers',kind:'trio',layouts:['02','04','08'],width:1536,height:1024},
  {id:'06-keeper',name:'Trots · keeper 8217',kind:'solo',layouts:['01','05'],width:1024,height:1536},
  {id:'07-walking',name:'Walking Football · het team',kind:'walking',layouts:['04'],width:1448,height:1086},
  {id:'08-samen-vooruit',name:'Clubtrots · wijzen naar het embleem',kind:'duo',layouts:['02','08'],width:1122,height:1402,series:'v17'},
  {id:'12-een-team',name:'Eén team · keeper en veldspelers',kind:'trio',layouts:['02','04','08'],width:1536,height:1024,series:'v17'},
  {id:'13-clubtrots',name:'Trots op het shirt · drie spelers',kind:'trio',layouts:['02','04','08'],width:1536,height:1024,series:'v17'},
  {id:'14-natuurlijk-samen',name:'Natuurlijk samen · twee spelers',kind:'duo',layouts:['02','08'],width:1122,height:1402,series:'v18'},
  {id:'15-clubgenoten',name:'Clubgenoten · ontspannen duo',kind:'duo',layouts:['02','08'],width:1122,height:1402,series:'v18'},
  {id:'16-een-vereniging',name:'Eén vereniging · spelers en staf',kind:'trio',layouts:['02','04','08'],width:1536,height:1024,series:'v18'},
] as const;
export type HeroPhotoId = typeof heroPhotos[number]['id'];

export function photosForLayout(layout:HeroLayout) {
  return heroPhotos.filter(photo=>(photo.layouts as readonly string[]).includes(layout));
}
export function resolveHeroPhoto(value:unknown,layout:HeroLayout):HeroPhotoId|undefined {
  return photosForLayout(layout).find(photo=>photo.id===value)?.id;
}
export function pickHeroPhoto(layout:HeroLayout,saved:unknown,random=Math.random()):HeroPhotoId {
  const available=photosForLayout(layout);
  return resolveHeroPhoto(saved,layout)??available[Math.min(available.length-1,Math.max(0,Math.floor(random*available.length)))].id;
}

export function resolveHeroLayout(value:unknown):HeroLayout|undefined {
  return heroLayouts.find(layout=>layout.id===value)?.id;
}

/** A presentation-only visit preference; no identity or analytics are stored. */
export function pickHeroLayout(saved:unknown,random=Math.random()):HeroLayout {
  return resolveHeroLayout(saved)??heroLayouts[Math.min(heroLayouts.length-1,Math.max(0,Math.floor(random*heroLayouts.length)))].id;
}

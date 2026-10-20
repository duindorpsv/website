export type ClubNavigationLink = {id:string;label:string;href:string;enabled?:boolean;pageId?:string};
export type ClubNavigationItem = ClubNavigationLink & {children?:ClubNavigationLink[];managed?:boolean;excluded?:string[]};
export const maxClubNavigationChildren=50;

export const defaultClubNavigation:ClubNavigationItem[] = [
 {id:'home',label:'HOME',href:'/clubmuur'},
 {id:'club',label:'ONZE CLUB',href:'/clubmuur/club',children:[
  {id:'club-verhaal',label:'Ons verhaal & historie',href:'/clubmuur/club/ons-verhaal'},
  {id:'club-bestuur',label:'Het bestuur',href:'/clubmuur/club/bestuur'},
  {id:'club-commissies',label:'Commissies',href:'/clubmuur/club/commissies'},
  {id:'club-jeugd',label:'Jeugdorganisatie',href:'/clubmuur/club/jeugdorganisatie'},
  {id:'club-lidmaatschap',label:'Lidmaatschap & kleding',href:'/clubmuur/club/lidmaatschap'},
  {id:'club-vrijwilligers',label:'Vrijwilligers',href:'/clubmuur/club/vrijwilligers'},
  {id:'club-bezoek',label:'Accommodatie & route',href:'/clubmuur/club/accommodatie'},
  {id:'club-waarden',label:'Clubwaarden & sportiviteit',href:'/clubmuur/club/clubwaarden'},
  {id:'club-vertrouwen',label:'Vertrouwenspersoon',href:'/clubmuur/club/vertrouwenspersoon'},
  {id:'club-documenten',label:'Documenten',href:'/clubmuur/club/documenten'},
  {id:'club-contact',label:'Contact',href:'/clubmuur/club/contact'},
 ]},
 {id:'teams',label:'ONZE TEAMS',href:'/clubmuur/teams',children:[
  {id:'teams-alle',label:'Alle teams & teampagina’s',href:'/clubmuur/teams'},
  {id:'teams-eerste',label:'Ons eerste · competitie',href:'/clubmuur#clubmuur-eerste'},
  {id:'teams-trainingen',label:'Trainingen',href:'/clubmuur/teams/trainingen'},
  {id:'teams-walking',label:'Walking Football',href:'/clubmuur/teams/walking-football'},
  {id:'teams-jeugd',label:'Jeugd & begeleiding',href:'/clubmuur/club/jeugdorganisatie'},
 ]},
 {id:'wedstrijden',label:'WEDSTRIJDEN',href:'/clubmuur/wedstrijden',children:[
  {id:'wedstrijden-programma',label:'Programma',href:'/clubmuur/wedstrijden'},
  {id:'wedstrijden-uitslagen',label:'Uitslagen',href:'/clubmuur/wedstrijden#uitslagen'},
  {id:'wedstrijden-stand',label:'Stand van het eerste',href:'/clubmuur#clubmuur-eerste'},
  {id:'wedstrijden-info',label:'Wedstrijdinformatie',href:'/clubmuur/wedstrijden/informatie'},
  {id:'wedstrijden-afgelast',label:'Afgelastingen',href:'/clubmuur/wedstrijden/afgelastingen'},
 ]},
 {id:'nieuws',label:'MEDIA',href:'/clubmuur/nieuws',children:[
  {id:'nieuws-alle',label:'Nieuws & actualiteit',href:'/clubmuur/nieuws'},
  {id:'nieuws-verhalen',label:'Verhalen & columns',href:'/clubmuur/verhalen'},
  {id:'nieuws-fotos',label:'Fotomuur',href:'/clubmuur/media/fotos'},
  {id:'nieuws-brief',label:'Nieuwsbrief',href:'/clubmuur/media/nieuwsbrief'},
 ]},
];

export const clubNavigationDestinations = [
 {label:'Homepage',href:'/clubmuur'},
 {label:'Activiteiten · clubagenda',href:'/clubmuur#clubagenda'},
 {label:'Onze club · overzicht',href:'/clubmuur/club'},
 ...defaultClubNavigation.flatMap(item=>(item.children||[]).map(child=>({label:child.label,href:child.href}))),
 {label:'Clubnieuws',href:'/clubmuur/nieuws?categorie=Clubnieuws'},
 {label:'Jeugdnieuws',href:'/clubmuur/nieuws?categorie=Jeugd'},
 {label:'Nieuws van het eerste',href:'/clubmuur/nieuws?categorie=Eerste%20elftal'},
];

const supportedPaths=new Set(clubNavigationDestinations.map(item=>item.href.split(/[?#]/)[0]));
export function isSafeClubNavigationHref(value:unknown):value is string{
 if(typeof value!=='string'||value.length>300||value!==value.trim()||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(value))return false;
 try{
  const url=new URL(value,'https://duindorp.local');
  return url.origin==='https://duindorp.local'&&(supportedPaths.has(url.pathname)||/^\/clubmuur\/[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(url.pathname))&&url.pathname===value.split(/[?#]/,1)[0];
 }catch{return false;}
}

const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

const movedClubLinks:Record<string,string>={
 '/clubmuur/club#clubwaarden':'/clubmuur/club/clubwaarden',
 '/clubmuur/club#bezoek':'/clubmuur/club/accommodatie',
};
// These routes are retained for the VPS handoff, but are not menu destinations.
const hiddenMenuPaths=new Set(['/clubmuur/wedstrijden/oefenwedstrijd','/clubmuur/media/club-tv']);
const isHiddenMenuLink=(link:unknown)=>isRecord(link)&&typeof link.href==='string'&&hiddenMenuPaths.has(link.href.split(/[?#]/)[0]);
// Keep customised menus when former homepage sections become proper pages.
export function migrateClubNavigation(value:unknown):unknown{
 if(!Array.isArray(value))return value;
 const migrateLink=(link:unknown)=>isRecord(link)&&typeof link.href==='string'&&movedClubLinks[link.href]?{...link,href:movedClubLinks[link.href]}:link;
 const storyPath='/clubmuur/verhalen';
 const allLinks=value.flatMap(item=>isRecord(item)?[item,...(Array.isArray(item.children)?item.children:[])]:[]);
 const hasStoryLink=allLinks.some(link=>isRecord(link)&&typeof link.href==='string'&&link.href.split(/[?#]/)[0]===storyPath);
 const usedIds=new Set(allLinks.filter(isRecord).map(link=>link.id));
 let storyId='nieuws-verhalen',suffix=2;while(usedIds.has(storyId))storyId=`nieuws-verhalen-${suffix++}`;
 return value.map(item=>{
  if(!isRecord(item))return item;
  const migrated=migrateLink(item) as Record<string,unknown>;
  if(!Array.isArray(item.children))return migrated;
  const children=item.children.filter(child=>!isHiddenMenuLink(child)).map(migrateLink);
  // Upgrade only the former default combined entry; custom labels and menus stay intact.
  // Once the renamed menu is saved, removing its stories entry remains an explicit choice.
  const combinedIndex=item.id==='nieuws'?children.findIndex(child=>isRecord(child)&&child.id==='nieuws-alle'&&child.href==='/clubmuur/nieuws'&&['Nieuws & verhalen','Nieuws & wedstrijdverhalen'].includes(child.label as string)):-1;
  if(combinedIndex>=0){
   children[combinedIndex]={...(children[combinedIndex] as Record<string,unknown>),label:'Nieuws & actualiteit'};
   if(!hasStoryLink)children.splice(combinedIndex+1,0,{id:storyId,label:'Verhalen & columns',href:storyPath});
  }
  return {...migrated,children};
 });
}

export function validClubNavigation(value:unknown):value is ClubNavigationItem[]{
 if(!Array.isArray(value)||value.length<1||value.length>8)return false;
 const ids=new Set<string>();
 const validLink=(link:unknown,keys:string[])=>{
  if(!isRecord(link)||Object.keys(link).some(key=>!keys.includes(key)))return false;
  if(typeof link.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(link.id)||ids.has(link.id))return false;
  if(typeof link.label!=='string'||link.label.length>60||!link.label.trim()||link.label!==link.label.trim()||/[\u0000-\u001f\u007f]/.test(link.label)||!isSafeClubNavigationHref(link.href))return false;
  if(link.enabled!==undefined&&typeof link.enabled!=='boolean'||link.managed!==undefined&&typeof link.managed!=='boolean'||link.pageId!==undefined&&(typeof link.pageId!=='string'||link.pageId.length>100||link.pageId!==''&&!/^[-a-zA-Z0-9_]+$/.test(link.pageId)))return false;
  ids.add(link.id);return true;
 };
 return value.some(item=>isRecord(item)&&item.enabled!==false)&&value.every(item=>{
  if(!validLink(item,['id','label','href','children','enabled','pageId','managed','excluded']))return false;
  if(item.excluded!==undefined&&(!Array.isArray(item.excluded)||item.excluded.length>1000||item.excluded.some((id:unknown)=>typeof id!=='string'||id.length>300)))return false;
  return item.children===undefined||(Array.isArray(item.children)&&item.children.length<=maxClubNavigationChildren&&item.children.every((child:unknown)=>validLink(child,['id','label','href','enabled','pageId'])));
 });
}

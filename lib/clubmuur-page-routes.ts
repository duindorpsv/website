export const clubContentPaths=[
 'club','club/ons-verhaal','club/bestuur','club/commissies','club/jeugdorganisatie','club/vertrouwenspersoon',
 'club/accommodatie','club/lidmaatschap','club/vrijwilligers','club/clubwaarden','club/documenten','club/contact',
 'teams/trainingen','teams/walking-football',
 'wedstrijden/informatie','wedstrijden/afgelastingen','wedstrijden/oefenwedstrijd',
 'media/fotos','media/club-tv','media/nieuwsbrief',
] as const;
const paths=new Set<string>(clubContentPaths);
/** Vinext can provide URL-encoded segments; normalize before route validation. */
export function clubPathFromSegments(segments?:readonly string[]):string|null {
 if(!segments?.length)return 'home';
 try{
  const decoded=segments.map(segment=>decodeURIComponent(segment));
  if(decoded.some(segment=>!segment||/[\\/\u0000-\u001f\u007f]/.test(segment)||segment==='.'||segment==='..'))return null;
  return decoded.join('/');
 }catch{return null;}
}
export function isClubPagePath(path:string){return ['home','nieuws','verhalen','teams','wedstrijden'].includes(path)||isClubContentPath(path);}
/** CMS slugs are resolved against local published content in the client prototype. */
export function isCmsDynamicPath(path:string){return /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(path)&&path!=='beheer';}
export function isClubContentPath(path:string){return paths.has(path)||/^teams\/(?:-?\d+:(?:-?\d+)?|:-?\d+)$/.test(path);}
export function clubPageGroup(path:string):'club'|'teams'|'wedstrijden'|'nieuws'{const group=path.split('/')[0];return group==='media'||group==='nieuws'||group==='verhalen'?'nieuws':group==='teams'?'teams':group==='wedstrijden'?'wedstrijden':'club';}

export const clubContentTitles:Record<string,string>={
 'club':'Onze club','club/ons-verhaal':'Ons verhaal','club/bestuur':'Het bestuur','club/commissies':'Onze commissies','club/jeugdorganisatie':'Jeugdorganisatie','club/vertrouwenspersoon':'Vertrouwenspersoon',
 'club/accommodatie':'Accommodatie & route','club/lidmaatschap':'Lidmaatschap & kleding','club/vrijwilligers':'Vrijwilligers','club/clubwaarden':'Clubwaarden','club/documenten':'Clubdocumenten','club/contact':'Contact',
 'teams':'Onze teams','teams/trainingen':'Trainingstijden','teams/walking-football':'Walking Football','wedstrijden':'Wedstrijdcentrum','wedstrijden/informatie':'Wedstrijdinformatie','wedstrijden/afgelastingen':'Afgelastingen','wedstrijden/oefenwedstrijd':'Oefenwedstrijd aanvragen',
 'nieuws':'Nieuws','verhalen':'Verhalen & columns','media/fotos':'Foto’s van de club','media/club-tv':'Duindorp SV-TV','media/nieuwsbrief':'Nieuwsbrief',
};

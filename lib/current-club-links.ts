import type {CmsRedirect} from './cms/types';

const legacyRoutes:Record<string,string>={
  '705':'club/lidmaatschap#inschrijven','411':'club/lidmaatschap#contributie','889':'club/lidmaatschap#kleding','204':'club/contact?onderwerp=lidmaatschap',
  '630':'club/bestuur','637':'club/vertrouwenspersoon','639':'club/commissies','640':'club/commissies','901':'club/jeugdorganisatie','909':'club/jeugdorganisatie','643':'teams/trainingen',
};
export function currentClubHref(raw:string,redirects:CmsRedirect[]=[]):string{
  let url:URL;
  try{url=new URL(raw,'https://duindorpsv.nl');}catch{return raw;}
  if(url.hostname.replace(/^www\./,'')!=='duindorpsv.nl'||!['http:','https:'].includes(url.protocol))return raw;
  const redirect=redirects.find(item=>('/'+item.from.replace(/^\//,''))===url.pathname);
  if(redirect)return redirect.to.startsWith('/clubmuur/')?redirect.to:'/clubmuur/'+redirect.to.replace(/^\//,'');
  if(/^\/1\/\d+(?:\/|$)/.test(url.pathname))return '/clubmuur/nieuws';
  const match=url.pathname.match(/^\/(\d+)(?:\/|$)/);
  if(match&&/sponsor/i.test(url.pathname))return '/clubmuur/club/contact?onderwerp=sponsoring';
  if(match)return '/clubmuur/'+(legacyRoutes[match[1]]||'club/contact');
  if(/^https?:/i.test(raw)&&url.pathname==='/')return '/clubmuur';
  return raw;
}
/** Apply to published link attributes, leaving source archives and image URLs intact. */
export function currentClubLinks<T>(value:T,redirects:CmsRedirect[]=[]):T{
  if(Array.isArray(value))return value.map(item=>currentClubLinks(item,redirects)) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['href','url'].includes(key)&&typeof item==='string'?currentClubHref(item,redirects):currentClubLinks(item,redirects)])) as T;
  return value;
}

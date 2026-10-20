import {heroPages} from '../clubmuur-config';
import {resolveCmsPath} from './public-adapters';
import type {CmsRedirect} from './types';

type HeroPage={slug:string;live?:{slug:string;title:string};deletedAt?:string};
/** Hero tiles can link to every public CMS page, independently of menu visibility. */
export function heroPageOptions(pages:readonly HeroPage[]){
 const options=new Map(heroPages.map(page=>[page.value,page.label]));
 for(const page of pages){
  if(page.deletedAt||!page.live){options.delete(page.slug);if(page.live)options.delete(page.live.slug);continue;}
  options.set(page.live.slug,page.live.title);
 }
 return [...options].map(([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label,'nl'));
}
export function resolveHeroPage(target:string,redirects:readonly CmsRedirect[]=[]){
 return target?resolveCmsPath({redirects:[...redirects]},target):'';
}
export function heroPageHref(target:string,redirects:readonly CmsRedirect[]=[]){
 const path=resolveHeroPage(target,redirects);return path?`/clubmuur/${path}`:'/clubmuur';
}

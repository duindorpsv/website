import type {Article} from '../club-data';
import type {CmsState,ContentType} from './types';
import {docText} from './model';

export function cmsArticlesForSite(state:CmsState,contentType:ContentType='news'):Article[]{
 return state.articles.filter(article=>!article.deletedAt&&article.live&&(article.live.contentType||'news')===contentType).map(article=>{
  const live=article.live!;
  const cover=state.media.find(media=>media.id===live.coverId&&media.published&&!media.deletedAt);
  const text=docText(live.body);
  const date=new Date(live.publishedAt);
  return {id:article.id,publishedAt:live.publishedAt,featured:live.featured,featuredUntil:live.featuredUntil,title:live.title,category:live.category,intro:live.intro,image:cover?.src||'/assets/crest-close.webp',date:Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'}).format(date),minutes:Math.max(1,Math.ceil(text.trim().split(/\s+/).length/200)),body:text.split('\n').filter(Boolean)};
 });
}

export function resolveCmsPath(state:Pick<CmsState,'redirects'>,path:string):string{
 let current=path;const visited=new Set<string>();
 while(!visited.has(current)){
  visited.add(current);
  const redirect=state.redirects.find(row=>row.from===current);
  if(!redirect||!/^([a-z0-9]+(?:[-/][a-z0-9]+)*)$/.test(redirect.to))return current;
  current=redirect.to;
 }
 return path;
}

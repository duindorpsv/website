import type {ClubNavigationItem,ClubNavigationLink} from '../clubmuur-navigation';
import type {CmsPage,CmsState,PageContent} from './types';

const hiddenPaths=new Set(['wedstrijden/oefenwedstrijd','media/club-tv']);
const hiddenIds=new Set([...hiddenPaths].map(path=>`page-${path.replaceAll('/','-')}`));
const menuFields=['title','slug','menuVisible','menuGroup','order','parentId'] as const;
const pathOf=(href:string)=>href.split(/[?#]/)[0];
const hrefFor=(path:string)=>`/clubmuur/${path}`;
const hiddenPage=(page:CmsPage)=>hiddenIds.has(page.id)||!!page.live&&hiddenPaths.has(page.live.slug);

/** Overlay only published navigation changes, preserving the custom menu by default. */
export function cmsNavigation(base:ClubNavigationItem[],state:CmsState,originalPages:CmsPage[]=[]):ClubNavigationItem[]{
 if(base.some(group=>group.managed))return managedNavigation(base,state);
 const result=structuredClone(base);
 result.forEach(group=>{if(group.children)group.children=group.children.filter(link=>!hiddenPaths.has(pathOf(link.href).replace(/^\/clubmuur\//,'')));});
 const managed=state.pages.filter(page=>{
  const original=originalPages.find(p=>p.id===page.id),live=page.live;
  return !original||!live||!!page.deletedAt||!live.menuVisible||hiddenPage(page)||menuFields.some(key=>live[key]!==original.live?.[key]);
 });
 // Remove all old links first. Draft slugs never remove another published link.
 for(const page of managed){
  const original=originalPages.find(p=>p.id===page.id),live=page.live;
  const aliases=new Set([live?.slug,original?.slug,...(!live?[page.slug]:[])].filter((path):path is string=>!!path));
  let expanded=true;while(expanded){expanded=false;for(const redirect of state.redirects){if(aliases.has(redirect.from)&&!aliases.has(redirect.to)){aliases.add(redirect.to);expanded=true;}if(aliases.has(redirect.to)&&!aliases.has(redirect.from)){aliases.add(redirect.from);expanded=true;}}}
  const paths=new Set([...aliases].filter(path=>!state.pages.some(other=>other.id!==page.id&&!other.deletedAt&&other.live?.slug===path)).map(hrefFor));
  result.forEach(group=>{
   if(group.children)group.children=group.children.filter(link=>!paths.has(pathOf(link.href))&&link.id!==`cms-${page.id}`);
   if(original&&pathOf(group.href)===hrefFor(original.slug))group.href=live&&!page.deletedAt&&live.menuVisible&&!hiddenPage(page)?hrefFor(live.slug):'/clubmuur';
  });
 }
 const visible=managed.filter((page):page is CmsPage&{live:PageContent}=>!!page.live&&!page.deletedAt&&page.live.menuVisible&&!hiddenPage(page)).sort((a,b)=>a.live.order-b.live.order||a.live.title.localeCompare(b.live.title,'nl'));
 const rank=(link:ClubNavigationLink,groupId:string)=>state.pages.find(page=>page.live&&!page.deletedAt&&page.live.menuVisible&&!hiddenPage(page)&&page.live.menuGroup===groupId&&hrefFor(page.live.slug)===pathOf(link.href))?.live?.order;
 for(const page of visible){
  const live=page.live,href=hrefFor(live.slug);
  if(result.some(group=>pathOf(group.href)===href))continue;
  const group=result.find(g=>g.id===live.menuGroup)||result.find(g=>g.id==='club');
  if(!group)continue;
  const children=group.children||[],link={id:`cms-${page.id}`,label:live.title,href};
  const insertion=children.findIndex(child=>{const order=rank(child,group.id);return order!==undefined&&order>live.order;});
  children.splice(insertion<0?children.length:insertion,0,link);group.children=children;
 }
 return result;
}

function managedNavigation(base:ClubNavigationItem[],state:CmsState){
 const mentioned=new Set([...base.flatMap(group=>group.excluded||[]),...base.flatMap(group=>[group,...group.children||[]]).flatMap(link=>[link.pageId||'',pathOf(link.href)])]);
 function resolve(link:ClubNavigationLink):ClubNavigationLink|null{
  if(link.enabled===false)return null;
  const page=link.pageId?state.pages.find(page=>page.id===link.pageId):state.pages.find(page=>hrefFor(page.live?.slug||page.slug)===pathOf(link.href));
  if(page&&(!page.live||page.deletedAt||hiddenPage(page)))return null;
  if(link.pageId&&!page)return null;
  return page?.live?{...link,href:hrefFor(page.live.slug)+link.href.slice(pathOf(link.href).length)}:link;
 }
 const result:ClubNavigationItem[]=base.flatMap(group=>{
  const parent=resolve(group);if(!parent)return [];
  return [{...group,...parent,children:(group.children||[]).map(resolve).filter((link):link is ClubNavigationLink=>!!link)}];
 });
 for(const page of state.pages.filter(page=>page.live?.menuVisible&&!page.deletedAt&&!hiddenPage(page)).sort((a,b)=>a.live!.order-b.live!.order)){
  if(mentioned.has(page.id)||mentioned.has(hrefFor(page.live!.slug)))continue;
  const group=result.find(group=>group.id===page.live!.menuGroup);if(group)(group.children||=[]).push({id:`cms-${page.id}`,pageId:page.id,label:page.live!.title,href:hrefFor(page.live!.slug)});
 }
 return result;
}

export function editableNavigation(base:ClubNavigationItem[],state:CmsState,originalPages:CmsPage[]=[]){
 if(base.some(group=>group.managed)){const result=structuredClone(base),resolved=managedNavigation(base,state);for(const group of result){for(const link of [group,...group.children||[]]){const page=state.pages.find(page=>page.id===link.pageId&&page.live&&!page.deletedAt);if(page)link.href=hrefFor(page.live!.slug)+link.href.slice(pathOf(link.href).length);}for(const link of resolved.find(item=>item.id===group.id)?.children||[])if(!group.children?.some(item=>item.id===link.id))(group.children||=[]).push(link);}return result;}
 const result=cmsNavigation(base,state,originalPages);
 for(const group of result){
  group.managed=true;
  const original=base.find(item=>item.id===group.id);
  for(const link of original?.children||[])if(!result.some(group=>group.children?.some(child=>pathOf(child.href)===pathOf(link.href))))(group.children||=[]).push({...link,enabled:false});
  for(const link of [group,...group.children||[]]){const page=state.pages.find(page=>page.live&&hrefFor(page.live.slug)===pathOf(link.href));if(page)link.pageId=page.id;}
 }
 return result;
}

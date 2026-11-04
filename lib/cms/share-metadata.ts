import type {CmsState} from './types';
import type {ArchiveMoment} from '../club-archive-types';
import {createDefaultHeroSlider,publicSliderMediaSource,resolveHeroSlides,safeHeroImageSrc} from './hero-slider';
import {getHeroSelection} from './hero-portraits';
import {heroPhotoSource} from '../clubmuur-layouts';
import {isFeatured} from './featured';

export type ShareImage={url:string;alt:string};
type PublicArchiveCover=Pick<ArchiveMoment,'cover'|'media'|'published'|'title'>;
const clubPhoto='/assets/club-life-v28/supporters-1280.webp';
const groundPhoto='/assets/clubmuur-brush-v25/section-houtrust-1600.webp';
const sectionPhotos:Record<string,string>={
 'club':clubPhoto,
 'club/accommodatie':groundPhoto,
 'club/lidmaatschap':'/assets/club-life-v28/youth-1280.webp',
 'club/jeugdorganisatie':'/assets/club-life-v28/youth-1280.webp',
 'teams/trainingen':groundPhoto,
 'teams/walking-football':'/assets/club-life-v28/walking-1280.webp',
 'wedstrijden/informatie':groundPhoto,
 'media/club-tv':clubPhoto,
};

/** Use the published cover shown by the renderer, never an editor's draft. */
export function publicShareImage(state:CmsState,path:string,baseUrl:string,archive?:PublicArchiveCover):ShareImage{
 const base=new URL(baseUrl);
 function fromSource(src:unknown,alt:string):ShareImage|undefined{
  if(!safeHeroImageSrc(src))return;
  const url=new URL(src,base);
  // Absolute URLs must not bypass the private-file exclusion either.
  if(url.pathname.startsWith('/api/cms/'))return;
  if(url.origin===base.origin){
   if(!safeHeroImageSrc(url.pathname+url.search))return;
   const file=/^\/api\/media\/([^/]+)$/.exec(url.pathname);
   if(file&&!state.media.some(media=>media.id===file[1]&&media.published&&!media.deletedAt))return;
  }
  return {url:url.href,alt};
 }
 function fromMedia(id:string|undefined):ShareImage|undefined{
  const media=id&&state.media.find(item=>item.id===id&&item.published&&!item.deletedAt);
  const src=media&&publicSliderMediaSource(media);
  return src&&media?fromSource(src,media.alt||media.caption||media.name):undefined;
 }
 const article=state.articles.find(item=>!item.deletedAt&&item.live&&`${item.live.contentType==='story'?'verhalen':'nieuws'}/${item.live.slug}`===path)?.live;
 const page=state.pages.find(item=>!item.deletedAt&&item.live?.slug===path)?.live;
 let selected=article?fromMedia(article.coverId):page?(page.coverId?fromMedia(page.coverId):fromSource(page.coverSrc,page.title)):undefined;
 if(selected)return selected;
 // readArchive supplies only approved, ready media on published records.
 if(archive?.published){
  const cover=archive.media.find(media=>media.kind==='image'&&media.approved&&media.src===archive.cover);
  if(cover&&/^\/api\/archive\/media\/[a-zA-Z0-9_-]+$/.test(cover.src))return {url:new URL(cover.src,base).href,alt:cover.caption||archive.title};
 }
 const album=state.albums.find(item=>item.published&&!item.deletedAt&&`media/fotos/${item.slug}`===path);
 if(album){selected=fromMedia(album.coverId)||album.mediaIds.map(fromMedia).find(Boolean);if(selected)return selected;}
 if(path==='nieuws'||path==='verhalen'){
  const articles=state.articles.filter(item=>!item.deletedAt&&item.live&&(item.live.contentType==='story'?'verhalen':'nieuws')===path).map(item=>({...item.live!,id:item.id})).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  const featured=path==='verhalen'?state.settings.homepageStoryIds.map(id=>articles.find(article=>article.id===id)).find(Boolean)||articles[0]:articles.find(article=>isFeatured(article))||articles[0];
  selected=fromMedia(featured?.coverId);if(selected)return selected;
 }
 if(path==='home'){
  const slide=resolveHeroSlides(state.appearance?.heroSlider??createDefaultHeroSlider(),state.media)[0];
  selected=slide&&fromSource(slide.src,slide.label);
  if(selected)return selected;
  const {enabled,catalog}=getHeroSelection(state.appearance,state.media);
  const portrait=catalog.find(photo=>enabled.includes(photo.id));
  selected=portrait&&fromSource(heroPhotoSource(portrait),portrait.name);
  if(selected)return selected;
 }
 const fallback=sectionPhotos[path]||(/^(teams|wedstrijden)(\/|$)/.test(path)?groundPhoto:clubPhoto);
 return {url:new URL(fallback,base).href,alt:'Duindorp SV · Onze club. Onze trots.'};
}

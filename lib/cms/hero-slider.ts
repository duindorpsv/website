import {z} from 'zod';
import type {CmsMedia} from './types';
export type CmsHeroSlide={id:string;source:'builtin'|'media';sourceId:string;label:string;enabled:boolean;focusX:number;focusY:number};
export type CmsHeroSlider={slides:CmsHeroSlide[];autoplay:boolean;intervalMs:number;transition:'fade'|'none';transitionMs:number;zoom:'none'|'subtle'|'cinematic';parallax:boolean;showIndicators:boolean};

const base='/assets/clubmuur-brush-v25';
export const HERO_BACKGROUND_PRESETS=[
  {id:'houtrust',label:'Onze kantine op Houtrust',src:`${base}/houtrust-wide-1672.webp`},
  {id:'de-wijk',label:'Het Meeuwenhof en de kerk',src:`${base}/de-wijk-wide-1672.webp`},
  {id:'aan-zee',label:'Het havenhoofd en de wijk',src:`${base}/aan-zee-wide-1672.webp`},
] as const;

export function createDefaultHeroSlider():CmsHeroSlider{
  return {slides:HERO_BACKGROUND_PRESETS.map(preset=>({id:`background-${preset.id}`,source:'builtin',sourceId:preset.id,label:preset.label,enabled:true,focusX:50,focusY:50})),autoplay:true,intervalMs:10000,transition:'fade',transitionMs:1600,zoom:'subtle',parallax:true,showIndicators:true};
}

const identifier=z.string().trim().min(1,'Een afbeelding mist een identifier.').max(200);
const percent=z.number().finite().min(0).max(100);
const slideSchema=z.object({
  id:identifier,source:z.enum(['builtin','media']),sourceId:identifier,
  label:z.string().trim().min(1,'Geef iedere afbeelding een naam.').max(160),
  enabled:z.boolean(),focusX:percent,focusY:percent,
}).strict().superRefine((slide,context)=>{
  if(slide.source==='builtin'&&!HERO_BACKGROUND_PRESETS.some(preset=>preset.id===slide.sourceId))context.addIssue({code:'custom',path:['sourceId'],message:'Deze standaardachtergrond bestaat niet.'});
});

export const heroSliderSchema=z.object({
  slides:z.array(slideSchema).max(20,'Gebruik maximaal 20 achtergrondafbeeldingen.'),
  autoplay:z.boolean(),intervalMs:z.number().int().min(4000).max(60000),
  transition:z.enum(['fade','none']),transitionMs:z.number().int().min(0).max(3000),
  zoom:z.enum(['none','subtle','cinematic']),parallax:z.boolean(),showIndicators:z.boolean(),
}).strict().superRefine((slider,context)=>{
  if(slider.transitionMs>=slider.intervalMs)context.addIssue({code:'custom',path:['transitionMs'],message:'De overgang moet korter zijn dan de weergavetijd.'});
  if(new Set(slider.slides.map(slide=>slide.id)).size!==slider.slides.length)context.addIssue({code:'custom',path:['slides'],message:'Iedere dia moet een unieke identifier hebben.'});
  if(new Set(slider.slides.map(slide=>`${slide.source}:${slide.sourceId}`)).size!==slider.slides.length)context.addIssue({code:'custom',path:['slides'],message:'Een afbeelding staat meer dan één keer in de slider.'});
});

export function validateHeroSlider(value:unknown):string[]{
  const result=heroSliderSchema.safeParse(value);
  return result.success?[]:result.error.issues.map(issue=>issue.message);
}

export type ResolvedHeroSlide=CmsHeroSlide&{src:string;presetId?:string};

/** Only public media files and explicitly published assets become image URLs. */
export function safeHeroImageSrc(src:unknown):src is string{
  if(typeof src!=='string'||!src||/[\s\u0000-\u001f\u007f<>"'\\]/.test(src))return false;
  if(/^\/assets\/[^?#]+(?:[?#].*)?$/.test(src)||/^\/api\/media\/[a-zA-Z0-9_-]+(?:[?#].*)?$/.test(src))return !/(?:^|\/)\.\.(?:\/|$)/.test(src)&&!/%(?:2e|2f|5c)/i.test(src);
  try{const url=new URL(src);return ['https:','http:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
export function publicSliderMediaSource(media:Pick<CmsMedia,'id'|'src'|'published'|'deletedAt'>):string|undefined{
  if(!media.published||media.deletedAt)return;
  const privateFile=/^\/api\/cms\/media\/([^/?#]+)\/file$/.exec(media.src);
  const src=privateFile&&privateFile[1]===media.id?`/api/media/${encodeURIComponent(media.id)}`:media.src;
  const publicFile=/^\/api\/media\/([^/?#]+)/.exec(src);
  if(publicFile&&publicFile[1]!==media.id)return;
  return safeHeroImageSrc(src)?src:undefined;
}


/** Resolves only explicitly selected, public images; an empty slider stays empty. */
export function resolveHeroSlides(settings:CmsHeroSlider,media:readonly CmsMedia[]):ResolvedHeroSlide[]{
  const result:ResolvedHeroSlide[]=[];
  const seen=new Set<string>();
  for(const slide of settings.slides){
    const key=`${slide.source}:${slide.sourceId}`;
    if(!slide.enabled||seen.has(key))continue;
    seen.add(key);
    if(slide.source==='builtin'){
      const preset=HERO_BACKGROUND_PRESETS.find(item=>item.id===slide.sourceId);
      if(preset)result.push({...slide,src:preset.src,presetId:preset.id});
    }else{
      const photo=media.find(item=>item.id===slide.sourceId&&item.published&&!item.deletedAt);
      const src=photo&&publicSliderMediaSource(photo);
      if(src)result.push({...slide,src});
    }
  }
  return result;
}

export function heroBackgroundSourceSet(id:string,shape:'wide'|'portrait',format:'avif'|'webp'){
  return (shape==='wide'?[960,1280,1672]:[480,800,941]).map(width=>`${base}/${id}-${shape}-${width}.${format} ${width}w`).join(', ');
}

export function heroBackgroundImageSrc(id:string,shape:'wide'|'portrait'){
  return `${base}/${id}-${shape}-${shape==='wide'?1672:941}.webp`;
}

import {defaultHeroPhotoIds,heroPhotos,type HeroPhoto,type HeroPhotoId} from '../clubmuur-layouts';

export const heroPortraitKinds=[
  {value:'solo',label:'Eén persoon · staand'},
  {value:'duo',label:'Twee personen · staand'},
  {value:'trio',label:'Drie personen · breed'},
  {value:'walking',label:'Team of groep · breed'},
] as const;
export type HeroPortraitKind=typeof heroPortraitKinds[number]['value'];
export type HeroPortrait={id:`portrait-${string}`;mediaId:string;name:string;kind:HeroPortraitKind};
export type HeroPortraitMedia={id:string;src:string;published:boolean;deletedAt?:string};

/** Descriptors reference approved library records; they never store a file URL. */
export function validHeroPortraits(value:unknown):value is HeroPortrait[]{
  return Array.isArray(value)&&value.length<=200&&new Set(value.map(item=>item?.id)).size===value.length&&value.every(item=>
    item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).every(key=>['id','mediaId','name','kind'].includes(key))&&
    typeof item.id==='string'&&/^portrait-[a-zA-Z0-9-]{1,80}$/.test(item.id)&&
    typeof item.mediaId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(item.mediaId)&&
    typeof item.name==='string'&&!!item.name.trim()&&item.name.length<=150&&
    heroPortraitKinds.some(kind=>kind.value===item.kind));
}

export function publicHeroMediaSource(media:HeroPortraitMedia):string|undefined {
  if(!media.published||media.deletedAt||!media.src)return;
  const privateFile=/^\/api\/cms\/media\/([^/?#]+)\/file(?:[?#].*)?$/.exec(media.src);
  if(privateFile)return privateFile[1]===media.id?`/api/media/${encodeURIComponent(media.id)}`:undefined;
  if(media.src.startsWith('/api/cms/'))return;
  if(/^(?:\/(?!\/)|https:\/\/)/.test(media.src))return media.src;
}

export function getHeroPhotoCatalog(portraits:readonly HeroPortrait[]=[],media:readonly HeroPortraitMedia[]=[]):HeroPhoto[]{
  const custom:HeroPhoto[]=[];
  for(const portrait of portraits){
    const photo=media.find(item=>item.id===portrait.mediaId),src=photo&&publicHeroMediaSource(photo);
    if(!src)continue;
    const layouts=portrait.kind==='solo'?['01','05'] as const:portrait.kind==='duo'?['02','08'] as const:portrait.kind==='trio'?['02','04','08'] as const:['04'] as const;
    const wide=portrait.kind==='trio'||portrait.kind==='walking';
    custom.push({...portrait,src,layouts,width:wide?1536:1024,height:wide?1024:1536});
  }
  return [...heroPhotos,...custom];
}

/** Missing/deleted/unpublished custom media cannot become a public image source. */
export function getHeroSelection(appearance:{heroPhotos?:readonly string[];heroPortraits?:readonly HeroPortrait[]}|undefined,media:readonly HeroPortraitMedia[]=[]){
  const catalog=getHeroPhotoCatalog(appearance?.heroPortraits,media);
  const enabled=(appearance?.heroPhotos||defaultHeroPhotoIds).filter(id=>catalog.some(photo=>photo.id===id)) as HeroPhotoId[];
  return {catalog,enabled:enabled.length?enabled:defaultHeroPhotoIds};
}

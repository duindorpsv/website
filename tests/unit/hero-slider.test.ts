import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createDefaultHeroSlider,HERO_BACKGROUND_PRESETS,heroSliderSchema,resolveHeroSlides,publicSliderMediaSource,safeHeroImageSrc,heroBackgroundImageSrc,heroBackgroundSourceSet} from '../../lib/cms/hero-slider';
import type {CmsMedia} from '../../lib/cms/types';
const photo:CmsMedia={id:'slider-photo',name:'Clubfoto',src:'/api/cms/media/slider-photo/file',alt:'Spelers van Duindorp',caption:'',credit:'',folderId:'',teamId:'',season:'2026–2027',published:true,featured:false,order:0,focusX:50,focusY:50,createdAt:'2026-10-20T12:00:00Z'};

test('hero slider defaults match the artwork and motion contract without sharing mutable arrays',()=>{
 const first=createDefaultHeroSlider(),other=createDefaultHeroSlider();assert.deepEqual(first,other);first.slides.pop();assert.equal(other.slides.length,3);
 assert.equal(other.intervalMs,10000);assert.equal(other.transitionMs,1600);assert.equal(other.zoom,'subtle');assert.equal(other.parallax,true);assert.equal(other.showIndicators,true);assert.equal(other.autoplay,true);
 for(const preset of HERO_BACKGROUND_PRESETS)for(const shape of ['wide','portrait'] as const)for(const format of ['avif','webp'] as const){for(const entry of heroBackgroundSourceSet(preset.id,shape,format).split(', ')){const path=entry.split(' ')[0];assert.ok(readFileSync(join(process.cwd(),'public',path)).length>0,path);}assert.ok(heroBackgroundImageSrc(preset.id,shape).includes(shape));}
});
test('hero slider validates all motion bounds, slide identities, source duplicates and focal coordinates',()=>{
 const source=createDefaultHeroSlider();assert.ok(heroSliderSchema.safeParse(source).success);
 for(const patch of [{intervalMs:3999},{intervalMs:60001},{transitionMs:-1},{transitionMs:3001},{zoom:'fast'},{transition:'crossfade'},{extra:'ignored'}])assert.equal(heroSliderSchema.safeParse({...source,...patch}).success,false,JSON.stringify(patch));
 for(const patch of [{focusX:-1},{focusX:101},{focusY:NaN},{sourceId:'absent'},{label:' '},{url:'blob:private'}])assert.equal(heroSliderSchema.safeParse({...source,slides:[{...source.slides[0],...patch}]}).success,false,JSON.stringify(patch));
 assert.equal(heroSliderSchema.safeParse({...source,slides:[source.slides[0],source.slides[0]]}).success,false);
 assert.equal(heroSliderSchema.safeParse({...source,slides:[source.slides[0],{...source.slides[0],id:'another'}]}).success,false);
 const slides=Array.from({length:20},(_,index)=>({...source.slides[0],id:'slide-'+index,source:'media' as const,sourceId:'media-'+index}));assert.ok(heroSliderSchema.safeParse({...source,slides}).success);assert.equal(heroSliderSchema.safeParse({...source,slides:[...slides,{...slides[0],id:'slide-21',sourceId:'media-21'}]}).success,false);
 for(const intervalMs of [4000,60000])for(const transitionMs of [0,3000])assert.ok(heroSliderSchema.safeParse({...source,intervalMs,transitionMs}).success);
});
test('intentional empty or disabled sliders stay empty while ordered selected media use only public URLs',()=>{
 const source=createDefaultHeroSlider();assert.deepEqual(resolveHeroSlides({...source,slides:[]},[photo]),[]);assert.deepEqual(resolveHeroSlides({...source,slides:source.slides.map(slide=>({...slide,enabled:false}))},[photo]),[]);
 const custom={...source.slides[0],id:'own-slide',source:'media' as const,sourceId:photo.id,focusX:30,focusY:70};
 const selected=resolveHeroSlides({...source,slides:[custom,source.slides[2],source.slides[1]]},[photo]);assert.deepEqual(selected.map(slide=>slide.id),[custom.id,source.slides[2].id,source.slides[1].id]);assert.equal(selected[0].src,'/api/media/slider-photo');assert.equal(selected[0].focusY,70);
 for(const media of [{...photo,published:false},{...photo,deletedAt:'2026-10-20'},{...photo,src:'blob:https://club.example/image'},{...photo,src:'/api/cms/media/other-id/file'}])assert.deepEqual(resolveHeroSlides({...source,slides:[custom]},[media]),[]);
 assert.deepEqual(resolveHeroSlides({...source,slides:[custom]},[]),[]);
});
test('public slider sources reject private routes, unsafe schemes and credential URLs',()=>{
 for(const src of ['javascript:alert(1)','data:image/png,private','blob:https://club.example/private','/api/cms/media/secret/file','//private.example/image','https://user:password@example.org/photo.jpg','/assets/../api/cms/file','/assets/%2e%2e/api/cms/file','file:///tmp/image.png','https://example.org/a b.jpg'])assert.equal(safeHeroImageSrc(src),false,src);
 assert.equal(publicSliderMediaSource({...photo,src:'/api/media/another-id'}),undefined);assert.equal(publicSliderMediaSource(photo),'/api/media/slider-photo');assert.ok(safeHeroImageSrc('/assets/team.png'));assert.ok(safeHeroImageSrc('https://images.example.org/club.webp'));
});

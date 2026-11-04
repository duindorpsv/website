import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCmsSeed} from '../../lib/cms/seed';
import {publicShareImage} from '../../lib/cms/share-metadata';
import {createDefaultHeroSlider} from '../../lib/cms/hero-slider';
import type {CmsMedia,CmsState} from '../../lib/cms/types';

const origin='https://club.example';
const media:CmsMedia={id:'public-cover',name:'Omslag',src:'/api/media/public-cover',alt:'Samen langs de lijn',caption:'',credit:'',folderId:'',teamId:'',season:'',published:true,featured:false,order:0,focusX:50,focusY:50,createdAt:'2026-11-04T12:00:00Z'};
function state():CmsState{const result=createCmsSeed();result.articles=[];result.pages=[];result.albums=[];result.media=[{...media}];result.appearance={};return result;}
function article(contentType:'news'|'story'='story'){
 const result=createCmsSeed().articles[0];
 result.live={...result.live!,contentType,slug:'langs-de-lijn',coverId:media.id};
 result.slug='draft-slug';result.coverId='draft-cover';result.status='draft';
 return result;
}

test('story and news shares use the live article cover instead of draft changes or logos',()=>{
 for(const type of ['news','story'] as const){
  const current=state();current.articles=[article(type)];current.media.push({...media,id:'draft-cover',src:'/assets/logo.png'});
  assert.deepEqual(publicShareImage(current,`${type==='story'?'verhalen':'nieuws'}/langs-de-lijn`,origin),{url:origin+media.src,alt:media.alt});
  current.articles[0].deletedAt='2026-11-04';
  assert.ok(!publicShareImage(current,`${type==='story'?'verhalen':'nieuws'}/langs-de-lijn`,origin).url.includes(media.id));
 }
});

test('private, unpublished, missing and deleted media never appear in share URLs',()=>{
 const current=state();current.articles=[article()];
 for(const cover of [
  {...media,published:false},
  {...media,deletedAt:'2026-11-04'},
  {...media,src:'/api/cms/media/other-record/file'},
  {...media,src:origin+'/api/cms/media/public-cover/file'},
  {...media,src:'blob:https://club.example/private'},
  {...media,src:'data:image/png;base64,cHJpdmF0ZQ=='},
 ]){
  current.media=[cover];
  assert.ok(!publicShareImage(current,'verhalen/langs-de-lijn',origin).url.includes(media.id),cover.src);
 }
 current.media=[];assert.ok(!publicShareImage(current,'verhalen/langs-de-lijn',origin).url.includes(media.id));
 current.media=[{...media,src:'/api/cms/media/public-cover/file'}];
 assert.equal(publicShareImage(current,'verhalen/langs-de-lijn',origin).url,origin+'/api/media/public-cover');
 current.media=[{...media,src:'https://images.example.org/public.jpg'}];
 assert.equal(publicShareImage(current,'verhalen/langs-de-lijn',origin).url,'https://images.example.org/public.jpg');
});

test('published CMS pages support library and legacy static covers without leaking private file URLs',()=>{
 const current=state(),page=createCmsSeed().pages[0];
 page.live={...page.live!,slug:'club/voorbeeld',coverId:media.id,coverSrc:'/assets/logo.png'};
 page.coverId='draft-cover';current.pages=[page];
 assert.equal(publicShareImage(current,'club/voorbeeld',origin).url,origin+media.src);
 page.live.coverId='';page.live.coverSrc='/assets/club-life-v28/youth-1280.webp';
 assert.equal(publicShareImage(current,'club/voorbeeld',origin).url,origin+page.live.coverSrc);
 for(const src of ['/api/cms/media/private/file',origin+'/api/cms/media/private/file',origin+'/api/private/image','//private.example/image','javascript:alert(1)']){
  page.live.coverSrc=src;assert.ok(!publicShareImage(current,'club/voorbeeld',origin).url.includes('private'),src);
 }
 page.live.coverSrc='/api/media/public-cover';current.media[0].published=false;
 assert.ok(!publicShareImage(current,'club/voorbeeld',origin).url.includes(media.id));
});

test('homepage shares use the first selected public hero slide and section fallbacks use club photos',()=>{
 const current=state(),slider=createDefaultHeroSlider();
 slider.slides.unshift({...slider.slides[0],id:'custom',source:'media',sourceId:media.id,label:'Eigen hero'});
 current.appearance={heroSlider:slider};
 assert.equal(publicShareImage(current,'home',origin).url,origin+media.src);
 current.media[0].published=false;
 assert.equal(publicShareImage(current,'home',origin).url,origin+'/assets/clubmuur-brush-v25/houtrust-wide-1672.webp');
 assert.equal(publicShareImage(current,'teams/123:456',origin).url,origin+'/assets/clubmuur-brush-v25/section-houtrust-1600.webp');
 assert.ok(!publicShareImage(current,'club/onbekend',origin).url.includes('logo'));
});

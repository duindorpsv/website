import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultHeroPhotoIds,heroPhotoSource,photosForLayout,pickHeroLayout,pickHeroPhoto,resolveHeroPhoto,validHeroPhotoIds} from '../../lib/clubmuur-layouts';
import {getHeroPhotoCatalog,getHeroSelection,publicHeroMediaSource,validHeroPortraits,type HeroPortrait} from '../../lib/cms/hero-portraits';

const media={id:'photo-custom',src:'/api/cms/media/photo-custom/file',published:true};
const portrait:HeroPortrait={id:'portrait-custom',mediaId:media.id,name:'Sam – eerste elftal',kind:'solo'};

test('custom portrait descriptors are bounded, unique references without writable image URLs',()=>{
 assert.ok(validHeroPortraits([portrait]));assert.ok(validHeroPortraits([]));
 for(const value of [[{...portrait,id:'01-trots'}],[{...portrait,mediaId:''}],[{...portrait,mediaId:'../../private'}],[{...portrait,name:' '}],[{...portrait,name:'x'.repeat(151)}],[{...portrait,kind:'invalid'}],[{...portrait,src:'https://private.example/image'}],[portrait,portrait],Array.from({length:201},(_,i)=>({...portrait,id:`portrait-${i}`}))])assert.equal(validHeroPortraits(value),false);
 assert.equal(validHeroPhotoIds([portrait.id]),false);
 assert.ok(validHeroPhotoIds([portrait.id],[portrait]));
 assert.ok(validHeroPhotoIds([...defaultHeroPhotoIds,portrait.id],[portrait]));
 assert.equal(validHeroPhotoIds(['unknown'],[portrait]),false);
 assert.equal(validHeroPhotoIds([portrait.id,portrait.id],[portrait]),false);
});

test('library portraits use public media URLs and never expose unpublished or mismatched private media',()=>{
 assert.equal(publicHeroMediaSource(media),'/api/media/photo-custom');
 assert.equal(publicHeroMediaSource({...media,published:false}),undefined);
 assert.equal(publicHeroMediaSource({...media,deletedAt:'2026-10-20'}),undefined);
 assert.equal(publicHeroMediaSource({...media,src:'/api/cms/media/another-file/file'}),undefined);
 assert.equal(publicHeroMediaSource({...media,src:'/api/cms/private/file'}),undefined);
 assert.equal(publicHeroMediaSource({...media,src:'javascript:alert(1)'}),undefined);
 assert.equal(publicHeroMediaSource({...media,src:'//private.example/image'}),undefined);
 assert.equal(publicHeroMediaSource({...media,src:'https://static.example/photo.webp'}),'https://static.example/photo.webp');
 const catalog=getHeroPhotoCatalog([portrait],[media]),custom=catalog.find(photo=>photo.id===portrait.id)!;
 assert.equal(heroPhotoSource(custom),'/api/media/photo-custom');
 assert.equal(getHeroPhotoCatalog([portrait],[{...media,published:false}]).some(photo=>photo.id===portrait.id),false);
});

test('custom-only selections choose their compatible compositions and reject stale visit-cookie portraits',()=>{
 for(const kind of ['solo','duo','trio','walking'] as const){
  const custom={...portrait,kind};
  const {catalog,enabled}=getHeroSelection({heroPhotos:[custom.id],heroPortraits:[custom]},[media]);
  assert.deepEqual(enabled,[custom.id]);
  for(const savedLayout of ['01','02','04','05','08'])for(const random of [0,.5,.999]){
   const layout=pickHeroLayout(savedLayout,random,enabled,catalog);
   assert.ok(photosForLayout(layout,enabled,catalog).length);
   assert.equal(pickHeroPhoto(layout,'01-trots',random,enabled,catalog),custom.id);
   assert.equal(resolveHeroPhoto('01-trots',layout,enabled,catalog),undefined);
   assert.equal(resolveHeroPhoto(custom.id,layout,enabled,catalog),custom.id);
  }
 }
});

test('legacy selections and unavailable custom media preserve a safe built-in first paint',()=>{
 assert.deepEqual(getHeroSelection(undefined,[]).enabled,defaultHeroPhotoIds);
 assert.deepEqual(getHeroSelection({heroPhotos:['07-walking']},[]).enabled,['07-walking']);
 assert.deepEqual(getHeroSelection({heroPhotos:[portrait.id],heroPortraits:[portrait]},[{...media,published:false}]).enabled,defaultHeroPhotoIds);
 assert.deepEqual(getHeroSelection({heroPhotos:['07-walking',portrait.id],heroPortraits:[portrait]},[]).enabled,['07-walking']);
});

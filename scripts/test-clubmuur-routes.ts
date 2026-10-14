import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const {clubContentPaths,clubPathFromSegments,isClubPagePath,isClubContentPath,isCmsDynamicPath,clubPageGroup}=await import(new URL('../lib/clubmuur-page-routes.ts',import.meta.url).href) as typeof import('../lib/clubmuur-page-routes');
const {defaultClubNavigation,clubNavigationDestinations}=await import(new URL('../lib/clubmuur-navigation.ts',import.meta.url).href) as typeof import('../lib/clubmuur-navigation');

test('encoded Ontdek dit team URLs resolve to the same detail page as decoded params',()=>{
 for(const id of ['218382:-1','218380:-1','312711:-1','-1:23',':23']){
  for(const segment of [id,encodeURIComponent(id),encodeURIComponent(id).replace('%3A','%3a')]){
   const path=clubPathFromSegments(['teams',segment]);
   assert.equal(path,`teams/${id}`);
   assert.ok(isClubContentPath(path!));
   assert.ok(isClubPagePath(path!));
  }
 }
});

test('home and every registered content page resolve',()=>{
 assert.equal(clubPathFromSegments(undefined),'home');
 assert.equal(clubPathFromSegments([]),'home');
 for(const path of ['home','nieuws','verhalen','teams','wedstrijden',...clubContentPaths]){
  assert.ok(isClubPagePath(clubPathFromSegments(path.split('/'))!),path);
 }
});

test('news and stories have separate index and article routes under the Media menu',()=>{
 for(const section of ['nieuws','verhalen']){
  assert.ok(isClubPagePath(section));
  assert.equal(isClubContentPath(section),false,'editorial indexes must not resolve as static content pages');
  assert.ok(isCmsDynamicPath(`${section}/een-zaterdag-aan-de-lijn`));
  assert.equal(clubPageGroup(`${section}/een-zaterdag-aan-de-lijn`),'nieuws');
 }
});

test('malformed encoded paths do not throw or create additional route segments',()=>{
 for(const segment of ['%','%E0%A4%A','teams%2F218382%3A-1','%5c','%00','..','%2e%2e','']){
  assert.equal(clubPathFromSegments(['teams',segment]),null,segment);
 }
 const doubleEncoded=clubPathFromSegments(['teams','218382%253A-1']);
 assert.ok(doubleEncoded&&!isClubPagePath(doubleEncoded));
 assert.ok(!isClubPagePath('teams/not-a-team'));
});

test('all menu destinations have an implemented page',()=>{
 const links=[...defaultClubNavigation.flatMap(item=>[item,...(item.children||[])]),...clubNavigationDestinations];
 for(const {href} of links){
  const path=new URL(href,'https://club.test').pathname.replace(/^\/clubmuur\/?/,'');
  assert.ok(isClubPagePath(clubPathFromSegments(path?path.split('/'):undefined)!),href);
 }
});

test('every literal internal Clubmuur link in components and content points to an implemented page',()=>{
 const root=new URL('..',import.meta.url).pathname;
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):/\.(ts|tsx)$/.test(entry.name)?[join(dir,entry.name)]:[]);
 let count=0;
 for(const file of [...files(join(root,'components')),...files(join(root,'lib'))]){
  const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/(?:href\s*[:=]\s*|location\.(?:href\s*=\s*|assign\())['"](\/clubmuur[^'"\s]*)['"]/g)){
   const href=match[1],path=new URL(href,'https://club.test').pathname.replace(/^\/clubmuur\/?/,'');
   assert.ok(isClubPagePath(clubPathFromSegments(path?path.split('/'):undefined)!),`${file}: ${href}`);
   count++;
  }
 }
 assert.ok(count>70,`Expected a site-wide link audit, found ${count}`);
});

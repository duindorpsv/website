import {test} from 'node:test';import assert from 'node:assert/strict';
import {defaultHeroCards,validHeroCards,isHeroPageTarget} from '../../lib/clubmuur-config';
import {heroPageOptions,heroPageHref} from '../../lib/cms/hero-pages';import {createCmsSeed} from '../../lib/cms/seed';

test('all published CMS pages, including custom pages outside the menu, are hero destinations',()=>{
 const state=createCmsSeed(),base=state.pages[0];
 const custom={...base,id:'own-page',slug:'club/privaat-concept',title:'Private werktitel',menuVisible:false,live:{...base.live!,slug:'club/activiteiten',title:'Activiteiten',menuVisible:false}};
 const options=heroPageOptions([...state.pages,custom,{...base,slug:'club/concept',live:undefined},{...base,slug:'club/verwijderd',deletedAt:'2026-10-20',live:{...base.live!,slug:'club/verwijderd'}}]);
 for(const page of state.pages.filter(page=>page.live&&!page.deletedAt))assert.ok(options.some(option=>option.value===page.live!.slug));
 assert.deepEqual(options.find(option=>option.value==='club/activiteiten'),{value:'club/activiteiten',label:'Activiteiten'});
 for(const path of ['club/privaat-concept','club/concept','club/verwijderd'])assert.equal(options.some(option=>option.value===path),false);
 for(const path of ['','nieuws','verhalen','teams','wedstrijden','media/fotos'])assert.ok(options.some(option=>option.value===path));
 assert.equal(new Set(options.map(option=>option.value)).size,options.length);
});
test('hero targets stay within the current site and renamed pages keep a working destination',()=>{
 for(const value of ['club/bestuur','club/contact','teams/trainingen','club/activiteiten',''])assert.ok(isHeroPageTarget(value));
 for(const value of ['https://old.example/page','//evil.test','../beheer','/beheer','club/../beheer','club/%2e%2e','club?x=1','club#x','x'.repeat(241)])assert.equal(isHeroPageTarget(value),false,value);
 const cards=defaultHeroCards.map(card=>({...card,kind:'page' as const,target:'club/activiteiten'}));assert.ok(validHeroCards(cards));cards[0].target='../beheer';assert.equal(validHeroCards(cards),false);
 assert.equal(heroPageHref('club/activiteiten',[{from:'club/activiteiten',to:'club/clubactiviteiten'}]),'/clubmuur/club/clubactiviteiten');assert.equal(heroPageHref(''),'/clubmuur');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultClubNavigation,validClubNavigation,isSafeClubNavigationHref} from '../../lib/clubmuur-navigation';
import {cmsNavigation,editableNavigation} from '../../lib/cms/navigation';
import {createCmsSeed} from '../../lib/cms/seed';
import {pageContent,textDoc,emptySEO} from '../../lib/cms/model';
test('menu tree accepts a published custom destination and rejects unsafe destinations and duplicate IDs',()=>{
 const menu=structuredClone(defaultClubNavigation);menu[1].children!.push({id:'activities',label:'Activiteiten',href:'/clubmuur/club/activiteiten',enabled:true,pageId:''});assert.ok(validClubNavigation(menu));
 for(const href of ['javascript:alert(1)','//evil.test','/beheer','/clubmuur/../beheer','/clubmuur/club/%2e%2e/bestuur','https://evil.test/clubmuur','/123/oud'])assert.equal(isSafeClubNavigationHref(href),false,href);
 menu[1].children![0].id='activities';assert.equal(validClubNavigation(menu),false);
});
test('explicit menu placement, names and off switches survive page metadata; new published pages remain available',()=>{
 const state=createCmsSeed(),originals=structuredClone(state.pages),page={...state.pages[0],id:'activities-page',title:'Activiteiten',slug:'club/activiteiten',intro:'',body:textDoc(['Clubactiviteiten']),parentId:'',menuVisible:false,menuGroup:'club',order:20,seo:emptySEO()};page.live=pageContent(page);state.pages.push(page);
 const menu=editableNavigation(defaultClubNavigation,state,originals);menu[1].children!.push({id:'activities',pageId:page.id,label:'Kom naar de club',href:'/clubmuur/club/activiteiten'});
 assert.ok(cmsNavigation(menu,state,originals)[1].children?.some(link=>link.label==='Kom naar de club'));
 menu[1].children!.find(link=>link.id==='activities')!.enabled=false;assert.equal(cmsNavigation(menu,state,originals).flatMap(group=>group.children||[]).some(link=>link.id==='activities'),false);
 menu[1].children!.find(link=>link.id==='activities')!.enabled=true;page.live.slug='club/clubactiviteiten';assert.equal(cmsNavigation(menu,state,originals)[1].children!.find(link=>link.id==='activities')!.href,'/clubmuur/club/clubactiviteiten');
 page.live=undefined;assert.equal(cmsNavigation(menu,state,originals).flatMap(group=>group.children||[]).some(link=>link.id==='activities'),false);
 menu[1].enabled=false;assert.equal(cmsNavigation(menu,state,originals).some(group=>group.id==='club'),false);
});
test('removed page links stay removed and CMS destinations retain query strings and anchors',()=>{
 const state=createCmsSeed(),menu=editableNavigation(defaultClubNavigation,state,structuredClone(state.pages));
 const board=menu[1].children!.find(link=>link.href==='/clubmuur/club/bestuur')!;
 menu[1].children=menu[1].children!.filter(link=>link!==board);menu[0].excluded=[board.pageId!,board.href];
 assert.equal(cmsNavigation(menu,state).flatMap(group=>group.children||[]).some(link=>link.href===board.href),false);
 const contact=menu[1].children!.find(link=>link.href==='/clubmuur/club/contact')!;contact.href+='?onderwerp=sponsoring#bericht';
 assert.equal(cmsNavigation(menu,state)[1].children!.find(link=>link.id===contact.id)!.href,contact.href);
 assert.equal(editableNavigation(menu,state)[1].children!.find(link=>link.id===contact.id)!.href,contact.href);
 assert.ok(validClubNavigation(menu));
});

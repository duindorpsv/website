import assert from 'node:assert/strict';
import test from 'node:test';
import type {SportlinkTeam} from '../lib/sportlink-types';

const {heroTeamHref}=await import(new URL('../lib/clubmuur-destinations.ts',import.meta.url).href) as typeof import('../lib/clubmuur-destinations');
const {defaultClubNavigation,migrateClubNavigation,validClubNavigation}=await import(new URL('../lib/clubmuur-navigation.ts',import.meta.url).href) as typeof import('../lib/clubmuur-navigation');
const makeTeam=(id:string,name:string):SportlinkTeam=>({id,name,teamCode:id.split(':')[0],localTeamCode:id.split(':')[1],category:'Senioren',gender:'Man',sport:'Veld',day:'Zaterdag',competitions:[]});

test('hero team cards use real destinations, including Walking Football without a data connection',()=>{
 assert.equal(heroTeamHref('walking',[]),'/clubmuur/teams/walking-football');
 const first=makeTeam('218382:-1','Duindorp sv 1');
 assert.equal(heroTeamHref('1',[first],first),'/clubmuur/teams/218382%3A-1');
 assert.equal(heroTeamHref(first.id,[first]),'/clubmuur/teams/218382%3A-1');
 const youth=makeTeam('999:-1','Duindorp S.V. JO15-1');
 assert.equal(heroTeamHref('jo15',[youth]),'/clubmuur/teams/999%3A-1');
});

test('unavailable or deleted CMS team references still open the team directory',()=>{
 assert.equal(heroTeamHref('1',[]),'/clubmuur/teams');
 assert.equal(heroTeamHref('removed-team',[]),'/clubmuur/teams');
 assert.equal(heroTeamHref('mo17',[makeTeam('999:-1','Duindorp sv JO15-1')]),'/clubmuur/teams');
});

test('moved club sections keep custom navigation labels and order',()=>{
 const custom=structuredClone(defaultClubNavigation);
 custom[1].children=[{id:'waarden-custom',label:'Onze afspraken',href:'/clubmuur/club#clubwaarden'},{id:'route-custom',label:'Kom langs',href:'/clubmuur/club#bezoek'}];
 const original=structuredClone(custom);
 const migrated=migrateClubNavigation(custom);
 assert.ok(validClubNavigation(migrated));
 assert.deepEqual(migrated[1].children,[{id:'waarden-custom',label:'Onze afspraken',href:'/clubmuur/club/clubwaarden'},{id:'route-custom',label:'Kom langs',href:'/clubmuur/club/accommodatie'}]);
 assert.deepEqual(custom,original,'migration must not mutate saved settings');
 assert.deepEqual(migrateClubNavigation(defaultClubNavigation),defaultClubNavigation);
});

test('migration never turns malformed or unsafe navigation into approved links',()=>{
 for(const invalid of [null,{},[null],['bad']])assert.equal(validClubNavigation(migrateClubNavigation(invalid)),false);
 const custom=structuredClone(defaultClubNavigation);
 custom[1].children=[{id:'unsafe',label:'Unsafe',href:'javascript:alert(1)'}];
 assert.equal(validClubNavigation(migrateClubNavigation(custom)),false);
});

test('combined news menus gain a distinct stories link without losing custom links or order',()=>{
 const old=structuredClone(defaultClubNavigation);
 const media=old.find(item=>item.id==='nieuws')!;
 media.children=media.children!.filter(link=>link.href!=='/clubmuur/verhalen');
 media.children![0].label='Nieuws & wedstrijdverhalen';
 media.children!.push({id:'custom-youth',label:'Van onze jeugd',href:'/clubmuur/nieuws?categorie=Jeugd'});
 const before=structuredClone(old);
 const migrated=migrateClubNavigation(old);
 assert.ok(validClubNavigation(migrated));
 const children=migrated.find(item=>item.id==='nieuws')!.children!;
 assert.deepEqual(children.map(item=>item.label),['Nieuws & actualiteit','Verhalen & columns','Fotomuur','Nieuwsbrief','Van onze jeugd']);
 assert.deepEqual(old,before,'saved menus are not mutated');
 assert.deepEqual(migrateClubNavigation(migrated),migrated,'migration is idempotent');
 const intentionallyRemoved=structuredClone(migrated);
 intentionallyRemoved.find(item=>item.id==='nieuws')!.children=children.filter(item=>item.href!=='/clubmuur/verhalen');
 assert.deepEqual(migrateClubNavigation(intentionallyRemoved),intentionallyRemoved,'a saved choice to remove the stories link is respected');
});

test('custom editorial labels and already linked stories remain intact',()=>{
 const custom=structuredClone(defaultClubNavigation);
 custom.find(item=>item.id==='nieuws')!.children![0].label='Onze actualiteiten';
 assert.deepEqual(migrateClubNavigation(custom),custom);
 const old=structuredClone(defaultClubNavigation);
 old.find(item=>item.id==='nieuws')!.children![0].label='Nieuws & verhalen';
 const migrated=migrateClubNavigation(old);
 assert.ok(validClubNavigation(migrated));
 assert.equal(migrated.flatMap(item=>item.children||[]).filter(item=>item.href==='/clubmuur/verhalen').length,1);
});

test('a full legacy menu keeps all twelve links and can add its stories destination safely',()=>{
 const old=structuredClone(defaultClubNavigation);
 const media=old.find(item=>item.id==='nieuws')!;
 media.children=Array.from({length:12},(_,index)=>({id:index===0?'nieuws-alle':`custom-${index}`,label:index===0?'Nieuws & verhalen':`Clubselectie ${index}`,href:index===0?'/clubmuur/nieuws':`/clubmuur/nieuws?selectie=${index}`}));
 const migrated=migrateClubNavigation(old);
 assert.ok(validClubNavigation(migrated));
 assert.equal(migrated.find(item=>item.id==='nieuws')!.children!.length,13);
 assert.equal(migrated.find(item=>item.id==='nieuws')!.children!.at(-1)!.id,'custom-11');
});

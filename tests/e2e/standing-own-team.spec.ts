import {test,expect} from '@playwright/test';
import {normalizeSportlink,withStandingOwnership} from '../../lib/sportlink-normalize';

// Sportlink standings omit teamcode; a league match supplies the same verified
// identity. Exercise the adapter output rather than manually setting own=true.
function standingsFixture(){
 const ownCode='19001',club='FIXTURE';
 const team={teamcode:ownCode,lokaleteamcode:-1,teamnaam:'Duindorp SV 1',poulecode:190123,competitiesoort:'regulier',klassepoule:'Fictieve testpoule',geslacht:'man'};
 const game={wedstrijdcode:'19091',wedstrijddatum:'2026-10-24T14:30:00+0200',thuisteamid:ownCode,thuisteam:team.teamnaam,thuisteamclubrelatiecode:club,uitteamid:'19002',uitteam:'Testtegenstander 1',uitteamclubrelatiecode:'OTHER',status:'Te spelen'};
 return normalizeSportlink({verifiedClubCode:club,teams:[team],standings:Array.from({length:14},(_,index)=>({positie:index+1,teamnaam:index===6?team.teamnaam:`Testtegenstander ${index+1}`,clubrelatiecode:index===6?club:'OTHER',gespeeldewedstrijden:4,gewonnen:2,gelijk:1,verloren:1,doelpuntenvoor:8,doelpuntentegen:5,doelsaldo:3,punten:7})),leagueFixtures:[game],leagueResults:[],clubFixtures:[],clubResults:[]},new Date('2026-10-22T12:00:00Z'));
}

for(const width of [1440,390]){
 test(`own team stays blue at both scroll edges while the other teams move (${width}px)`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.route('**/api/sportlink',route=>route.fulfill({json:standingsFixture()}));
  await page.route('https://sassets.knvb.nl/**',route=>route.abort());
  await page.goto('/');
  const card=page.locator('.cm-standings-card'),viewport=card.locator('.cm-standings-scroll');
  await card.scrollIntoViewIfNeeded();
  const own=card.locator('tbody tr[data-own=true]');
  await expect(own).toHaveCount(1);
  await expect(own.locator('th')).toHaveText('Duindorp SV 1');
  await expect(card.locator('tbody tr')).toHaveCount(14);
  await expect(card.locator('.cm-standing-context')).toContainText('#7');
  const cell=own.locator('th');
  await expect(cell).toHaveCSS('background-color','rgb(3, 67, 138)');
  await expect(cell).toHaveCSS('position','sticky');
  await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  const initial=await viewport.evaluate(element=>element.scrollTop);
  await page.mouse.move(0,0);
  await expect.poll(()=>viewport.evaluate((element,initial)=>Math.abs(element.scrollTop-initial),initial),{timeout:8000}).toBeGreaterThan(3);
  await card.getByRole('button',{name:'Automatisch scrollen van de stand pauzeren',exact:true}).click();
  const positions=[];
  for(const edge of ['bottom','top'] as const){
   const bounds=await viewport.evaluate((element,edge)=>{
    element.scrollTop=edge==='top'?element.scrollHeight:0;
    const box=element.getBoundingClientRect(),header=element.querySelector('thead')!.getBoundingClientRect();
    return {top:box.top,bottom:box.bottom,header:header.height};
   },edge);
   await expect.poll(async()=>{
    const box=await cell.boundingBox();
    if(!box)return Infinity;
    return Math.abs(edge==='top'?box.y-bounds.top-bounds.header:box.y+box.height-bounds.bottom);
   }).toBeLessThanOrEqual(2);
   await expect(cell).toHaveCSS('background-color','rgb(3, 67, 138)');
   positions.push(await card.locator('tbody tr').first().locator('th').evaluate(element=>element.getBoundingClientRect().top));
  }
  expect(Math.abs(positions[0]-positions[1])).toBeGreaterThan(100);
  await card.getByRole('button',{name:'Centreer de stand rond Duindorp'}).click();
  await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await expect(own).toHaveCount(1);
 });
}

test('retained cached standings regain their own-team marker without fetching new provider data',async({page})=>{
 const snapshot={...standingsFixture(),clubCode:'FIXTURE',stale:true,warning:'Laatst opgeslagen gegevens'};
 snapshot.standings.forEach(row=>row.team.own=false);
 await page.route('**/api/sportlink',route=>route.fulfill({json:withStandingOwnership(snapshot)}));
 await page.route('https://sassets.knvb.nl/**',route=>route.abort());
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const own=page.locator('.cm-standings-table tbody tr[data-own=true]');
 await expect(own).toHaveCount(1);
 await expect(own.locator('th')).toHaveCSS('background-color','rgb(3, 67, 138)');
 await expect(page.locator('.cm-competition-notice')).toHaveText('Laatst opgeslagen gegevens');
});

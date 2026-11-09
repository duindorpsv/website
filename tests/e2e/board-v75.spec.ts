import {test,expect,type Page,type Locator} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {sqlClient,closeDb} from '../../db';
import {createBoardBrowserFixture} from '../helpers/board-browser-fixtures';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {loginWithEmailCode} from './login-fixture';

assertLocalSupabaseTests();
let fixture:Awaited<ReturnType<typeof createBoardBrowserFixture>>;
const widths=[320,390,524,768,1024,1440];
test.beforeAll(async()=>{fixture=await createBoardBrowserFixture();await mkdir('.runtime/screenshots/bestuur-v75',{recursive:true});});
test.beforeEach(async()=>{await fixture.reset();});
test.afterAll(closeDb);
async function open(page:Page,role:keyof typeof fixture.accounts){
 page.setDefaultTimeout(15000);
 await loginWithEmailCode(page,fixture.accounts[role].email);await page.goto('/beheer#bestuur');
 await expect(page.locator('.bp-nav')).toBeVisible({timeout:30000});
 return page.locator('.bp-workspace');
}
async function saved(page:Page,action:()=>Promise<unknown>){
 const response=page.waitForResponse(r=>r.url().endsWith('/api/cms/board')&&r.request().method()==='POST');
 await action();const result=await response;expect(result.status(),await result.text()).toBe(200);
 await expect(page.locator('.bp-workspace')).toHaveAttribute('aria-busy','false');
}
async function fits(page:Page,root:Locator){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 expect(await root.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
}
async function screenshot(page:Page,label:string){await page.screenshot({path:'.runtime/screenshots/bestuur-v75/'+label+'.png',fullPage:true});}

test('v75: separate secretary and chair sessions transfer and correct the agenda at 390px',async({page,browser})=>{
 test.setTimeout(180000);await page.setViewportSize({width:390,height:844});
 const board=await open(page,'secretary');await expect(board.getByRole('heading',{name:'Secretarisoverzicht',exact:true})).toBeVisible();await screenshot(page,'secretaris-390');
 await board.getByRole('button',{name:/Agenda voorbereiden/}).click();
 const picker=board.getByRole('combobox',{name:'Kies een agendapunt',exact:true});await expect(picker).toBeVisible();
 await board.getByRole('button',{name:'Ga naar dit punt',exact:true}).click();await expect(board.getByRole('region',{name:'Agendapunt Opening en vaststelling agenda',exact:true})).toBeFocused();
 await saved(page,()=>board.getByRole('button',{name:'Agenda indienen bij voorzitter',exact:true}).click());
 await board.locator('.bp-nav').getByRole('button',{name:'Overzicht',exact:true}).click();await expect(board.getByText('1 vergadering bij de voorzitter',{exact:true})).toBeVisible();
 const chairContext=await browser.newContext({baseURL:process.env.APP_BASE_URL,viewport:{width:390,height:844}}),chair=await chairContext.newPage();
 try{
  const chairBoard=await open(chair,'chair');await expect(chairBoard.getByRole('heading',{name:'Voorzittersoverzicht',exact:true})).toBeVisible();await screenshot(chair,'voorzitter-390-review');
  await chairBoard.getByRole('button',{name:/Agenda beoordelen/}).click();await chairBoard.getByRole('button',{name:'Terug naar secretaris',exact:true}).click();
  await chairBoard.getByLabel('Welke aanpassing is nodig?',{exact:true}).fill('Controleer de volgorde en dien de agenda opnieuw in.');
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Aanpassing vragen',exact:true}).click());
  await page.reload();await board.getByRole('button',{name:/Agenda voorbereiden/}).click();await expect(board.getByText('Agenda versie 2',{exact:false})).toBeVisible();
  await saved(page,()=>board.getByRole('button',{name:'Agenda indienen bij voorzitter',exact:true}).click());
  await chair.reload();await chairBoard.getByRole('button',{name:/Agenda beoordelen/}).click();await saved(chair,()=>chairBoard.getByRole('button',{name:'Agenda goedkeuren',exact:true}).click());
  const result=await chair.request.get('/api/cms/board').then(r=>r.json());expect(result.board.meetings[0].status).toBe('approved');expect(result.board.meetings[0].agendaVersion).toBe(2);
  await screenshot(chair,'agenda-goedgekeurd-390');await fits(chair,chairBoard);
 }finally{await chairContext.close();}
});

test('v75: seven sections and agenda adapt to actual CMS workspace at all requested widths',async({page})=>{
 test.setTimeout(240000);const board=await open(page,'secretary');
 for(const width of widths){
  await page.setViewportSize({width,height:900});await board.locator('.bp-nav').getByRole('button',{name:'Overzicht',exact:true}).click();await fits(page,board);await screenshot(page,'secretaris-'+width);
  for(const tab of ['Inbreng & voorstellen','Vergaderingen','Besluiten','Acties','ALV','Dossiers & portefeuilles']){
   await board.locator('.bp-nav').getByRole('button',{name:tab,exact:true}).click();await fits(page,board);
   if(width===320)await screenshot(page,tab.replaceAll(/[^a-zA-Z]/g,'-')+'-320');
  }
  await board.locator('.bp-nav').getByRole('button',{name:'Vergaderingen',exact:true}).click();await board.getByRole('button',{name:/Bestuursvergadering november/}).click();
  const available=await board.evaluate(element=>element.clientWidth),picker=board.getByRole('combobox',{name:'Kies een agendapunt',exact:true});
  if(available<=720){await expect(picker).toBeVisible();await expect(board.locator('.bp-meeting-agenda-desktop')).toBeHidden();}
  else{await expect(picker).toBeHidden();await expect(board.locator('.bp-meeting-agenda-desktop')).toBeVisible();}
  await fits(page,board);await screenshot(page,'agenda-'+width);
 }
 await page.setViewportSize({width:1440,height:900});await expect(page.getByRole('complementary').first()).toBeVisible();
});

test('v75: committee scope, assigned action and direct endpoint authorization',async({page})=>{
 test.setTimeout(120000);const board=await open(page,'committee');
 await expect(board.locator('.bp-nav button')).toHaveCount(3);await board.locator('.bp-nav').getByRole('button',{name:'Onze acties',exact:true}).click();
 await board.getByRole('button',{name:/Maak een eerste rooster voor de ontvangst/}).click();
 await saved(page,()=>board.getByRole('button',{name:'Ik pak dit op',exact:true}).click());
 await screenshot(page,'liv-eigen-actie');
 const payload=await page.request.get('/api/cms/board').then(r=>r.json());expect(payload.board.meetings).toHaveLength(0);expect(payload.board.alvs).toHaveLength(0);expect(payload.board.decisions).toHaveLength(0);
 expect(payload.board.actions.every((action:any)=>action.ownerId===fixture.accounts.committee.personId||action.committeeId===fixture.committeeId)).toBe(true);
 const forbidden=await page.request.get('/api/cms/board/pdf?kind=minutes&id='+fixture.board.meetings[0].id);expect(forbidden.status()).toBe(403);
 const anonymous=await page.context().browser()!.newContext();try{expect((await anonymous.request.get(new URL('/api/cms/board',process.env.APP_BASE_URL).href)).status()).toBe(401);}finally{await anonymous.close();}
 await page.context().clearCookies();await loginWithEmailCode(page,fixture.accounts.outsider.email);expect((await page.request.get('/api/cms/board')).status()).toBe(403);
});

test('v75: validation keeps the form, and a lost response retries the same operation without duplicating a meeting',async({page})=>{
 test.setTimeout(150000);const board=await open(page,'secretary');
 await board.getByRole('button',{name:'Vergadering plannen',exact:true}).click();
 const title='Fictieve vergadering met veilige herhaling '+crypto.randomUUID();
 await board.getByLabel('Naam van de vergadering',{exact:true}).fill(title);
 let validation=true,lost=false;const requests:unknown[]=[];
 await page.route('**/api/cms/board',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  if(validation){validation=false;return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({message:'Controleer de ingevulde vergadergegevens.'})});}
  requests.push(route.request().postDataJSON());
  if(!lost){lost=true;const result=await route.fetch();expect(result.status(),await result.text()).toBe(200);return route.abort('failed');}
  return route.continue();
 });
 await board.getByRole('button',{name:'Conceptagenda openen',exact:true}).click();
 await expect(board.getByRole('alert')).toContainText('Controleer de ingevulde vergadergegevens.');
 await expect(board.getByLabel('Naam van de vergadering',{exact:true})).toHaveValue(title);
 await board.getByRole('button',{name:'Conceptagenda openen',exact:true}).click();
 await expect(board.getByRole('button',{name:'Dezelfde wijziging opnieuw proberen',exact:true})).toBeVisible();
 await expect(board.getByLabel('Naam van de vergadering',{exact:true})).toHaveValue(title);
 await board.getByRole('button',{name:'Dezelfde wijziging opnieuw proberen',exact:true}).click();
 await expect(board.getByRole('heading',{name:title,exact:true})).toBeVisible();
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
 const data=await page.request.get('/api/cms/board').then(r=>r.json());expect(data.board.meetings.filter((meeting:any)=>meeting.title===title)).toHaveLength(1);
 await page.unroute('**/api/cms/board');
});

test('v75: long content, date-based decisions and 200 percent zoom remain usable inside Clubbeheer',async({page})=>{
 test.setTimeout(150000);
 const long=structuredClone(fixture.board),title='Lang bestuursvoorstel over ontvangst, planning en de gezamenlijke vrijwilligersactiviteiten '.repeat(2).slice(0,159);
 long.meetings[0].title=title;long.meetings[0].points[0].title=title;
 long.proposals[0].title=title;long.actions[0].title=title;long.dossiers[0].title=title;
 await fixture.reset(long);await page.setViewportSize({width:390,height:844});const board=await open(page,'secretary');
 await board.locator('.bp-nav').getByRole('button',{name:'Vergaderingen',exact:true}).click();
 await board.getByRole('button',{name:new RegExp('^'+title)}).click();await board.getByText('Mijn privénotitie',{exact:true}).click();
 await board.getByLabel('Persoonlijke aantekening',{exact:true}).fill('Een lange eigen aantekening '.repeat(40));await fits(page,board);
 const undersized=await board.locator('button:visible,input:visible:not([type=checkbox]):not([type=radio]),select:visible').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().height<43.5).map(element=>({tag:element.tagName,text:element.textContent?.slice(0,80),height:element.getBoundingClientRect().height})));
 expect(undersized).toEqual([]);await screenshot(page,'lange-inhoud-390');
 await board.locator('.bp-nav').getByRole('button',{name:'Besluiten',exact:true}).click();
 await board.getByLabel('Peildatum',{exact:true}).fill('2026-10-31');await expect(board.locator('.bp-list-row').filter({hasText:'BES-2026-0001'})).toBeVisible();
 await board.getByLabel('Peildatum',{exact:true}).fill('2026-11-01');await expect(board.locator('.bp-list-row').filter({hasText:'BES-2026-0001'})).toHaveCount(0);await expect(board.locator('.bp-list-row').filter({hasText:'BES-2026-0002'})).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.body.style.zoom='2';});
 for(const tab of ['Overzicht','Inbreng & voorstellen','Vergaderingen','Besluiten','Acties','ALV','Dossiers & portefeuilles']){await board.locator('.bp-nav').getByRole('button',{name:tab,exact:true}).click();await fits(page,board);}
 await screenshot(page,'bestuur-200-procent');
});

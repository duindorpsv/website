import {test,expect,type Page,type Locator} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {closeDb} from '../../db';
import {createBoardBrowserFixture} from '../helpers/board-browser-fixtures';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {loginWithEmailCode} from './login-fixture';

assertLocalSupabaseTests();
const evidence='.runtime/screenshots/bestuur-v75';
let fixture:Awaited<ReturnType<typeof createBoardBrowserFixture>>;
test.beforeAll(async()=>{
 fixture=await createBoardBrowserFixture();await mkdir(evidence,{recursive:true});
 const parser=spawnSync('pdftotext',['-v']);
 expect(parser.error,'The document acceptance requires the real pdftotext parser (poppler-utils).').toBeUndefined();
 expect(parser.status).toBe(0);
});
test.beforeEach(async()=>{await fixture.reset();});
test.afterAll(closeDb);

async function open(page:Page,role:'secretary'|'chair'){
 page.setDefaultTimeout(15000);
 await loginWithEmailCode(page,fixture.accounts[role].email);await page.goto('/beheer#bestuur');
 await expect(page.locator('.bp-nav')).toBeVisible();return page.locator('.bp-workspace');
}
async function tab(board:Locator,name:string){await board.locator('.bp-nav').getByRole('button',{name,exact:true}).click();}
async function meeting(board:Locator){
 await tab(board,'Vergaderingen');await board.getByRole('button',{name:/Bestuursvergadering november/}).click();
}
async function saved(page:Page,action:()=>Promise<unknown>){
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/cms/board'&&response.request().method()==='POST');
 await action();const response=await pending;expect(response.status(),await response.text()).toBe(200);
 const data=await response.json();await expect(page.locator('.bp-workspace')).toHaveAttribute('aria-busy','false');return data;
}
async function state(page:Page){const response=await page.request.get('/api/cms/board');expect(response.status()).toBe(200);return response.json();}
async function capture(page:Page,name:string){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true});}
async function pdf(page:Page,button:Locator,name:string){
 const pending=page.waitForEvent('download');await button.click();const download=await pending;
 const path=`${evidence}/${name}.pdf`;await download.saveAs(path);const bytes=await readFile(path);
 expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
 const result=spawnSync('pdftotext',['-layout','-','-'],{input:bytes,maxBuffer:8*1024*1024});
 expect(result.error,'Archived document must be readable by a real PDF text parser.').toBeUndefined();expect(result.status,result.stderr?.toString()).toBe(0);
 const text=result.stdout.toString().replace(/\s+/g,' ').trim();expect(text.length).toBeGreaterThan(50);return {text,bytes};
}

test('v75 documents: private notes stay private while approved minutes and their PDF retain the submitted snapshot',async({page,browser})=>{
 test.setTimeout(300000);
 const run=crypto.randomUUID().slice(0,8),privateNote=`PRIVATE-V75-ONLY-IRIS-${run}`,publicNote=`V75 openbare bespreeknotitie ${run}`,summary=`V75 algemeen verslag ${run}`,outcome=`V75 uitvoeringsafspraak ${run}`,actionTitle=`V75 opvolging origineel ${run}`,laterProgress=`V75 latere voortgang ${run}`;
 const secretary=await open(page,'secretary');await meeting(secretary);
 await saved(page,()=>secretary.getByRole('button',{name:'Agenda indienen bij voorzitter',exact:true}).click());
 const chairContext=await browser.newContext({baseURL:process.env.APP_BASE_URL,viewport:{width:1440,height:960}}),chair=await chairContext.newPage();
 try{
  const chairBoard=await open(chair,'chair');await meeting(chairBoard);
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Agenda goedkeuren',exact:true}).click());
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Agenda vaststellen en starten',exact:true}).click());
  await page.reload();await meeting(secretary);
  await secretary.getByRole('textbox',{name:'Wat is besproken?',exact:true}).fill(publicNote);
  await saved(page,()=>secretary.getByRole('button',{name:'Notitie opslaan',exact:true}).click());
  await secretary.getByText('Mijn privénotitie',{exact:true}).click();
  await secretary.getByRole('textbox',{name:'Persoonlijke aantekening',exact:true}).fill(privateNote);
  await saved(page,()=>secretary.getByRole('button',{name:'Privénotitie opslaan',exact:true}).click());
  const own=await state(page);expect(JSON.stringify(own)).toContain(privateNote);
  const other=await state(chair);expect(JSON.stringify(other)).not.toContain(privateNote);
  await chair.reload();await meeting(chairBoard);expect(await chair.content()).not.toContain(privateNote);
  await secretary.getByRole('button',{name:'Uitwerken',exact:true}).click();
  await secretary.getByRole('textbox',{name:'Wat is afgesproken?',exact:true}).fill(outcome);
  await secretary.getByRole('combobox',{name:'Actiehouder',exact:true}).selectOption(fixture.accounts.secretary.personId);
  await secretary.getByLabel('Deadline',{exact:true}).fill('2026-11-25');
  await secretary.getByLabel('Titel van de uitvoeringsactie',{exact:true}).fill(actionTitle);
  await saved(page,()=>secretary.getByRole('button',{name:'Vastleggen en verder',exact:true}).click());
  await chair.reload();await meeting(chairBoard);
  await chairBoard.getByRole('button',{name:'Besluiten & acties',exact:true}).click();
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Vergadering afsluiten',exact:true}).click());
  await page.reload();await meeting(secretary);
  await secretary.getByRole('textbox',{name:'Algemeen verslag',exact:true}).fill(summary);
  await saved(page,()=>secretary.getByRole('button',{name:'Akkoord secretaris en indienen',exact:true}).click());
  await chair.reload();await meeting(chairBoard);
  await chairBoard.getByRole('button',{name:'Correctie vragen',exact:true}).click();
  await chairBoard.getByRole('textbox',{name:'Welke correctie is nodig?',exact:true}).fill('Vul de verduidelijking bij het algemene verslag aan.');
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Retour naar secretaris',exact:true}).click());
  await page.reload();await meeting(secretary);
  await expect(secretary.getByText('Correctie gevraagd',{exact:true})).toBeVisible();
  const correctedSummary=summary+' gecorrigeerd';
  await secretary.getByRole('textbox',{name:'Algemeen verslag',exact:true}).fill(correctedSummary);
  await saved(page,()=>secretary.getByRole('button',{name:'Akkoord secretaris en indienen',exact:true}).click());
  await chair.reload();await meeting(chairBoard);
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Notulen goedkeuren',exact:true}).click());
  await expect(chairBoard.getByRole('heading',{name:'Goedgekeurde notulen',exact:true})).toBeVisible();
  expect(await chair.content()).not.toContain(privateNote);await capture(chair,'documenten-notulen-goedgekeurd');
  const approved=await state(chair),stored=approved.board.meetings.find((value:any)=>value.id===fixture.board.meetings[0].id);
  expect(stored.minutesStatus).toBe('approved');expect(stored.minutesVersion).toBe(2);expect(stored.minutesSnapshot).toBeTruthy();expect(stored.minutesHistory).toHaveLength(2);
  const snapshot=structuredClone(stored.minutesSnapshot);
  const original=await pdf(chair,chairBoard.getByRole('button',{name:'Notulen als PDF',exact:true}),'documenten-notulen-goedgekeurd');
  for(const text of [publicNote,correctedSummary,outcome,actionTitle])expect(original.text).toContain(text);
  expect(original.text).not.toContain(privateNote);
  await page.reload();await tab(secretary,'Acties');await secretary.getByRole('button',{name:new RegExp(actionTitle)}).click();
  await saved(page,()=>secretary.getByRole('button',{name:'Ik pak dit op',exact:true}).click());
  await secretary.getByRole('button',{name:'Voortgang bijwerken',exact:true}).click();
  await secretary.getByRole('combobox',{name:'Status',exact:true}).selectOption('progress');
  await secretary.getByRole('textbox',{name:'Voortgang',exact:true}).fill(laterProgress);
  await saved(page,()=>secretary.getByRole('button',{name:'Voortgang opslaan',exact:true}).click());
  const after=await state(chair),unchanged=after.board.meetings.find((value:any)=>value.id===stored.id);
  expect(after.board.actions.find((value:any)=>value.title===actionTitle).progress).toBe(laterProgress);
  expect(unchanged.minutesSnapshot).toEqual(snapshot);
  await chair.reload();await meeting(chairBoard);
  const repeated=await pdf(chair,chairBoard.getByRole('button',{name:'Notulen als PDF',exact:true}),'documenten-notulen-na-voortgang');
  expect(repeated.text).toBe(original.text);expect(repeated.text).not.toContain(laterProgress);expect(repeated.text).not.toContain(privateNote);
  await tab(chairBoard,'Besluiten');
  const previousDecision=fixture.board.decisions.find(value=>value.title==='Sleuteloverdracht clubhuis'&&!value.replacesId)!,replacementDecision=fixture.board.decisions.find(value=>value.replacesId===previousDecision.id)!;
  const referenceDate=chairBoard.getByLabel('Peildatum',{exact:true});await referenceDate.fill('2026-11-09');
  await chairBoard.locator('button.bp-list-row').filter({hasText:replacementDecision.code}).click();
  await chairBoard.getByRole('button',{name:'Vervangt '+previousDecision.code,exact:true}).click();
  await expect(referenceDate).toHaveValue('2026-11-09');await expect(chairBoard.getByRole('button',{name:'Archief',exact:true})).toHaveAttribute('aria-pressed','true');
  await chairBoard.getByRole('button',{name:'Vervangen door '+replacementDecision.code,exact:true}).click();
  await expect(referenceDate).toHaveValue('2026-11-09');
  await referenceDate.fill('2026-08-15');await chairBoard.getByRole('button',{name:'Geldt vandaag',exact:true}).click();
  await expect(chairBoard.locator('button.bp-list-row').filter({hasText:previousDecision.code})).toBeVisible();
  await expect(chairBoard.locator('button.bp-list-row').filter({hasText:replacementDecision.code})).toHaveCount(0);
  await chairBoard.getByRole('button',{name:'Binnenkort',exact:true}).click();await chairBoard.locator('button.bp-list-row').filter({hasText:replacementDecision.code}).click();
  await chairBoard.getByRole('button',{name:'Vervangt '+previousDecision.code,exact:true}).click();
  await expect(referenceDate).toHaveValue('2026-08-15');await expect(chairBoard.getByRole('button',{name:'Geldt vandaag',exact:true})).toHaveAttribute('aria-pressed','true');
  await capture(chair,'documenten-besluiten-peildatum');
 }finally{await chairContext.close();}
});

test('v75 documents: ALV preparation, released package, room display and two-person amendment and final motion use fixed texts',async({page,browser})=>{
 test.setTimeout(360000);
 const run=crypto.randomUUID().slice(0,8),initial=`V75 oorspronkelijke stemtekst ${run}`,unreleased=`V75 niet vrijgegeven ledenstuk ${run}`,amendment=`V75 amendement exacte tekst ${run}`,motion=`V75 gewijzigde definitieve stemtekst ${run}`,report=`V75 algemeen ALV verslag ${run}`,promise=`V75 toezegging vervolg ${run}`,rejectedQuestion=`V75 verworpen voorstel ${run}`;
 const decisionPoint=fixture.board.alvItems.find(value=>value.kind==='decision')!,infoPoint=fixture.board.alvItems.find(value=>value.kind==='info')!;
 const secretary=await open(page,'secretary');await tab(secretary,'ALV');
 await secretary.locator('article.bp-alv-card').filter({has:page.getByRole('heading',{name:decisionPoint.title,exact:true})}).getByRole('button',{name:'Bewerk voorbereiding',exact:true}).click();
 const form=secretary.locator('form.bp-alv-card');
 await form.getByRole('textbox',{name:'Ledenstuk of bijlagelink',exact:true}).fill(unreleased);
 await form.getByRole('textbox',{name:'Exacte stemtekst',exact:true}).fill(initial);
 await form.getByRole('checkbox',{name:'Stukken gecontroleerd of geen stukken nodig',exact:true}).check();
 await form.getByRole('checkbox',{name:'Exacte stemtekst gecontroleerd',exact:true}).check();
 await expect(form.getByRole('checkbox',{name:'Deel dit stuk in het ledenpakket',exact:true})).not.toBeChecked();
 await saved(page,()=>form.getByRole('button',{name:'Zet klaar voor agenda',exact:true}).click());
 await secretary.locator('article.bp-alv-card').filter({has:page.getByRole('heading',{name:infoPoint.title,exact:true})}).getByRole('button',{name:'Bewerk voorbereiding',exact:true}).click();
 await form.getByRole('combobox',{name:'Doel',exact:true}).selectOption('decision');
 await form.getByRole('textbox',{name:'Exacte stemtekst',exact:true}).fill(rejectedQuestion);
 await form.getByRole('checkbox',{name:'Exacte stemtekst gecontroleerd',exact:true}).check();
 await saved(page,()=>form.getByRole('button',{name:'Zet klaar voor agenda',exact:true}).click());
 await saved(page,()=>secretary.getByRole('button',{name:'Stel conceptagenda op',exact:true}).click());
 await expect(secretary.getByRole('button',{name:'Agenda vaststellen',exact:true})).toHaveCount(0);
 const chairContext=await browser.newContext({baseURL:process.env.APP_BASE_URL,viewport:{width:1440,height:960}}),chair=await chairContext.newPage();
 try{
  const chairBoard=await open(chair,'chair');await tab(chairBoard,'ALV');
  const pane=async(board:Locator,name:string)=>board.getByRole('navigation',{name:'ALV-onderdelen',exact:true}).getByRole('button',{name,exact:true}).click();
  await pane(chairBoard,'Agenda & draaiboek');
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Agenda vaststellen',exact:true}).click());
  const packagePdf=await pdf(chair,chairBoard.getByRole('button',{name:'Ledenpakket',exact:true}),'documenten-alv-ledenpakket');
  expect(packagePdf.text).toContain(initial);expect(packagePdf.text).toContain(infoPoint.document);expect(packagePdf.text).not.toContain(unreleased);
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Open de vergadering',exact:true}).click());
  const decisionCard=chairBoard.locator('li.bp-alv-card').filter({has:chair.getByRole('heading',{name:new RegExp(decisionPoint.title)})});
  const popupEvent=chair.waitForEvent('popup');await decisionCard.getByRole('button',{name:'Zaalbeeld',exact:true}).click();const popup=await popupEvent;
  await expect(popup.locator('body')).toContainText(initial);await expect(popup.locator('body')).not.toContainText(unreleased);await capture(popup,'documenten-alv-zaalbeeld');await popup.close();
  await page.reload();await tab(secretary,'ALV');await pane(secretary,'Stemmingen');
  async function enterRound(kind:'Amendement'|'Gewijzigd voorstel'|'Oorspronkelijk voorstel',text:string,itemId=decisionPoint.id,outcome:'adopted'|'rejected'='adopted'){
   const voteForm=secretary.locator('form.bp-alv-card').filter({has:page.getByRole('heading',{name:'Nieuwe telling invoeren',exact:true})});
   await voteForm.getByRole('combobox',{name:'Beslispunt',exact:true}).selectOption(itemId);
   await voteForm.getByRole('combobox',{name:'Waarover is gestemd?',exact:true}).selectOption(kind==='Amendement'?'amendment':'motion');
   if(kind!=='Oorspronkelijk voorstel')await voteForm.getByRole('textbox',{name:kind==='Amendement'?'Exacte tekst van het amendement':'Exacte tekst van het gewijzigde voorstel',exact:true}).fill(text);
   else await expect(voteForm.locator('.bp-alv-note')).toHaveText(text);
   for(const [label,value]of Object.entries({Voor:outcome==='adopted'?'20':'4',Tegen:outcome==='adopted'?'4':'20',Onthouding:'1',Ongeldig:'0'}))await voteForm.getByRole('spinbutton',{name:label,exact:true}).fill(value);
   await voteForm.getByRole('combobox',{name:'Vastgestelde uitkomst voor deze telling',exact:false}).selectOption(outcome);
   await saved(page,()=>voteForm.getByRole('button',{name:'Bied telling aan voor controle',exact:true}).click());
  }
  await enterRound('Amendement',amendment);await expect(secretary.getByRole('button',{name:'Bevestig telling',exact:true})).toHaveCount(0);
  await chair.reload();await tab(chairBoard,'ALV');await pane(chairBoard,'Verslag');
  const unconfirmed=await pdf(chair,chairBoard.getByRole('button',{name:'Download conceptnotulen',exact:true}),'documenten-alv-onbevestigd');
  expect(unconfirmed.text).not.toContain(amendment);
  await pane(chairBoard,'Stemmingen');await saved(chair,()=>chairBoard.getByRole('button',{name:'Bevestig telling',exact:true}).click());
  expect((await state(chair)).board.decisions.filter((value:any)=>value.alvItemId===decisionPoint.id)).toHaveLength(0);
  await page.reload();await tab(secretary,'ALV');await pane(secretary,'Stemmingen');await enterRound('Gewijzigd voorstel',motion);
  await chair.reload();await tab(chairBoard,'ALV');await pane(chairBoard,'Verslag');
  const mixed=await pdf(chair,chairBoard.getByRole('button',{name:'Download conceptnotulen',exact:true}),'documenten-alv-een-bevestigd');
  expect(mixed.text).toContain(amendment);expect(mixed.text).not.toContain(motion);
  await pane(chairBoard,'Stemmingen');await saved(chair,()=>chairBoard.getByRole('button',{name:'Bevestig telling',exact:true}).click());
  const result=await state(chair),decisions=result.board.decisions.filter((value:any)=>value.source==='alv'&&value.alvItemId===decisionPoint.id);
  expect(decisions).toHaveLength(1);expect(decisions[0].text).toBe(motion);expect(decisions[0].outcome).toBe('adopted');
  const cycle=result.board.alvs.find((value:any)=>value.id===fixture.board.alvs[0].id);expect(cycle.votes).toHaveLength(2);expect(cycle.votes.every((value:any)=>value.confirmedBy===fixture.accounts.chair.personId)).toBe(true);
  expect(cycle.agendaSnapshot.find((value:any)=>value.id===decisionPoint.id).question).toBe(initial);
  await page.reload();await tab(secretary,'ALV');await pane(secretary,'Stemmingen');
  await enterRound('Oorspronkelijk voorstel',rejectedQuestion,infoPoint.id,'rejected');
  await chair.reload();await tab(chairBoard,'ALV');await pane(chairBoard,'Stemmingen');
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Bevestig telling',exact:true}).click());
  const rejectedState=await state(chair),rejectedDecisions=rejectedState.board.decisions.filter((value:any)=>value.source==='alv'&&value.alvItemId===infoPoint.id);
  expect(rejectedDecisions).toHaveLength(1);expect(rejectedDecisions[0].text).toBe(rejectedQuestion);expect(rejectedDecisions[0].outcome).toBe('rejected');
  expect(rejectedState.board.decisions.filter((value:any)=>value.source==='alv'&&value.alvItemId===decisionPoint.id)).toHaveLength(1);
  await capture(chair,'documenten-alv-bevestigde-tellingen');
  await pane(chairBoard,'Agenda & draaiboek');
  const fixedPackage=await pdf(chair,chairBoard.getByRole('button',{name:'Ledenpakket',exact:true}),'documenten-alv-ledenpakket-na-telling');
  expect(fixedPackage.text).toBe(packagePdf.text);expect(fixedPackage.text).not.toContain(unreleased);
  await saved(chair,()=>chairBoard.getByRole('button',{name:'Rond ALV af',exact:true}).click());
  await page.reload();await tab(secretary,'ALV');await pane(secretary,'Verslag');
  await secretary.getByRole('textbox',{name:'Algemene verslagnotities',exact:true}).fill(report);
  await secretary.getByRole('textbox',{name:'Toezeggingen voor de volgende ALV',exact:false}).fill(promise);
  await saved(page,()=>secretary.getByRole('button',{name:'Bewaar verslag en toezeggingen',exact:true}).click());
  await chair.reload();await tab(chairBoard,'ALV');await pane(chairBoard,'Verslag');
  const finalPdf=await pdf(chair,chairBoard.getByRole('button',{name:'Download conceptnotulen',exact:true}),'documenten-alv-conceptnotulen');
  for(const text of [amendment,motion,rejectedQuestion,report,promise])expect(finalPdf.text).toContain(text);
  expect(finalPdf.text).not.toContain(unreleased);await capture(chair,'documenten-alv-verslag-afgerond');
 }finally{await chairContext.close();}
});

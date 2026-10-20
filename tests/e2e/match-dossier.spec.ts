import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {dossierFixture} from '../helpers/match-dossier-fixture';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {loginWithEmailCode} from './login-fixture';
import {sqlClient} from '../../db';
import {writeStoredMatches} from '../../lib/server/match-store';
import {readSportlinkSettings} from '../../lib/server/sportlink-config';
import {runOnce} from '../../lib/server/worker';
import {previewLocalDate} from '../../lib/cms/match-preview';

test('shared dossier supports first/reserve/youth/empty states, mobile layout, deep links and visible-only refresh',async({page})=>{
 test.setTimeout(90000);const fixture=dossierFixture();let payload=structuredClone(fixture.payload),requests=0;
 await page.clock.install({time:new Date('2026-10-21T10:00:00Z')});
 await page.route('**/api/sportlink',route=>route.fulfill({json:fixture.snapshot}));
 await page.route('**/api/sportlink/match?**',route=>{requests++;return route.fulfill({json:payload});});
 const open=async()=>{await page.goto(`/clubmuur/wedstrijden?wedstrijd=${payload.match.id}&team=19001:-1&poule=190123&seizoen=2026%2F2027`);await expect(page.getByRole('dialog')).toContainText('Onze kleuren. Jouw wedstrijd.');await expect(page.locator('.md-sync')).toContainText('Bijgewerkt');};
 await open();const dialog=page.getByRole('dialog');await expect(dialog.locator('.md-form-chips').first().locator('span')).toHaveCount(5);
 await dialog.getByRole('tab',{name:'Kleedkamer',exact:true}).click();await expect(dialog).toContainText('Samen gaan we voor de punten.');await expect(dialog).not.toContainText('Hoe bereiden we ons voor?');
 await dialog.getByRole('tab',{name:'Overzicht',exact:true}).click();
 const before=requests;await page.clock.fastForward(61000);await expect.poll(()=>requests).toBeGreaterThan(before);
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));const hidden=requests;await page.clock.fastForward(61000);expect(requests).toBe(hidden);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>requests).toBeGreaterThan(hidden);
 for(const width of [390,360]){
  await page.setViewportSize({width,height:844});const time=await dialog.locator('.sl-dialog-score>strong').evaluate(element=>({height:element.getBoundingClientRect().height,line:parseFloat(getComputedStyle(element).lineHeight),whiteSpace:getComputedStyle(element).whiteSpace}));expect(time.whiteSpace).toBe('nowrap');expect(time.height).toBeLessThan(time.line+2);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:`.runtime/screenshots/match-dossier-${width}.png`});
 }
 const share=new URL(await dialog.getByRole('link',{name:'Delen via WhatsApp'}).getAttribute('href')||'');expect(share.searchParams.get('text')).toContain('wedstrijd=19091');expect(share.searchParams.get('text')).toContain('seizoen=2026%2F2027');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(new URL(page.url()).searchParams.has('wedstrijd')).toBe(false);
 const opener=page.locator('.sl-fixture').first();await opener.click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(opener).toBeFocused();
 for(const kind of ['reserve','young','empty','played','cancelled'] as const){
  payload=structuredClone(fixture.payload);
  if(kind==='reserve'||kind==='young'){payload.firstTeamMatch=false;payload.preview=null as any;payload.match.home={...payload.match.home,id:'19009',name:kind==='young'?'Duindorp SV JO10-1':'Duindorp SV 2'};payload.comparisonMatches=payload.comparisonMatches.map(match=>({...match,home:payload.match.home}));}
  if(kind==='empty'){payload.preview=null as any;payload.headToHead=[];payload.comparisonMatches=[];payload.homeHeadCoach=null as any;payload.awayHeadCoach=null as any;for(const key of ['field','homeDressingRoom','awayDressingRoom','referee','venue','venueAddress'])payload.match[key as 'field']='';}
  if(kind==='played')payload.match=fixture.results[0];if(kind==='cancelled')payload.match.status='Afgelast';
  await open();if(['reserve','young','empty'].includes(kind))await expect(dialog.getByRole('tab',{name:/Laatste 5|Onderling/})).toHaveCount(0);
  if(['young','empty'].includes(kind))await expect(dialog.locator('.md-form-chips')).toHaveCount(0);
  if(['played','cancelled'].includes(kind)){await expect(dialog.locator('.md-countdown')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'In mijn agenda'})).toHaveCount(0);}
 }
});

test('CMS preview edits and scheduled snapshots use the real shared database and keep live text independent',async({page,context})=>{
 test.setTimeout(90000);assertLocalSupabaseTests();const sql=sqlClient(),fixture=dossierFixture(),owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8')),before=await sql`select * from sportlink_cache where cache_key='club-competition-v1'`,settings=(await readSportlinkSettings()).settings;
 const id='19'+String(Date.now()).slice(-9),recordId='match-preview-'+id;fixture.match.id=id;fixture.match.home.clubCode=settings.clubCode||'FIXTURE';fixture.snapshot.clubCode=fixture.match.home.clubCode;fixture.snapshot.nextMatch=fixture.match;fixture.snapshot.fixtures=[fixture.match];fixture.snapshot.nextRound.matches=[fixture.match];
 fixture.snapshot.updatedAt=new Date().toISOString();
 await sql`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values ('club-competition-v1',${JSON.stringify(fixture.snapshot)},${Date.now()},${Date.now()+3600000},0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at,refresh_after=0`;
 await writeStoredMatches([fixture.match],new Date().toISOString());
 try{
  await loginWithEmailCode(page,owner.email);await page.goto('/beheer#voorbeschouwingen');await page.locator('.cmp-match-list button').filter({hasText:fixture.match.away.name}).first().click();
  await page.getByRole('checkbox',{name:/Stem uit de kleedkamer inschakelen/}).check();await page.getByLabel('Spreker',{exact:true}).fill('Onze aanvoerder');await page.getByLabel('Rol',{exact:true}).fill('Aanvoerder');await page.getByLabel(/Wat staat er op het spel/).fill('Openbare eerste tekst.');
  await page.getByRole('button',{name:'Concept bewaren',exact:true}).click();await expect(page.locator('.dd-toast')).toContainText('concept bewaard');expect((await sql`select live from cms_records where id=${recordId}`)[0].live).toBeNull();
  await page.getByRole('button',{name:'Publiceren',exact:true}).click();await expect.poll(async()=> (await sql`select live->>'whatAtStake' as text from cms_records where id=${recordId}`)[0]?.text).toBe('Openbare eerste tekst.');
  await page.getByLabel(/Wat staat er op het spel/).fill('Geplande vervanging.');await page.locator('input[type=datetime-local]').fill(previewLocalDate(new Date(Date.now()+86400000).toISOString()));await page.getByRole('button',{name:'Deze versie inplannen',exact:true}).click();await expect(page.locator('.dd-toast')).toContainText('ingepland');
  await page.getByLabel(/Wat staat er op het spel/).fill('Later privéconcept.');await page.getByRole('button',{name:'Concept bewaren',exact:true}).click();await expect(page.locator('.dd-toast')).toContainText('concept bewaard');
  let response=await page.request.get(`/api/sportlink/match?id=${id}`);expect(response.status()).toBe(200);expect((await response.json()).preview.whatAtStake).toBe('Openbare eerste tekst.');
  await page.screenshot({path:'.runtime/screenshots/match-preview-editor-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);await page.screenshot({path:'.runtime/screenshots/match-preview-editor-390.png',fullPage:true});
  await page.close();await sql`update cms_jobs set run_at='1800-01-01T00:00:00Z' where kind='publish' and payload->>'id'=${recordId} and status='pending'`;await runOnce();
  await expect.poll(async()=> (await sql`select live->>'whatAtStake' as text from cms_records where id=${recordId}`)[0]?.text).toBe('Geplande vervanging.');expect((await sql`select draft->>'whatAtStake' as text from cms_records where id=${recordId}`)[0].text).toBe('Later privéconcept.');
  const reopened=await context.newPage();await reopened.goto('/beheer#voorbeschouwingen');await reopened.locator('.cmp-match-list button').filter({hasText:fixture.match.away.name}).first().click();await expect(reopened.getByLabel(/Wat staat er op het spel/)).toHaveValue('Later privéconcept.');await reopened.getByRole('button',{name:'Publicatie intrekken',exact:true}).click();await expect.poll(async()=> (await sql`select live from cms_records where id=${recordId}`)[0]?.live).toBeNull();response=await reopened.request.get(`/api/sportlink/match?id=${id}`);expect((await response.json()).preview).toBeNull();await reopened.close();
 }finally{
  await sql`update cms_records set live=null,deleted_at=now() where id=${recordId}`;await sql`delete from sportlink_matches where id=${id}`;await sql`delete from sportlink_cache where cache_key='club-competition-v1'`;for(const row of before)await sql`insert into sportlink_cache ${sql(row)}`;
 }
});

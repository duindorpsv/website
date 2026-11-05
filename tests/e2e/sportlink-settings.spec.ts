import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
test('Sportlink settings persist actual intervals privately and keep authority controls fixed',async({page})=>{
 await loginWithEmailCode(page,owner.email);const origin=new URL(page.url()).origin,before=await page.request.get('/api/cms/sportlink').then(response=>response.json());
 try{
  await page.goto('/beheer#sportlink');await expect(page.locator('main h1')).toHaveCount(1);await expect(page.locator('.cms-sportlink-dataset')).toHaveCount(7);
  await expect(page.getByRole('heading',{name:'Sportlink bepaalt de wedstrijdindeling',exact:true})).toBeVisible();
  const interval=page.getByLabel('Wedstrijdprogramma: interval',{exact:true}),wanted=before.settings.schedules.matches.every===12?6:12;
  await interval.fill(String(wanted));await page.getByLabel('Wedstrijdprogramma: eenheid',{exact:true}).selectOption('hour');
  const response=page.waitForResponse(response=>response.url().endsWith('/api/cms/sportlink/settings')&&response.request().method()==='POST');await page.getByRole('button',{name:'Instellingen opslaan',exact:true}).click();expect((await response).status()).toBe(200);
  await expect(page.getByRole('status').filter({hasText:'Sportlink-instellingen zijn opgeslagen.'})).toBeVisible();await page.reload();await expect(interval).toHaveValue(String(wanted));
  const stored=await page.request.get('/api/cms/sportlink').then(response=>response.json());expect(stored.settings.schedules.matches.every).toBe(wanted);expect(stored.version).toBeGreaterThan(before.version);expect(stored.credentialConfigured).toBe(false);
  await expect(page.locator('.cms-sportlink-dataset').first().getByRole('button',{name:'Nu synchroniseren',exact:true})).toBeDisabled();
  for(const width of [1440,1024,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);}
 }finally{const current=await page.request.get('/api/cms/sportlink').then(response=>response.json()),restored=await page.request.post('/api/cms/sportlink/settings',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),expectedVersion:current.version,settings:before.settings}});expect(restored.status(),await restored.text()).toBe(200);}
});

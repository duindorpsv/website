import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
async function selectTab(page:Page){await page.goto('/beheer#homepage');await page.getByRole('tab',{name:'Spelersfoto’s',exact:true}).click();await expect(page.getByRole('heading',{name:'Jij kiest wie er bovenaan staat.',exact:true})).toBeVisible();}

test('player portraits: upload, choose composition, publish a custom-only selection and render its actual public source',async({page})=>{
 test.setTimeout(120000);
 await loginWithEmailCode(page,owner.email);
 const initial=await page.request.get('/api/cms/bootstrap').then(response=>response.json()),before={items:initial.state.appearance?.heroPhotos,portraits:initial.state.appearance?.heroPortraits||[]};
 const name='Browserportret '+crypto.randomUUID();let mediaId='';
 try{
  await selectTab(page);await page.getByRole('button',{name:'Foto toevoegen',exact:true}).click();
  const editor=page.getByRole('region',{name:'Spelersfoto toevoegen',exact:true});await editor.locator('input[type="file"]').setInputFiles('public/assets/clubmuur-portraits-v14/01-trots-640.webp');
  await expect(editor.getByRole('button',{name:'Foto aan selectie toevoegen',exact:true})).toBeEnabled({timeout:75000});
  await editor.getByLabel('Naam van het portret',{exact:true}).fill(name);await editor.getByLabel('Personen en indeling',{exact:true}).selectOption('duo');
  const mediaSaved=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST'&&response.request().postDataJSON().changes.some((change:any)=>change.module==='media'&&change.action==='publish'));
  await editor.getByRole('button',{name:'Foto aan selectie toevoegen',exact:true}).click();expect((await mediaSaved).status()).toBe(200);
  await expect(editor).toHaveCount(0);await page.getByRole('button',{name:'Alles uitsluiten',exact:true}).click();await page.getByRole('checkbox',{name:name+' opnemen in de hero',exact:true}).check();
  const published=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST'&&response.request().postDataJSON().changes.some((change:any)=>change.module==='heroPhotos'));
  await page.getByRole('button',{name:'Selectie publiceren',exact:true}).click();expect((await published).status()).toBe(200);await expect(page.getByRole('button',{name:'Selectie publiceren',exact:true})).toBeDisabled();
  const saved=await page.request.get('/api/cms/bootstrap').then(response=>response.json()),portrait=saved.state.appearance.heroPortraits.find((portrait:any)=>portrait.name===name);mediaId=portrait.mediaId;
  expect(saved.state.appearance.heroPhotos).toEqual([portrait.id]);
  const publicResponse=await page.request.get('/clubmuur?hero=01&photo=01-trots'),html=await publicResponse.text();expect(publicResponse.status()).toBe(200);expect(html).toContain(`data-hero-photo="${portrait.id}"`);expect(html).toMatch(/data-hero-layout="(?:02|08)"/);expect(html).toContain(`/api/media/${mediaId}`);expect(html).not.toContain(`/api/cms/media/${mediaId}/file`);
  await selectTab(page);await expect(page.getByRole('checkbox',{name:name+' opnemen in de hero',exact:true})).toBeChecked();
  const card=page.locator('article').filter({has:page.getByRole('checkbox',{name:name+' opnemen in de hero',exact:true})});await card.getByRole('button',{name:'Bewerken',exact:true}).click();await page.getByLabel('Personen en indeling',{exact:true}).selectOption('walking');await page.getByRole('button',{name:'Portret bijwerken',exact:true}).click();
  const republished=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');await page.getByRole('button',{name:'Selectie publiceren',exact:true}).click();expect((await republished).status()).toBe(200);
  expect(await page.request.get('/clubmuur?hero=01').then(response=>response.text())).toContain('data-hero-layout="04"');
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);}
  await page.screenshot({path:'.runtime/screenshots/hero-portraits-320.png',fullPage:true});
 }finally{
  const current=await page.request.get('/api/cms/bootstrap').then(response=>response.json());
  const restored=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'heroPhotos',id:'site-hero-photos',expectedVersion:current.versions['site-hero-photos'],action:'publish',data:before}]}});expect(restored.status(),await restored.text()).toBe(200);
  if(mediaId){const removed=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'media',id:mediaId,expectedVersion:current.versions[mediaId],action:'trash'}]}});expect(removed.status(),await removed.text()).toBe(200);}
 }
});

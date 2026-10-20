import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {createDefaultHeroSlider,type CmsHeroSlider} from '../../lib/cms/hero-slider';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
const keys=['slides','autoplay','intervalMs','transition','transitionMs','zoom','parallax','showIndicators'] as const;
const payload=(record:any):CmsHeroSlider=>Object.fromEntries(keys.map(key=>[key,record[key]])) as CmsHeroSlider;

test('hero slider: real upload, saved private draft, explicit public source/crop and retained library image after removal',async({page})=>{
 test.setTimeout(180000);await loginWithEmailCode(page,owner.email);
 const origin=new URL(page.url()).origin,initialResponse=await page.request.get('/api/cms/heroSlider/site-hero-slider'),initial=initialResponse.ok()?await initialResponse.json():null;
 let mediaId='';const name='Sliderachtergrond '+crypto.randomUUID().slice(0,8);
 async function record(){return page.request.get('/api/cms/heroSlider/site-hero-slider').then(response=>response.json());}
 async function save(action:'save'|'publish'){
  const received=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST'&&response.request().postDataJSON().changes.some((change:any)=>change.module==='heroSlider'&&change.action===action));
  await page.getByRole('button',{name:action==='save'?'Hero-slider opslaan':'Slider publiceren',exact:true}).click();const response=await received;expect(response.status(),await response.text()).toBe(200);
  await expect(page.getByRole('status').filter({hasText:action==='save'?'De werkversie is opgeslagen.':'De hero-slider is gepubliceerd op de homepage.'})).toBeVisible();
 }
 try{
  await page.getByRole('button',{name:'Homepage',exact:true}).click();await page.getByRole('tab',{name:'Hero-slider',exact:true}).click();
  await page.getByRole('button',{name:'Achtergrond toevoegen',exact:true}).click();await page.getByRole('button',{name:'Uploaden',exact:true}).click();await page.locator('.hsm-upload input[type=file]').setInputFiles('public/assets/clubmuur-portraits-v14/01-trots-640.webp');await page.getByLabel('Fotonaam',{exact:true}).fill(name);await page.getByLabel('Beschrijving',{exact:true}).fill('Een gecontroleerde achtergrond voor de slider.');await page.getByRole('button',{name:'Uploaden en toevoegen',exact:true}).click();await expect(page.getByText(name,{exact:true})).toBeVisible({timeout:75000});
  await page.getByLabel('Horizontale uitsnede',{exact:true}).fill('30');await page.getByLabel('Verticale uitsnede',{exact:true}).fill('70');
  while(await page.getByRole('button',{name:name+' eerder',exact:true}).isEnabled())await page.getByRole('button',{name:name+' eerder',exact:true}).click();
  await save('save');const draft=await record(),selected=draft.slides.find((slide:any)=>slide.label===name);mediaId=selected.sourceId;expect(selected.focusX).toBe(30);expect(selected.focusY).toBe(70);expect(draft.live||null).toEqual(initial?.live||null);
  await page.reload();await expect(page.getByText(name,{exact:true})).toBeVisible();await save('publish');const approved=await record();expect(approved.live.slides[0].sourceId).toBe(mediaId);
  const publicPage=await page.request.get('/clubmuur'),html=await publicPage.text();expect(publicPage.status()).toBe(200);expect(html).toContain(`data-active-scene="${mediaId}"`);expect(html).toContain(`/api/media/${mediaId}`);expect(html).not.toContain(`/api/cms/media/${mediaId}/file`);
  await page.getByRole('button',{name:name+' uit slider verwijderen',exact:true}).click();await save('publish');const media=await page.request.get('/api/cms/media/'+mediaId).then(response=>response.json());expect(media.id).toBe(mediaId);expect(media.published).toBe(true);expect(media.deletedAt).toBeFalsy();
 }finally{
  const latest=await record(),restore=async(data:CmsHeroSlider,action:'save'|'publish'|'unpublish',expectedVersion:number)=>page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes:[{module:'heroSlider',id:'site-hero-slider',expectedVersion,action,data}]}});
  const restored=await restore(initial?.live?payload(initial.live):createDefaultHeroSlider(),initial&&!initial.live?'unpublish':'publish',latest.version);expect(restored.status(),await restored.text()).toBe(200);
  if(initial){const current=await record(),saved=await restore(payload(initial),'save',current.version);expect(saved.status(),await saved.text()).toBe(200);}
  if(mediaId){const media=await page.request.get('/api/cms/media/'+mediaId).then(response=>response.json());const removed=await page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes:[{module:'media',id:mediaId,expectedVersion:media.version,action:'trash'}]}});expect(removed.status(),await removed.text()).toBe(200);}
 }
});

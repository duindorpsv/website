import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {defaultHeroCards} from '../../lib/clubmuur-config';
import {loginWithEmailCode} from './login-fixture';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));

test('hero editor loads saved content, protects concurrent publications and explicitly reloads before a retry',async({page})=>{
 await loginWithEmailCode(page,owner.email);
 const origin=new URL(page.url()).origin,initial=await page.request.get('/api/cms/hero/site-hero'),before=initial.ok()?(await initial.json()).items:defaultHeroCards;
 async function version(){return (await page.request.get('/api/cms/bootstrap').then(response=>response.json())).versions['site-hero']||0;}
 async function publish(items:typeof defaultHeroCards,expectedVersion:number){return page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes:[{module:'hero',id:'site-hero',expectedVersion,action:'publish',data:{items}}]}});}
 try{
  await page.getByRole('button',{name:'Homepage',exact:true}).click();await page.getByRole('button',{name:'Vier vakken bovenaan',exact:true}).click();
  const title=page.getByRole('textbox',{name:'Nieuws · volle hoogte: titel',exact:true}),second=page.getByRole('textbox',{name:'Uitgelicht naast de spelers: titel',exact:true});
  await expect(title).toHaveValue(before[0].title);await title.fill('Lokale hero-kop');
  const winner=before.map((card:any,index:number)=>index===1?{...card,title:'Kop van een collega'}:card),other=await publish(winner,await version());expect(other.status(),await other.text()).toBe(200);
  const conflict=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');await page.getByRole('button',{name:'Vier vakken opslaan',exact:true}).click();expect((await conflict).status()).toBe(409);await expect(title).toHaveValue('Lokale hero-kop');await expect(page.getByRole('alert')).toContainText('door een andere redacteur gewijzigd');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Serverversie opnieuw laden',exact:true}).click();await expect(second).toHaveValue('Kop van een collega');await expect(title).toHaveValue(before[0].title);
  await title.fill('Na vergelijking gepubliceerd');const saved=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');await page.getByRole('button',{name:'Vier vakken opslaan',exact:true}).click();expect((await saved).status()).toBe(200);await expect(page.getByRole('status').filter({hasText:'De vier hero-vakken zijn op de server gepubliceerd.'})).toBeVisible();
  for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);}
 }finally{const restored=await publish(before,await version());expect(restored.status(),await restored.text()).toBe(200);}
});

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
  const conflict=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');await page.getByRole('button',{name:'Vier vakken opslaan',exact:true}).click();expect((await conflict).status()).toBe(409);await expect(title).toHaveValue('Lokale hero-kop');await expect(page.locator('.hero-editor').getByRole('alert')).toContainText('door een andere redacteur gewijzigd');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Serverversie opnieuw laden',exact:true}).click();await expect(second).toHaveValue('Kop van een collega');await expect(title).toHaveValue(before[0].title);
  await title.fill('Na vergelijking gepubliceerd');const saved=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');await page.getByRole('button',{name:'Vier vakken opslaan',exact:true}).click();expect((await saved).status()).toBe(200);await expect(page.locator('.hero-editor').getByRole('status').filter({hasText:'De vier hero-vakken zijn op de server gepubliceerd.'})).toBeVisible();
  for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);}
 }finally{const restored=await publish(before,await version());expect(restored.status(),await restored.text()).toBe(200);}
});

test('each hero tile can link to every published page, including a custom page outside the menu',async({page})=>{
 await loginWithEmailCode(page,owner.email);
 const origin=new URL(page.url()).origin,id=crypto.randomUUID(),slug='club/eigen-hero-pagina-'+id;
 const initial=await page.request.get('/api/cms/hero/site-hero'),before=initial.ok()?(await initial.json()).items:defaultHeroCards;
 const content={title:'Eigen hero-bestemming',slug,intro:'Deze pagina staat niet in het menu.',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Deze eigen pagina is via het hero-vak bereikbaar.'}]}]},parentId:'',menuGroup:'club',menuVisible:false,order:999,seo:{title:'',description:'',noIndex:true},useBuilder:true};
 const mutate=async(changes:any[])=>page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes}});
 const created=await mutate([{module:'pages',id,action:'publish',expectedVersion:0,data:content}]);expect(created.status(),await created.text()).toBe(200);const pageVersion=(await created.json()).versions[id];
 const version=async()=>(await page.request.get('/api/cms/bootstrap').then(response=>response.json())).versions['site-hero']||0;
 try{
  await page.reload();
  await page.getByRole('button',{name:'Homepage',exact:true}).click();await page.getByRole('button',{name:'Vier vakken bovenaan',exact:true}).click();
  const slots=['Nieuws · volle hoogte','Uitgelicht naast de spelers','Rechtsboven','Rechtsonder'],targets=['club/bestuur','club/contact','teams/trainingen',slug];
  for(let index=0;index<slots.length;index++){
   await page.getByRole('combobox',{name:slots[index]+': inhoud',exact:true}).selectOption('page');
   const destination=page.getByRole('combobox',{name:slots[index]+': bestemming',exact:true});
   expect(await destination.locator('option').count()).toBeGreaterThan(5);
   await expect(destination.locator('option').filter({hasText:'Eigen hero-bestemming'})).toHaveAttribute('value',slug);
   await destination.selectOption(targets[index]);
  }
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');await page.getByRole('button',{name:'Vier vakken opslaan',exact:true}).click();expect((await saved).status()).toBe(200);
  await page.reload();await page.getByRole('button',{name:'Vier vakken bovenaan',exact:true}).click();
  for(let index=0;index<slots.length;index++)await expect(page.getByRole('combobox',{name:slots[index]+': bestemming',exact:true})).toHaveValue(targets[index]);
  await page.goto('/clubmuur?hero=01');
  for(let index=0;index<targets.length;index++)await expect(page.locator(`a[data-slot-id="${defaultHeroCards[index].id}"]`)).toHaveAttribute('href','/clubmuur/'+targets[index]);
  await page.locator(`a[data-slot-id="${defaultHeroCards[3].id}"]`).click();await expect(page.locator('main h1')).toHaveText('Eigen hero-bestemming');
 }finally{
  const restored=await mutate([{module:'hero',id:'site-hero',action:'publish',expectedVersion:await version(),data:{items:before}}]);expect(restored.status(),await restored.text()).toBe(200);
  const removed=await mutate([{module:'pages',id,action:'trash',expectedVersion:pageVersion,data:content}]);expect(removed.status(),await removed.text()).toBe(200);
 }
});

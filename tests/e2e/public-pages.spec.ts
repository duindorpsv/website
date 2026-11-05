import {test,expect} from '@playwright/test';

const pages=['club','club/ons-verhaal','club/bestuur','club/commissies','club/jeugdorganisatie','club/vertrouwenspersoon','club/accommodatie','club/lidmaatschap','club/vrijwilligers','club/clubwaarden','club/documenten','club/contact','teams','teams/trainingen','teams/walking-football','wedstrijden','wedstrijden/informatie','wedstrijden/afgelastingen','nieuws','verhalen','media/fotos','media/nieuwsbrief'];

test('anonymous WhatsApp previews use the public article hero image without JavaScript',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,userAgent:'WhatsApp/2.23',javaScriptEnabled:false});
 try{
  const page=await context.newPage();
  const indexResponse=await page.goto('/clubmuur/verhalen');
  expect(indexResponse?.status()).toBe(200);
  const story=page.locator('.cmsp-editorial-photo:has(img)').first();
  await expect(story).toBeVisible();
  const href=await story.getAttribute('href');
  expect(href).toBeTruthy();
  const response=await page.goto(new URL(href!,page.url()).href);
  expect(response?.status()).toBe(200);
  const hero=page.locator('.cmsp-article-cover img');
  await expect(hero).toBeVisible();
  const imageSrc=await hero.getAttribute('src');
  expect(imageSrc).toBeTruthy();
  const expectedImage=new URL(imageSrc!,page.url()).href;
  await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute('content',expectedImage);
  await expect(page.locator('head meta[name="twitter:image"]')).toHaveAttribute('content',expectedImage);
  await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
  const imageResponse=await context.request.get(expectedImage);
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()['content-type']).toMatch(/^image\//i);
 }finally{
  await context.close();
 }
});

test('published club pages remain readable on desktop and mobile after the prototype layout comparison',async({page})=>{
 test.setTimeout(150000);
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const path of pages){
  await page.setViewportSize({width:1440,height:1000});
  const response=await page.goto('/clubmuur/'+path);
  expect(response?.status(),path).toBe(200);
  await expect(page.locator('main h1'),path).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),path).toBe(false);
  const body=page.locator('.cmsp-page-body');
  if(await body.count())expect(await body.evaluate(element=>element.getBoundingClientRect().width),path).toBeGreaterThan(1000);
  if(path==='club/bestuur'){
   const cards=page.locator('.cmsp-people .cmsp-person');await expect(cards).toHaveCount(6);
   const positions=await cards.evaluateAll(items=>items.slice(0,2).map(item=>({top:item.getBoundingClientRect().top,width:item.getBoundingClientRect().width})));
   expect(Math.abs(positions[0].top-positions[1].top)).toBeLessThan(1);
   expect(positions[0].width).toBeGreaterThan(450);
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'mobile '+path).toBe(false);
 }
});

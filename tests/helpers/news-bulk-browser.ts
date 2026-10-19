import {expect,type Page} from '@playwright/test';

async function createSelection(page:Page){
  const tag='Bulkproef-'+crypto.randomUUID(),ids=[0,1,2,3].map(index=>tag+'-'+index);
  const articles=ids.map((id,index)=>({id,contentType:'news',storyFormat:'story',title:`${tag} Bericht ${index}`,slug:id.toLowerCase(),intro:'Synthetische bulkpublicatie.',body:index===2?{type:'doc',content:[{type:'paragraph'}]}:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Nieuws voor de publicatieproef.'}]}]},coverId:'',author:'Redactie',category:'Clubnieuws',tags:[],teamId:'',season:'2026–2027',seo:{title:'',description:'',noIndex:true},featured:false,publishedAt:'',status:'draft'}));
  const response=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:articles.map((data,index)=>({module:'articles',id:data.id,expectedVersion:0,action:index===1?'schedule':'save',data,...(index===1?{scheduledAt:new Date(Date.now()+86400000).toISOString()}:{})}))}});
  expect(response.status()).toBe(200);
  await page.goto('/beheer?bulk='+tag+'#nieuws');
  await page.getByRole('textbox',{name:'Zoek in nieuws',exact:true}).fill(tag);
  await expect(page.locator('.cms-news-item')).toHaveCount(4);
  return {tag,ids,articles};
}
const record=(page:Page,id:string)=>page.request.get('/api/cms/articles/'+id).then(r=>r.json());

export async function publishNewsInBulk(page:Page){
  const {tag,ids,articles}=await createSelection(page),search=page.getByRole('textbox',{name:'Zoek in nieuws',exact:true});
  const first=page.getByLabel('Selecteer nieuwsbericht: '+articles[0].title,{exact:true});
  await first.check();await expect(page.getByRole('button',{name:'Selectie publiceren (1)',exact:true})).toBeEnabled();
  await expect(page.getByPlaceholder('Wat is het nieuws?')).toHaveCount(0);
  // Changing the filter must not leave a hidden record in the publication selection.
  await search.fill(tag+' Bericht 1');await expect(page.locator('.cms-news-item')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Selectie publiceren (0)',exact:true})).toBeDisabled();
  await search.fill(tag);
  await page.getByLabel('Selecteer alle zichtbare nieuwsberichten',{exact:true}).check();
  await page.getByLabel('Selecteer nieuwsbericht: '+articles[3].title,{exact:true}).uncheck();
  const requested=page.waitForResponse(r=>r.url().endsWith('/api/cms/mutations')&&r.request().postDataJSON().changes.some((change:any)=>change.id===ids[0]&&change.action==='publish'));
  await page.getByRole('button',{name:'Selectie publiceren (3)',exact:true}).click();
  const response=await requested;expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().changes.map((change:any)=>change.id).sort()).toEqual(ids.slice(0,2).sort());
  const result=page.getByRole('region',{name:'Resultaat bulkpublicatie'});
  await expect(result).toContainText('2 nieuwsberichten gepubliceerd. 1 heeft aandacht nodig.');
  await expect(result).toContainText('Schrijf eerst de inhoud.');
  for(const id of ids.slice(0,2)){const saved=await record(page,id);expect(saved.status).toBe('published');expect(saved.live).toBeTruthy();expect(saved.scheduledAt).toBe('');}
  for(const id of ids.slice(2)){const saved=await record(page,id);expect(saved.status).toBe('draft');expect(saved.live).toBeFalsy();}
  await expect(first).not.toBeChecked();
  await expect(page.getByLabel('Selecteer nieuwsbericht: '+articles[2].title,{exact:true})).toBeChecked();
  await page.screenshot({path:'.runtime/news-bulk-'+page.viewportSize()!.width+'.png',fullPage:true});
  await result.getByRole('button',{name:/^Bericht openen/}).click();
  await expect(page.getByPlaceholder('Wat is het nieuws?')).toHaveValue(articles[2].title);
}

export async function bulkNewsConflict(page:Page){
  const {ids,articles}=await createSelection(page);
  for(const article of articles.slice(0,2))await page.getByLabel('Selecteer nieuwsbericht: '+article.title,{exact:true}).check();
  const before=await record(page,ids[0]),title='Gewijzigd in een ander venster '+articles[0].title;
  const external=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'articles',id:ids[0],expectedVersion:before.version,action:'save',data:{...before,title}}]}});
  expect(external.status()).toBe(200);
  await page.getByRole('button',{name:'Selectie publiceren (2)',exact:true}).click();
  const result=page.getByRole('region',{name:'Resultaat bulkpublicatie'});
  await expect(result).toContainText('0 nieuwsberichten gepubliceerd. 2 hebben aandacht nodig.');
  await expect(result).toContainText('De publicatie is niet bevestigd.');
  await expect(page.getByRole('button',{name:'Selectie publiceren (2)',exact:true})).toBeDisabled();
  for(const id of ids.slice(0,2))expect((await record(page,id)).live).toBeFalsy();
  expect((await record(page,ids[0])).title).toBe(title);
  await result.getByRole('button',{name:'Overzicht opnieuw laden',exact:true}).click();
  await expect(page.locator('.cms-news-item').filter({hasText:title})).toBeVisible();
  await page.getByRole('button',{name:'Selectie publiceren (2)',exact:true}).click();
  await expect(page.getByRole('region',{name:'Resultaat bulkpublicatie'})).toContainText('2 nieuwsberichten gepubliceerd.');
  expect((await record(page,ids[0])).live.title).toBe(title);
}

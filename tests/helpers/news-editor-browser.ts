import {expect,type Page} from '@playwright/test';

async function createDraft(page:Page){
  const id='editor-browser-'+crypto.randomUUID(),title='Redactieproef '+id;
  const data={id,contentType:'news',storyFormat:'story',title,slug:id,intro:'Synthetisch nieuws voor de browsertest.',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Dit is een echte redactieproef.'}]}]},coverId:'',author:'Redactie',category:'Clubnieuws',tags:[],teamId:'',season:'2026–2027',seo:{title:'',description:'',noIndex:true},featured:false,publishedAt:'',status:'draft'};
  const response=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'articles',id,expectedVersion:0,action:'save',data}]}});
  expect(response.status()).toBe(200);
  await page.goto('/beheer?newsId='+id+'#nieuws');
  const field=page.getByPlaceholder('Wat is het nieuws?');await expect(field).toHaveValue(title);
  return {id,field};
}
const record=(page:Page,id:string)=>page.request.get('/api/cms/articles/'+id).then(r=>r.json());

export async function publishNewsImmediately(page:Page){
  const {id,field}=await createDraft(page),title='Direct publiceren '+crypto.randomUUID();
  await field.fill(title);
  await page.getByLabel('Uitlichten bij Nieuws op de homepage',{exact:true}).check();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/cms/mutations')&&r.request().postDataJSON().changes.some((c:any)=>c.id===id&&c.action==='publish'));
  await page.getByRole('button',{name:'Nu publiceren',exact:true}).click();
  const response=await saved;expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().changes.map((c:any)=>c.module)).toEqual(['articles']);
  await expect(page.getByText('Het nieuwsbericht staat op de website.',{exact:true})).toBeVisible();
  const published=await record(page,id);
  expect(published.status).toBe('published');expect(published.live.title).toBe(title);expect(published.scheduledAt).toBe('');
  const remaining=Date.parse(published.live.featuredUntil)-Date.now();
  expect(remaining).toBeGreaterThan(6.9*86400000);expect(remaining).toBeLessThanOrEqual(7*86400000);
  // Wait beyond the autosave debounce: an older queued draft must not undo publication.
  await page.waitForTimeout(1000);
  const unchanged=await record(page,id);expect(unchanged.version).toBe(published.version);expect(unchanged.status).toBe('published');
  await page.reload();await expect(field).toHaveValue(title);
  await expect(page.getByLabel('Uitgelicht tot en met',{exact:true})).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByLabel('Uitgelicht tot en met',{exact:true}).fill('2099-01-01');
  const updated=page.waitForResponse(r=>r.url().endsWith('/api/cms/mutations')&&r.request().postDataJSON().changes.some((c:any)=>c.action==='publish'));
  await page.getByRole('button',{name:'Publicatie nu bijwerken',exact:true}).click();expect((await updated).status()).toBe(200);
  const extended=await record(page,id);expect(extended.live.featuredUntil).toMatch(/^2099-01-01T/);
  await page.waitForTimeout(1000);expect((await record(page,id)).version).toBe(extended.version);
}

export async function preserveTypingDuringSave(page:Page){
  const {id,field}=await createDraft(page),first='Eerste wijziging '+id,latest='Nieuwste invoer blijft bewaard '+id;
  let delayed=false,release:()=>void=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/cms/mutations',async route=>{
    const matches=route.request().postDataJSON().changes.some((c:any)=>c.id===id&&c.action==='save');
    if(matches&&!delayed){delayed=true;await held;}
    await route.continue();
  });
  try{
    const requested=page.waitForRequest(request=>request.url().endsWith('/api/cms/mutations')&&request.postDataJSON().changes.some((c:any)=>c.id===id));
    await field.fill(first);await requested;
    await field.fill(latest);release();
    await expect.poll(async()=>(await record(page,id)).title).toBe(latest);
    await expect(field).toHaveValue(latest);
    await expect(page.getByText('Opslaan niet gelukt',{exact:true})).toHaveCount(0);
  }finally{release();await page.unroute('**/api/cms/mutations');}
}

export async function resolveNewsConflict(page:Page){
  const {id,field}=await createDraft(page),before=await record(page,id);
  const remoteTitle='Wijziging in ander venster '+id,mine='Mijn onopgeslagen werkversie '+id;
  const external=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'articles',id,expectedVersion:before.version,action:'save',data:{...before,title:remoteTitle}}]}});expect(external.status()).toBe(200);
  await field.fill(mine);
  await expect(page.getByRole('heading',{name:'Er staat een nieuwere versie op de server.'})).toBeVisible();
  await expect(field).toHaveValue(mine);
  await page.getByText('Serverversie bekijken',{exact:true}).click();
  await expect(page.locator('.cms-news-conflict-preview')).toContainText(remoteTitle);
  await page.getByRole('button',{name:'Mijn werkversie opslaan',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Er staat een nieuwere versie op de server.'})).toHaveCount(0);
  expect((await record(page,id)).title).toBe(mine);
  await expect(field).toHaveValue(mine);
  // A second conflict can also be resolved by explicitly adopting the server version.
  const current=await record(page,id);
  const again=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'articles',id,expectedVersion:current.version,action:'save',data:{...current,title:remoteTitle}}]}});expect(again.status()).toBe(200);
  await field.fill(mine+' nog een wijziging');
  await expect(page.getByRole('heading',{name:'Er staat een nieuwere versie op de server.'})).toBeVisible();
  await page.getByRole('button',{name:'Serverversie gebruiken',exact:true}).click();
  await expect(field).toHaveValue(remoteTitle);
  await expect(page.getByRole('heading',{name:'Er staat een nieuwere versie op de server.'})).toHaveCount(0);
}

export async function heroNewsExpiresAndExtends(page:Page){
  const tag=crypto.randomUUID(),pin='Tijdelijk uitgelicht '+tag;
  for(const [index,title,featured] of [[0,pin,true],[1,'Recente clubnieuws '+tag,false],[2,'Nieuwste clubnieuws '+tag,false]] as const){
    const id='hero-browser-'+tag+'-'+index;
    const data={id,contentType:'news',storyFormat:'story',title,slug:id,intro:'Synthetische hero-controle.',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Nieuws voor de hero.'}]}]},coverId:'',author:'Redactie',category:'Clubnieuws',tags:[],teamId:'',season:'2026–2027',seo:{title:'',description:'',noIndex:true},featured,featuredUntil:featured?new Date(Date.now()+10000).toISOString():'',publishedAt:'',status:'draft'};
    const response=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'articles',id,expectedVersion:0,action:'publish',data}]}});expect(response.status()).toBe(200);
  }
  await page.goto('/');
  const first=page.locator('.cm-news-tile').first().locator('.cm-news-tile-toggle').first();
  await expect(first).toContainText(pin);
  await expect(first).not.toContainText(pin,{timeout:15000});
  await page.goto('/beheer?newsId=hero-browser-'+tag+'-0#nieuws');
  await expect(page.getByPlaceholder('Wat is het nieuws?')).toHaveValue(pin,{timeout:15000});
  await expect(page.getByLabel('Uitlichten bij Nieuws op de homepage',{exact:true})).not.toBeChecked();
  await page.getByLabel('Uitgelicht tot en met',{exact:true}).fill('2099-01-01');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/cms/mutations')&&r.request().postDataJSON().changes.some((c:any)=>c.action==='publish'));
  await page.getByRole('button',{name:'Publicatie nu bijwerken',exact:true}).click();expect((await saved).status()).toBe(200);
  await page.goto('/');await expect(first).toContainText(pin);
}

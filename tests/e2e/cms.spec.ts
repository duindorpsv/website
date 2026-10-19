import {loginWithEmailCode} from './login-fixture';
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
async function login(page:any){await loginWithEmailCode(page,owner.email);}
test('AUTH01 and SEO: unauthenticated APIs reject access, public history is rendered without JS',async({request,browser})=>{expect((await request.get('/api/cms/bootstrap')).status()).toBe(401);const response=await request.get('/beheer',{maxRedirects:0});expect([307,308]).toContain(response.status());const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto('/clubmuur/club/ons-verhaal');await expect(page.getByRole('heading',{name:/verhaal/i}).first()).toBeVisible();expect(await page.locator('body').innerText()).toContain('1950');await context.close();expect((await request.get('/clubmuur/club/missing-e2e-page')).status()).toBe(404);});
test('real login, row/column builder and one-step undo/redo',async({page})=>{
 await login(page);await page.getByRole('button',{name:'Pagina’s',exact:true}).click();
 const created=page.waitForResponse((r:any)=>r.url().endsWith('/api/cms/mutations')&&r.request().method()==='POST'&&r.request().postDataJSON().changes.some((c:any)=>c.expectedVersion===0&&c.id.startsWith('page-')));
 await page.getByRole('button',{name:'Nieuwe pagina',exact:true}).first().click();const creation=await created;expect(creation.status()).toBe(200);
 const createdId=Object.keys((await creation.json()).versions)[0];await expect(page.locator(`[data-page-id="${createdId}"] .pb-builder`)).toBeVisible();
 await page.getByRole('button',{name:'Rij met 2 kolommen',exact:true}).click();await expect(page.locator('.pb-column')).toHaveCount(3);
 await page.locator('.pb-column').nth(1).getByRole('button',{name:'Widget toevoegen'}).click();
 await page.locator('.pb-palette-item').filter({hasText:'Tekst'}).first().getByRole('button',{name:'Tekst',exact:true}).click();
 await expect(page.locator('[data-widget-id]')).toHaveCount(1);
 // Target the editable paragraph, rather than the padded NodeView container.
 // Prove typing succeeded before checking either history operation.
 const content=page.locator('.pb-rich-content'),text='Dit is een echte tekstwidget.';
 await content.locator('p').click();await expect(page.locator('.ProseMirror')).toBeFocused();
 await page.keyboard.type(text);await expect(content).toHaveText(text);
 await page.getByRole('button',{name:'Ongedaan maken',exact:true}).click();await expect(content).toHaveText('');
 const redo=page.getByRole('button',{name:'Opnieuw',exact:true});await expect(redo).toBeEnabled();await redo.click();await expect(content).toHaveText(text);
 const saved=page.waitForResponse((r:any)=>r.url().endsWith('/api/cms/mutations')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Bewaren',exact:true}).first().click();expect((await saved).status()).toBe(200);
 await page.screenshot({path:'.runtime/screenshots/builder.png',fullPage:true});
});
test('public pages remain usable at 320, 390, 768 and 1440 pixels',async({page})=>{for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.goto('/clubmuur/club/ons-verhaal');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);expect(overflow).toBe(false);}await page.screenshot({path:'.runtime/screenshots/history-1440.png',fullPage:true});});

test('FORM01: public contact commits before acknowledging receipt',async({page,request})=>{await page.goto('/clubmuur/club/contact');await page.getByLabel('Naam *',{exact:true}).fill('Synthetische browserproef');await page.getByLabel('E-mailadres *',{exact:true}).fill('e2e-'+crypto.randomUUID()+'@example.invalid');await page.getByLabel('Bericht *',{exact:true}).fill('Controle van betrouwbare formulierontvangst.');const received=page.waitForResponse(r=>r.url().includes('/api/forms/contact/submissions'));await page.getByRole('button',{name:'Versturen',exact:true}).click();expect((await received).status()).toBe(201);await expect(page.getByText('Je inzending is ontvangen en opgeslagen. De club verwerkt deze verder.')).toBeVisible();});
test('NEWSLETTER: subscribers and subjects are managed in the CMS without an external list',async({page,request})=>{
 const email='cms-newsletter-'+crypto.randomUUID()+'@example.invalid';
 expect((await request.get('/api/cms/newsletter')).status()).toBe(401);
 await login(page);const origin=new URL(page.url()).origin;
 const created=await page.request.post('/api/newsletter',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),email,name:'Browserabonnee',topics:['club'],consent:true}});expect(created.status()).toBe(201);
 await page.getByRole('button',{name:'Instellingen & koppelingen',exact:true}).click();
 const panel=page.getByRole('region',{name:'Nieuwsbriefabonnees'});
 await panel.getByLabel('Abonnees zoeken',{exact:true}).fill(email);await panel.getByRole('button',{name:'Zoeken',exact:true}).click();
 await panel.getByRole('button',{name:'Beheer abonnee '+email,exact:true}).click();
 await expect(panel.getByText('Deze inschrijving is nog niet bevestigd.',{exact:true})).toBeVisible();
 await panel.getByLabel('Naam abonnee',{exact:true}).fill('Bewerkt in het CMS');await panel.getByRole('textbox',{name:'Onderwerpen abonnee',exact:true}).fill('jeugd\nclub');
 await panel.getByRole('button',{name:'Abonnee opslaan',exact:true}).click();await expect(panel.getByText('Abonnee opgeslagen.',{exact:true})).toBeVisible();
 await page.reload();await panel.getByLabel('Abonnees zoeken',{exact:true}).fill(email);await panel.getByRole('button',{name:'Zoeken',exact:true}).click();
 await panel.getByRole('button',{name:'Beheer abonnee '+email,exact:true}).click();await expect(panel.getByLabel('Naam abonnee',{exact:true})).toHaveValue('Bewerkt in het CMS');await expect(panel.getByRole('textbox',{name:'Onderwerpen abonnee',exact:true})).toHaveValue('jeugd\nclub');
 page.once('dialog',dialog=>dialog.accept());await panel.getByRole('button',{name:'Abonnee afmelden',exact:true}).click();await expect(panel.getByText('Abonnee afgemeld.',{exact:true})).toBeVisible();
 const status=await page.request.get('/api/cms/newsletter?'+new URLSearchParams({q:email})).then(r=>r.json());expect(status.items[0].status).toBe('unsubscribed');expect(status.items[0]).not.toHaveProperty('confirmation_hash');
 const integration=await page.request.get('/api/cms/integrations').then(r=>r.json());expect(integration.mailProvider).toBe('resend');expect(integration.newsletterManagement).toBe('cms');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
 await page.screenshot({path:'.runtime/screenshots/newsletter-cms-390.png',fullPage:true});
});
test('PB-03/04/05: keyboard move menu and pointer drag across columns/rows preserve independent nodes',async({page})=>{
 await page.setViewportSize({width:1600,height:2200});await login(page);
 const people=await page.request.get('/api/cms/people').then(r=>r.json()),media=await page.request.get('/api/cms/media').then(r=>r.json());
 const id=crypto.randomUUID(),text=(id:string,value:string)=>({type:'cmsRichText',attrs:{id},content:[{type:'paragraph',content:[{type:'text',text:value}]}]}),column=(id:string,content:any[])=>({type:'cmsColumn',attrs:{id},content}),row=(id:string,content:any[])=>({type:'cmsRow',attrs:{id,layout:content.length===2?'equal':'full',gap:'normal',padding:'normal',tone:'default',verticalAlign:'start'},content}),widget=(id:string,kind:string,data:any)=>({type:'cmsWidget',attrs:{id,kind,data}});
 const data={id,title:'Rijenproef '+id.slice(0,6),slug:'club/rijenproef-'+id,intro:'',bodyFormat:'page-layout-v2',body:{type:'doc',content:[row('row-one',[column('left',[text('text-a','A links'),widget('person-a','person',{refId:people.items[0].id}),widget('image-a','image',{refId:media.items[0].id})]),column('right',[text('text-b','B rechts'),widget('news-a','news',{contentType:'news'}),widget('story-a','story',{contentType:'story'})])]),row('row-two',[column('second',[text('text-c','C tweede rij')])])]},parentId:'',menuGroup:'club',menuVisible:false,order:0,seo:{title:'',description:'',noIndex:true},useBuilder:true,status:'draft'};
 const created=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'pages',id,expectedVersion:0,action:'save',data}]}});expect(created.status()).toBe(200);
 await page.reload();await page.getByRole('button',{name:'Pagina’s',exact:true}).click();await page.locator('.cms-page-select').filter({hasText:data.title}).click();await expect(page.locator('.pb-column')).toHaveCount(3);await expect(page.locator('[data-widget-id]')).toHaveCount(7);const columns=await page.locator('[data-layout-node="row-one"] .pb-column').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width})));expect(Math.abs(columns[0].y-columns[1].y)).toBeLessThan(2);expect(columns[1].x).toBeGreaterThan(columns[0].x+columns[0].width-1);
 const image=page.locator('[data-widget-id="image-a"]');await image.getByRole('button',{name:'Verplaatsen naar…'}).click();await image.getByLabel('Verplaatsbestemming').selectOption({label:'Rij 1, rechterkolom, aan het einde'});await expect(page.locator('[data-column-id="right"] [data-widget-id="image-a"]')).toBeVisible();
 const handle=page.locator('[data-widget-id="text-a"] [data-node-handle="text-a"]'),target=page.locator('[data-column-id="second"] .pb-drop').last();await handle.scrollIntoViewIfNeeded();const sourceBox=await handle.boundingBox(),targetBox=await target.boundingBox();expect(sourceBox).toBeTruthy();expect(targetBox).toBeTruthy();await page.mouse.move(sourceBox!.x+sourceBox!.width/2,sourceBox!.y+sourceBox!.height/2);await page.mouse.down();await page.mouse.move(sourceBox!.x+sourceBox!.width/2+20,sourceBox!.y+sourceBox!.height/2+20,{steps:5});await expect(page.locator('.pb-drag-overlay')).toBeVisible();await target.scrollIntoViewIfNeeded();const destinationBox=await target.boundingBox();await page.mouse.move(destinationBox!.x+destinationBox!.width/2,destinationBox!.y+destinationBox!.height/2,{steps:20});await page.mouse.up();await expect(page.locator('[data-column-id="second"] [data-widget-id="text-a"]')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByLabel('Kolomverhouding rij 1').selectOption('full');await expect(page.locator('[data-layout-node="row-one"] .pb-column')).toHaveCount(1);await page.getByRole('button',{name:'Ongedaan maken',exact:true}).click();await expect(page.locator('[data-layout-node="row-one"] .pb-column')).toHaveCount(2);
 await page.locator('[data-layout-node="row-one"] > .pb-row .pb-row-toolbar').getByRole('button',{name:'Rij omlaag',exact:true}).click();await expect(page.locator('[data-layout-node]').first()).toHaveAttribute('data-layout-node','row-two');await expect(page.locator('[data-widget-id]')).toHaveCount(7);
 await page.screenshot({path:'.runtime/screenshots/drag-rows-columns.png',fullPage:true});
});
test('NEWS01 and DATA01: a typed news draft is saved and visible in a second browser',async({page,browser})=>{
 await login(page);await page.getByRole('button',{name:'Nieuws',exact:true}).click();const title='Browsertitel '+crypto.randomUUID().slice(0,8);
 await page.getByRole('button',{name:'Nieuw nieuwsbericht',exact:true}).click();const field=page.getByPlaceholder('Wat is het nieuws?');await field.fill(title);await expect(field).toHaveValue(title);
 await page.getByRole('button',{name:'Concept bewaren',exact:true}).click();await expect(page.getByText(/Concept en revisie opgeslagen/)).toBeVisible();
 const other=await browser.newContext();const second=await other.newPage();await login(second);await second.getByRole('button',{name:'Nieuws',exact:true}).click();await expect(second.getByRole('heading',{name:title,exact:true})).toBeVisible();await other.close();
});
test('MEDIA01: saving a photo also persists its homepage selection without an unknown ID error',async({page})=>{
 await login(page);
 const bootstrap=await page.request.get('/api/cms/bootstrap').then(r=>r.json());
 const original=bootstrap.state.media.find((item:any)=>item.published&&item.featured&&bootstrap.state.settings.homepagePhotoIds.includes(item.id));
 expect(original).toBeTruthy();
 const caption='Fotowijziging '+crypto.randomUUID(),origin=new URL(page.url()).origin;
 try{
  await page.goto('/beheer#media');
  await page.locator('.cms-media-tile').filter({hasText:original.name}).first().click();
  await page.getByLabel('Bijschrift',{exact:true}).fill(caption);
  await page.getByLabel('Uitlichten op de fotomuur van de homepage',{exact:true}).uncheck();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/cms/mutations')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Opslaan',exact:true}).click();
  const response=await saved;
  expect(response.request().postDataJSON().changes.map((change:any)=>change.module).sort()).toEqual(['media','settings']);
  expect(response.status()).toBe(200);
  await expect(page.getByText('Foto opgeslagen.',{exact:true})).toBeVisible();
  await page.reload();
  await page.locator('.cms-media-tile').filter({hasText:original.name}).first().click();
  await expect(page.getByLabel('Bijschrift',{exact:true})).toHaveValue(caption);
  await expect(page.getByLabel('Uitlichten op de fotomuur van de homepage',{exact:true})).not.toBeChecked();
  const persisted=await page.request.get('/api/cms/bootstrap').then(r=>r.json());
  expect(persisted.state.settings.homepagePhotoIds).not.toContain(original.id);
  await expect(page.getByText(/Onbekend veld:/)).toHaveCount(0);
 }finally{
  const current=await page.request.get('/api/cms/bootstrap').then(r=>r.json());
  const restored=await page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes:[
   {module:'media',id:original.id,expectedVersion:current.versions[original.id],action:'save',data:original},
   {module:'settings',id:'settings',expectedVersion:current.versions.settings,action:'save',data:{...current.state.settings,homepagePhotoIds:bootstrap.state.settings.homepagePhotoIds}},
  ]}});
  expect(restored.status()).toBe(200);
 }
});
test('PB05: emulated touch drag can be cancelled without losing nodes at 390 pixels',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage();await login(page);await page.getByRole('button',{name:'Beheermenu openen'}).click();await page.getByRole('button',{name:'Pagina’s',exact:true}).click();
 const created=page.waitForResponse((r:any)=>r.url().endsWith('/api/cms/mutations')&&r.request().method()==='POST'&&r.request().postDataJSON().changes.some((c:any)=>c.expectedVersion===0&&c.id.startsWith('page-')));await page.getByRole('button',{name:'Nieuwe pagina',exact:true}).first().click();const response=await created;const id=Object.keys((await response.json()).versions)[0];await expect(page.locator(`[data-page-id="${id}"] .pb-builder`)).toBeVisible();
 await page.locator('.pb-column').first().getByRole('button',{name:'Widget toevoegen'}).click();await page.locator('.pb-palette-item').filter({hasText:'Tekst'}).first().getByRole('button',{name:'Tekst',exact:true}).click();
 const handle=page.locator('[data-widget-id] [data-node-handle]').first();await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();const client=await context.newCDPSession(page);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});await expect(page.locator('.pb-drag-overlay')).toBeVisible();await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(page.locator('.pb-drag-overlay')).toHaveCount(0);await expect(page.locator('[data-widget-id]')).toHaveCount(1);await expect(page.getByRole('status').filter({hasText:'Slepen geannuleerd.'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);await page.screenshot({path:'.runtime/screenshots/touch-390.png',fullPage:true});await context.close();
});
test('PB06 and SEO01: the published two-column renderer stacks in order without overflow',async({page,browser})=>{
 await login(page);const id='public-layout-'+crypto.randomUUID(),slug='club/'+id;
 const text=(id:string,value:string)=>({type:'cmsRichText',attrs:{id},content:[{type:'paragraph',content:[{type:'text',text:value}]}]});
 const body={type:'doc',content:[{type:'cmsRow',attrs:{id:'row-'+id,layout:'equal',gap:'normal',padding:'normal',tone:'default',verticalAlign:'start'},content:[{type:'cmsColumn',attrs:{id:'left-'+id},content:[text('first-'+id,'Eerst links')]},{type:'cmsColumn',attrs:{id:'right-'+id},content:[text('second-'+id,'Daarna rechts')]}]}]};
 const data={id,title:'Synthetische publicatieproef',slug,intro:'',bodyFormat:'page-layout-v2',body,parentId:'',menuGroup:'club',menuVisible:false,order:0,seo:{title:'Publicatietest',description:'Synthetisch',noIndex:true},useBuilder:true,status:'draft'};
 const response=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'pages',id,expectedVersion:0,action:'publish',data}]}});expect(response.status()).toBe(200);
 const publicContext=await browser.newContext({javaScriptEnabled:false}),visitor=await publicContext.newPage();
 for(const width of [320,768,1440]){await visitor.setViewportSize({width,height:900});await visitor.goto('/clubmuur/'+slug);await expect(visitor.getByText('Eerst links',{exact:true})).toBeVisible();await expect(visitor.getByText('Daarna rechts',{exact:true})).toBeVisible();expect(await visitor.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);}
 await expect(visitor).toHaveTitle(/Publicatietest/);await publicContext.close();
});

test('AUTH10: invited users sign in using an eight-digit code without a password or authenticator',async({page,browser})=>{
 const email='activation-e2e-'+crypto.randomUUID()+'@example.invalid';
 await login(page);const invited=await page.request.post('/api/cms/users',{headers:{Origin:new URL(page.url()).origin},data:{name:'Browseractivatie',email,roleId:'editor',teamIds:[],departments:[]}});expect(invited.status()).toBe(200);
 const context=await browser.newContext();
 try{
  const invitedPage=await context.newPage();await invitedPage.goto('/beheer/login');
  await expect(invitedPage.getByLabel('Wachtwoord',{exact:true})).toHaveCount(0);
  await invitedPage.screenshot({path:'.runtime/screenshots/email-code-login.png'});
  await loginWithEmailCode(invitedPage,email);await invitedPage.reload();await expect(invitedPage.getByText('Gedeeld CMS',{exact:true})).toBeVisible();
  expect((await invitedPage.request.post('/api/auth/sign-in/email',{headers:{Origin:new URL(invitedPage.url()).origin},data:{email,password:'unused'}})).status()).toBe(404);
 }finally{await context.close();}
});

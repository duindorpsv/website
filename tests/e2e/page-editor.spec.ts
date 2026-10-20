import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';

const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));

test('page editor preserves untouched live content and persists rich text edits',async({page})=>{
 await page.setViewportSize({width:1600,height:1100});
 await loginWithEmailCode(page,owner.email);
 const id=crypto.randomUUID(),title='Pagina-editor '+id.slice(0,8),origin=new URL(page.url()).origin;
 const data={title,slug:'club/editor-'+id,intro:'Een bestaande gepubliceerde pagina.',bodyFormat:'page-layout-v2',body:{type:'doc',content:[{type:'cmsRow',attrs:{id:'editor-row',layout:'full',gap:'normal',padding:'normal',tone:'default',verticalAlign:'start'},content:[{type:'cmsColumn',attrs:{id:'editor-column'},content:[{type:'cmsRichText',attrs:{id:'editor-text'},content:[{type:'paragraph',content:[{type:'text',text:'Bestaande pagina-inhoud.',marks:[{type:'link',attrs:{href:'/clubmuur/club/contact'}}]}]}]}]}]}]},parentId:'',menuGroup:'club',menuVisible:false,order:999,seo:{title:'',description:'',noIndex:true},useBuilder:true,status:'draft'};
 const mutate=async(action:'save'|'publish',expectedVersion:number)=>{
  const response=await page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes:[{module:'pages',id,expectedVersion,action,data}]}});
  expect(response.status()).toBe(200);return (await response.json()).versions[id] as number;
 };
 const savedVersion=await mutate('save',0),publishedVersion=await mutate('publish',savedVersion);
 await page.goto('/beheer?editor='+id+'#paginas');
 await page.getByRole('textbox',{name:'Pagina’s doorzoeken',exact:true}).fill(title);
 await page.locator('.cms-page-select').filter({hasText:title}).click();
 const composer=page.locator(`[data-page-id="${id}"]`);
 await expect(composer.locator('.pb-rich-content')).toContainText('Bestaande pagina-inhoud.');
 await expect(page.locator('.cms-page-breadcrumb .cms-status')).toHaveText('Gepubliceerd');
 await expect(page.locator('.pb-palette')).toHaveCount(0);
 await expect(page.locator('.cms-page-planning')).not.toHaveAttribute('open');
 // Opening rich text with missing schema defaults must not create a draft.
 await page.waitForTimeout(900);
 expect((await page.request.get('/api/cms/pages/'+id).then(response=>response.json())).version).toBe(publishedVersion);
 const paragraph=composer.locator('.pb-rich-content p');
 await paragraph.click();await expect(page.locator('.ProseMirror')).toBeFocused();
 await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
 const text='Nieuwe tekst zonder verdwenen letters.';
 await page.keyboard.type(text);await expect(paragraph).toHaveText(text);
 await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
 await page.getByRole('button',{name:'Onderstrepen',exact:true}).click();
 await page.getByRole('button',{name:'Centreren',exact:true}).click();
 await page.getByRole('combobox',{name:'Tekststijl',exact:true}).selectOption('3');
 await expect(composer.locator('.pb-rich-content h3 u')).toHaveText(text);
 await page.getByRole('button',{name:'Bewaren',exact:true}).click();
 await expect.poll(async()=>JSON.stringify((await page.request.get('/api/cms/pages/'+id).then(response=>response.json())).body)).toContain(text);
 await page.getByRole('button',{name:'Publicatie bijwerken',exact:true}).click();
 await expect(page.locator('.cms-page-breadcrumb .cms-status')).toHaveText('Gepubliceerd');
 await page.reload();
 await page.getByRole('textbox',{name:'Pagina’s doorzoeken',exact:true}).fill(title);
 await page.locator('.cms-page-select').filter({hasText:title}).click();
 await expect(composer.locator('.pb-rich-content h3 u')).toHaveText(text);
 await expect(composer.locator('.pb-rich-content h3')).toHaveCSS('text-align','center');
 await page.getByRole('button',{name:'Revisies',exact:true}).click();
 await expect(page.locator('.cms-page-revisions article').first()).toContainText('Gepubliceerd');
});

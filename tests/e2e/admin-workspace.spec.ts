import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));

test('trash restores the selected server version as an unpublished working copy',async({page})=>{
 await loginWithEmailCode(page,owner.email);
 const id='restore-browser-'+crypto.randomUUID(),title='Herstelcontrole '+crypto.randomUUID(),slug=id;
 const data={contentType:'news',storyFormat:'story',title,slug,intro:'Herstelcontrole zonder e-mail.',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bewaar deze inhoud als werkversie.'}]}]},coverId:'',author:'Redactie',category:'Clubnieuws',tags:[],teamId:'',season:'2026–2027',seo:{title:'',description:'',noIndex:true},featured:false,publishedAt:new Date().toISOString()};
 async function mutate(action:string,expectedVersion:number){const response=await page.request.post('/api/cms/mutations',{headers:{Origin:new URL(page.url()).origin},data:{operationId:crypto.randomUUID(),changes:[{module:'articles',id,action,expectedVersion,data}]}});expect(response.status(),await response.text()).toBe(200);return (await response.json()).versions[id];}
 const publishedVersion=await mutate('publish',0),trashedVersion=await mutate('trash',publishedVersion);
 await page.goto('/beheer?restore='+encodeURIComponent(id)+'#herstel');
 await page.getByRole('button',{name:/^Prullenbak \(/}).click();
 await page.getByLabel('Zoeken in prullenbak',{exact:true}).fill(title);
 await expect(page.getByRole('navigation',{name:'Paginering Prullenbak',exact:true})).toContainText('1–1 van 1');
 const saved=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST'&&response.request().postDataJSON().changes.some((change:any)=>change.id===id&&change.action==='restore'));
 await page.getByRole('button',{name:'Herstellen als concept',exact:true}).click();
 const restored=await saved;expect(restored.status(),await restored.text()).toBe(200);expect(restored.request().postDataJSON().changes.find((change:any)=>change.id===id).expectedVersion).toBe(trashedVersion);
 await expect(page.getByRole('status').filter({hasText:'Inhoud hersteld als concept.'})).toBeVisible();
 const record=await page.request.get('/api/cms/articles/'+id).then(response=>response.json());expect(record.title).toBe(title);expect(record.status).toBe('draft');expect(record.live).toBeFalsy();expect(record.deletedAt).toBeFalsy();
 expect((await page.request.get('/clubmuur/nieuws/'+slug)).status()).toBe(404);
});

test('all CMS modules keep navigation and account controls usable on a narrow screen',async({page})=>{
 test.setTimeout(120000);
 await loginWithEmailCode(page,owner.email);
 await page.setViewportSize({width:320,height:844});
 const modules=[['overzicht','Overzicht'],['nieuws','Nieuws'],['verhalen','Verhalen & columns'],['paginas','Pagina’s'],['personen','Personen & commissies'],['media','Mediabibliotheek'],['albums','Fotoalbums'],['homepage','Homepage'],['trainingen','Trainingstijden'],['agenda','Agenda'],['navigatie','Navigatie'],['documenten','Documenten'],['formulieren','Formulieren & inbox'],['rollen','Gebruikers & rollen'],['instellingen','Instellingen & koppelingen'],['herstel','Prullenbak & back-up']];
 for(const [id,label] of modules){
  await page.goto('/beheer#'+id);
  await expect(page.locator('.dd-breadcrumb>b')).toHaveText(label);
  await expect(page.getByText('Clubbeheer wordt geladen…',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Accountbeveiliging',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Uitloggen',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),label).toBe(false);
 }
});

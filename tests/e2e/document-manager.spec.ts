import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));

test('document search and deletion persist through the server',async({page})=>{
 await loginWithEmailCode(page,owner.email);
 const id=crypto.randomUUID(),title='Documentproef '+id.slice(0,8),origin=new URL(page.url()).origin;
 const created=await page.request.post('/api/cms/mutations',{headers:{Origin:origin},data:{operationId:crypto.randomUUID(),changes:[{module:'documents',id,expectedVersion:0,action:'save',data:{title,url:'https://example.invalid/document.pdf',category:'Clubdocumenten',published:false}}]}});
 expect(created.status()).toBe(200);
 await page.goto('/beheer?documentproef='+id+'#documenten');
 const search=page.getByRole('textbox',{name:'Zoek documenten',exact:true});await search.fill('bestaat-niet-'+id);
 await expect(page.getByRole('heading',{name:'Geen documenten gevonden',exact:true})).toBeVisible();
 await search.fill(title);await page.locator('.cms-record-row').filter({hasText:title}).getByRole('button',{name:'Bewerken',exact:true}).click();
 await page.getByRole('button',{name:'Verwijderen',exact:true}).click();
 const mutation=page.waitForResponse(response=>response.url().endsWith('/api/cms/mutations')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Ja, link verwijderen',exact:true}).click();
 const response=await mutation;expect(response.status()).toBe(200);expect(response.request().postDataJSON().changes).toEqual([expect.objectContaining({module:'documents',id,action:'trash'})]);
 await expect(page.getByRole('heading',{name:'Geen documenten gevonden',exact:true})).toBeVisible();
 await page.reload();await search.fill(title);await expect(page.locator('.cms-record-row').filter({hasText:title})).toHaveCount(0);
 const record=await page.request.get('/api/cms/documents/'+id).then(result=>result.json());expect(record.deletedAt).toBeTruthy();expect(record.published).toBe(false);
});

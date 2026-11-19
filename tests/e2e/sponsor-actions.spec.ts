import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sponsorV72Fixture} from '../helpers/sponsor-v72-fixture';
import {closeDb} from '../../db';

assertLocalSupabaseTests();
test.use({trace:'off',video:'off'});
const account=JSON.parse(readFileSync(process.env.SPONSOR_E2E_ACCOUNT_FILE||'.runtime/e2e-account.json','utf8'));
async function workspace(page:Page){
 const response=await page.request.get('/api/cms/sponsor-workspace?mode=sponsorship');
 expect(response.status()).toBe(200);return response.json();
}
async function command(page:Page,name:string,args:unknown[]){
 const scope=await workspace(page),response=await page.request.post('/api/cms/sponsor-workspace',{
  headers:{Origin:new URL(process.env.APP_BASE_URL!).origin},
  data:{operationId:crypto.randomUUID(),mode:'sponsorship',companyId:'',versions:scope.versions,commands:[{name,args,offset:0}]}
 });
 expect(response.status(),await response.text()).toBe(200);
}
async function tab(page:Page,name:string){await page.getByRole('navigation',{name:'Sponsoring onderdelen'}).getByRole('button',{name:new RegExp('^'+name+'(?:\\s+\\d+)?$')}).click();}
test.afterAll(closeDb);

test('search has one border and consistent adjacent icons remove a relation with its active draft after confirmation',async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:1440,height:900});
 await loginWithEmailCode(page,account.email);
 const id=crypto.randomUUID(),name='Fictieve verwijderbare relatie '+id.slice(0,8);
 const sponsor={...sponsorV72Fixture().sponsorship!.sponsors[0],id,name,ownerId:account.id,businessDetails:undefined};
 await command(page,'saveSponsor',[sponsor]);
 await command(page,'createSponsorProposal',[id]);
 await page.goto('/beheer#sponsoring');await tab(page,'Relaties');
 const search=page.getByRole('textbox',{name:'Zoek sponsor',exact:true});
 await search.fill(name);
 const border=await search.evaluate(input=>{
  const inner=getComputedStyle(input),outer=getComputedStyle(input.parentElement!);
  return {inner:inner.borderTopWidth,shadow:inner.boxShadow,outline:inner.outlineWidth,outer:outer.borderTopWidth};
 });
 expect(border).toEqual({inner:'0px',shadow:'none',outline:'0px',outer:'1px'});
 const row=page.getByRole('row').filter({hasText:name}),edit=row.getByRole('button',{name:'Bewerk '+name,exact:true}),remove=row.getByRole('button',{name:'Verwijder '+name,exact:true});
 await expect(edit.locator('svg')).toHaveClass(/lucide-pencil/);
 await expect(remove.locator('svg')).toHaveClass(/lucide-trash/);
 const editBox=await edit.boundingBox(),removeBox=await remove.boundingBox();
 expect(editBox).not.toBeNull();expect(removeBox).not.toBeNull();
 expect(removeBox!.x).toBeGreaterThan(editBox!.x);expect(removeBox!.y).toBe(editBox!.y);
 expect(removeBox!.width).toBe(editBox!.width);expect(removeBox!.height).toBe(editBox!.height);
 await remove.click();
 await expect(page.getByRole('dialog')).toContainText('Vastgelegde documenten en facturen blijven');
 await page.getByRole('dialog').getByRole('button',{name:'Annuleren',exact:true}).click();
 await expect(row).toBeVisible();
 await tab(page,'Voorstellen');
 const proposal=(await workspace(page)).state.sponsorship.proposals.find((entry:{sponsorId:string})=>entry.sponsorId===id);
 const proposalRow=page.getByRole('row').filter({hasText:name});
 const pair=proposalRow.locator('.cms-record-actions');
 await expect(pair.getByRole('button',{name:'Bewerken',exact:true})).toBeVisible();
 await expect(pair.getByRole('button',{name:'Verwijder concept '+proposal.name,exact:true})).toBeVisible();
 await tab(page,'Relaties');await remove.click();
 const saved=page.waitForResponse(response=>response.url().includes('/api/cms/sponsor-workspace')&&response.request().method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:'Relatie geforceerd verwijderen',exact:true}).click();
 expect((await saved).status()).toBe(200);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(row).toHaveCount(0);
 await page.reload();await tab(page,'Relaties');await search.fill(name);await expect(row).toHaveCount(0);
 const scope=await workspace(page);
 expect(scope.state.sponsorship.sponsors.some((entry:{id:string})=>entry.id===id)).toBe(false);
 expect(scope.state.sponsorship.proposals.some((entry:{sponsorId:string})=>entry.sponsorId===id)).toBe(false);
});

import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {loginWithEmailCode} from './login-fixture';

assertLocalSupabaseTests();
test('v75: administrator configures access without assuming a board role, and role editor preserves the explicit chair grant',async({page})=>{
 test.setTimeout(120000);page.setDefaultTimeout(15000);
 const owner=JSON.parse(await readFile('.runtime/e2e-account.json','utf8'));await loginWithEmailCode(page,owner.email);
 await page.goto('/beheer#bestuur');await expect(page.getByRole('heading',{name:'Bestuur inrichten',exact:true})).toBeVisible();
 const response=await page.request.get('/api/cms/board');expect(response.status()).toBe(200);const data=await response.json();
 expect(data.actor).toBeNull();expect(data.permissions.configure).toBe(true);expect(data.board.meetings).toHaveLength(0);expect(data.board.proposals).toHaveLength(0);expect(data.board.actions).toHaveLength(0);
 await mkdir('.runtime/screenshots/bestuur-v75',{recursive:true});await page.screenshot({path:'.runtime/screenshots/bestuur-v75/beheerder-inrichting.png',fullPage:true});
 await page.getByRole('link',{name:'Gebruikers & rollen openen',exact:false}).click();
 await page.getByRole('navigation',{name:'Gebruikersbeheer',exact:true}).getByRole('button',{name:/Rollen & rechten/}).click();
 const role=page.getByRole('button',{name:/^Bestuur · Voorzitter/}),pagination=page.getByRole('navigation',{name:'Paginering Rollen',exact:true});
 await expect(pagination.locator('span').first()).toHaveText(/^\d+–\d+ van [1-9]\d*$/);
 const count=await pagination.getByRole('button',{name:/^Rollen: pagina \d+$/}).evaluateAll(buttons=>Math.max(...buttons.map(button=>Number(button.textContent))));
 for(let current=1;current<count&&await role.count()===0;current++){
  await pagination.getByRole('button',{name:'Rollen: volgende pagina',exact:true}).click();
  await expect(pagination.getByRole('button',{name:'Rollen: pagina '+(current+1),exact:true})).toHaveAttribute('aria-current','page');
 }
 await role.click();await expect(page.getByRole('combobox',{name:'Bestuursrol',exact:true})).toHaveValue('chair');await expect(page.getByRole('checkbox',{name:'board read',exact:true})).toBeChecked();
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/cms/roles')&&r.request().method()==='POST');await page.getByRole('button',{name:'Rol bewaren',exact:true}).click();expect((await saved).status()).toBe(200);
 const roles=await page.request.get('/api/cms/roles').then(r=>r.json()),chair=roles.items.find((item:any)=>item.id==='board-chair');
 expect(chair.grants.filter((grant:any)=>grant.module==='board').map((grant:any)=>grant.action).sort()).toEqual(['chair','read']);
});

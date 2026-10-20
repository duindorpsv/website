import {expect,type Page} from '@playwright/test';
import {clearBrowserLoginLimits,capturedEmailCode} from '../helpers/email-code';
export async function loginWithEmailCode(page:Page,email:string){
 await clearBrowserLoginLimits(email);const after=Date.now();
 await page.goto('/beheer/login');await page.getByLabel('E-mailadres',{exact:true}).fill(email);
 const requested=page.waitForResponse(response=>response.url().endsWith('/api/auth/email-code/request')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Inlogcode aanvragen',exact:true}).click();expect((await requested).status()).toBe(200);
 const code=await capturedEmailCode(email,after);await page.getByLabel('Inlogcode',{exact:true}).fill(code);
 await page.getByRole('button',{name:'Inloggen',exact:true}).click();await expect(page.getByText('Gedeeld CMS',{exact:true})).toBeVisible({timeout:30000});await expect(page.locator('.dd-save-indicator')).toHaveText('Serveropslag',{timeout:30000});
}

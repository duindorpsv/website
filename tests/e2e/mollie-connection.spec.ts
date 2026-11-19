import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {createMollieSettings} from '../../lib/cms/mollie';
import {closeDb} from '../../db';

assertLocalSupabaseTests();
// This adapter exercises the settings UI without sending credentials to Mollie.
test.use({trace:'off',video:'off'});
const account=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
test.afterAll(closeDb);

test('Mollie profile keys stay private and test/live activation is separate',async({page})=>{
 test.setTimeout(120000);
 const settings=createMollieSettings(),fakeKey='test_FICTIONALLOCALONLY000000001234';
 const connections={test:{configured:false,organizationId:'',bindingId:'',currentProfileId:'',authMode:'advanced-token',reason:'Nog niet verbonden',source:'none',keyPreview:''},live:{configured:false,organizationId:'',bindingId:'',currentProfileId:'',authMode:'advanced-token',reason:'Nog niet verbonden',source:'none',keyPreview:''}};
 let version=0,rejectFirst=true;
 const actions:string[]=[];
 await page.route('**/api/cms/mollie',async route=>{
  if(route.request().method()==='POST'){
   const command=route.request().postDataJSON(),mode=command.mode as 'test'|'live',environment=settings.environments[mode];
   actions.push(command.action);
   expect(command.expectedVersion).toBe(version);
   if(command.action==='api-key'){
    expect(command.apiKey).toBe(fakeKey);
    if(rejectFirst){rejectFirst=false;await route.fulfill({status:422,json:{message:'Rejected '+fakeKey}});return;}
    environment.authMode='profile-api-key';environment.credentialReference='stored-api-key';environment.currentProfileId='pfl_localfixture';
    environment.catalog={source:'provider',organizationId:'',bindingId:'fixture-binding',fetchedAt:new Date().toISOString(),profiles:[{id:'pfl_localfixture',name:'Fictieve clubbetalingen',website:'https://example.invalid',status:'verified',canReceivePayments:true,mode,readinessCheckedAt:new Date().toISOString()}],balances:[],links:[]};
    connections[mode]={configured:true,organizationId:'',bindingId:'fixture-binding',currentProfileId:'pfl_localfixture',authMode:'profile-api-key',reason:'',source:'stored-api-key',keyPreview:'test_••••1234'};
   }else if(command.action==='streams')environment.streams=command.streams;
   else if(command.action==='activation')environment.paymentsEnabled=command.enabled;
   else if(command.action==='mode')settings.mode=mode;
   else throw Error('Unexpected local settings action');
   version++;
  }
  await route.fulfill({json:{settings,version,connections,paymentsEnabled:settings.environments[settings.mode].paymentsEnabled,executionAllowed:settings.environments[settings.mode].paymentsEnabled}});
 });
 await page.setViewportSize({width:1440,height:1000});
 await loginWithEmailCode(page,account.email);
 await page.goto('/beheer?koppeling=mollie#instellingen');
 const input=page.getByLabel('Test API-sleutel',{exact:true});
 await expect(input).toHaveAttribute('type','password');
 await expect(input).toHaveAttribute('autocomplete','off');
 await expect(page.getByRole('button',{name:'Testbetalingen activeren',exact:true})).toBeDisabled();
 await expect(page.locator('.ml-advanced')).not.toHaveAttribute('open','');
 await input.fill(fakeKey);await page.getByRole('button',{name:'Opslaan en verifiëren',exact:true}).click();
 await expect(page.locator('.ml-error')).toContainText('De API-sleutel kon niet worden gecontroleerd');
 await expect(input).toHaveValue('');await expect(page.locator('body')).not.toContainText(fakeKey);
 await input.fill(fakeKey);await page.getByRole('button',{name:'Opslaan en verifiëren',exact:true}).click();
 await expect(page.locator('.ml-saved-key')).toContainText('test_••••1234');
 await expect(input).toHaveValue('');await expect(page.locator('body')).not.toContainText(fakeKey);
 await expect(page.locator('.ml-card.ml-confirm-link')).toHaveCount(0);
 const row=page.getByRole('row').filter({has:page.getByRole('checkbox',{name:/Sponsoring/})});
 await row.getByRole('checkbox').check();
 await row.getByRole('combobox').selectOption('pfl_localfixture');
 await page.getByRole('button',{name:'Verdeling opslaan',exact:true}).click();
 await expect(page.getByRole('button',{name:'Testbetalingen activeren',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Testbetalingen activeren',exact:true}).click();
 await expect(page.locator('.ml-activation')).toContainText('Actief');
 await expect(page.getByRole('button',{name:'Betalingen uitschakelen',exact:true})).toBeEnabled();
 mkdirSync('.runtime/mollie-connection-ui',{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>scrollTo(0,0));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.runtime/mollie-connection-ui/test-connected-'+width+'.png',fullPage:false,animations:'disabled'});
  await page.locator('.ml-api-key').screenshot({path:'.runtime/mollie-connection-ui/api-key-'+width+'.png',animations:'disabled'});
  await page.locator('.ml-activation').screenshot({path:'.runtime/mollie-connection-ui/activation-'+width+'.png',animations:'disabled'});
 }
 await page.locator('.ml-mode-switch').getByRole('button',{name:'Live',exact:true}).click();
 await expect(page.getByLabel('Live API-sleutel',{exact:true})).toHaveValue('');
 await expect(page.getByRole('button',{name:'Livebetalingen activeren',exact:true})).toBeDisabled();
 await expect(page.locator('.ml-activation')).toContainText('Uitgeschakeld');
 await expect(page.locator('.ml-saved-key')).toHaveCount(0);
 expect(settings.environments.test.paymentsEnabled).toBe(true);
 expect(settings.environments.live.paymentsEnabled).toBe(false);
 expect(actions.filter(action=>action==='activation')).toHaveLength(1);
});

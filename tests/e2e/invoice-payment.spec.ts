import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {donorInvoiceSchema} from '../../lib/cms/sponsorship-schema';
import {calculateSponsorTotals} from '../../lib/cms/sponsorship';

assertLocalSupabaseTests();
test.use({trace:'off',video:'off'});
const sql=sqlClient(),account=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
test.afterAll(closeDb);

test('backoffice invoice links distinguish test payments and refresh a verified live receipt',async({page})=>{
 test.setTimeout(120000);page.setDefaultTimeout(15000);
 const id=crypto.randomUUID(),stamp=new Date().toISOString(),date=stamp.slice(0,10),number='FICTIEF-MOLLIE-'+id.slice(0,8);
 const lines=[{id:crypto.randomUUID(),itemId:'',name:'Fictieve clubbijdrage',description:'Lokale browsercontrole',quantity:1,unitPriceCents:1001,taxRate:'0' as const,startDate:date,endDate:''}];
 const invoice=donorInvoiceSchema.parse({id,donorId:crypto.randomUUID(),contributionId:crypto.randomUUID(),number,issueDate:date,dueDate:date,status:'open',issuer:{legalName:'Fictieve club',address:'Voorbeeldstraat 1',companyNumber:'',email:'club@example.invalid'},recipient:{id:crypto.randomUUID(),name:'Fictieve Mollie-betaler',kind:'person',email:'betaler@example.invalid',phone:'',address:'Voorbeeldstraat 2',postalCode:'1234 AB',city:'Teststad',notes:'',active:true,createdAt:stamp,updatedAt:stamp},lines,totals:calculateSponsorTotals(lines),totalCents:1001,paidAt:'',createdAt:stamp});
 await sql`insert into cms_sponsor_records(id,kind,data) values (${id},'donorInvoices',${sql.json(invoice as any)})`;
 type Attempt={id:string;status:string;providerId:string;checkoutUrl:string;errorCode:null;mode:'test'|'live'};
 let mode:'test'|'live'='test',enabled=false,attempt:Attempt|null=null;
 const calls:{action?:string;sourceKind:string;sourceId:string;operationId?:string;expectedMode?:'test'|'live'}[]=[];
 await page.route('**/api/sponsorship/payments*',async route=>{
  const request=route.request();
  if(request.method()==='POST'){
   const body=request.postDataJSON();calls.push(body);expect(body.sourceKind).toBe('donors');expect(body.sourceId).toBe(id);expect(body.amountCents).toBeUndefined();
   if(body.action==='verify'){
    attempt!.status='paid';
    if(mode==='live')await sql`update cms_sponsor_records set data=data||${sql.json({status:'paid',paidAt:stamp,paymentMethod:'mollie',paymentReference:'tr_localfixture'})}::jsonb,version=version+1 where id=${id}`;
   }else{
    expect(body.operationId).toMatch(/^[a-f0-9-]{36}$/);expect(body.expectedMode).toBe(mode);
    attempt={id:crypto.randomUUID(),status:'open',providerId:'tr_localfixture',checkoutUrl:'https://www.mollie.com/checkout/localfixture',errorCode:null,mode};
    await route.fulfill({json:attempt});return;
   }
  }else{
   const url=new URL(request.url());expect(url.searchParams.get('sourceId')).toBe(id);expect(url.searchParams.get('sourceKind')).toBe('donors');
  }
  await route.fulfill({json:{mode,enabled,reason:enabled?'':'Activeer online betalen bij de Mollie-instellingen.',attempt}});
 });
 await page.setViewportSize({width:1440,height:1000});await loginWithEmailCode(page,account.email);
 await page.goto('/beheer#donateurs');await page.getByRole('navigation',{name:'Donateurs onderdelen'}).getByRole('button',{name:/^Facturen(?:\s+\d+)?$/}).click();
 const row=page.getByRole('row').filter({hasText:number});await row.getByRole('button',{name:'Mollie-betaallink',exact:true}).click();
 let dialog=page.getByRole('dialog');await expect(dialog).toContainText('Activeer online betalen');await expect(dialog.getByRole('button',{name:'Testbetaallink maken',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Sluiten',exact:true}).first().click();enabled=true;
 await row.getByRole('button',{name:'Mollie-betaallink',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog).toContainText('Dit is een testbetaling');
 await dialog.getByRole('button',{name:'Testbetaallink maken',exact:true}).click();await expect(dialog.getByRole('link',{name:'Testbetaling openen',exact:false})).toHaveAttribute('href','https://www.mollie.com/checkout/localfixture');
 mkdirSync('.runtime/invoice-payment-ui',{recursive:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.runtime/invoice-payment-ui/test-link-'+width+'.png',animations:'disabled'});}
 await dialog.getByRole('button',{name:'Betaalstatus controleren',exact:true}).click();await expect(dialog).toContainText('Testbetaling voltooid');
 expect((await sql`select data from cms_sponsor_records where id=${id}`)[0].data.status).toBe('open');
 mode='live';attempt=null;await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(dialog).toContainText('Liveomgeving');await dialog.getByRole('button',{name:'Betaallink maken',exact:true}).click();await expect(dialog.getByRole('link',{name:'Betaallink openen',exact:false})).toBeVisible();
 await dialog.getByRole('button',{name:'Betaalstatus controleren',exact:true}).click();await expect(dialog).toContainText('De factuur is bijgewerkt');await dialog.getByRole('button',{name:'Sluiten',exact:true}).first().click();await expect(row).toContainText('Betaald');
 expect(calls.filter(call=>!call.action)).toHaveLength(2);expect(calls.filter(call=>!call.action)[0].operationId).not.toBe(calls.filter(call=>!call.action)[1].operationId);expect(calls.filter(call=>call.action==='verify')).toHaveLength(2);
 await page.goto('/betaling');await expect(page.getByRole('heading',{name:'Bedankt voor je steun.'})).toBeVisible();await expect(page.locator('body')).not.toContainText(number);
});

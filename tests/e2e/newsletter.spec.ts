import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {sqlClient} from '../../db';
import {runOnce} from '../../lib/server/worker';
import {previewLocalDate} from '../../lib/cms/match-preview';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';

test('newsletter composer uses TipTap, preserves server drafts and immutable scheduled worker mail',async({page,context})=>{
 test.setTimeout(120000);assertLocalSupabaseTests();const sql=sqlClient(),owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8')),tag=crypto.randomUUID().slice(0,8),name='Clubpost browser '+tag,audience='Browsergroep '+tag;
 await loginWithEmailCode(page,owner.email);
 const command=async(action:string,rest:any={})=>{const r=await page.request.post('/api/cms/newsletters',{headers:{Origin:process.env.APP_BASE_URL!},data:{operationId:crypto.randomUUID(),action,...rest}});expect(r.status(),await r.text()).toBe(200);return r.json();};
 const contactId=crypto.randomUUID(),audienceId=crypto.randomUUID();
 await command('contact',{data:{id:contactId,email:'newsletter-browser-'+tag+'@example.org',name:'Browser Supporter',status:'subscribed',source:'manual',tags:['browser-'+tag],consentAt:new Date().toISOString()}});
 await command('audience',{data:{id:audienceId,name:audience,description:'Geïsoleerde browsertest',color:'#DBEAFE',mode:'tags',tags:['browser-'+tag],contactIds:[]}});
 await page.goto('/beheer#nieuwsbrieven');await page.getByRole('button',{name:'Nieuwsbrief maken',exact:true}).click();
 await page.getByLabel('Interne naam',{exact:true}).fill(name);await page.getByLabel('Onderwerpregel',{exact:true}).fill('Onze club. Onze trots. '+tag);
 await page.getByRole('checkbox',{name:new RegExp(audience)}).check();
 await page.getByRole('button',{name:'Tekst bewerken',exact:true}).first().click();
 const editor=page.locator('.nlb-block-fields .tiptap');await expect(editor).toBeVisible();await editor.fill('Beste {{voornaam}}, dit is de volledige clubpost.');await editor.press('ControlOrMeta+A');await page.getByRole('button',{name:'Vet',exact:true}).click();
 await expect(page.locator('.nl-autosave')).toContainText('Bewaard op de server');
 const [record]=await sql`select id,data from cms_newsletter_resources where kind='campaign' and data->>'name'=${name}`;expect(record.data.blocks[0].body.type).toBe('doc');expect(JSON.stringify(record.data.blocks[0].body)).toContain('bold');
 const rejectedSave=async(route:any)=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='save')await route.fulfill({status:409,json:{code:'conflict',message:'Een andere redacteur heeft deze editie gewijzigd.'}});else await route.continue();};
 await page.route('**/api/cms/newsletters',rejectedSave);await page.getByLabel('Onderwerpregel',{exact:true}).fill('Bewaarde eigen werkversie '+tag);await expect(page.locator('.nl-autosave')).toContainText('Opslaan niet gelukt');await expect(page.getByLabel('Onderwerpregel',{exact:true})).toHaveValue('Bewaarde eigen werkversie '+tag);await expect(page.getByRole('alert').filter({hasText:'andere redacteur'})).toBeVisible();await page.unroute('**/api/cms/newsletters',rejectedSave);await page.getByRole('button',{name:'Opnieuw bewaren',exact:true}).click();await expect(page.locator('.nl-autosave')).toContainText('Bewaard op de server');
 const lostAcknowledgement=async(route:any)=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='save'){await route.fetch();await route.abort('failed');}else await route.continue();};
 await page.route('**/api/cms/newsletters',lostAcknowledgement);await page.getByLabel('Onderwerpregel',{exact:true}).fill('Eenmaal opgeslagen ondanks netwerkfout '+tag);await expect(page.locator('.nl-autosave')).toContainText('Opslaan niet gelukt');await page.unroute('**/api/cms/newsletters',lostAcknowledgement);await page.getByRole('button',{name:'Opnieuw bewaren',exact:true}).click();await expect(page.locator('.nl-autosave')).toContainText('Bewaard op de server');await expect(page.getByLabel('Onderwerpregel',{exact:true})).toHaveValue('Eenmaal opgeslagen ondanks netwerkfout '+tag);
 await page.getByRole('button',{name:'Tekst dupliceren',exact:true}).first().click();await expect(page.locator('.nlb-block')).toHaveCount(3);await page.getByRole('button',{name:'Tekst omhoog',exact:true}).nth(1).click();
 await expect(page.locator('.nl-autosave')).toContainText('Bewaard op de server');
 await page.getByRole('button',{name:'Nieuwsbericht',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.locator('.nl-article-picker button').first().click();await expect(page.locator('.nlb-block')).toHaveCount(4);await page.getByRole('button',{name:'Nieuwsbericht verwijderen',exact:true}).click();await expect(page.locator('.nlb-block')).toHaveCount(3);await expect(page.locator('.nl-autosave')).toContainText('Bewaard op de server');
 const [copied]=await sql`select data from cms_newsletter_resources where id=${record.id}`;expect(new Set(copied.data.blocks.map((b:any)=>b.id)).size).toBe(3);
 for(const width of [1440,1024,390]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`.runtime/screenshots/newsletter-editor-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Voorbeeld',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();const frame=page.frameLocator('iframe[title="E-mailvoorbeeld"]');await expect(frame.getByText('De clubpost.',{exact:true})).toBeVisible();await expect(frame.locator('body')).toContainText('Beste Supporter');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Inplannen',exact:true}).click();await page.getByLabel('Verzendmoment · Nederlandse tijd').fill(previewLocalDate(new Date(Date.now()+86400000).toISOString()));await page.getByRole('button',{name:'Editie inplannen',exact:true}).click();await expect(page.locator('.nl-frozen-note')).toContainText('vastgezet');
 const [planned]=await sql`select data from cms_newsletter_resources where id=${record.id}`;expect(planned.data.snapshot.settings).toBeTruthy();expect(planned.data.snapshot.templateVersion).toBe('clubpost-v1');
 await page.close();
 await sql`update cms_jobs set run_at='1800-01-01T00:00:00Z' where kind='newsletter-dispatch' and payload->>'campaignId'=${record.id} and status='pending'`;await runOnce();
 await expect.poll(async()=>(await sql`select id from cms_newsletter_deliveries where campaign_id=${record.id} and email=${'newsletter-browser-'+tag+'@example.org'}`).length).toBe(1);
 const [delivery]=await sql`select * from cms_newsletter_deliveries where campaign_id=${record.id} and email=${'newsletter-browser-'+tag+'@example.org'}`;expect(['queued','processing','accepted']).toContain(delivery.status);
 await sql`update cms_jobs set run_at='1800-01-01T00:00:00Z' where kind='newsletter-delivery' and payload->>'deliveryId'=${delivery.id} and status='pending'`;await runOnce();
 await expect.poll(async()=>(await sql`select status from cms_newsletter_deliveries where id=${delivery.id}`)[0].status).toBe('accepted');
 const [sent]=await sql`select provider_id from cms_newsletter_deliveries where id=${delivery.id}`;expect(sent.provider_id).toBeTruthy();
 const reopened=await context.newPage();await reopened.goto('/beheer#nieuwsbrieven');await reopened.getByRole('button',{name:new RegExp(name)}).first().click();await expect(reopened.locator('.nl-log-list')).toContainText('Aangeboden aan Resend');await expect(reopened.getByLabel('Onderwerpregel',{exact:true})).toBeDisabled();await reopened.close();
});

test('newsletter public access does not change status on GET and rejects anonymous CMS access',async({page})=>{
 const r=await page.request.get('/api/cms/newsletters');expect(r.status()).toBe(401);
 await page.goto('/clubmuur/media/nieuwsbrief');const form=page.getByRole('form',{name:'Nieuwsbrief aanvragen',exact:true});await expect(form).toBeVisible();await page.getByRole('button',{name:'Afmelden',exact:true}).first().click();await expect(page.getByRole('form',{name:'Nieuwsbrief afmelden',exact:true}).getByRole('checkbox')).toHaveCount(0);
 const get=await page.request.get('/api/newsletter/one-click?token='+'0'.repeat(64));expect(get.status()).toBe(405);
});

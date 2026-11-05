import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import type {Sponsor,SponsorItem,SponsorPackage,SponsorProposal} from '../../lib/cms/sponsorship-types';

assertLocalSupabaseTests();
const admin=JSON.parse(readFileSync(process.env.SPONSOR_E2E_ACCOUNT_FILE||'.runtime/e2e-account.json','utf8')) as {id:string;email:string};
const sql=sqlClient(),evidence='.runtime/sponsor-evidence/maatwerk';
test.beforeAll(()=>{mkdirSync(evidence,{recursive:true});});
test.afterAll(closeDb);
async function workspace(page:Page){
 const response=await page.request.get('/api/cms/sponsor-workspace?mode=sponsorship');
 expect(response.status()).toBe(200);return response.json();
}
async function command(page:Page,name:string,args:unknown[]){
 const scope=await workspace(page);
 const response=await page.request.post('/api/cms/sponsor-workspace',{headers:{Origin:new URL(process.env.APP_BASE_URL!).origin},data:{operationId:crypto.randomUUID(),mode:'sponsorship',companyId:'',versions:scope.versions,commands:[{name,args,offset:0}]}});
 expect(response.status(),await response.text()).toBe(200);return response.json();
}
async function capture(page:Page,name:string){
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:evidence+'/'+name+'.png',fullPage:false,animations:'disabled'});
}
function item(name:string):SponsorItem{return {id:crypto.randomUUID(),name,description:'Fictief sponsoritem voor een persoonlijke samenwerking.',kind:'board',priceCents:30000,setupCostCents:20000,taxRate:'21',capacity:0,period:'season',active:true};}
function company(name:string):Sponsor{return {id:crypto.randomUUID(),name,companyNumber:'',vatNumber:'',address:'',postalCode:'',city:'Den Haag',email:'maatwerk@example.invalid',phone:'',website:'https://example.invalid',description:'Fictief bedrijf voor de lokale maatwerkcontrole.',logoUrl:'',ownerId:admin.id,stage:'lead',notes:'Fictieve maatwerkacceptatie.',publicProfile:{name,description:'Fictief sponsorprofiel',website:'https://example.invalid',logoUrl:''},publicEnabled:false,publicFrom:'',publicUntil:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false};}

test('maatwerk in beheer: the explicit empty package choice opens, saves and reloads a personal proposal',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1363,height:936});
 await loginWithEmailCode(page,admin.email);
 const run=crypto.randomUUID().slice(0,8),sponsor=company('Fictieve maatwerkpartner '+run),catalogItem=item('Maatwerkbord '+run),proposalName='Maatwerkafspraken '+run;
 await command(page,'saveSponsor',[sponsor]);await command(page,'saveSponsorItem',[catalogItem]);
 await page.goto('/beheer#sponsoring');
 await page.getByRole('navigation',{name:'Sponsoring onderdelen'}).getByRole('button',{name:'Voorstellen',exact:true}).click();
 await page.getByRole('button',{name:'Voorstel maken',exact:true}).click();
 let dialog=page.getByRole('dialog');
 await dialog.getByLabel('Sponsor *',{exact:false}).selectOption(sponsor.id);
 await expect(dialog.getByLabel('Vertrekpunt',{exact:false})).toHaveValue('');
 await expect(dialog.getByLabel('Vertrekpunt',{exact:false}).locator('option:checked')).toHaveText('Maatwerk · zelf items kiezen');
 await capture(page,'beheer-maatwerk-start');
 const started=page.waitForResponse(response=>response.url().endsWith('/api/cms/sponsor-workspace')&&response.request().method()==='POST');
 await dialog.getByRole('button',{name:'Voorstel opbouwen',exact:true}).click();
 const startResponse=await started,request=startResponse.request().postDataJSON();
 const startCommand=request.commands.find((value:{name:string})=>value.name==='createSponsorProposal');
 expect(startCommand.args).toEqual([sponsor.id,'']);
 if(startResponse.status()!==200){
  await expect(dialog.getByRole('alert')).toBeVisible();
  writeFileSync(evidence+'/beheer-maatwerk-before-http.json',JSON.stringify({command:startCommand.name,args:startCommand.args,status:startResponse.status(),response:await startResponse.json()},null,2));
  await capture(page,'beheer-maatwerk-before-error');
 }
 expect(startResponse.status(),await startResponse.text()).toBe(200);
 dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Samenwerking op maat',exact:true})).toBeVisible();
 await expect(dialog.locator('.sb-line-card')).toHaveCount(0);
 await dialog.getByLabel('Naam van het voorstel',{exact:false}).fill(proposalName);
 await dialog.getByLabel('Sponsoritem toevoegen',{exact:false}).selectOption(catalogItem.id);
 const line=dialog.locator('.sb-line-card');await expect(line).toHaveCount(1);
 await line.getByLabel('Naam in dit voorstel',{exact:false}).fill('Twee persoonlijke maatwerkborden');
 await line.getByLabel('Toevoeging / concrete afspraak',{exact:false}).fill('Naast elkaar bij het hoofdveld.');
 await line.getByLabel('Aantal',{exact:false}).fill('2');
 const saved=page.waitForResponse(response=>response.url().endsWith('/api/cms/sponsor-workspace')&&response.request().method()==='POST');
 await dialog.getByRole('button',{name:'Concept bewaren',exact:true}).click();
 const savedResponse=await saved;expect(savedResponse.status(),await savedResponse.text()).toBe(200);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.reload();
 await page.getByRole('navigation',{name:'Sponsoring onderdelen'}).getByRole('button',{name:'Voorstellen',exact:true}).click();
 await page.getByRole('row').filter({hasText:proposalName}).getByRole('button',{name:'Bewerken',exact:false}).click();
 dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Naam van het voorstel',{exact:false})).toHaveValue(proposalName);
 await expect(dialog.locator('.sb-line-card')).toHaveCount(1);
 await expect(dialog.getByLabel('Naam in dit voorstel',{exact:false})).toHaveValue('Twee persoonlijke maatwerkborden');
 await expect(dialog.getByLabel('Toevoeging / concrete afspraak',{exact:false})).toHaveValue('Naast elkaar bij het hoofdveld.');
 await expect(dialog.getByLabel('Aantal',{exact:false})).toHaveValue('2');
 await expect(dialog.getByLabel('Eenmalige opmaakkosten voor deze regel (€)',{exact:false})).toHaveValue('200');
 const scope=await workspace(page),proposal=scope.state.sponsorship.proposals.find((value:SponsorProposal)=>value.name===proposalName) as SponsorProposal;
 expect(proposal).toMatchObject({sponsorId:sponsor.id,packageId:'',status:'draft',lines:[{itemId:catalogItem.id,name:'Twee persoonlijke maatwerkborden',addition:'Naast elkaar bij het hoofdveld.',quantity:2,unitPriceCents:30000,setupCostCents:20000}]});
 expect(proposal.snapshot).toBeUndefined();
 await capture(page,'beheer-maatwerk-opgeslagen-herladen');
 writeFileSync(evidence+'/beheer-maatwerk-result.json',JSON.stringify({createStatus:startResponse.status(),saveStatus:savedResponse.status(),explicitPackageValue:startCommand.args[1],companyId:sponsor.id,proposalId:proposal.id,packageId:proposal.packageId,status:proposal.status,lineCount:proposal.lines.length,quantity:proposal.lines[0].quantity,unitPriceCents:proposal.lines[0].unitPriceCents,setupCostCents:proposal.lines[0].setupCostCents,reloaded:true},null,2));
});

test('public Maatwerk CTA: selected package context is submitted to the real inbox and sponsor dossier',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1363,height:936});
 await loginWithEmailCode(page,admin.email);
 const run=crypto.randomUUID().slice(0,8),catalogItem=item('Fictief maatwerkitem '+run);
 await command(page,'saveSponsorItem',[catalogItem]);
 const pack:SponsorPackage={id:crypto.randomUUID(),name:'Maatwerk '+run,description:'Een fictieve samenwerking op maat voor de lokale acceptatiecontrole.',itemIds:[catalogItem.id],priceCents:30000,taxRate:'21',active:true};
 await command(page,'saveSponsorPackage',[pack]);
 await page.context().clearCookies();await page.goto('/clubmuur/club/word-sponsor');
 const card=page.locator('.spp-packages article').filter({has:page.getByRole('heading',{name:pack.name,exact:true})});
 await card.getByRole('link',{name:'Hier wil ik meer over weten',exact:false}).click();
 await expect(page).toHaveURL(/#sponsor-kennismaken$/);await expect(card).toHaveClass('selected');
 const context='Interesse: '+pack.name;
 await expect(page.locator('#sponsor-kennismaken').getByText(context,{exact:true})).toBeVisible();
 const form=page.getByRole('form',{name:'Sponsor worden',exact:true}),companyName='Fictieve publieke maatwerkaanvraag '+run,message='Ik wil een persoonlijke samenwerking voor twee borden bespreken.';
 await form.getByLabel('Naam contactpersoon *',{exact:true}).fill('Fictief maatwerkcontact');
 await form.getByLabel('Bedrijfsnaam *',{exact:true}).fill(companyName);
 await form.getByLabel('E-mailadres *',{exact:true}).fill('maatwerk-'+run+'@example.invalid');
 await form.getByLabel('Hoe wil je de club sponsoren? *',{exact:true}).fill(message);
 expect(await form.evaluate((node:HTMLFormElement)=>node.checkValidity())).toBe(true);
 await form.scrollIntoViewIfNeeded();
 await capture(page,'publiek-maatwerk-geselecteerd');
 const submitted=page.waitForResponse(response=>response.url().endsWith('/api/forms/sponsorship/submissions')&&response.request().method()==='POST');
 await form.getByRole('button',{name:'Sponsoraanvraag versturen',exact:true}).click();
 const response=await submitted;expect(response.status(),await response.text()).toBe(201);
 expect(response.request().postDataJSON().answers.message).toBe(message+'\n\n'+context);
 const {id}=await response.json();await expect(form.getByRole('status')).toContainText('Je sponsoraanvraag is ontvangen.');
 const [submission]=await sql`select answers from cms_submissions where id=${id}`;
 expect(submission.answers.find((answer:{fieldId:string})=>answer.fieldId==='message').value).toBe(message+'\n\n'+context);
 const leadId='sponsor-enquiry-'+id;
 await expect.poll(async()=>{const [lead]=await sql`select data from cms_sponsor_companies where id=${leadId}`;return lead?.data.notes;},{timeout:30000}).toBe('Aanvraag van Fictief maatwerkcontact\n'+message+'\n\n'+context);
 const [lead]=await sql`select data from cms_sponsor_companies where id=${leadId}`;
 expect(lead.data).toMatchObject({name:companyName,stage:'lead',publicEnabled:false});
 await capture(page,'publiek-maatwerk-ontvangen');
 writeFileSync(evidence+'/publiek-maatwerk-result.json',JSON.stringify({packageId:pack.id,packageName:pack.name,context,submissionId:id,leadId,httpStatus:response.status(),inboxMessage:message+'\n\n'+context,projectedToDossier:true},null,2));
});

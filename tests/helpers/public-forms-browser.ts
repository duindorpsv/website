import {expect,type Page} from '@playwright/test';

async function fill(page:Page,form:ReturnType<Page['getByRole']>,values:Record<string,string>){
  for(const [name,value] of Object.entries(values)){
    const input=form.getByLabel(name,{exact:true});
    if(await input.evaluate(element=>element.tagName==='SELECT'))await input.selectOption(value);else await input.fill(value);
  }
}
async function assertControlsVisible(form:ReturnType<Page['getByRole']>){
  for(const input of await form.locator('input:not([tabindex="-1"]):not([type=checkbox]),textarea,select').all()){
    const style=await input.evaluate(element=>{const computed=getComputedStyle(element),rect=element.getBoundingClientRect();return {border:computed.borderTopStyle,width:parseFloat(computed.borderTopWidth),radius:parseFloat(computed.borderTopLeftRadius),height:rect.height};});
    expect(style.border).toBe('solid');expect(style.width).toBeGreaterThanOrEqual(1);expect(style.radius).toBeGreaterThanOrEqual(6);expect(style.height).toBeGreaterThanOrEqual(44);
  }
}
export async function publicContactAndSponsorship(page:Page){
  await page.goto('/clubmuur/club/contact');
  const contact=page.getByRole('form',{name:'Contact met de club',exact:true});
  await expect(contact).toBeVisible();await assertControlsVisible(contact);
  await expect(page.getByRole('heading',{name:'Contact met de club',exact:true})).toHaveCount(1);
  await fill(page,contact,{'Naam *':'Synthetisch contact','E-mailadres *':'contact-browser@example.invalid','Bericht *':'Een vraag via het nieuwe contactformulier.'});
  let operation='';
  await page.route('**/api/forms/contact/submissions',async route=>{
    operation=route.request().postDataJSON().operationId;
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Tijdelijk niet bereikbaar. Probeer het opnieuw.'})});
  },{times:1});
  await contact.getByRole('button',{name:'Versturen',exact:true}).click();
  await expect(contact.getByRole('alert')).toContainText('Probeer het opnieuw.');
  await expect(contact.getByLabel('Bericht *',{exact:true})).toHaveValue('Een vraag via het nieuwe contactformulier.');
  const submitted=page.waitForResponse(response=>response.url().endsWith('/api/forms/contact/submissions'));
  await contact.getByRole('button',{name:'Versturen',exact:true}).click();const saved=await submitted;expect(saved.status()).toBe(201);expect(saved.request().postDataJSON().operationId).toBe(operation);
  await expect(contact.getByRole('status')).toContainText('Je bericht is ontvangen');
  await page.goto('/clubmuur');
  await page.getByRole('button',{name:'Lid worden',exact:true}).first().click();
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Kom erbij.',exact:true})});
  await expect(dialog.getByRole('button',{name:'Vrijwilliger worden',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Sponsoren',exact:true}).click();
  const sponsor=dialog.getByRole('form',{name:'Sponsor worden',exact:true});
  await assertControlsVisible(sponsor);
  await fill(page,sponsor,{'Naam contactpersoon *':'Synthetische sponsor','Bedrijfsnaam *':'Testbedrijf','E-mailadres *':'sponsor-browser@example.invalid','Hoe wil je de club sponsoren? *':'Interesse in sponsoring.'});
  const sponsored=page.waitForResponse(response=>response.url().endsWith('/api/forms/sponsorship/submissions'));
  await sponsor.getByRole('button',{name:'Sponsoraanvraag versturen',exact:true}).click();expect((await sponsored).status()).toBe(201);
  await expect(sponsor.getByRole('status')).toContainText('Je sponsoraanvraag is ontvangen');
  // CMS-built contact pages must route sponsorship links to the same intake.
  await page.goto('/clubmuur/club/contact?onderwerp=sponsoring');
  const contextual=page.getByRole('form',{name:'Sponsor worden',exact:true});
  await expect(contextual).toBeVisible();await expect(contextual.getByLabel('Bedrijfsnaam *',{exact:true})).toBeVisible();
}

export async function publicMembership(page:Page){
  await page.goto('/clubmuur/club/lidmaatschap#inschrijven');
  const form=page.getByRole('form',{name:'Inschrijven bij Duindorp SV',exact:true});
  await expect(form).toBeVisible();await assertControlsVisible(form);
  await fill(page,form,{'Voornaam *':'Synthetische','Achternaam *':'Jeugdspeler','Geboortedatum *':'2015-01-01','E-mailadres *':'member-browser@example.invalid','Telefoonnummer *':'0612345678','Straatnaam *':'Teststraat','Huisnummer en toevoeging *':'1 A','Postcode *':'1234 AB','Woonplaats *':'Den Haag','Ben je op dit moment ingeschreven bij een andere vereniging? *':'Ja'});
  await expect(form.getByLabel('Naam ouder / voogd *',{exact:true})).toBeVisible();
  await expect(form.getByLabel('Naam van de vereniging *',{exact:true})).toBeVisible();
  await fill(page,form,{'Naam ouder / voogd *':'Synthetische ouder','E-mailadres ouder / voogd *':'parent-browser@example.invalid','Telefoonnummer ouder / voogd *':'0687654321','Naam van de vereniging *':'Testvereniging'});
  // Switching to an adult removes conditional parent fields and their required state.
  await form.getByLabel('Geboortedatum *',{exact:true}).fill('2000-01-01');
  await expect(form.getByLabel('Naam ouder / voogd *',{exact:true})).toHaveCount(0);
  await form.getByLabel('Geboortedatum *',{exact:true}).fill('2015-01-01');
  await page.screenshot({path:'.runtime/live-membership-'+page.viewportSize()!.width+'.png',fullPage:true});
  const submitted=page.waitForResponse(response=>response.url().endsWith('/api/forms/membership/submissions'));
  await form.getByRole('button',{name:'Inschrijving versturen',exact:true}).click();expect((await submitted).status()).toBe(201);
  await expect(form.getByRole('status')).toContainText('Je inschrijving is ontvangen');
}

export async function publicSiteHasCurrentCopyAndLinks(page:Page){
  for(const path of ['/clubmuur','/clubmuur/club/lidmaatschap','/clubmuur/club/contact','/clubmuur/club/bestuur','/clubmuur/teams/trainingen','/clubmuur/media/fotos','/clubmuur/nieuws','/clubmuur/verhalen']){
    await page.goto(path);
    const body=await page.locator('body').innerText();
    expect(body).not.toMatch(/CMS-demo|voorbeeldcontent|voorbeeldagenda|gegenereerd(?:e)? sfeerbeeld|dit prototype|voorbeeldformulier/i);
    const legacy=await page.locator('a[href]').evaluateAll(anchors=>anchors.map(anchor=>anchor.getAttribute('href')||'').filter(href=>/^(?:https?:\/\/(?:www\.)?duindorpsv\.nl)?\/\d+(?:\/|$)/i.test(href)));
    expect(legacy).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  }
  await page.goto('/clubmuur/club/lidmaatschap#kleding');
  await expect(page.getByRole('button',{name:'Clubkleding',exact:true})).toHaveAttribute('aria-pressed','true');
}

export async function publicFriendlyAndNewsletter(page:Page){
  await page.goto('/clubmuur/wedstrijden/oefenwedstrijd');
  const friendly=page.getByRole('form',{name:'Oefenwedstrijd aanvragen',exact:true});
  await expect(friendly).toBeVisible();await assertControlsVisible(friendly);
  await fill(page,friendly,{'Naam contactpersoon *':'Synthetisch team','E-mailadres *':'team-browser@example.invalid','Vereniging *':'Testvereniging','Team *':'JO15','Gewenste datum *':'2099-01-01','Voorkeurslocatie *':'In overleg'});
  const submitted=page.waitForResponse(response=>response.url().endsWith('/api/forms/friendly-request/submissions'));
  await friendly.getByRole('button',{name:'Versturen',exact:true}).click();expect((await submitted).status()).toBe(201);
  await expect(friendly.getByRole('status')).toContainText('Je bericht is ontvangen');
  await page.goto('/clubmuur/media/nieuwsbrief');
  const newsletter=page.getByRole('form',{name:'Nieuwsbrief aanvragen',exact:true});
  await expect(newsletter).toBeVisible();await assertControlsVisible(newsletter);
  await newsletter.getByLabel('E-mailadres *',{exact:true}).fill('newsletter-'+crypto.randomUUID()+'@example.invalid');
  await newsletter.getByRole('checkbox').check();
  const requested=page.waitForResponse(response=>response.url().endsWith('/api/newsletter'));
  await newsletter.getByRole('button',{name:'Nieuwsbrief aanvragen',exact:true}).click();expect((await requested).status()).toBe(201);
  await expect(newsletter.getByRole('status')).toContainText('Je aanvraag is opgeslagen');
}

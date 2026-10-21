import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {dossierFixture} from '../helpers/match-dossier-fixture';

test('cached matches load KNVB club logos and unavailable images retain a neutral fallback',async({page})=>{
 const fixture=dossierFixture();let missing=false,obsoleteRequests=0;
 fixture.match.away.clubCode='TEST123';
 fixture.match.away.logoUrl='https://logoapi.voetbal.nl/logo.php?clubcode=TEST123';
 await page.route('**/api/sportlink',route=>route.fulfill({json:fixture.snapshot}));
 await page.route('**/api/sportlink/match?**',route=>route.fulfill({json:fixture.payload}));
 await page.route('https://logoapi.voetbal.nl/**',route=>{obsoleteRequests++;return route.abort();});
 const image=readFileSync('public/assets/logo.png');
 await page.route('https://sassets.knvb.nl/**',route=>missing?route.fulfill({status:404}):route.fulfill({contentType:'image/png',body:image}));
 const open=async()=>{
  await page.goto(`/clubmuur/wedstrijden?wedstrijd=${fixture.match.id}`);
  await expect(page.getByRole('dialog')).toBeVisible();
 };
 await open();
 const logos=page.getByRole('dialog').locator('.md-clubs .cm-club-logo');
 await expect(logos.first().locator('img')).toHaveAttribute('src','/assets/logo.png');
 const opponent=logos.last();
 await expect(opponent.locator('img')).toHaveAttribute('src','https://sassets.knvb.nl/sites/voetbal.nl/files/knvblogos_width60/TEST123.png');
 await expect.poll(()=>opponent.locator('img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 missing=true;await open();
 await expect(opponent.locator('img')).toHaveCount(0);
 await expect(opponent.locator('.cm-club-logo-fallback')).toHaveText('SE');
 expect(obsoleteRequests).toBe(0);
});

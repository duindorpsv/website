import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loginWithEmailCode} from './login-fixture';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {actorPrincipal} from '../../lib/server/permissions';
import {mutate} from '../../lib/server/records';
import {readSportlinkSettings} from '../../lib/server/sportlink-config';
import {defaultSportlinkSettings} from '../../lib/cms/sportlink-settings';
import {planningInstant} from '../../lib/cms/planning';
import {cachedSportlinkArticle} from '../../lib/server/sportlink-client';
import {accommodationEvidence} from '../../lib/server/sportlink-identity';
const owner=JSON.parse(readFileSync('.runtime/e2e-account.json','utf8'));
test('a real source transaction updates two open CMS sessions and protects an open stale form',async({page,browser})=>{
 test.setTimeout(90000);assertLocalSupabaseTests();
 const sql=sqlClient(),actor=await actorPrincipal(owner.id),before=await readSportlinkSettings(),originalFetch=globalThis.fetch,oldClient=process.env.SPORTLINK_CLIENT_ID;
 const backup=await sql`select * from sportlink_cache where cache_key in ('sportlink-assignments-v1','sportlink-planning-review-v1','cms-planning-revision-v1')`;
 const tag=crypto.randomUUID().slice(0,8),clubCode='BROWSER-'+tag,fieldId='browser-source-field-'+tag,homeId='sportlink-match-'+clubCode+':19990091',awayId='sportlink-match-'+clubCode+':19990092';
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam'}).format(new Date()),accommodation={naam:'Synthetisch eigen sportpark',straat:'Fixturestraat 1',plaats:'Teststad'};
 let start='18:00',cancelled=false;const config=defaultSportlinkSettings();config.clubCode=clubCode;config.ownPark={id:'synthetic-browser-park-'+tag,name:accommodation.naam,verificationNote:'Geïsoleerde browserfixture, geen productie-identiteit'};config.parkConfirmations=[{matchId:'19990091',accommodationId:config.ownPark.id,sourceFingerprint:accommodationEvidence({accommodatie:accommodation}).fingerprint}];
 const bootstrap=await (async()=>{await loginWithEmailCode(page,owner.email);return page.request.get('/api/cms/bootstrap').then(r=>r.json());})();
 config.teamMappings=[{cmsTeamId:bootstrap.state.settings.teams[0].id,teamId:'19990001:-1'}];config.locationMappings=[{sourceType:'field',sourceValue:'Browserveld',locationId:fieldId,clubCode,accommodationId:config.ownPark.id,confirmed:true}];
 const otherContext=await browser.newContext({baseURL:new URL(page.url()).origin}),other=await otherContext.newPage();
 try{
  await mutate(actor,[{module:'locations',id:fieldId,expectedVersion:0,action:'save',data:{id:fieldId,name:'Browserveld '+tag,type:'field',capacity:22,description:'',active:true,sportlinkFieldName:'',color:'#356da7'}},{module:'sportlinkSettings',id:'site-sportlink',expectedVersion:before.version,action:'save',data:config}],crypto.randomUUID(),crypto.randomUUID());
  process.env.SPORTLINK_CLIENT_ID='synthetic-browser-source-'+tag;
  globalThis.fetch=async(input:any)=>{const url=new URL(String(input));if(url.origin!=='https://data.sportlink.com')return originalFetch(input);if(url.pathname==='/clubgegevens')return Response.json({gegevens:{clubcode:clubCode,clubnaam:'Synthetische club'}});if(url.pathname==='/teams')return Response.json([{teamcode:19990001,lokaleteamcode:-1,teamnaam:'Eigen JO13-1 '+tag}]);if(url.pathname==='/wedstrijd-informatie')return Response.json({wedstrijdinformatie:{duur:60,veldnaam:'Browserveld'},kleedkamers:{},accommodatie:url.searchParams.get('wedstrijdcode')==='19990092'?{naam:'Extern sportpark',straat:'Quickstraat 2',plaats:'Delft'}:accommodation});
   return Response.json([{wedstrijdcode:19990091,wedstrijddatum:planningInstant(date+'T'+start),thuisteamid:19990001,uitteamid:19990002,thuisteam:'Eigen JO13-1 '+tag,uitteam:'Quick JO13-2 '+tag,thuisteamclubrelatiecode:clubCode,uitteamclubrelatiecode:'OTHER',status:cancelled?'Afgelast':'Gepland'},{wedstrijdcode:19990092,wedstrijddatum:planningInstant(date+'T17:00'),thuisteamid:19990002,uitteamid:19990001,thuisteam:'Quick JO13-2 '+tag,uitteam:'Eigen JO13-1 '+tag,thuisteamclubrelatiecode:'OTHER',uitteamclubrelatiecode:clubCode,status:'Gepland',accommodatie:'Extern sportpark'}]);
  };
  const refresh=()=>cachedSportlinkArticle('programma',{browser:tag},{settings:config,force:true});await refresh();
  await page.goto('/beheer#jaaragenda');await expect(page.locator('.planning-sync')).toContainText('Live beheerverbinding');
  const home=page.locator('.plan-card').filter({hasText:'Eigen JO13-1 '+tag+' – Quick JO13-2 '+tag}).first(),away=page.locator('.plan-card').filter({hasText:'Quick JO13-2 '+tag+' – Eigen JO13-1 '+tag}).first();
  await expect(home).toContainText('Thuis');await expect(home).toHaveCSS('background-color','rgb(234, 242, 252)');await expect(away).toContainText('Uit');await expect(away).toHaveCSS('background-color','rgb(241, 243, 245)');await expect(page.locator('.plan-unassigned')).not.toContainText('Quick JO13-2 '+tag+' – Eigen JO13-1 '+tag);
  await home.click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Omschrijving of praktische informatie',{exact:true}).fill('Mijn nog niet opgeslagen voorbereiding');
  await loginWithEmailCode(other,owner.email);await other.goto('/beheer#locaties');await expect(other.getByRole('tab',{name:'Bezetting',exact:true})).toHaveAttribute('aria-selected','true');const booking=other.locator('.cloc-booking').filter({hasText:tag}).first();await expect(booking).toContainText('18:00');
  start='18:15';await refresh();await expect(booking).toContainText('18:15');await expect(dialog.getByRole('alert')).toContainText('18:15');await expect(dialog.getByLabel('Omschrijving of praktische informatie',{exact:true})).toHaveValue('Mijn nog niet opgeslagen voorbereiding');await expect(dialog.getByRole('button',{name:'Activiteit opslaan',exact:true})).toBeDisabled();
  const a=await page.request.get('/api/cms/bootstrap').then(r=>r.json()),b=await other.request.get('/api/cms/bootstrap').then(r=>r.json());expect(a.planningSync.revision).toBe(b.planningSync.revision);expect(a.state.planning.activities.find((v:any)=>v.id===homeId).sourceData.batchRevision).toBe(b.state.planning.activities.find((v:any)=>v.id===homeId).sourceData.batchRevision);
  await other.getByRole('tab',{name:'Locaties',exact:true}).click();cancelled=true;await refresh();await expect(dialog.getByRole('alert')).toContainText('Afgelast');await expect(other.getByRole('tab',{name:'Locaties',exact:true})).toHaveAttribute('aria-selected','true');await other.getByRole('tab',{name:'Bezetting',exact:true}).click();await expect(other.locator('.cloc-booking').filter({hasText:tag})).toHaveCount(0);
  expect((await sql`select count(*)::int as n from cms_activity_reservations where activity_id=${homeId}`)[0].n).toBe(0);
 }finally{
  await otherContext.close();globalThis.fetch=originalFetch;if(oldClient===undefined)delete process.env.SPORTLINK_CLIENT_ID;else process.env.SPORTLINK_CLIENT_ID=oldClient;
  for(const id of [homeId,awayId]){const [row]=await sql`select version from cms_records where id=${id}`;if(row)await mutate(actor,[{module:'activities',id,expectedVersion:row.version,action:'trash'}],crypto.randomUUID(),crypto.randomUUID(),undefined,{sportlink:true});}
  const [location]=await sql`select version from cms_records where id=${fieldId}`;if(location)await mutate(actor,[{module:'locations',id:fieldId,expectedVersion:location.version,action:'trash'}],crypto.randomUUID(),crypto.randomUUID());
  const current=await readSportlinkSettings();await mutate(actor,[{module:'sportlinkSettings',id:'site-sportlink',expectedVersion:current.version,action:'save',data:before.settings}],crypto.randomUUID(),crypto.randomUUID());
  await sql`delete from sportlink_cache where cache_key in ('sportlink-assignments-v1','sportlink-planning-review-v1','cms-planning-revision-v1')`;for(const row of backup)await sql`insert into sportlink_cache ${sql(row)}`;
  await closeDb();
 }
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defaultSportlinkSettings} from '../../lib/cms/sportlink-settings';
import {mutate,loadState} from '../../lib/server/records';
import {cachedSportlinkArticle} from '../../lib/server/sportlink-client';
import {queueSportlinkSync,processSportlinkSync,previewSportlinkPeople,importSportlinkPeople,scheduleSportlinkSync,sportlinkStatus} from '../../lib/server/sportlink-sync';
import type {Principal} from '../../lib/server/permissions';
/** Real database operations; only the fixed external provider is mocked. */
export async function verifySportlinkRepository(sql:any){
 const suffix=crypto.randomUUID().replaceAll('-',''),actorId='sl-owner-'+suffix,roleId='sl-role-'+suffix,fieldId='sl-field-'+suffix,roomId='sl-room-'+suffix;
 const actor:Principal={id:actorId,name:'Sportlink controle',email:actorId+'@example.invalid',roleId,teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
 await sql`insert into auth_user(id,name,email) values (${actorId},${actor.name},${actor.email})`;await sql`insert into cms_roles(id,name) values (${roleId},'Sportlink test')`;await sql`insert into cms_grants(role_id,module,action) values (${roleId},'*','*')`;await sql`insert into cms_memberships(user_id,role_id) values (${actorId},${roleId})`;
 const config=defaultSportlinkSettings();config.locationMappings=[{sourceType:'field',sourceValue:'Testveld',locationId:fieldId},{sourceType:'changing',sourceValue:'Testkleedkamer',locationId:roomId}];
 const save=async(module:any,id:string,data:any,expectedVersion=0)=>mutate(actor,[{module,id,data,expectedVersion,action:'save'}],crypto.randomUUID(),crypto.randomUUID());
 for(const [id,type,name] of [[fieldId,'field','Testveld'],[roomId,'changing','Testkleedkamer']])await save('locations',id,{id,type,name,capacity:20,description:'',active:true,sportlinkFieldName:'',color:'#112233'});
 const [old]=await sql`select version from cms_records where id='site-sportlink'`;await save('sportlinkSettings','site-sportlink',config,old?.version||0);
 const [privateConfig]=await sql`select live from cms_records where id='site-sportlink'`;assert.equal(privateConfig.live,null);assert.equal(JSON.stringify((await loadState(true)).state).includes('teamMappings'),false);
 const originalFetch=globalThis.fetch,originalClient=process.env.SPORTLINK_CLIENT_ID;process.env.SPORTLINK_CLIENT_ID='synthetic-sportlink-fixture-'+suffix;
 let failTeams=false,calls=0,sourceField='Testveld',homeName='Duindorp sv 1',category='Senioren';
 globalThis.fetch=async(input:any)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://data.sportlink.com');calls++;let value:unknown=[];
  if(url.pathname==='/teams'){if(failTeams)return new Response('{}',{status:503});value=[{teamcode:991001,lokaleteamcode:-1,teamnaam:'Duindorp sv 1',leeftijdscategorie:category}];}
  if(url.pathname==='/programma')value=[{wedstrijdcode:991009,wedstrijddatum:'2026-11-25T20:00:00+0100',thuisteamid:991001,thuisteam:homeName,thuisteamclubrelatiecode:'BBGV51U',uitteamid:991002,uitteam:'Tegenstander',uitteamclubrelatiecode:'OTHER',status:'Gepland',veld:sourceField,kleedkamerthuisteam:'Testkleedkamer',accommodatie:'Dit is geen veld-ID'}];
  if(url.pathname==='/wedstrijd-informatie')value={wedstrijdinformatie:{duur:90,veldnaam:sourceField},kleedkamers:{thuis:'Testkleedkamer'}};
  if(url.pathname==='/team-indeling')value=[{relatiecode:'REL-'+suffix,naam:'Testspeler '+suffix,rol:'Speler',email:'private-'+suffix+'@example.invalid'},{relatiecode:'HIDDEN-'+suffix,naam:'Afgeschermd',rol:'Speler'}];
  if(url.pathname==='/team-gegevens')value={};return Response.json(value);
 };
 try{
  await cachedSportlinkArticle('teams',{fixture:suffix});const after=calls;await cachedSportlinkArticle('teams',{fixture:suffix});assert.equal(calls,after,'catalog TTL avoids unnecessary provider calls');
  const operation=crypto.randomUUID(),queued=await queueSportlinkSync(actor,'teams',operation);assert.ok(queued.id);assert.equal((await queueSportlinkSync(actor,'teams',operation)).id,queued.id);
  await processSportlinkSync({dataset:'teams',actorId},queued.id);const [team]=await sql`select active from sportlink_teams where id='991001:-1'`;assert.equal(team.active,1);
  await processSportlinkSync({dataset:'assignments',actorId},crypto.randomUUID());const [match]=await sql`select id,draft,live,version from cms_records where module='activities' and draft->>'sourceId'='BBGV51U:991009'`;
  assert.ok(match);assert.equal(match.live,null);assert.equal(match.draft.public,false);assert.deepEqual(new Set(match.draft.locationIds),new Set([fieldId,roomId]));assert.equal(match.draft.endTime,'21:30');
  await processSportlinkSync({dataset:'assignments',actorId},crypto.randomUUID());assert.equal((await sql`select count(*)::int as n from cms_records where module='activities' and draft->>'sourceId'='BBGV51U:991009'`)[0].n,1);
  homeName='Duindorp SV eerste elftal';await processSportlinkSync({dataset:'assignments',actorId},crypto.randomUUID());assert.ok((await sql`select draft from cms_records where id=${match.id}`)[0].draft.title.startsWith(homeName));
  const mappedTeam='sl-cms-team-'+suffix;await sql`insert into cms_teams(id,name) values (${mappedTeam},'Gekoppeld CMS-team')`;config.teamMappings=[{cmsTeamId:mappedTeam,teamId:'991001:-1'}];await save('sportlinkSettings','site-sportlink',config,(await sql`select version from cms_records where id='site-sportlink'`)[0].version);await processSportlinkSync({dataset:'assignments',actorId},crypto.randomUUID());assert.ok((await sql`select draft from cms_records where id=${match.id}`)[0].draft.teamIds.includes(mappedTeam));
  category='JO19';await processSportlinkSync({dataset:'teams',actorId},crypto.randomUUID());assert.equal((await sql`select category from sportlink_teams where id='991001:-1'`)[0].category,'JO19');
  const preview=await previewSportlinkPeople(actor);assert.equal(preview.items.length,1);assert.equal(preview.items[0].sourceId,'REL-'+suffix.toUpperCase());assert.equal(JSON.stringify(preview).includes('private-'),false);
  const imported=await importSportlinkPeople(actor,[preview.items[0].sourceId],crypto.randomUUID());assert.equal(imported.imported,1);const [person]=await sql`select draft,live from cms_records where module='people' and draft->>'sportlinkId'=${preview.items[0].sourceId}`;assert.equal(person.live,null);assert.equal(person.draft.showContact,false);assert.equal(person.draft.email,'');
  assert.equal((await importSportlinkPeople(actor,[preview.items[0].sourceId],crypto.randomUUID())).imported,0);
  const [rawLeak]=await sql`select count(*)::int as n from sportlink_cache where payload_json like ${'%private-'+suffix+'%'}`;assert.equal(rawLeak.n,0);
  failTeams=true;await assert.rejects(()=>processSportlinkSync({dataset:'teams',actorId},crypto.randomUUID()));assert.equal((await sql`select active from sportlink_teams where id='991001:-1'`)[0].active,1);assert.equal((await sportlinkStatus(actor)).datasets.teams.status,'failed');
  await assert.rejects(()=>queueSportlinkSync({...actor,grants:[{module:'settings',action:'read'}]},'teams',crypto.randomUUID()),/rechten/);
  const paused={...config,enabled:false};await save('sportlinkSettings','site-sportlink',paused,(await sql`select version from cms_records where id='site-sportlink'`)[0].version);const [before]=await sql`select count(*)::int as n from cms_jobs where kind='sportlink-sync'`;await scheduleSportlinkSync();const [afterPause]=await sql`select count(*)::int as n from cms_jobs where kind='sportlink-sync'`;assert.equal(before.n,afterPause.n);failTeams=false;await processSportlinkSync({dataset:'assignments',actorId},crypto.randomUUID());assert.equal((await sportlinkStatus(actor)).datasets.assignments.status,'success');assert.equal((await sportlinkStatus(actor)).settings.enabled,false);
  const cacheParams={lease:suffix},cacheHash=createHash('sha256').update(JSON.stringify([process.env.SPORTLINK_CLIENT_ID,'uitslagen',Object.entries(cacheParams).sort()])).digest('hex'),cacheKey='sportlink-article-v2:results:'+cacheHash;
  const provider=globalThis.fetch;let unblock!:(response:Response)=>void,started!:()=>void,leaseCalls=0;const pending=new Promise<void>(resolve=>started=resolve);
  globalThis.fetch=async()=>{if(++leaseCalls===1){started();return new Promise<Response>(resolve=>unblock=resolve);}return Response.json([{score:'NEW'}]);};
  try{const first=cachedSportlinkArticle('uitslagen',cacheParams,{force:true,settings:defaultSportlinkSettings()});await pending;await sql`update sportlink_cache set expires_at=0,refresh_after=0 where cache_key=${cacheKey}`;await new Promise(resolve=>setTimeout(resolve,2));const second=await cachedSportlinkArticle('uitslagen',cacheParams,{force:true,settings:defaultSportlinkSettings()});unblock(Response.json([{score:'OLD'}]));await first;assert.equal((second.value as any)[0].score,'NEW');assert.equal(JSON.parse((await sql`select payload_json from sportlink_cache where cache_key=${cacheKey}`)[0].payload_json)[0].score,'NEW','a lost lease cannot overwrite a newer source response');}finally{globalThis.fetch=provider;}
  return {passed:true,checks:['private versioned config','calendar catalog cache','durable idempotent queue','real source field and changing-room mapping','no guessed venue mapping','source imports internal','match identity idempotent','only stable visible member IDs','no raw contact cache','source outage preserves active teams','manage permission','paused scheduler']};
 }finally{globalThis.fetch=originalFetch;if(originalClient===undefined)delete process.env.SPORTLINK_CLIENT_ID;else process.env.SPORTLINK_CLIENT_ID=originalClient;}
}

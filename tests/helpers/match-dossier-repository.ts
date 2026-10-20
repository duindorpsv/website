import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {defaultSportlinkSettings} from '../../lib/cms/sportlink-settings';
import {emptyMatchPreviewContent} from '../../lib/cms/match-preview';
import {mutate,loadState} from '../../lib/server/records';
import {readSportlinkSettings} from '../../lib/server/sportlink-config';
import {cachedSportlinkArticle} from '../../lib/server/sportlink-client';
import {readStoredMatch,writeStoredMatches} from '../../lib/server/match-store';
import {matchSourceCache} from '../../lib/server/match-source-cache';
import {getSportlinkSnapshot} from '../../lib/sportlink-server';
import {getSportlinkMatch} from '../../lib/sportlink-match-server';
import {getSportlinkMatchHeadCoaches} from '../../lib/sportlink-match-coaches-server';
import {getSportlinkHistoricalSource} from '../../lib/sportlink-history-server';
import {publishedMatchPreview,matchPreviewChoices} from '../../lib/server/match-previews';
import {runOnce} from '../../lib/server/worker';
import type {Principal} from '../../lib/server/permissions';

/** Real PostgreSQL repository and worker; only the external Sportlink transport is replaced. */
export async function verifyMatchDossierRepository(sql:any){
 const tag=crypto.randomUUID().slice(0,8),actorId=`dossier-owner-${tag}`,roleId=`dossier-role-${tag}`,teamId=`dossier-team-${tag}`,club=`DOSSIER-${tag}`;
 const actor:Principal={id:actorId,name:'Dossier fixture',email:actorId+'@example.invalid',roleId,teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
 const before=await readSportlinkSettings(),backup=await sql`select * from sportlink_cache where cache_key in ('club-competition-v1','sportlink-assignments-v1','sportlink-planning-review-v1','cms-planning-revision-v1')`;
 const original=globalThis.fetch,oldClient=process.env.SPORTLINK_CLIENT_ID;
 await sql`insert into auth_user(id,name,email) values (${actorId},${actor.name},${actor.email})`;
 await sql`insert into cms_roles(id,name) values (${roleId},'Dossier fixture')`;
 await sql`insert into cms_memberships(user_id,role_id) values (${actorId},${roleId})`;
 await sql`insert into cms_grants(role_id,module,action) values (${roleId},'*','*')`;
 await sql`insert into cms_teams(id,name) values (${teamId},'Dossier eerste elftal')`;
 const config=defaultSportlinkSettings();config.clubCode=club;config.teamMappings=[{teamId:'19881001:-1',cmsTeamId:teamId}];
 await mutate(actor,[{module:'sportlinkSettings',id:'site-sportlink',expectedVersion:before.version,action:'save',data:config}],crypto.randomUUID(),crypto.randomUUID());
 await sql`delete from sportlink_cache where cache_key in ('club-competition-v1','sportlink-assignments-v1','sportlink-planning-review-v1')`;
 process.env.SPORTLINK_CLIENT_ID='synthetic-dossier-'+tag;
 const id=String(19881000000+parseInt(tag,16)%100000000),reserveId=String(Number(id)+1);
 const kickoff=new Date(Date.now()+5*86400000).toISOString();let field='Veld 1',room='2',referee='A. Scheidsrechter',coach='A. Openbaar',coachFail=false,historyFail=false;
 let calls=0,historicalCalls=0;
 const rawTeam={teamcode:19881001,lokaleteamcode:-1,teamnaam:'Duindorp sv 1',poulecode:1988123,klassepoule:'Dossierpoule',competitiesoort:'regulier'};
 const game=(id:number,date:string)=>({wedstrijdcode:id,wedstrijddatum:date,thuisteamid:19881001,thuisteam:'Duindorp SV 1',thuisteamclubrelatiecode:club,uitteamid:19881002,uitteam:'Tegenstander 1',uitteamclubrelatiecode:'OTHER',poulecode:1988123,klassepoule:'Dossierpoule',status:'Gepland',veld:field,kleedkamerthuisteam:room,scheidsrechter:referee,accommodatie:'Synthetisch sportpark'});
 globalThis.fetch=async(input:any,init?:any)=>{
  const url=new URL(String(input));if(url.origin!=='https://data.sportlink.com')return original(input,init);calls++;
  switch(url.pathname){
   case '/clubgegevens':return Response.json({gegevens:{clubcode:club,clubnaam:'Synthetische dossierclub'}});
   case '/teams':return Response.json([rawTeam]);
   case '/programma':case '/poule-programma':return Response.json([game(Number(id),kickoff)]);
   case '/uitslagen':case '/pouleuitslagen':return Response.json(Array.from({length:3},(_,index)=>({...game(19881910+index,new Date(Date.now()-(index+1)*86400000).toISOString()),status:'Uitgespeeld',uitslag:`${index+1}-0`})));
   case '/wedstrijd-informatie':return Response.json({wedstrijdinformatie:{duur:90,veldnaam:field},kleedkamers:{thuis:room,uit:'3'},accommodatie:{naam:'Synthetisch sportpark',straat:'Teststraat 1',plaats:'Teststad'},officials:{verenigingsscheidsrechter:referee}});
   case '/wedstrijd-thuisteam':if(coachFail)return new Response('{}',{status:503});return Response.json(coach?[{naam:coach,functie:'Hoofdtrainer',email:'NEVER-CACHE-'+tag,relatiecode:'SECRET-'+tag}]:[]);
   case '/wedstrijd-uitteam':return Response.json([{naam:'Afgeschermd',functie:'Hoofdcoach'},{naam:'Assistent',functie:'Assistent-trainer/coach'}]);
   case '/wedstrijd-historische-resultaten':historicalCalls++;if(historyFail)return new Response('{}',{status:503});return Response.json([{seizoen:'2025/2026',datum:'01-09-2025',wedstrijd:'Tegenstander 1 - Duindorp SV 1',uitslag:'2-1'}]);
   case '/team-indeling':return Response.json([]);
   default:return Response.json([]);
  }
 };
 const previewId='match-preview-'+id;
 const change=async(action:any,data?:any,version?:number,scheduledAt?:string,p=actor)=>{const [row]=await sql`select version from cms_records where id=${previewId}`;return mutate(p,[{module:'matchPreviews',id:previewId,expectedVersion:version??row?.version??0,action,data,scheduledAt}],crypto.randomUUID(),crypto.randomUUID());};
 try{
  const snapshot=await getSportlinkSnapshot();assert.equal(snapshot.firstTeam?.id,'19881001:-1');
  let response=await getSportlinkMatch(id);assert.equal(response.match.homeDressingRoom,'2');assert.equal(response.match.referee,referee);assert.equal(response.homeHeadCoach,'A. Openbaar');assert.equal(response.awayHeadCoach,null);assert.equal(response.firstTeamMatch,true);assert.equal(response.headToHead.find(row=>row.season==='2025/2026')?.matchLabel,'Tegenstander 1 - Duindorp SV 1');assert.equal(response.headToHead.find(row=>row.season==='2025/2026')?.scoreLabel,'2 – 1');assert.ok(response.comparisonMatches.length>=3);
  assert.equal(JSON.stringify(await sql`select payload_json from sportlink_cache`).includes('NEVER-CACHE-'+tag),false);
  const choices=await matchPreviewChoices(actor);assert.ok(choices.items.some(match=>match.id===id));
  field='Veld 2';room='';referee='B. Scheidsrechter';await cachedSportlinkArticle('programma',{fixture:tag},{settings:config,force:true});
  let canonical=(await readStoredMatch(id))!;assert.equal(canonical.field,'Veld 2');assert.equal(canonical.homeDressingRoom,'');assert.equal(canonical.referee,referee);
  const oldAt=new Date(Date.now()-600000).toISOString(),newAt=new Date(Date.now()+1000).toISOString();
  await writeStoredMatches([{...canonical,field:'Nieuwste veld',sourceUpdatedAt:newAt}],newAt);
  await writeStoredMatches([{...canonical,field:'Oude trage response',sourceUpdatedAt:oldAt}],oldAt);
  assert.equal((await readStoredMatch(id))!.field,'Nieuwste veld');
  // An old failure cannot replace a newer successful cache or set its backoff.
  const key='dossier-race-'+tag;let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve),active=new Promise<void>(resolve=>entered=resolve);
  const late=matchSourceCache(key,async()=>{entered();await waiting;throw Error('Old transport failed');},[]);
  await active;
  await sql`update sportlink_cache set payload_json='["new"]',updated_at=${Date.now()+5000},expires_at=${Date.now()+65000},refresh_after=0 where cache_key=${key}`;release();assert.deepEqual((await late).value,['new']);assert.equal(Number((await sql`select refresh_after from sportlink_cache where cache_key=${key}`)[0].refresh_after),0);
  let loaders=0;const concurrentKey='dossier-lease-'+tag;await Promise.all(Array.from({length:4},()=>matchSourceCache(concurrentKey,async()=>{loaders++;await delay(15);return ['shared'];},[])));assert.equal(loaders,1);
  coach='';await sql`update sportlink_cache set expires_at=0,refresh_after=0 where cache_key like ${'match-head-coach-v2:'+id+':%'}`;assert.equal((await getSportlinkMatchHeadCoaches(canonical)).homeHeadCoach,null);
  coach='B. Openbaar';await sql`update sportlink_cache set expires_at=0,refresh_after=0 where cache_key like ${'match-head-coach-v2:'+id+':%'}`;assert.equal((await getSportlinkMatchHeadCoaches(canonical)).homeHeadCoach,coach);
  coachFail=true;await sql`update sportlink_cache set expires_at=0,refresh_after=0 where cache_key like ${'match-head-coach-v2:'+id+':%'}`;const retained=await getSportlinkMatchHeadCoaches(canonical);assert.equal(retained.homeHeadCoach,coach);assert.equal(retained.headCoachesStale,true);
  historyFail=true;await sql`update sportlink_cache set expires_at=0,refresh_after=0 where cache_key like ${'match-h2h-v2:'+id+':%'}`;assert.equal((await getSportlinkHistoricalSource(canonical)).stale,true);
  const reserve={...canonical,id:reserveId,home:{...canonical.home,id:'19881009',name:'Duindorp SV 2'}};await writeStoredMatches([reserve],newAt);const beforeHistory=historicalCalls;assert.equal((await getSportlinkMatch(reserve.id)).firstTeamMatch,false);assert.equal(historicalCalls,beforeHistory);
  const content={...emptyMatchPreviewContent(),enabled:true,speaker:'De aanvoerder',role:'Aanvoerder',whatAtStake:'Live vooruitblik.'};
  const draft={...content,id:previewId,matchId:id,firstTeamId:snapshot.firstTeam!.id,teamId,title:'Vooruitblik'};
  await change('save',draft);assert.equal(await publishedMatchPreview(canonical,snapshot.firstTeam),null);
  await assert.rejects(()=>change('schedule',draft,undefined,'2027-03-28T02:30'),(error:any)=>error.status===422);
  const editor={...actor,grants:[{module:'news',action:'read'},{module:'news',action:'update'},{module:'news',action:'create'}]};await assert.rejects(()=>change('publish',draft,undefined,undefined,editor),(error:any)=>error.status===403);
  await change('publish',draft);assert.equal((await publishedMatchPreview(canonical,snapshot.firstTeam))?.whatAtStake,'Live vooruitblik.');
  const [oldVersion]=await sql`select version from cms_records where id=${previewId}`;await change('save',{...draft,whatAtStake:'Privéconcept'});assert.equal((await publishedMatchPreview(canonical,snapshot.firstTeam))?.whatAtStake,'Live vooruitblik.');await assert.rejects(()=>change('save',draft,oldVersion.version),(error:any)=>error.code==='conflict');
  await change('schedule',{...draft,whatAtStake:'Ingeplande vooruitblik.'},undefined,new Date(Date.now()+86400000).toISOString());
  await change('save',{...draft,whatAtStake:'Later privéconcept.'});assert.equal((await publishedMatchPreview(canonical,snapshot.firstTeam))?.whatAtStake,'Live vooruitblik.');
  await sql`update cms_jobs set run_at='1800-01-01T00:00:00Z' where kind='publish' and payload->>'id'=${previewId} and status='pending'`;await runOnce();
  const [published]=await sql`select live,draft from cms_records where id=${previewId}`;assert.equal(published.live.whatAtStake,'Ingeplande vooruitblik.');assert.equal(published.draft.whatAtStake,'Later privéconcept.');
  await change('save',{...draft,whatAtStake:'Nog later privéconcept.'});assert.equal((await publishedMatchPreview(canonical,snapshot.firstTeam))?.whatAtStake,'Ingeplande vooruitblik.');
  await change('unpublish');assert.equal(await publishedMatchPreview(canonical,snapshot.firstTeam),null);
  await assert.rejects(()=>change('save',{...draft,matchId:reserve.id}),(error:any)=>error.status===422);
  const stranger={...editor,teamScoped:true,teams:['another-team']};await assert.rejects(()=>change('save',draft,undefined,undefined,stranger),(error:any)=>error.status===403);
  assert.equal((await loadState(true)).state.matchPreviews.length,0,'public page bootstrap never includes private or unrelated preview records');
  return {checks:22,upstreamCalls:calls,canonical:true,privacy:true,immutablePublications:true};
 }finally{
  globalThis.fetch=original;if(oldClient===undefined)delete process.env.SPORTLINK_CLIENT_ID;else process.env.SPORTLINK_CLIENT_ID=oldClient;
  const current=await readSportlinkSettings();await mutate(actor,[{module:'sportlinkSettings',id:'site-sportlink',expectedVersion:current.version,action:'save',data:before.settings}],crypto.randomUUID(),crypto.randomUUID());
  await sql`delete from sportlink_cache where cache_key in ('club-competition-v1','sportlink-assignments-v1','sportlink-planning-review-v1','cms-planning-revision-v1')`;for(const row of backup)await sql`insert into sportlink_cache ${sql(row)}`;
  // This helper runs only in a guarded isolated test database. Fixtures retain their audit trail.
  await sql`update cms_records set deleted_at=now(),live=null where id=${previewId} or module='activities' and draft->'sourceData'->>'clubId'=${club}`;
 }
}

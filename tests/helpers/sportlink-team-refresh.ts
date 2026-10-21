import assert from 'node:assert/strict';
import {createHash,randomInt} from 'node:crypto';
import {defaultSportlinkSettings} from '../../lib/cms/sportlink-settings';
import {withSportlinkSettings} from '../../lib/server/sportlink-config';
import {getSportlinkTeamDetail} from '../../lib/sportlink-team-server';
import {seasonForDate} from '../../lib/sportlink-team-normalize';
import {processSportlinkSync,sportlinkStatus} from '../../lib/server/sportlink-sync';
import type {Principal} from '../../lib/server/permissions';

/** Actual PostgreSQL bigint cache rows, populated match data and a shared pool. */
export async function verifySportlinkTeamRefresh(sql:any,check:'cached'|'sync',visit?:(teamId:string)=>Promise<void>){
 const token=crypto.randomUUID(),base=randomInt(800000000,900000000),season=seasonForDate(new Date());
 const pool=String(base+2),teamIds=[`${base}:-1`,`${base+1}:-1`],actorId='sl-refresh-'+token,client='synthetic-refresh-'+token;
 const config=defaultSportlinkSettings();config.clubCode='TEST';config.teamIds=teamIds;
 const catalog=teamIds.map((_,i)=>({teamcode:base+i,lokaleteamcode:-1,teamnaam:'Testteam '+i,leeftijdscategorie:'Senioren',poulecode:pool,klassepoule:'Testpoule',competitiesoort:'regulier'}));
 const cachedAt=Date.now()-60000,catalogKey='team-catalog-v1:'+season;
 const before=await sql`select * from sportlink_cache`;
 const owned:string[]=[];const matchIds=[String(base+3),String(base+4)];
 async function cache(key:string,value:unknown,at=cachedAt){owned.push(key);await sql`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values (${key},${JSON.stringify(value)},${at},${Date.now()+86400000},0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at,refresh_after=0`;}
 const sourceKey=(name:string,params:Record<string,string>,dataset:string)=>'sportlink-article-v2:'+dataset+':'+createHash('sha256').update(JSON.stringify([client,name,Object.entries(params).sort()])).digest('hex');
 const originalFetch=globalThis.fetch,originalClient=process.env.SPORTLINK_CLIENT_ID;
 let sourceCalls=0,sourceUnavailable=false;
 try {
  process.env.SPORTLINK_CLIENT_ID=client;
  await cache(catalogKey,catalog);
  const resultRows=teamIds.map((_,i)=>({wedstrijdcode:base+3+i,wedstrijddatum:new Date().toISOString(),thuisteamid:base+i,thuisteam:'Testteam '+i,thuisteamclubrelatiecode:'TEST',uitteamid:base+10,uitteam:'Tegenstander',uitteamclubrelatiecode:'OTHER',status:'Uitgespeeld',uitslag:'2 - 1',poulecode:pool}));
  for(let i=0;i<teamIds.length;i++){
   const match={id:matchIds[i],kickoff:resultRows[i].wedstrijddatum,home:{id:String(base+i),name:'Testteam '+i,clubCode:'TEST',own:true,logoUrl:null},away:{id:String(base+10),name:'Tegenstander',clubCode:'OTHER',own:false,logoUrl:null},homeScore:2,awayScore:1,scoreLabel:'2 – 1',status:'Uitgespeeld',venue:'',competitionId:pool,competitionLabel:'Testpoule'};
   await cache(`team-results-v1:${season}:${teamIds[i]}`,[match]);
   await cache(`team-fixtures-v1:${season}:${teamIds[i]}`,[]);
   await cache(`team-roster-v1:${season}:${teamIds[i]}`,{players:[],hiddenPlayers:0});
   await cache(`team-photo-v1:${season}:${teamIds[i]}:team`,null);
  }
  await cache(`team-pool-results-v1:${season}:${pool}`,resultRows);
  await cache(`team-pool-fixtures-v1:${season}:${pool}`,[]);
  await cache(`team-pool-standing-v1:${season}:${pool}`,[]);
  await cache(sourceKey('clubgegevens',{},'teams'),{gegevens:{clubcode:'TEST',clubnaam:'Testclub'}});
  await cache(sourceKey('teams',{competitieperiode:'ALLES'},'teams'),catalog);
  globalThis.fetch=async(input:any)=>{
   const url=new URL(String(input));assert.equal(url.origin,'https://data.sportlink.com');
   // A second team in this pool must reuse this response within the same job.
   if(url.pathname==='/poulestand'){sourceCalls++;return sourceUnavailable?new Response('{}',{status:503}):Response.json([]);}
   throw new Error('Unexpected provider request '+url.pathname);
  };
  await withSportlinkSettings(config,async()=>{
   const detail=await getSportlinkTeamDetail(teamIds[0]);
   assert.equal(detail.results.length,1);
   assert.ok(detail.matchUpdatedAt);
   assert.equal(detail.matchUpdatedAt[matchIds[0]],new Date(cachedAt).toISOString());
   assert.equal(detail.stale,false);assert.equal(detail.availability.standings,'empty');
   const [stored]=await sql`select updated_at from sportlink_cache where cache_key=${`team-results-v1:${season}:${teamIds[0]}`}`;
   assert.equal(typeof stored.updated_at,'string','Exercise the actual raw PostgreSQL bigint boundary');
   if(visit)await visit(teamIds[0]);
   if(check==='cached')return;
   await sql`insert into auth_user(id,name,email) values (${actorId},'Sportlink test',${actorId+'@example.invalid'})`;
   await sql`insert into cms_roles(id,name) values (${actorId},'Sportlink test')`;
   await sql`insert into cms_grants(role_id,module,action) values (${actorId},'*','*')`;
   await sql`insert into cms_memberships(user_id,role_id) values (${actorId},${actorId})`;
   const actor:Principal={id:actorId,name:'Sportlink test',email:actorId+'@example.invalid',roleId:actorId,teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
   await processSportlinkSync({dataset:'standings',actorId},crypto.randomUUID());
   const status=await sportlinkStatus(actor);
   assert.equal(status.datasets.standings.status,'success');
   assert.equal(status.datasets.standings.counts.teams,2);
   assert.equal(sourceCalls,1,'A shared pool is fetched once and remains fresh for both teams');
   sourceUnavailable=true;
   await new Promise(resolve=>setTimeout(resolve,5));
   await assert.rejects(()=>processSportlinkSync({dataset:'standings',actorId},crypto.randomUUID()));
   const failed=(await sportlinkStatus(actor)).datasets.standings;
   assert.equal(failed.status,'failed','Zero refreshed teams is not partial success');
   assert.equal(failed.lastSuccessAt,status.datasets.standings.lastSuccessAt);
   assert.equal(failed.counts.failed,2);assert.match(failed.message,/0 van 2 teams/);
   const [retained]=await sql`select payload_json from sportlink_cache where cache_key=${`team-results-v1:${season}:${teamIds[0]}`}`;
   assert.equal(JSON.parse(retained.payload_json).length,1,'A provider outage preserves the last valid results');
  });
 } finally {
  globalThis.fetch=originalFetch;if(originalClient===undefined)delete process.env.SPORTLINK_CLIENT_ID;else process.env.SPORTLINK_CLIENT_ID=originalClient;
  await sql`delete from sportlink_matches where id in ${sql(matchIds)}`;
  const newKeys=[...new Set([...owned,sourceKey('poulestand',{poulecode:pool},'standings'),'sportlink-sync-v1:standings'])];
  await sql`delete from sportlink_cache where cache_key in ${sql(newKeys)} and cache_key not in ${sql(before.length?before.map((row:any)=>row.cache_key):[''])}`;
  // Restore only keys this test or the existing dataset invalidation touched.
  for(const row of before)if(newKeys.includes(row.cache_key)||row.cache_key.startsWith('team-pool-standing-v1:')||row.cache_key.startsWith('sportlink-article-v2:standings:'))await sql`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values (${row.cache_key},${row.payload_json},${row.updated_at},${row.expires_at},${row.refresh_after}) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at,refresh_after=excluded.refresh_after`;
  await sql`delete from cms_memberships where user_id=${actorId}`;await sql`delete from cms_grants where role_id=${actorId}`;await sql`delete from cms_roles where id=${actorId}`;await sql`delete from auth_user where id=${actorId}`;
 }
}

import {canonicalMatches,writeStoredMatches} from './server/match-store';
import {sportlinkReadMaxAge,withSportlinkReadAge,collectSportlinkObservation,observeSportlinkSource} from './server/sportlink-read-context';
import {verifiedSportlinkCatalog} from './server/sportlink-identity';
import {sportlinkStore, type SportlinkStatement} from './server/sportlink-store';
import {currentPool,finished,matchesForTeam,mergeTeamCatalog,normalizeRoster,poolsForTeam,record,seasonForDate,standingsForTeam,teamCatalog,text,validSeason,validTeamId} from './sportlink-team-normalize';
import type {SportlinkTeamDetail,TeamAvailability,TeamPlayer,TeamPool} from './sportlink-team-types';
import type {SportlinkMatch} from './sportlink-types';
import {cachedSportlinkArticle,fetchSportlinkArticle} from './server/sportlink-client';
import {readSportlinkSettings} from './server/sportlink-config';
import {nextSportlinkRun,type SportlinkDataset} from './cms/sportlink-settings';

type CacheRow={payload_json:string|null;updated_at:number;expires_at:number;refresh_after:number};
type Cached<T>={value:T;updatedAt:number;stale:boolean};
type Dataset<T>=Cached<T>&{available:true}|{value:T;updatedAt:0;stale:false;available:false};
type Roster={players:TeamPlayer[];hiddenPlayers:number};

const CATALOG='team-catalog-v1:';
const inFlight=new Map<string,Promise<Cached<unknown>>>();
export class TeamDataError extends Error{constructor(message:string,public status:number){super(message);}}
function database(){if(!sportlinkStore)throw new Error('De teamgegevens zijn nog niet beschikbaar.');return sportlinkStore;}
async function read(key:string){return database().prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind(key).first<CacheRow>();}
// Raw PostgreSQL bigint values arrive as decimal strings. Normalize only this
// timestamp boundary; changing the raw client's parsers would affect other data.
function fromRow<T>(row:CacheRow,stale:boolean):Cached<T>{return {value:JSON.parse(row.payload_json!) as T,updatedAt:Number(row.updated_at),stale};}

/** Cache each dataset separately: a roster failure cannot erase a valid standings table. */
async function loadCached<T>(key:string,loader:()=>Promise<T>,historical=false,force=false):Promise<Cached<T>>{
 const pending=inFlight.get(key);if(pending)return pending as Promise<Cached<T>>;
 const run=async()=>{
  const db=database();
  await db.prepare('INSERT INTO sportlink_cache (cache_key) VALUES (?) ON CONFLICT(cache_key) DO NOTHING').bind(key).run();
  const row=await read(key),now=Date.now(),config=(await readSportlinkSettings()).settings;
  const dataset:SportlinkDataset=key.startsWith(CATALOG)?'teams':key.startsWith('team-roster-')?'players':key.startsWith('team-photo-')?'teamInfo':key.includes('standing')?'standings':key.includes('results')?'results':'matches';
  if(!historical&&!force&&(!config.enabled||!config.schedules[dataset].enabled)){if(row?.payload_json)return fromRow<T>(row,true);throw Error('Dit Sportlink-onderdeel is gepauzeerd.');}
  if(row?.payload_json&&!force&&(historical||row.expires_at>now&&(!['matches','results','standings'].includes(dataset)||now-Number(row.updated_at)<sportlinkReadMaxAge())))return fromRow<T>(row,false);
  // Historic data comes only from previously observed snapshots, never current-season endpoints.
  if(historical)throw new Error('Voor dit seizoen is dit onderdeel niet opgeslagen.');
  const lease=now+45000;
  const claimed=await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=? AND refresh_after<=? RETURNING cache_key').bind(lease,key,now).first();
  if(!claimed){if(row?.payload_json)return fromRow<T>(row,true);throw new Error('Dit onderdeel wordt bijgewerkt.');}
  try{
   const {value,updatedAt}=await collectSportlinkObservation(loader);
   const written=await db.prepare('UPDATE sportlink_cache SET payload_json=?,updated_at=?,expires_at=?,refresh_after=0 WHERE cache_key=? AND refresh_after=? AND updated_at<=? RETURNING cache_key').bind(JSON.stringify(value),updatedAt,nextSportlinkRun(config.schedules[dataset],updatedAt),key,lease,updatedAt).first();
   if(!written){const fresh=await read(key);if(fresh?.payload_json)return fromRow<T>(fresh,true);throw Error('Dit onderdeel wordt opnieuw bijgewerkt.');}
   const committed=await read(key);return fromRow<T>(committed!,false);
  }catch(error){
   await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=? AND refresh_after=? AND updated_at<=?').bind(Date.now()+120000,key,lease,now).run();
   const latest=await read(key);if(latest?.payload_json)return fromRow<T>(latest,Number(latest.updated_at)<=now);
   throw error;
  }
 };
 const promise=run().finally(()=>inFlight.delete(key));inFlight.set(key,promise as Promise<Cached<unknown>>);return promise;
}
async function safe<T>(promise:Promise<Cached<T>>,empty:T):Promise<Dataset<T>>{
 try{return {...await promise,available:true};}catch{return {value:empty,available:false,updatedAt:0,stale:false};}
}
async function requestArticle(name:string,params:Record<string,string>={}):Promise<unknown>{
 if(name==='team-indeling')return fetchSportlinkArticle(name,params);
 const result=await cachedSportlinkArticle(name,params);observeSportlinkSource(result.updatedAt);if(result.stale)throw new Error('Sportlink wordt opnieuw geprobeerd.');return result.value;
}
async function article(name:string,params:Record<string,string>={}):Promise<unknown[]>{
 const data=await requestArticle(name,params);if(!Array.isArray(data))throw new Error('Sportlink leverde geen geldige teamgegevens.');return data;
}
async function downloadTeamPhoto(teamId:string):Promise<{data:string;mime:string}|null>{
 const [teamcode,lokaleteamcode]=teamId.split(':');
 const payload=record(await requestArticle('team-gegevens',{teamcode,lokaleteamcode}));
 const photo=text(record(payload.team).teamfoto);
 const mime=photo.startsWith('/9j/')?'image/jpeg':photo.startsWith('iVBOR')?'image/png':photo.startsWith('UklGR')?'image/webp':null;
 return mime&&photo.length<1_800_000&&/^[A-Za-z0-9+/=\r\n]+$/.test(photo)?{data:photo,mime}:null;
}
function seasonWindows(season:string,now:Date,upcoming:boolean):{weekoffset:string;aantaldagen:string}[]{
 const start=Number(season.slice(0,4)),day=86400000;
 const begin=new Date(`${start}-07-01T00:00:00+02:00`).getTime(),end=new Date(`${start+1}-07-01T00:00:00+02:00`).getTime();
 const from=upcoming?now.getTime():begin,to=upcoming?end:now.getTime();
 const days=Math.max(1,Math.ceil((to-from)/day)+7);
 const offset=upcoming?0:Math.floor((from-now.getTime())/(7*day));
 const windows=[{weekoffset:String(offset),aantaldagen:String(Math.min(250,days))}];
 if(days>245)windows.push({weekoffset:String(offset+35),aantaldagen:String(Math.min(250,days-245+7))});
 return windows;
}
async function matchArticle(name:string,params:Record<string,string>,season:string,upcoming:boolean){
 const chunks=await Promise.all(seasonWindows(season,new Date(),upcoming).map(window=>article(name,{...params,...window,aantalregels:'500'})));
 return chunks.flat();
}
function availability<T>(dataset:Dataset<T[]>,items:T[]=dataset.value):TeamAvailability{return !dataset.available?'unavailable':items.length?'available':'empty';}
function rosterPhotoKey(teamId:string,person:string,season:string){return `team-photo-v1:${season}:${teamId}:${person}`;}
async function downloadRoster(teamId:string,season:string):Promise<Roster>{
 const [teamcode,lokaleteamcode]=teamId.split(':');
 const config=(await readSportlinkSettings()).settings;
 const rows=await article('team-indeling',{teamcode,lokaleteamcode,toonlidfoto:config.includePhotos?'JA':'NEE'});
 const roster=normalizeRoster(rows,teamId);
 const db=database(),now=Date.now();
 const statements:SportlinkStatement[]=[];
 let chunk:(string|number)[][]=[],bytes=0;
 const flush=()=>{if(!chunk.length)return;statements.push(db.prepare(`INSERT INTO sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) VALUES ${chunk.map(()=>'(?,?,?,?,0)').join(',')} ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at`).bind(...chunk.flat()));chunk=[];bytes=0;};
 for(const photo of roster.photos){
  const payload=JSON.stringify({data:photo.data,mime:photo.mime});
  if(chunk.length>=25||bytes+payload.length>1_800_000)flush();
  chunk.push([rosterPhotoKey(teamId,photo.id,season),payload,now,nextSportlinkRun(config.schedules.players,now)]);bytes+=payload.length;
 }
 flush();
 // Bulk writes respect bounded parameter and payload limits. Never store raw member contact data.
 if(statements.length)await db.batch(statements);
 return {players:roster.players.map(player=>({...player,photoUrl:player.photoUrl?`${player.photoUrl}&season=${encodeURIComponent(season)}`:null})),hiddenPlayers:roster.hiddenPlayers};
}
function sortPools(pools:TeamPool[]){return [...pools].sort((a,b)=>b.seasonId.localeCompare(a.seasonId)||Number(b.current)-Number(a.current)||Number(b.phase?.match(/\d+/)?.[0]||0)-Number(a.phase?.match(/\d+/)?.[0]||0)||a.label.localeCompare(b.label,'nl'));}

async function loadTeamDetail(teamId:string,season?:string|null,pool?:string|null,refreshDataset?:SportlinkDataset):Promise<SportlinkTeamDetail>{
 if(!validTeamId(teamId))throw new TeamDataError('Ongeldig team.',400);
 if(season&&!validSeason(season))throw new TeamDataError('Ongeldig seizoen.',400);
 if(pool&&!/^\d{1,12}$/.test(pool))throw new TeamDataError('Ongeldige poule.',400);
 const now=new Date(),currentSeason=seasonForDate(now);
 const current=await loadCached<unknown[]>(`${CATALOG}${currentSeason}`,async()=>{
  const rows=(await verifiedSportlinkCatalog((await readSportlinkSettings()).settings,false,false)).rows;
  if(!teamCatalog(rows).length)throw new Error('Er zijn op dit moment geen teams beschikbaar.');
  const previous=await read(`${CATALOG}${currentSeason}`);
  return mergeTeamCatalog(previous?.payload_json?JSON.parse(previous.payload_json) as unknown[]:[],rows);
 });
 const catalogRows=await database().prepare('SELECT cache_key,payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key LIKE ? AND payload_json IS NOT NULL ORDER BY cache_key DESC LIMIT 12').bind(`${CATALOG}%`).all<CacheRow&{cache_key:string}>();
 const catalogs=catalogRows.results.map(row=>({season:row.cache_key.slice(CATALOG.length),rows:JSON.parse(row.payload_json!) as unknown[]})).filter(item=>validSeason(item.season));
 const availableCatalogs=catalogs.map(item=>({...item,team:teamCatalog(item.rows).find(team=>team.id===teamId)})).filter(item=>!!item.team);
 if(!availableCatalogs.length)throw new TeamDataError('Dit team is niet gevonden.',404);
 const selected=availableCatalogs.find(item=>item.season===(season||currentSeason))||(!season?availableCatalogs[0]:null);
 if(!selected)throw new TeamDataError('Dit seizoen is niet beschikbaar voor dit team.',404);
 const team=selected.team!,selectedSeasonId=selected.season,historical=selectedSeasonId!==currentSeason;
 const pools=availableCatalogs.flatMap(item=>poolsForTeam(item.rows,item.team!,item.season));
 const currentPools=pools.filter(item=>item.seasonId===selectedSeasonId);
 if(pool&&!currentPools.some(item=>item.id===pool))throw new TeamDataError('Deze poule hoort niet bij dit team en seizoen.',404);
 const teamParams:Record<string,string>=Number(team.teamCode)>0?{teamcode:team.teamCode}:{lokaleteamcode:team.localTeamCode};
 const [allFixtures,allResults,roster,teamPhoto]=await Promise.all([
  safe(loadCached<SportlinkMatch[]>(`team-fixtures-v1:${selectedSeasonId}:${teamId}`,async()=>matchesForTeam(await matchArticle('programma',teamParams,selectedSeasonId,true),team,currentPools,selectedSeasonId),historical,refreshDataset==='matches'),[]),
  safe(loadCached<SportlinkMatch[]>(`team-results-v1:${selectedSeasonId}:${teamId}`,async()=>matchesForTeam(await matchArticle('uitslagen',teamParams,selectedSeasonId,false),team,currentPools,selectedSeasonId),historical,refreshDataset==='results'),[]),
  safe(loadCached<Roster>(`team-roster-v1:${selectedSeasonId}:${teamId}`,()=>downloadRoster(teamId,selectedSeasonId),historical,refreshDataset==='players'),{players:[],hiddenPlayers:0}),
  safe(loadCached<{data:string;mime:string}|null>(rosterPhotoKey(teamId,'team',selectedSeasonId),()=>downloadTeamPhoto(teamId),historical,refreshDataset==='teamInfo'),null),
 ]);
 const defaultPool=currentPool(currentPools,[...allResults.value,...allFixtures.value].sort((a,b)=>a.kickoff.localeCompare(b.kickoff)),now);
 const selectedPool=currentPools.find(item=>item.id===pool)||defaultPool;
 if(defaultPool)defaultPool.current=true;
 const [poolFixtures,poolResults,poolStandings]=selectedPool?await Promise.all([
  safe(loadCached<unknown[]>(`team-pool-fixtures-v1:${selectedSeasonId}:${selectedPool.id}`,()=>matchArticle('poule-programma',{poulecode:selectedPool.id,eigenwedstrijden:'NEE'},selectedSeasonId,true),historical,refreshDataset==='matches'),[]),
  safe(loadCached<unknown[]>(`team-pool-results-v1:${selectedSeasonId}:${selectedPool.id}`,()=>matchArticle('pouleuitslagen',{poulecode:selectedPool.id,eigenwedstrijden:'NEE'},selectedSeasonId,false),historical,refreshDataset==='results'),[]),
  safe(loadCached<unknown[]>(`team-pool-standing-v1:${selectedSeasonId}:${selectedPool.id}`,()=>article('poulestand',{poulecode:selectedPool.id}),historical,refreshDataset==='standings'),[]),
 ]):[null,null,null];
 const leagueResults=selectedPool&&poolResults?matchesForTeam(poolResults.value,team,currentPools,selectedSeasonId,{pool:selectedPool,allTeams:true}):[];
 const filteredResults=selectedPool?allResults.value.filter(match=>match.competitionId===selectedPool.id):allResults.value;
 const filteredFixtures=selectedPool?allFixtures.value.filter(match=>match.competitionId===selectedPool.id):allFixtures.value;
 const poolFixtureMatches=selectedPool&&poolFixtures?matchesForTeam(poolFixtures.value,team,currentPools,selectedSeasonId,{pool:selectedPool}):[];
 const resultMap=new Map([...leagueResults.filter(match=>match.home.own||match.away.own),...filteredResults].map(match=>[match.id,match]));
 const fixtureMap=new Map([...poolFixtureMatches,...filteredFixtures].map(match=>[match.id,match]));
 const results=[...resultMap.values()].sort((a,b)=>b.kickoff.localeCompare(a.kickoff));
 const comparisonMatches=[...new Map([...leagueResults,...filteredResults].map(match=>[match.id,match])).values()].sort((a,b)=>b.kickoff.localeCompare(a.kickoff));
 const matchUpdatedAt:Record<string,string>={};
 const matchSource:Record<string,'club'|'pool'>={};
 const markSynced=(matches:SportlinkMatch[],updatedAt:number,source:'club'|'pool')=>{if(updatedAt)for(const match of matches){matchUpdatedAt[match.id]=new Date(updatedAt).toISOString();matchSource[match.id]=source;}};
 markSynced(leagueResults,poolResults?.updatedAt||0,'pool');
 markSynced(poolFixtureMatches,poolFixtures?.updatedAt||0,'pool');
 markSynced(filteredResults,allResults.updatedAt,'club');
 markSynced(filteredFixtures,allFixtures.updatedAt,'club');
 let fixtures=[...fixtureMap.values()].filter(match=>!finished(match.status)).sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
 const staged=[...new Map([...comparisonMatches,...fixtures].map(match=>[match.id,match])).values()];
 for(const match of staged)if(matchUpdatedAt[match.id])match.sourceUpdatedAt=matchUpdatedAt[match.id];
 for(const source of ['club','pool'] as const)await writeStoredMatches(staged.filter(match=>matchSource[match.id]===source&&match.sourceUpdatedAt),new Date().toISOString(),undefined,source==='pool');
 fixtures=await canonicalMatches(fixtures);const canonicalResults=await canonicalMatches(results),canonicalComparison=await canonicalMatches(comparisonMatches);

 const standings=poolStandings?standingsForTeam(poolStandings.value,team,leagueResults):[];
 const fixtureSource=poolFixtures?.available?poolFixtures:allFixtures,resultSource=poolResults?.available?poolResults:allResults;
 const datasets=[allFixtures,allResults,roster,...[poolFixtures,poolResults,poolStandings].filter(item=>item!==null)];
 const anyUnavailable=datasets.some(item=>!item.available),stale=current.stale||datasets.some(item=>item.stale);
 const timestamps=datasets.filter(item=>item.available).map(item=>item.updatedAt);
 const updatedAt=new Date(timestamps.length?Math.min(...timestamps):current.updatedAt).toISOString();
 const notes=['Sportlink levert de huidige seizoensindelingen. Oudere seizoenen worden getoond zodra ze in het clubarchief zijn opgeslagen.'];
 if(historical)notes.push('Je bekijkt de laatst opgeslagen gegevens uit dit seizoen. Dit is geen gegarandeerd volledig seizoensarchief. De spelerslijst wordt niet aangevuld met de huidige selectie.');
 if(!currentPools.length)notes.push('Voor dit team is nog geen competitiepoule gepubliceerd.');
 if(poolStandings?.available&&!standings.length)notes.push('Voor deze poule publiceert Sportlink geen stand. Bij sommige jeugdcompetities worden standen niet openbaar getoond.');
 if(!roster.available)notes.push('De spelerslijst is momenteel niet beschikbaar.');
 else if(roster.value.hiddenPlayers)notes.push('Alleen spelers en begeleiders die via Sportlink openbaar zichtbaar zijn, worden getoond.');
 if(!allFixtures.available&&!poolFixtures?.available)notes.push('Het programma is tijdelijk niet beschikbaar.');
 if(!allResults.available&&!poolResults?.available)notes.push('De uitslagen zijn tijdelijk niet beschikbaar.');
 return {team,teamPhotoUrl:teamPhoto.value?`/api/sportlink/team/photo?team=${encodeURIComponent(teamId)}&person=team&season=${encodeURIComponent(selectedSeasonId)}`:null,seasons:availableCatalogs.map(item=>({id:item.season,label:item.season})),pools:sortPools(pools),selectedSeasonId,selectedPoolId:selectedPool?.id||null,fixtures,results:canonicalResults,comparisonMatches:canonicalComparison,matchUpdatedAt,matchSource,standings,players:(await readSportlinkSettings()).settings.includePhotos?roster.value.players:roster.value.players.map(player=>({...player,photoUrl:null})),hiddenPlayers:roster.value.hiddenPlayers,updatedAt,stale,warning:stale?'Een deel van de Sportlink-gegevens wordt bijgewerkt. Je ziet de laatst opgehaalde gegevens.':anyUnavailable?'Een deel van de teamgegevens is tijdelijk niet beschikbaar.':null,availability:{fixtures:availability(fixtureSource,fixtures),results:availability(resultSource,results),standings:poolStandings?availability(poolStandings,standings):'empty',players:!roster.available?'unavailable':roster.value.players.length?'available':'empty'},notes};
}

export async function getSportlinkTeamPhoto(teamId:string,person:string,season:string|null):Promise<{data:string;mime:string}|null>{
 if(!validTeamId(teamId)||(!/^[a-f0-9]{8}$/.test(person)&&person!=='team')||(season&&!validSeason(season)))return null;
 if(person!=='team'&&!(await readSportlinkSettings()).settings.includePhotos)return null;
 const selectedSeason=season||seasonForDate(new Date());
 if(person==='team'){
  const row=await read(rosterPhotoKey(teamId,'team',selectedSeason));
  return row?.payload_json?JSON.parse(row.payload_json) as {data:string;mime:string}|null:null;
 }
 // The public roster is the allowlist; removed/hidden members' old images cannot be retrieved.
 const rosterRow=await read(`team-roster-v1:${selectedSeason}:${teamId}`);
 if(!rosterRow?.payload_json||(selectedSeason===seasonForDate(new Date())&&rosterRow.expires_at<Date.now()))return null;
 const roster=JSON.parse(rosterRow.payload_json) as Roster;
 if(!roster.players.some(player=>player.id===person&&player.photoUrl))return null;
 if(selectedSeason!==seasonForDate(new Date())){
  const currentRoster=await read(`team-roster-v1:${seasonForDate(new Date())}:${teamId}`);
  if(!currentRoster?.payload_json||currentRoster.expires_at<Date.now())return null;
  const current=JSON.parse(currentRoster.payload_json) as Roster;
  if(!current.players.some(player=>player.id===person&&player.photoUrl))return null;
 }
 const photo=await read(rosterPhotoKey(teamId,person,selectedSeason));
 return photo?.payload_json?JSON.parse(photo.payload_json) as {data:string;mime:string}:null;
}

export function getSportlinkTeamDetail(teamId:string,season?:string|null,pool?:string|null,options?:SportlinkDataset|{maxAgeMs?:number}):Promise<SportlinkTeamDetail>{
 const read=()=>loadTeamDetail(teamId,season,pool,typeof options==='string'?options:undefined);
 return typeof options==='object'&&options.maxAgeMs?withSportlinkReadAge(options.maxAgeMs,read):read();
}

import {sportlinkStore, type SportlinkStatement} from './server/sportlink-store';
import {currentPool,finished,matchesForTeam,mergeTeamCatalog,normalizeRoster,poolsForTeam,record,seasonForDate,standingsForTeam,teamCatalog,text,validSeason,validTeamId} from './sportlink-team-normalize';
import type {SportlinkTeamDetail,TeamAvailability,TeamPlayer,TeamPool} from './sportlink-team-types';
import type {SportlinkMatch} from './sportlink-types';

type CacheRow={payload_json:string|null;updated_at:number;expires_at:number;refresh_after:number};
type Cached<T>={value:T;updatedAt:number;stale:boolean};
type Dataset<T>=Cached<T>&{available:true}|{value:T;updatedAt:0;stale:false;available:false};
type Roster={players:TeamPlayer[];hiddenPlayers:number};
const TTL=15*60*1000;
const CATALOG='team-catalog-v1:';
const inFlight=new Map<string,Promise<Cached<unknown>>>();
export class TeamDataError extends Error{constructor(message:string,public status:number){super(message);}}
function database(){if(!sportlinkStore)throw new Error('De teamgegevens zijn nog niet beschikbaar.');return sportlinkStore;}
async function read(key:string){return database().prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind(key).first<CacheRow>();}
function fromRow<T>(row:CacheRow,stale:boolean):Cached<T>{return {value:JSON.parse(row.payload_json!) as T,updatedAt:row.updated_at,stale};}

/** Cache each dataset separately: a roster failure cannot erase a valid standings table. */
async function loadCached<T>(key:string,loader:()=>Promise<T>,historical=false):Promise<Cached<T>>{
 const pending=inFlight.get(key);if(pending)return pending as Promise<Cached<T>>;
 const run=async()=>{
  const db=database();
  await db.prepare('INSERT INTO sportlink_cache (cache_key) VALUES (?) ON CONFLICT(cache_key) DO NOTHING').bind(key).run();
  const row=await read(key),now=Date.now();
  if(row?.payload_json&&(historical||row.expires_at>now))return fromRow<T>(row,false);
  // Historic data comes only from previously observed snapshots, never current-season endpoints.
  if(historical)throw new Error('Voor dit seizoen is dit onderdeel niet opgeslagen.');
  const claimed=await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=? AND refresh_after<=? RETURNING cache_key').bind(now+45000,key,now).first();
  if(!claimed){if(row?.payload_json)return fromRow<T>(row,true);throw new Error('Dit onderdeel wordt bijgewerkt.');}
  try{
   const value=await loader(),updatedAt=Date.now();
   await db.prepare('UPDATE sportlink_cache SET payload_json=?,updated_at=?,expires_at=?,refresh_after=0 WHERE cache_key=?').bind(JSON.stringify(value),updatedAt,updatedAt+TTL,key).run();
   return {value,updatedAt,stale:false};
  }catch(error){
   await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=?').bind(Date.now()+120000,key).run();
   if(row?.payload_json)return fromRow<T>(row,true);
   throw error;
  }
 };
 const promise=run().finally(()=>inFlight.delete(key));inFlight.set(key,promise as Promise<Cached<unknown>>);return promise;
}
async function safe<T>(promise:Promise<Cached<T>>,empty:T):Promise<Dataset<T>>{
 try{return {...await promise,available:true};}catch{return {value:empty,available:false,updatedAt:0,stale:false};}
}
async function requestArticle(name:string,params:Record<string,string>={}):Promise<unknown>{
 const clientId=process.env.SPORTLINK_CLIENT_ID;
 if(typeof clientId!=='string'||!clientId)throw new Error('Sportlink-configuratie ontbreekt.');
 const url=new URL(`https://data.sportlink.com/${name}`);url.search=new URLSearchParams({client_id:clientId,...params}).toString();
 let response:Response;
 try{response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});}catch{throw new Error('Sportlink is tijdelijk niet bereikbaar.');}
 if(!response.ok)throw new Error('Sportlink is tijdelijk niet bereikbaar.');
 return response.json();
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
 const rows=await article('team-indeling',{teamcode,lokaleteamcode,toonlidfoto:'JA'});
 const roster=normalizeRoster(rows,teamId);
 const db=database(),now=Date.now();
 const statements:SportlinkStatement[]=[];
 let chunk:(string|number)[][]=[],bytes=0;
 const flush=()=>{if(!chunk.length)return;statements.push(db.prepare(`INSERT INTO sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) VALUES ${chunk.map(()=>'(?,?,?,?,0)').join(',')} ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at`).bind(...chunk.flat()));chunk=[];bytes=0;};
 for(const photo of roster.photos){
  const payload=JSON.stringify({data:photo.data,mime:photo.mime});
  if(chunk.length>=25||bytes+payload.length>1_800_000)flush();
  chunk.push([rosterPhotoKey(teamId,photo.id,season),payload,now,now+TTL]);bytes+=payload.length;
 }
 flush();
 // Bulk writes respect bounded parameter and payload limits. Never store raw member contact data.
 if(statements.length)await db.batch(statements);
 return {players:roster.players.map(player=>({...player,photoUrl:player.photoUrl?`${player.photoUrl}&season=${encodeURIComponent(season)}`:null})),hiddenPlayers:roster.hiddenPlayers};
}
function sortPools(pools:TeamPool[]){return [...pools].sort((a,b)=>b.seasonId.localeCompare(a.seasonId)||Number(b.current)-Number(a.current)||Number(b.phase?.match(/\d+/)?.[0]||0)-Number(a.phase?.match(/\d+/)?.[0]||0)||a.label.localeCompare(b.label,'nl'));}

export async function getSportlinkTeamDetail(teamId:string,season?:string|null,pool?:string|null):Promise<SportlinkTeamDetail>{
 if(!validTeamId(teamId))throw new TeamDataError('Ongeldig team.',400);
 if(season&&!validSeason(season))throw new TeamDataError('Ongeldig seizoen.',400);
 if(pool&&!/^\d{1,12}$/.test(pool))throw new TeamDataError('Ongeldige poule.',400);
 const now=new Date(),currentSeason=seasonForDate(now);
 const current=await loadCached<unknown[]>(`${CATALOG}${currentSeason}`,async()=>{
  const rows=await article('teams',{competitieperiode:'ALLES'});
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
  safe(loadCached<SportlinkMatch[]>(`team-fixtures-v1:${selectedSeasonId}:${teamId}`,async()=>matchesForTeam(await matchArticle('programma',teamParams,selectedSeasonId,true),team,currentPools,selectedSeasonId),historical),[]),
  safe(loadCached<SportlinkMatch[]>(`team-results-v1:${selectedSeasonId}:${teamId}`,async()=>matchesForTeam(await matchArticle('uitslagen',teamParams,selectedSeasonId,false),team,currentPools,selectedSeasonId),historical),[]),
  safe(loadCached<Roster>(`team-roster-v1:${selectedSeasonId}:${teamId}`,()=>downloadRoster(teamId,selectedSeasonId),historical),{players:[],hiddenPlayers:0}),
  safe(loadCached<{data:string;mime:string}|null>(rosterPhotoKey(teamId,'team',selectedSeasonId),()=>downloadTeamPhoto(teamId),historical),null),
 ]);
 const defaultPool=currentPool(currentPools,[...allResults.value,...allFixtures.value].sort((a,b)=>a.kickoff.localeCompare(b.kickoff)),now);
 const selectedPool=currentPools.find(item=>item.id===pool)||defaultPool;
 if(defaultPool)defaultPool.current=true;
 const [poolFixtures,poolResults,poolStandings]=selectedPool?await Promise.all([
  safe(loadCached<unknown[]>(`team-pool-fixtures-v1:${selectedSeasonId}:${selectedPool.id}`,()=>matchArticle('poule-programma',{poulecode:selectedPool.id,eigenwedstrijden:'NEE'},selectedSeasonId,true),historical),[]),
  safe(loadCached<unknown[]>(`team-pool-results-v1:${selectedSeasonId}:${selectedPool.id}`,()=>matchArticle('pouleuitslagen',{poulecode:selectedPool.id,eigenwedstrijden:'NEE'},selectedSeasonId,false),historical),[]),
  safe(loadCached<unknown[]>(`team-pool-standing-v1:${selectedSeasonId}:${selectedPool.id}`,()=>article('poulestand',{poulecode:selectedPool.id}),historical),[]),
 ]):[null,null,null];
 const leagueResults=selectedPool&&poolResults?matchesForTeam(poolResults.value,team,currentPools,selectedSeasonId,{pool:selectedPool,allTeams:true}):[];
 const filteredResults=selectedPool?allResults.value.filter(match=>match.competitionId===selectedPool.id):allResults.value;
 const filteredFixtures=selectedPool?allFixtures.value.filter(match=>match.competitionId===selectedPool.id):allFixtures.value;
 const resultMap=new Map([...filteredResults,...leagueResults.filter(match=>match.home.own||match.away.own)].map(match=>[match.id,match]));
 const fixtureMap=new Map([...filteredFixtures,...(selectedPool&&poolFixtures?matchesForTeam(poolFixtures.value,team,currentPools,selectedSeasonId,{pool:selectedPool}):[])].map(match=>[match.id,match]));
 const results=[...resultMap.values()].sort((a,b)=>b.kickoff.localeCompare(a.kickoff));
 const fixtures=[...fixtureMap.values()].filter(match=>!finished(match.status)).sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
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
 return {team,teamPhotoUrl:teamPhoto.value?`/api/sportlink/team/photo?team=${encodeURIComponent(teamId)}&person=team&season=${encodeURIComponent(selectedSeasonId)}`:null,seasons:availableCatalogs.map(item=>({id:item.season,label:item.season})),pools:sortPools(pools),selectedSeasonId,selectedPoolId:selectedPool?.id||null,fixtures,results,standings,players:roster.value.players,hiddenPlayers:roster.value.hiddenPlayers,updatedAt,stale,warning:stale?'Een deel van de Sportlink-gegevens wordt bijgewerkt. Je ziet de laatst opgehaalde gegevens.':anyUnavailable?'Een deel van de teamgegevens is tijdelijk niet beschikbaar.':null,availability:{fixtures:availability(fixtureSource,fixtures),results:availability(resultSource,results),standings:poolStandings?availability(poolStandings,standings):'empty',players:!roster.available?'unavailable':roster.value.players.length?'available':'empty'},notes};
}

export async function getSportlinkTeamPhoto(teamId:string,person:string,season:string|null):Promise<{data:string;mime:string}|null>{
 if(!validTeamId(teamId)||(!/^[a-f0-9]{8}$/.test(person)&&person!=='team')||(season&&!validSeason(season)))return null;
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

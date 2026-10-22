import {withSportlinkReadAge,sportlinkReadMaxAge} from './server/sportlink-read-context';
import {writeStoredMatches,canonicalMatches} from './server/match-store';
import {verifiedSportlinkCatalog} from './server/sportlink-identity';
import {sportlinkStore, type SportlinkStatement} from './server/sportlink-store';
import {normalizeSportlink,withStandingOwnership} from './sportlink-normalize';
import type {SportlinkSnapshot,SportlinkSide} from './sportlink-types';
import {cachedSportlinkArticle} from './server/sportlink-client';
import {readSportlinkSettings} from './server/sportlink-config';

const CACHE_KEY='club-competition-v1';
const CACHE_MS=15*60*1000;
type CacheRow={payload_json:string|null;updated_at:number;expires_at:number;refresh_after:number};
let inFlight:Promise<SportlinkSnapshot>|null=null;

async function article(name:string,params:Record<string,string>={},versions?:Map<string,{at:number;priority:number}>){
 const result=await cachedSportlinkArticle(name,params);
 if(result.stale)throw new Error('Sportlink wordt opnieuw geprobeerd.');
 const data=result.value;
 if(!Array.isArray(data))throw new Error('Sportlink leverde geen geldige competitiegegevens.');
 if(versions)for(const row of data){const id=String(row.wedstrijdcode||''),priority=['programma','uitslagen'].includes(name)?2:1,old=versions.get(id);if(!old||priority>old.priority||priority===old.priority&&result.updatedAt>=old.at)versions.set(id,{at:result.updatedAt,priority});}return data;
}

async function downloadSnapshot():Promise<SportlinkSnapshot>{
 const started=Date.now(),versions=new Map<string,{at:number;priority:number}>();const {settings}=await readSportlinkSettings();
 const catalog=await verifiedSportlinkCatalog(settings,false,false),teams=catalog.rows;
 if(!teams.length)throw new Error('Sportlink leverde op dit moment geen teams.');
 const selection=normalizeSportlink({teams,standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:[]});
 const pool=selection.competition?.id;
 const [standings,leagueResults,leagueFixtures,clubResults,clubFixtures]=await Promise.all([
  pool?article('poulestand',{poulecode:pool},versions):Promise.resolve([]),
  pool?article('pouleuitslagen',{poulecode:pool,weekoffset:'-35',aantaldagen:'250',eigenwedstrijden:'NEE'},versions):Promise.resolve([]),
  pool?article('poule-programma',{poulecode:pool,weekoffset:'0',aantaldagen:'60',eigenwedstrijden:'NEE'},versions):Promise.resolve([]),
  article('uitslagen',{weekoffset:String(-Math.ceil(settings.resultsDays/7)),aantaldagen:String(settings.resultsDays),aantalregels:'500',sorteervolgorde:'datum-omgekeerd'},versions),
  article('programma',{weekoffset:'0',aantaldagen:String(settings.programmeDays),aantalregels:'500'},versions),
 ]);
 const data=normalizeSportlink({verifiedClubCode:catalog.clubCode,teams,standings,leagueResults,leagueFixtures,clubResults,clubFixtures},new Date(started));
 const mark=(match:any)=>({...match,sourceUpdatedAt:new Date(versions.get(match.id)?.at||started).toISOString()});
 return {...data,clubCode:catalog.clubCode,fixtures:data.fixtures.map(mark),results:data.results.map(mark),previousRound:{...data.previousRound,matches:data.previousRound.matches.map(mark)},nextRound:{...data.nextRound,matches:data.nextRound.matches.map(mark)},nextMatch:data.nextMatch?mark(data.nextMatch):null};
}

async function persist(data:SportlinkSnapshot,lease:number){
 const db=sportlinkStore;
 if(!db)throw new Error('De competitiegegevens zijn nog niet beschikbaar.');
 const statements:SportlinkStatement[]=[];
 // Bounded batches limit statement size. Multi-row inserts also
 // keep a large club import well below its per-invocation query limit.
 const appendUpserts=(table:string,columns:string[],rows:(string|number|null)[][],conflict:string)=>{
  const rowsPerStatement=Math.floor(100/columns.length);
  const placeholders=`(${columns.map(()=>'?').join(',')})`;
  for(let start=0;start<rows.length;start+=rowsPerStatement){
   const chunk=rows.slice(start,start+rowsPerStatement);
   statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map(()=>placeholders).join(',')} ${conflict}`).bind(...chunk.flat()));
  }
 };
 const clubs=new Map<string,SportlinkSide>();
 const matches=new Map([...data.previousRound.matches,...data.nextRound.matches,...data.results,...data.fixtures].map(match=>[match.id,match]));
 for(const match of matches.values()){
  if(match.home.clubCode)clubs.set(match.home.clubCode,match.home);
  if(match.away.clubCode)clubs.set(match.away.clubCode,match.away);
 }
 for(const row of data.standings)if(row.team.clubCode)clubs.set(row.team.clubCode,row.team);
 appendUpserts('sportlink_clubs',
  ['club_code','name','logo_url','updated_at'],
  [...clubs.values()].map(club=>[club.clubCode,club.name,club.logoUrl,data.updatedAt]),
  'ON CONFLICT(club_code) DO UPDATE SET name=excluded.name,logo_url=excluded.logo_url,updated_at=excluded.updated_at');
 const now=Date.parse(data.updatedAt);
 statements.push(db.prepare('UPDATE sportlink_cache SET payload_json=?,updated_at=?,expires_at=?,refresh_after=0 WHERE cache_key=? AND refresh_after=? AND updated_at<=?').bind(JSON.stringify(data),now,now+CACHE_MS,CACHE_KEY,lease,now));
 // PostgreSQL batch is transactional: the visible snapshot changes only after every row succeeds.
 const {sqlClient}=await import('./../db');await sqlClient().begin(async tx=>{const [owned]=await tx`select cache_key from sportlink_cache where cache_key=${CACHE_KEY} and refresh_after=${lease} for update`;if(!owned)return;await writeStoredMatches([...matches.values()],data.updatedAt,tx);for(const statement of statements)await statement.execute(tx as any);});
}

function cachedSnapshot(row:CacheRow,stale=false):SportlinkSnapshot{
 const data=withStandingOwnership(JSON.parse(row.payload_json!) as SportlinkSnapshot);
 return {...data,stale,warning:stale?'Sportlink is tijdelijk niet bereikbaar. Je ziet de laatst opgehaalde gegevens.':null};
}

async function readOrRefresh():Promise<SportlinkSnapshot>{
 const db=sportlinkStore;
 if(!db)throw new Error('De competitiegegevens zijn nog niet beschikbaar.');
 await db.prepare('INSERT INTO sportlink_cache (cache_key) VALUES (?) ON CONFLICT(cache_key) DO NOTHING').bind(CACHE_KEY).run();
 const row=await db.prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind(CACHE_KEY).first<CacheRow>();
 const now=Date.now();
 if(row?.payload_json&&row.expires_at>now&&now-Number(row.updated_at)<sportlinkReadMaxAge())return cachedSnapshot(row);
 // A short cross-worker lease prevents a busy homepage from flooding Sportlink.
 const claimed=await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=? AND refresh_after<=? RETURNING cache_key').bind(now+45000,CACHE_KEY,now).first();
 if(!claimed){
  if(row?.payload_json)return {...cachedSnapshot(row),stale:true,warning:'Competitiegegevens worden bijgewerkt.'};
  throw new Error('De competitiegegevens worden opgehaald. Probeer het over een moment opnieuw.');
 }
 try{
  const snapshot=await downloadSnapshot();
  await persist(snapshot,now+45000);
  const saved=await db.prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind(CACHE_KEY).first<CacheRow>();if(!saved?.payload_json)throw new Error('De bronupdate is nog niet opgeslagen.');return cachedSnapshot(saved);
 }catch(error){
  await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=? AND refresh_after=? AND updated_at<=?').bind(Date.now()+120000,CACHE_KEY,now+45000,now).run();
  const latest=await db.prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind(CACHE_KEY).first<CacheRow>();if(latest?.payload_json)return cachedSnapshot(latest,Number(latest.updated_at)<=now);
  throw error;
 }
}

function snapshot():Promise<SportlinkSnapshot>{
 if(inFlight)return inFlight;
 inFlight=readOrRefresh().then(overlaySportlinkAssignments).finally(()=>{inFlight=null;});
 return inFlight;
}

/** Fast source checks override slower competition snapshots, never hand edits. */
async function overlaySportlinkAssignments(snapshot:SportlinkSnapshot):Promise<SportlinkSnapshot>{
 const all=[...snapshot.fixtures,...snapshot.results,...snapshot.previousRound.matches,...snapshot.nextRound.matches,...(snapshot.nextMatch?[snapshot.nextMatch]:[])];
 const saved=await canonicalMatches(all),byId=new Map(saved.map(match=>[match.id,match]));const rows=(matches:typeof all)=>matches.flatMap(match=>byId.has(match.id)?[byId.get(match.id)!]:[]);
 return {...snapshot,fixtures:rows(snapshot.fixtures).sort((a,b)=>a.kickoff.localeCompare(b.kickoff)),results:rows(snapshot.results),previousRound:{...snapshot.previousRound,matches:rows(snapshot.previousRound.matches)},nextRound:{...snapshot.nextRound,matches:rows(snapshot.nextRound.matches)},nextMatch:snapshot.nextMatch?byId.get(snapshot.nextMatch.id)||null:null};
}
export function getSportlinkSnapshot(options:{maxAgeMs?:number}={}):Promise<SportlinkSnapshot>{return options.maxAgeMs?withSportlinkReadAge(options.maxAgeMs,snapshot):snapshot();}

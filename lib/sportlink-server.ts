import {sportlinkStore, type SportlinkStatement} from './server/sportlink-store';
import {normalizeSportlink} from './sportlink-normalize';
import type {SportlinkSnapshot,SportlinkSide} from './sportlink-types';
import {cachedSportlinkArticle} from './server/sportlink-client';
import {readSportlinkSettings} from './server/sportlink-config';

const CACHE_KEY='club-competition-v1';
const CACHE_MS=15*60*1000;
type CacheRow={payload_json:string|null;updated_at:number;expires_at:number;refresh_after:number};
let inFlight:Promise<SportlinkSnapshot>|null=null;

async function article(name:string,params:Record<string,string>={}){
 const result=await cachedSportlinkArticle(name,params);
 if(result.stale)throw new Error('Sportlink wordt opnieuw geprobeerd.');
 const data=result.value;
 if(!Array.isArray(data))throw new Error('Sportlink leverde geen geldige competitiegegevens.');
 return data;
}

async function downloadSnapshot():Promise<SportlinkSnapshot>{
 const {settings}=await readSportlinkSettings();
 const teams=await article('teams',{competitieperiode:'ALLES'});
 if(!teams.length)throw new Error('Sportlink leverde op dit moment geen teams.');
 const selection=normalizeSportlink({teams,standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:[]});
 const pool=selection.competition?.id;
 const [standings,leagueResults,leagueFixtures,clubResults,clubFixtures]=await Promise.all([
  pool?article('poulestand',{poulecode:pool}):Promise.resolve([]),
  pool?article('pouleuitslagen',{poulecode:pool,weekoffset:'-35',aantaldagen:'250',eigenwedstrijden:'NEE'}):Promise.resolve([]),
  pool?article('poule-programma',{poulecode:pool,weekoffset:'0',aantaldagen:'60',eigenwedstrijden:'NEE'}):Promise.resolve([]),
  article('uitslagen',{weekoffset:String(-Math.ceil(settings.resultsDays/7)),aantaldagen:String(settings.resultsDays),aantalregels:'500',sorteervolgorde:'datum-omgekeerd'}),
  article('programma',{weekoffset:'0',aantaldagen:String(settings.programmeDays),aantalregels:'500'}),
 ]);
 return normalizeSportlink({teams,standings,leagueResults,leagueFixtures,clubResults,clubFixtures});
}

async function persist(data:SportlinkSnapshot){
 const db=sportlinkStore;
 if(!db)throw new Error('De competitiegegevens zijn nog niet beschikbaar.');
 const catalogManaged=(await readSportlinkSettings()).configured;
 const statements:SportlinkStatement[]=catalogManaged?[]:[db.prepare('UPDATE sportlink_teams SET active = 0')];
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
 if(!catalogManaged)appendUpserts('sportlink_teams',
  ['id','team_code','local_team_code','name','category','gender','sport','day','competitions_json','active','updated_at'],
  data.teams.map(team=>[team.id,team.teamCode,team.localTeamCode,team.name,team.category,team.gender,team.sport,team.day,JSON.stringify(team.competitions),1,data.updatedAt]),
  'ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,gender=excluded.gender,sport=excluded.sport,day=excluded.day,competitions_json=excluded.competitions_json,active=1,updated_at=excluded.updated_at');
 const clubs=new Map<string,SportlinkSide>();
 const matches=new Map([...data.results,...data.fixtures,...data.previousRound.matches,...data.nextRound.matches].map(match=>[match.id,match]));
 for(const match of matches.values()){
  if(match.home.clubCode)clubs.set(match.home.clubCode,match.home);
  if(match.away.clubCode)clubs.set(match.away.clubCode,match.away);
 }
 appendUpserts('sportlink_matches',
  ['id','kickoff','home_team_code','away_team_code','home_club_code','away_club_code','status','payload_json','updated_at'],
  [...matches.values()].map(match=>[match.id,match.kickoff,match.home.id,match.away.id,match.home.clubCode,match.away.clubCode,match.status,JSON.stringify(match),data.updatedAt]),
  'ON CONFLICT(id) DO UPDATE SET kickoff=excluded.kickoff,home_team_code=excluded.home_team_code,away_team_code=excluded.away_team_code,home_club_code=excluded.home_club_code,away_club_code=excluded.away_club_code,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at');
 for(const row of data.standings)if(row.team.clubCode)clubs.set(row.team.clubCode,row.team);
 appendUpserts('sportlink_clubs',
  ['club_code','name','logo_url','updated_at'],
  [...clubs.values()].map(club=>[club.clubCode,club.name,club.logoUrl,data.updatedAt]),
  'ON CONFLICT(club_code) DO UPDATE SET name=excluded.name,logo_url=excluded.logo_url,updated_at=excluded.updated_at');
 const now=Date.now();
 statements.push(db.prepare('UPDATE sportlink_cache SET payload_json=?,updated_at=?,expires_at=?,refresh_after=0 WHERE cache_key=?').bind(JSON.stringify(data),now,now+CACHE_MS,CACHE_KEY));
 // PostgreSQL batch is transactional: the visible snapshot changes only after every row succeeds.
 await db.batch(statements);
}

function cachedSnapshot(row:CacheRow,stale=false):SportlinkSnapshot{
 const data=JSON.parse(row.payload_json!) as SportlinkSnapshot;
 return {...data,stale,warning:stale?'Sportlink is tijdelijk niet bereikbaar. Je ziet de laatst opgehaalde gegevens.':null};
}

async function readOrRefresh():Promise<SportlinkSnapshot>{
 const db=sportlinkStore;
 if(!db)throw new Error('De competitiegegevens zijn nog niet beschikbaar.');
 await db.prepare('INSERT INTO sportlink_cache (cache_key) VALUES (?) ON CONFLICT(cache_key) DO NOTHING').bind(CACHE_KEY).run();
 const row=await db.prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind(CACHE_KEY).first<CacheRow>();
 const now=Date.now();
 if(row?.payload_json&&row.expires_at>now)return cachedSnapshot(row);
 // A short cross-worker lease prevents a busy homepage from flooding Sportlink.
 const claimed=await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=? AND refresh_after<=? RETURNING cache_key').bind(now+45000,CACHE_KEY,now).first();
 if(!claimed){
  if(row?.payload_json)return {...cachedSnapshot(row),stale:true,warning:'Competitiegegevens worden bijgewerkt.'};
  throw new Error('De competitiegegevens worden opgehaald. Probeer het over een moment opnieuw.');
 }
 try{
  const snapshot=await downloadSnapshot();
  await persist(snapshot);
  return snapshot;
 }catch(error){
  await db.prepare('UPDATE sportlink_cache SET refresh_after=? WHERE cache_key=?').bind(Date.now()+120000,CACHE_KEY).run();
  if(row?.payload_json)return cachedSnapshot(row,true);
  throw error;
 }
}

export function getSportlinkSnapshot():Promise<SportlinkSnapshot>{
 if(inFlight)return inFlight;
 inFlight=readOrRefresh().then(overlaySportlinkAssignments).finally(()=>{inFlight=null;});
 return inFlight;
}

/** Fast source checks override slower competition snapshots, never hand edits. */
async function overlaySportlinkAssignments(snapshot:SportlinkSnapshot):Promise<SportlinkSnapshot>{
 const row=await sportlinkStore.prepare('SELECT payload_json,updated_at,expires_at,refresh_after FROM sportlink_cache WHERE cache_key=?').bind('sportlink-assignments-v1').first<CacheRow>();
 if(!row?.payload_json||Number(row.expires_at)<Date.now())return snapshot;
 const latest=new Map<string,SportlinkSnapshot['fixtures'][number]>(JSON.parse(row.payload_json).matches.map((match:SportlinkSnapshot['fixtures'][number])=>[match.id,match]));
 const merge=(match:SportlinkSnapshot['fixtures'][number])=>{const source=latest.get(match.id);return source?{...match,kickoff:source.kickoff,status:source.status,field:source.field,changingRooms:source.changingRooms}:match;};
 return {...snapshot,fixtures:snapshot.fixtures.map(merge).sort((a,b)=>a.kickoff.localeCompare(b.kickoff)),nextMatch:snapshot.nextMatch?merge(snapshot.nextMatch):null,nextRound:{...snapshot.nextRound,matches:snapshot.nextRound.matches.map(merge)}};
}

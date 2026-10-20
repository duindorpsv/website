import type {FormResult,SportlinkMatch,SportlinkSide,SportlinkStanding,SportlinkTeam} from './sportlink-types';
import type {TeamPlayer,TeamPool} from './sportlink-team-types';

type Raw=Record<string,unknown>;
export const record=(value:unknown):Raw=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Raw:{};
export const text=(value:unknown):string=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
const key=(value:unknown)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim();
const number=(value:unknown)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):0;
const code=(value:unknown)=>/^\d{1,12}$/.test(text(value))&&Number(value)>0?text(value):'';
const truth=(value:unknown)=>value===true||['true','ja','1'].includes(key(value));
export const finished=(value:string)=>['uitgespeeld','gespeeld','eindstand','beeindigd','afgelopen','finished','completed','na verlenging','na strafschoppen'].includes(key(value));

export function seasonForDate(date:Date):string {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'numeric'}).formatToParts(date);
 const year=Number(parts.find(part=>part.type==='year')?.value);
 const month=Number(parts.find(part=>part.type==='month')?.value);
 const start=month>=7?year:year-1;
 return `${start}/${start+1}`;
}
export function validSeason(value:string){const m=value.match(/^(20\d{2})\/(20\d{2})$/);return !!m&&Number(m[2])===Number(m[1])+1;}
export function validTeamId(value:string){return /^(?:[1-9]\d{0,11}|-1|):(?:[1-9]\d{0,11}|-1)$/.test(value)&&value.split(':').some(v=>Number(v)>0);}

export function teamCatalog(rows:unknown[]):SportlinkTeam[] {
 const map=new Map<string,SportlinkTeam>();
 for(const input of rows){
  const row=record(input),teamCode=text(row.teamcode),localTeamCode=text(row.lokaleteamcode)||'-1',id=`${teamCode}:${localTeamCode}`;
  if(!validTeamId(id)||!text(row.teamnaam))continue;
  let team=map.get(id);
  if(!team){team={id,teamCode,localTeamCode,name:text(row.teamnaam),category:text(row.leeftijdscategorie),gender:text(row.geslacht),sport:text(row.spelsoort),day:text(row.speeldag),competitions:[]};map.set(id,team);}
  const pool=code(row.poulecode);
  if(pool&&!team.competitions.some(item=>item.id===pool))team.competitions.push({id:pool,label:text(row.klassepoule)||text(row.competitienaam)||`Poule ${pool}`,type:key(row.competitiesoort)});
 }
 return [...map.values()];
}
/** Preserve finished phases within a season when the source publishes only newer assignments. */
export function mergeTeamCatalog(previous:unknown[],fresh:unknown[]):unknown[]{
 const rows=new Map<string,Raw>(),latestTeam=new Map<string,Raw>();
 const teamKey=(row:Raw)=>`${text(row.teamcode)}:${text(row.lokaleteamcode)||'-1'}`;
 for(const input of fresh){const row=record(input);latestTeam.set(teamKey(row),row);}
 for(const input of previous){
  const row=record(input),latest=latestTeam.get(teamKey(row));
  const metadata=latest?Object.fromEntries(['teamnaam','geslacht','leeftijdscategorie','spelsoort','speeldag'].map(field=>[field,latest[field]])):{};
  rows.set(`${teamKey(row)}:${text(row.poulecode)}`,{...row,...metadata});
 }
 for(const input of fresh){const row=record(input);rows.set(`${teamKey(row)}:${text(row.poulecode)}`,row);}
 return [...rows.values()];
}
export function poolsForTeam(rows:unknown[],team:SportlinkTeam,seasonId:string):TeamPool[]{
 const map=new Map<string,TeamPool>();
 for(const input of rows){
  const row=record(input);
  if(`${text(row.teamcode)}:${text(row.lokaleteamcode)||'-1'}`!==team.id)continue;
  const id=code(row.poulecode);if(!id)continue;
  const competitionName=text(row.competitienaam),label=text(row.klassepoule)||competitionName||`Poule ${id}`;
  const phaseText=`${competitionName} ${label}`;
  const phaseMatch=phaseText.match(/(?:\b(\d+)e?\s*fase\b|\bfase\s*(\d+)\b)/i);
  const phase=phaseMatch?`Fase ${phaseMatch[1]||phaseMatch[2]}`:/\bvoorjaar\b/i.test(phaseText)?'Voorjaar':/\bnajaar\b/i.test(phaseText)?'Najaar':null;
  map.set(id,{id,label,seasonId,type:key(row.competitiesoort),phase,competitionName,current:false});
 }
 return [...map.values()];
}
function kickoff(row:Raw):string|null{
 const value=text(row.wedstrijddatum);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value))return null;
 const date=new Date(value.replace(/([+-]\d{2})(\d{2})$/,'$1:$2'));
 return Number.isNaN(date.getTime())?null:date.toISOString();
}
function matchingPool(row:Raw,pools:TeamPool[]):TeamPool|undefined{
 const id=code(row.poulecode);if(id)return pools.find(pool=>pool.id===id);
 const label=key(row.klassepoule),competition=key(row.competitienaam)||key(row.competitie),type=key(row.competitiesoort);
 const candidates=pools.filter(pool=>!type||pool.type===type);
 const labels=label?candidates.filter(pool=>key(pool.label)===label):[];
 const competitions=competition?candidates.filter(pool=>key(pool.competitionName)===competition):[];
 const exact=labels.filter(pool=>competitions.includes(pool));
 if(exact.length===1)return exact[0];
 // Phases can share a class label: the competition name is more specific, never pick the first label.
 if(competitions.length===1&&(!labels.length||labels.includes(competitions[0])))return competitions[0];
 if(labels.length===1&&(!competitions.length||competitions.includes(labels[0])))return labels[0];
 // Sportlink uses B1000/B6610 prefixes and sometimes drops gender words in result labels.
 // Only an explicit competition type with a single possible pool is safe to resolve this way.
 return type&&candidates.length===1?candidates[0]:undefined;
}
function side(name:string,clubCode:string,id:string,team:SportlinkTeam,own=false):SportlinkSide{
 const ownSide=!!code(team.teamCode)&&id===team.teamCode;
 return {id:code(id)||`${clubCode}:${key(name)}`,name,clubCode,own:ownSide,logoUrl:ownSide?'/assets/logo.png':clubCode?`https://logoapi.voetbal.nl/logo.php?clubcode=${encodeURIComponent(clubCode)}`:null};
}
export function matchesForTeam(rows:unknown[],team:SportlinkTeam,pools:TeamPool[],seasonId:string,options:{pool?:TeamPool;allTeams?:boolean}={}):SportlinkMatch[]{
 const map=new Map<string,SportlinkMatch>();
 for(const input of rows){
  const row=record(input),id=text(row.wedstrijdcode),date=kickoff(row);
  if(!id||!date||seasonForDate(new Date(date))!==seasonId)continue;
  const homeName=text(row.thuisteam),awayName=text(row.uitteam);if(!homeName||!awayName)continue;
  const home=side(homeName,text(row.thuisteamclubrelatiecode),text(row.thuisteamid),team),away=side(awayName,text(row.uitteamclubrelatiecode),text(row.uitteamid),team);
  if(!options.allTeams&&!home.own&&!away.own)continue;
  const status=text(row.status),score=(text(row.uitslag)||text(row['uitslag-regulier'])).match(/^(\d{1,3})\s*[-–:]\s*(\d{1,3})(?:\s*\([^)]*\))?$/);
  const validScore=finished(status)&&score;
  const pool=options.pool||matchingPool(row,pools);
  map.set(id,{id,kickoff:date,home,away,homeScore:validScore?Number(score[1]):null,awayScore:validScore?Number(score[2]):null,scoreLabel:validScore?`${score[1]} – ${score[2]}`:null,status,venue:text(row.accommodatie),...sportlinkAssignmentFields(row),competitionId:pool?.id||'',competitionLabel:pool?.label||text(row.klassepoule)||text(row.competitienaam)||text(row.competitie)});
 }
 return [...map.values()].sort((a,b)=>a.kickoff.localeCompare(b.kickoff)||a.id.localeCompare(b.id));
}

/** The pool currently being played wins; a scheduled next phase follows a finished phase. */
export function currentPool(pools:TeamPool[],matches:SportlinkMatch[],now=new Date()):TeamPool|null{
 if(!pools.length)return null;
 const stamp=now.getTime();
 const scored=pools.map(pool=>{
  const own=matches.filter(match=>match.competitionId===pool.id);
  const past=own.filter(match=>new Date(match.kickoff).getTime()<=stamp);
  const future=own.filter(match=>new Date(match.kickoff).getTime()>stamp&&!finished(match.status)&&!/afgelast|vervallen|geannuleerd/i.test(match.status));
  const phase=Number(pool.phase?.match(/\d+/)?.[0]||0)+(pool.phase==='Voorjaar'?10:0);
  return {pool,phase,active:future.length>0,last:past.at(-1)?.kickoff||'',first:past[0]?.kickoff||'',next:future[0]?.kickoff||'',waiting:/wachtlijst/i.test(`${pool.label} ${pool.competitionName}`)};
 });
 scored.sort((a,b)=>Number(a.waiting)-Number(b.waiting)||Number(b.active)-Number(a.active)||
  (a.active&&b.active?(Number(b.pool.type==='regulier')-Number(a.pool.type==='regulier')||Number(!!b.first)-Number(!!a.first)||b.first.localeCompare(a.first)||b.phase-a.phase||a.next.localeCompare(b.next)):
   b.last.localeCompare(a.last)||b.phase-a.phase||Number(b.pool.type==='regulier')-Number(a.pool.type==='regulier'))||a.pool.label.localeCompare(b.pool.label,'nl'));
 return scored[0].pool;
}

export function standingsForTeam(rows:unknown[],team:SportlinkTeam,results:SportlinkMatch[]):SportlinkStanding[]{
 const sideIds=new Map<string,string>();
 for(const match of results)for(const item of [match.home,match.away])sideIds.set(`${item.clubCode}:${key(item.name)}`,item.id);
 return rows.map(record).filter(row=>number(row.positie)>0&&text(row.teamnaam)).map(row=>{
  const name=text(row.teamnaam),clubCode=text(row.clubrelatiecode),id=code(row.teamcode)||sideIds.get(`${clubCode}:${key(name)}`)||'';
  const item=side(name,clubCode,id,team,truth(row.eigenteam)&&key(name)===key(team.name));
  const form:FormResult[]=results.filter(match=>match.homeScore!==null&&match.awayScore!==null&&(match.home.id===item.id||match.away.id===item.id)).slice(-5).map(match=>{
   const home=match.home.id===item.id,own=home?match.homeScore!:match.awayScore!,other=home?match.awayScore!:match.homeScore!;
   return own===other?'GL':own>other?'W':'V';
  });
  return {rank:number(row.positie),team:item,played:number(row.gespeeldewedstrijden),won:number(row.gewonnen),drawn:number(row.gelijk),lost:number(row.verloren),goalsFor:number(row.doelpuntenvoor),goalsAgainst:number(row.doelpuntentegen),goalDifference:number(row.doelsaldo),points:number(row.punten),form};
 }).sort((a,b)=>a.rank-b.rank);
}

export type NormalizedRoster={players:TeamPlayer[];hiddenPlayers:number;photos:{id:string;data:string;mime:string}[]};
export function normalizeRoster(rows:unknown[],teamId:string,now=new Date()):NormalizedRoster{
 const result:NormalizedRoster={players:[],hiddenPlayers:0,photos:[]};
 for(const input of rows){
  const row=record(input),name=text(row.naam);
  if(!name||/afgeschermd|onbekend|niet zichtbaar|anoniem/i.test(name)){result.hiddenPlayers++;continue;}
  const end=text(row.einddatum);
  const endMatch=end.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const endDate=endMatch?new Date(`${endMatch[3]}-${endMatch[2]}-${endMatch[1]}T23:59:59+02:00`):/^\d{4}-\d{2}-\d{2}/.test(end)?new Date(end):null;
  if(endDate&&!Number.isNaN(endDate.getTime())&&endDate.getTime()<now.getTime())continue;
  const role=text(row.rol),fn=text(row.functie),photo=text(row.foto);
  // Public display fields create a stable image key without exposing member relation codes.
  let hash=2166136261;for(const char of `${name}|${role}|${fn}`){hash=Math.imul(hash^char.charCodeAt(0),16777619);}
  const id=(hash>>>0).toString(16).padStart(8,'0');
  const mime=photo.startsWith('/9j/')?'image/jpeg':photo.startsWith('iVBOR')?'image/png':photo.startsWith('UklGR')?'image/webp':null;
  const safePhoto=!!mime&&photo.length<1_800_000&&/^[A-Za-z0-9+/=\r\n]+$/.test(photo);
  if(safePhoto)result.photos.push({id,data:photo,mime:mime!});
  result.players.push({id,name,role,function:fn,kind:/speler/i.test(role)?'player':'staff',photoUrl:safePhoto?`/api/sportlink/team/photo?team=${encodeURIComponent(teamId)}&person=${id}`:null});
 }
 return result;
}
import {sportlinkAssignmentFields} from './sportlink-assignments';

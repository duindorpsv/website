import {sqlClient} from '../../db';
import type {SportlinkMatch} from '../sportlink-types';
import {supportsPublicMatchResults} from '../match-dossier';
import {publicCoachName} from '../sportlink-match-coaches';
export type StoredMatch={payload_json:string;updated_at:string};
function publicMatch(match:SportlinkMatch):SportlinkMatch{
 const safe={...match,homeDressingRoom:match.homeDressingRoom??match.changingRooms?.home??'',awayDressingRoom:match.awayDressingRoom??match.changingRooms?.away??'',referee:publicCoachName(match.referee)||''};
 return supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away)?safe:{...safe,homeScore:null,awayScore:null,scoreLabel:null};
}
export async function readStoredMatch(id:string,transaction?:any):Promise<(SportlinkMatch & {sourceUpdatedAt:string})|null>{
 const sql=transaction||sqlClient(),[row]=await sql`select payload_json,updated_at from sportlink_matches where id=${id}`;
 if(!row)return null;return {...publicMatch(JSON.parse(row.payload_json)),sourceUpdatedAt:row.updated_at};
}
/** All source writers share the same conditional whole-payload upsert. */
export async function writeStoredMatches(matches:SportlinkMatch[],observedAt:string,transaction?:any,protectOwn=false){
 const ordered=[...new Map(matches.map(match=>[match.id,match])).values()].sort((a,b)=>a.id.localeCompare(b.id));
 const perform=async(sql:any)=>{for(let start=0;start<ordered.length;start+=100){
  const rows=ordered.slice(start,start+100).map(match=>{const stamp=match.sourceUpdatedAt||observedAt;if(!Number.isFinite(Date.parse(stamp)))throw Error('Invalid source version');return {id:match.id,kickoff:match.kickoff,home_team_code:match.home.id,away_team_code:match.away.id,home_club_code:match.home.clubCode,away_club_code:match.away.clubCode,status:match.status,payload_json:JSON.stringify({...match,sourceUpdatedAt:stamp}),updated_at:stamp};});
  await sql`insert into sportlink_matches ${sql(rows,'id','kickoff','home_team_code','away_team_code','home_club_code','away_club_code','status','payload_json','updated_at')} on conflict(id) do update set kickoff=excluded.kickoff,home_team_code=excluded.home_team_code,away_team_code=excluded.away_team_code,home_club_code=excluded.home_club_code,away_club_code=excluded.away_club_code,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at where excluded.updated_at>sportlink_matches.updated_at and (not ${protectOwn} or not coalesce((excluded.payload_json::jsonb->'home'->>'own')::boolean,false) and not coalesce((excluded.payload_json::jsonb->'away'->>'own')::boolean,false))`;
 }};
 return transaction?perform(transaction):sqlClient().begin(perform);
}
export async function canonicalMatches(matches:SportlinkMatch[],transaction?:any):Promise<SportlinkMatch[]>{
 if(!matches.length)return [];
 const sql=transaction||sqlClient(),rows=await sql`select id,payload_json,updated_at from sportlink_matches where id in ${sql([...new Set(matches.map(m=>m.id))])}`;
 const saved=new Map<string,SportlinkMatch>(rows.map((row:any)=>[row.id,{...JSON.parse(row.payload_json),sourceUpdatedAt:row.updated_at}]));
 return matches.flatMap(match=>saved.has(match.id)?[publicMatch(saved.get(match.id)!)]:[]);
}

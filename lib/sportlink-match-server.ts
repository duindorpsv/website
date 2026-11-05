import {sqlClient} from '../db';
import {getSportlinkSnapshot} from './sportlink-server';
import {getSportlinkTeamDetail} from './sportlink-team-server';
import {validTeamId,validSeason} from './sportlink-team-normalize';
import {readStoredMatch,writeStoredMatches} from './server/match-store';
import {withSportlinkReadAge} from './server/sportlink-read-context';
import {cachedSportlinkArticle} from './server/sportlink-client';
import {matchWithDetail} from './server/sportlink-planning';
import {savedFirstTeam,publishedMatchPreview} from './server/match-previews';
import {isFirstTeamMatch} from './cms/match-preview';
import {getSportlinkHistoricalSource} from './sportlink-history-server';
import {getSportlinkMatchHeadCoaches} from './sportlink-match-coaches-server';
import {historicalFromMatches,mergeHistoricalResults,normalizeHistoricalResults} from './sportlink-history';
import {buildMatchDossier,matchSeason,supportsPublicMatchResults} from './match-dossier';
import type {SportlinkMatch,SportlinkSnapshot,SportlinkTeam} from './sportlink-types';
import type {SportlinkTeamDetail} from './sportlink-team-types';
export class MatchDataError extends Error{constructor(message:string,public status:number){super(message);}}
const normalize=(value:string)=>value.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ').trim();
const belongs=(team:SportlinkTeam,match:SportlinkMatch)=>[match.home,match.away].some(side=>side.id===team.id||side.id===team.teamCode||side.own&&!!side.clubCode&&side.id===`${side.clubCode}:${normalize(team.name)}`&&normalize(side.name)===normalize(team.name));
const all=(snapshot:SportlinkSnapshot)=>[...snapshot.results,...snapshot.fixtures,...snapshot.previousRound.matches,...snapshot.nextRound.matches];
export async function getSportlinkMatch(id:string,options:{team?:string|null;pool?:string|null;season?:string|null}={}){
 if(!/^[a-zA-Z0-9:_-]{1,100}$/.test(id)||options.team&&!validTeamId(options.team)||options.pool&&!/^\d{1,12}$/.test(options.pool)||options.season&&!validSeason(options.season))throw new MatchDataError('Ongeldige wedstrijdselectie.',400);
 return withSportlinkReadAge(60000,async()=>{
  let snapshot:SportlinkSnapshot|null=null,detail:SportlinkTeamDetail|null=null,failed=false,incomplete=false;
  try{snapshot=await getSportlinkSnapshot({maxAgeMs:60000});}catch{failed=true;}
  let match=await readStoredMatch(id);
  if(!match)throw new MatchDataError(failed?'De wedstrijdgegevens zijn tijdelijk niet beschikbaar.':'Deze wedstrijd is niet gevonden.',failed?503:404);
  if(options.pool&&match.competitionId&&options.pool!==match.competitionId||options.season&&options.season!==matchSeason(match.kickoff))throw new MatchDataError('Deze wedstrijd hoort niet bij de gedeelde poule of het gedeelde seizoen.',404);
  const identity=await savedFirstTeam(),team=snapshot?.teams.find(team=>team.id===options.team)||(!options.team?snapshot?.teams.find(team=>belongs(team,match!)):null)||(!options.team?identity.firstTeam:null);
  if(options.team&&(!team||!belongs(team,match)&&!team.competitions.some(pool=>pool.id===match!.competitionId)))throw new MatchDataError('Dit team hoort niet bij deze wedstrijdselectie.',404);
  const teamId=team?.id||null,pool=match.competitionId||options.pool||null,season=matchSeason(match.kickoff);
  if(teamId)try{detail=await getSportlinkTeamDetail(teamId,season,pool,{maxAgeMs:60000});}catch{failed=true;}
  if(detail?.matchSource?.[id]==='pool'&&(match.home.own||match.away.own))incomplete=true;
  // Detail and ordinary programme refreshes use the same fenced planning transaction.
  if(/^\d{1,12}$/.test(id))try{
   const source=await cachedSportlinkArticle('wedstrijd-informatie',{wedstrijdcode:id});
   if(!source.stale){const current=await readStoredMatch(id);if(current){const updated=matchWithDetail(current,source.value);await writeStoredMatches([{...updated,sourceUpdatedAt:new Date(source.updatedAt).toISOString()}],new Date(source.updatedAt).toISOString());}}
   else incomplete=true;
  }catch{incomplete=true;}
  match=(await readStoredMatch(id))!;
  const firstTeamMatch=supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away)&&isFirstTeamMatch(match,identity.firstTeam)&&(!identity.clubCode||[match.home,match.away].some(side=>side.own&&side.clubCode===identity.clubCode));
  const sourceIdentity=JSON.stringify([match.home,match.away]);
  const [source,coaches]=await Promise.all([
   firstTeamMatch?getSportlinkHistoricalSource(match):Promise.resolve({rows:[] as unknown[],stale:false,warning:null}),
   getSportlinkMatchHeadCoaches(match),
  ]);
  // No response is constructed from an upstream in-memory candidate; the final committed row wins.
  match=(await readStoredMatch(id))!;
  const ids=[match.home.id,match.away.id,...[match.home,match.away].map(side=>`${side.clubCode}:${normalize(side.name)}`)],sql=sqlClient();
  const archive=await sql`select payload_json,updated_at from sportlink_matches where kickoff<=${new Date().toISOString()} and (home_team_code in ${sql(ids)} or away_team_code in ${sql(ids)}) order by kickoff desc,id limit 500`;
  const comparisonMatches:SportlinkMatch[]=archive.map(row=>({...JSON.parse(row.payload_json),sourceUpdatedAt:row.updated_at}));
  const sameIdentity=sourceIdentity===JSON.stringify([match.home,match.away]);
  const dossier=buildMatchDossier(match,comparisonMatches);
  const headToHead=firstTeamMatch&&sameIdentity?mergeHistoricalResults(historicalFromMatches(dossier.encounters),normalizeHistoricalResults(source.rows,match),match):[];
  const disappeared=!!snapshot&&!snapshot.stale&&!!detail&&!detail.stale&&!all(snapshot).some(game=>game.id===id)&&![...detail.fixtures,...detail.results,...detail.comparisonMatches||[]].some(game=>game.id===id);
  const stale=failed||incomplete||!!snapshot?.stale||!!detail?.stale||disappeared;
  const resultsAllowed=supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away);
  const preview=firstTeamMatch&&sameIdentity?await publishedMatchPreview(match,identity.firstTeam):null;
  return {match:resultsAllowed?match:{...match,homeScore:null,awayScore:null,scoreLabel:null},updatedAt:match.sourceUpdatedAt,stale,warning:disappeared?'Deze wedstrijd staat niet meer in het actuele programma. Je ziet de laatst opgeslagen gegevens.':stale?'Het bijwerken is vertraagd. Je ziet de laatst opgeslagen wedstrijdgegevens.':null,comparisonMatches:resultsAllowed?comparisonMatches:[],standings:[],contextTeamId:teamId,contextPoolId:match.competitionId||pool,contextSeasonId:matchSeason(match.kickoff)||season,firstTeamMatch:firstTeamMatch&&sameIdentity,preview,headToHead:resultsAllowed?headToHead:[],headToHeadStale:source.stale,headToHeadWarning:source.warning,...(sameIdentity?coaches:{homeHeadCoach:null,awayHeadCoach:null,headCoachesStale:true})};
 });
}

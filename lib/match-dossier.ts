import type {FormResult,SportlinkMatch,SportlinkSide,SportlinkStanding} from './sportlink-types';

export type MatchDossierSide={
 team:SportlinkSide;matches:SportlinkMatch[];form:FormResult[];
 played:number;won:number;drawn:number;lost:number;goalsFor:number;goalsAgainst:number;
 standing:SportlinkStanding|null;
};
export type MatchDossier={home:MatchDossierSide;away:MatchDossierSide;encounters:SportlinkMatch[]};

const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim();
const numericId=(value:string)=>/^[1-9]\d*$/.test(value)?value:null;
const completed=(value:string)=>['uitgespeeld','gespeeld','eindstand','beeindigd','afgelopen','finished','completed','na verlenging','na strafschoppen'].includes(normalized(value));
const validScore=(value:number|null):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** Younger age groups do not publish scores; source placeholder zeros are not draws. */
export function supportsPublicMatchResults(team:Pick<SportlinkSide,'name'>):boolean{
 const age=normalized(team.name).match(/\b(?:jo|mo|o|u|onder)\s*0?(\d{1,2})(?=$|[\s-])/);
 return !age||Number(age[1])<1||Number(age[1])>10;
}

export function dossierHistoryAvailable(dossier:MatchDossier):boolean{
 return !!(dossier.home.matches.length||dossier.away.matches.length||dossier.encounters.length);
}

/** Never use own-club highlighting as team identity: every Duindorp team shares it. */
export function sameDossierTeam(a:SportlinkSide,b:SportlinkSide):boolean{
 if(!normalized(a.name)||normalized(a.name)!==normalized(b.name))return false;
 if(a.clubCode&&b.clubCode&&a.clubCode!==b.clubCode)return false;
 const left=numericId(a.id),right=numericId(b.id);
 if(left&&right)return left===right;
 // A missing numeric ID may fall back to the exact full team name in the same club.
 return !!a.clubCode&&!!b.clubCode&&a.clubCode===b.clubCode;
}

export function matchSeason(value:string):string|null{
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'numeric'}).formatToParts(date);
 const year=Number(parts.find(part=>part.type==='year')?.value),month=Number(parts.find(part=>part.type==='month')?.value);
 const start=month>=7?year:year-1;
 return `${start}/${start+1}`;
}

function competitionMatches(match:SportlinkMatch,candidate:SportlinkMatch){
 if(match.competitionId)return candidate.competitionId===match.competitionId;
 return !!match.competitionLabel&&!candidate.competitionId&&normalized(candidate.competitionLabel)===normalized(match.competitionLabel);
}

/**
 * The last payload for an ID is authoritative, including a correction/cancellation.
 * Filter only after deduplication so an obsolete scored row cannot reappear.
 * Standings supplied by the caller must belong to this match's competition/pool.
 */
export function buildMatchDossier(match:SportlinkMatch,results:SportlinkMatch[],standings:SportlinkStanding[]=[],now:Date|number=new Date()):MatchDossier{
 const target=Date.parse(match.kickoff),instant=typeof now==='number'?now:now.getTime(),season=matchSeason(match.kickoff);
 const latest=new Map<string,SportlinkMatch>();
 for(const result of results)if(result.id)latest.set(result.id,result);
 const completedAvailable=Number.isFinite(target)&&Number.isFinite(instant)?[...latest.values()].filter(result=>{
  const played=Date.parse(result.kickoff);
  return Number.isFinite(played)&&played<=instant&&supportsPublicMatchResults(result.home)&&supportsPublicMatchResults(result.away)&&
   completed(result.status)&&validScore(result.homeScore)&&validScore(result.awayScore);
 }).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)||a.id.localeCompare(b.id)):[];
 // Form is the latest known form in this pool/season, even for an older selected match.
 // Direct encounters remain the stored archive before this match's kickoff.
 const available=completedAvailable.filter(result=>matchSeason(result.kickoff)===season&&competitionMatches(match,result));
 const side=(team:SportlinkSide):MatchDossierSide=>{
  const matches=supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away)&&supportsPublicMatchResults(team)?available.filter(result=>sameDossierTeam(team,result.home)||sameDossierTeam(team,result.away)).slice(0,5):[];
  let goalsFor=0,goalsAgainst=0;
  const form=matches.map(result=>{
   const home=sameDossierTeam(team,result.home),ours=(home?result.homeScore:result.awayScore)!,theirs=(home?result.awayScore:result.homeScore)!;
   goalsFor+=ours;goalsAgainst+=theirs;
   return ours>theirs?'W':ours<theirs?'V':'GL';
  });
  return {team,matches,form,played:matches.length,won:form.filter(value=>value==='W').length,drawn:form.filter(value=>value==='GL').length,lost:form.filter(value=>value==='V').length,goalsFor,goalsAgainst,standing:supportsPublicMatchResults(team)?standings.find(row=>sameDossierTeam(team,row.team))||null:null};
 };
 const encounters=supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away)?completedAvailable.filter(result=>result.id!==match.id&&Date.parse(result.kickoff)<target&&((sameDossierTeam(match.home,result.home)&&sameDossierTeam(match.away,result.away))||(sameDossierTeam(match.home,result.away)&&sameDossierTeam(match.away,result.home)))).slice(0,5):[];
 return {home:side(match.home),away:side(match.away),encounters};
}

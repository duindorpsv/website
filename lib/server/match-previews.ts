import {sqlClient} from '../../db';
import {isFirstTeamMatch,matchPreviewDraftSchema,validateMatchPreview} from '../cms/match-preview';
import type {SportlinkMatch,SportlinkTeam} from '../sportlink-types';
import type {MatchPreviewContent} from '../cms/types';
import {readSportlinkSettings} from './sportlink-config';
import {has,type Principal} from './permissions';
import {readStoredMatch} from './match-store';
import {CmsError} from './errors';

/** Identity is read from the saved authorized club catalog, never from a browser role or club-name guess. */
export async function savedFirstTeam(transaction?:any):Promise<{firstTeam:SportlinkTeam|null;clubCode:string;cmsTeamId:string}>{
 const sql=transaction||sqlClient(),[row]=await sql`select payload_json from sportlink_cache where cache_key='club-competition-v1'`;
 const snapshot=row?.payload_json?JSON.parse(row.payload_json):null,config=await readSportlinkSettings(sql);
 const firstTeam:SportlinkTeam|null=snapshot?.teams?.find((team:SportlinkTeam)=>team.id===snapshot.firstTeam?.id)||null;
 return {firstTeam,clubCode:config.settings.clubCode||snapshot?.clubCode||'',cmsTeamId:config.settings.teamMappings.find(mapping=>mapping.teamId===firstTeam?.id)?.cmsTeamId||''};
}
export async function validateMatchPreviewWrite(sql:any,candidate:Record<string,any>,old:Record<string,any>|undefined,action:string){
 if(['unpublish','trash','cancelSchedule'].includes(action))return;
 const {firstTeam,clubCode,cmsTeamId}=await savedFirstTeam(sql),match=await readStoredMatch(candidate.matchId,sql);
 if(!firstTeam||!match||!isFirstTeamMatch(match,firstTeam)||clubCode&&![match.home,match.away].some(side=>side.own&&side.clubCode===clubCode))throw new CmsError('match-preview-team','Kies een opgeslagen wedstrijd van het bevestigde eerste elftal.',422);
 if(candidate.firstTeamId!==firstTeam.id||candidate.teamId!==cmsTeamId||candidate.id!==`match-preview-${match.id}`)throw new CmsError('match-preview-identity','De wedstrijd- of teamkoppeling klopt niet. Laad de selectie opnieuw.',422);
 if(old&&['matchId','firstTeamId','teamId'].some(key=>old[key]!==candidate[key]))throw new CmsError('match-preview-identity','Een bestaande vooruitblik kan niet aan een andere wedstrijd of ander team worden gekoppeld.',422);
 candidate.title=`${match.home.name} – ${match.away.name}`;
}
export async function matchPreviewChoices(actor:Principal){
 const sql=sqlClient(),context=await savedFirstTeam();
 if(!has(actor,'news','read',{teamId:context.cmsTeamId}))throw new CmsError('forbidden','Je hebt geen redactierechten voor het eerste elftal.',403);
 if(!context.firstTeam)return {...context,items:[]};
 const first=context.firstTeam,ids=[first.id,first.teamCode,`${context.clubCode}:${first.name.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ').trim()}`];
 const rows=await sql`select payload_json from sportlink_matches where home_team_code in ${sql(ids)} or away_team_code in ${sql(ids)} order by kickoff desc,id`;
 const items:SportlinkMatch[]=rows.map(row=>JSON.parse(row.payload_json)).filter(match=>isFirstTeamMatch(match,context.firstTeam)&&(!context.clubCode||[match.home,match.away].some(side=>side.own&&side.clubCode===context.clubCode)));
 return {...context,items:items.sort((a,b)=>b.kickoff.localeCompare(a.kickoff))};
}
/** Only immutable live snapshots are public. Due publications are settled by the existing durable worker. */
export async function publishedMatchPreview(match:SportlinkMatch,firstTeam:SportlinkTeam|null):Promise<MatchPreviewContent|null>{
 if(!isFirstTeamMatch(match,firstTeam))return null;
 const [row]=await sqlClient()`select live from cms_records where id=${`match-preview-${match.id}`} and module='matchPreviews' and deleted_at is null`;
 const live=row?.live;if(!live||live.matchId!==match.id||live.firstTeamId!==firstTeam?.id||!matchPreviewDraftSchema.safeParse(Object.fromEntries(Object.entries(live).filter(([key])=>key!=='published'))).success||validateMatchPreview(live).length)return null;
 const {enabled,speaker,role,intro,whatAtStake,preparation,supporterFocus}=live;return {enabled,speaker,role,intro,whatAtStake,preparation,supporterFocus};
}

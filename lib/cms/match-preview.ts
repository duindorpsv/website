import type {SportlinkMatch,SportlinkSide,SportlinkTeam} from '../sportlink-types';
import type {CmsMatchPreview,MatchPreviewContent} from './types';
import {z} from 'zod';
import {planningInstant} from './planning';

export const matchPreviewContentSchema=z.object({enabled:z.boolean(),speaker:z.string().trim().max(120),role:z.string().trim().max(120),intro:z.string().trim().max(1200),whatAtStake:z.string().trim().max(3000),preparation:z.string().trim().max(3000),supporterFocus:z.string().trim().max(3000)});
export const matchPreviewDraftSchema=matchPreviewContentSchema.extend({id:z.string().min(1).max(150),matchId:z.string().regex(/^\d{1,12}$/),teamId:z.string().max(150),firstTeamId:z.string().min(1).max(100),title:z.string().max(500)}).strict();
export const matchPreviewStateSchema=matchPreviewDraftSchema.extend({status:z.enum(['draft','review','scheduled','published','archived']),publishAt:z.string(),scheduledAt:z.string().optional(),updatedAt:z.string(),version:z.number().optional(),deletedAt:z.string().optional(),live:matchPreviewDraftSchema.extend({published:z.boolean().optional()}).optional(),scheduled:matchPreviewContentSchema.optional(),revisions:z.array(z.unknown()).optional()});

const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim();

/** A matching club alone is insufficient: only the confirmed first-team identity is eligible. */
export function isFirstTeamMatch(match:SportlinkMatch,firstTeam:SportlinkTeam|null|undefined):boolean{
 if(!firstTeam)return false;
 const same=(side:SportlinkSide)=>{
  if(!side.own)return false;
  if(side.id===firstTeam.id)return true;
  if(/^\d+$/.test(side.id)&&/^\d+$/.test(firstTeam.teamCode)&&Number(firstTeam.teamCode)>0)return side.id===firstTeam.teamCode;
  return !!side.clubCode&&side.id===`${side.clubCode}:${normalized(side.name)}`&&normalized(side.name)===normalized(firstTeam.name);
 };
 return same(match.home)||same(match.away);
}

export function emptyMatchPreviewContent():MatchPreviewContent{return {enabled:false,speaker:'',role:'',intro:'',whatAtStake:'',preparation:'',supporterFocus:''};}

export function matchPreviewContent(value:MatchPreviewContent):MatchPreviewContent{
 return {enabled:value.enabled,speaker:value.speaker.trim(),role:value.role.trim(),intro:value.intro.trim(),whatAtStake:value.whatAtStake.trim(),preparation:value.preparation.trim(),supporterFocus:value.supporterFocus.trim()};
}

export function validateMatchPreview(value:MatchPreviewContent):string[]{
 const content=matchPreviewContent(value),errors:string[]=[];
 if(!content.enabled)errors.push('Schakel ‘Stem uit de kleedkamer’ in om dit onderdeel te publiceren.');
 if(!content.speaker)errors.push('Vul de naam van de spreker in.');
 if(!content.role)errors.push('Vul de rol van de spreker in.');
 if(![content.intro,content.whatAtStake,content.preparation,content.supporterFocus].some(Boolean))errors.push('Schrijf een inleiding of beantwoord ten minste één vraag.');
 return errors;
}

/** Settle an elapsed schedule before a new edit so saving a draft cannot resurrect an older quote. */
export function settleMatchPreviewPublication(entry:CmsMatchPreview,now=new Date()):void{
 if(entry.status!=='scheduled'||!entry.scheduled||!Number.isFinite(Date.parse(entry.publishAt))||Date.parse(entry.publishAt)>now.getTime()||validateMatchPreview(entry.scheduled).length)return;
 entry.live=matchPreviewContent(entry.scheduled);entry.status='published';entry.publishAt='';delete entry.scheduled;
}

/** Public reading uses a publication snapshot; edits to the draft never leak into a live quote. */
export function getPublishedMatchPreview(previews:CmsMatchPreview[]|undefined,match:SportlinkMatch,firstTeam:SportlinkTeam|null|undefined,now=new Date()):MatchPreviewContent|null{
 if(!firstTeam||!isFirstTeamMatch(match,firstTeam))return null;
 const entry=previews?.find(item=>item.matchId===match.id&&(item.firstTeamId||item.teamId)===firstTeam.id);
 if(!entry)return null;
 const due=entry.status==='scheduled'&&entry.scheduled&&Number.isFinite(Date.parse(entry.publishAt))&&Date.parse(entry.publishAt)<=now.getTime();
 const published=due?entry.scheduled:entry.live;
 return published&&!validateMatchPreview(published).length?matchPreviewContent(published):null;
}

/** Amsterdam input is independent of the device timezone. Nonexistent DST times are rejected. */
export function previewLocalDate(value:string):string{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const part=(type:string)=>parts.find(item=>item.type===type)?.value||'';
 return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function previewUtcDate(value:string):string{
 try{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return '';return new Date(planningInstant(value)).toISOString();}catch{return '';}
}

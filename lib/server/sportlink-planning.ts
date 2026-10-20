import {createHash} from 'node:crypto';
import {Temporal} from '@js-temporal/polyfill';
import {sqlClient} from '../../db';
import type {SportlinkMatch} from '../sportlink-types';
import type {SportlinkSettings} from '../cms/sportlink-settings';
import {locationsOverlap} from '../cms/planning';
import {record,text} from '../sportlink-team-normalize';
import {cachedSportlinkArticle} from './sportlink-client';
import {mutate} from './records';
import {CmsError} from './errors';
import {authorize,type Principal} from './permissions';
const key=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl').trim();
type Unresolved={matchId:string;title:string;reason:string;fieldName?:string};
function sourceDuration(value:unknown):number|null{
 const raw=text(value);if(/^\d{1,3}$/.test(raw)){const duration=Number(raw);return duration>0&&duration<=600?duration:null;}
 const time=raw.match(/^(\d{1,2}):(\d{2})(?::00)?$/);if(!time)return null;const duration=Number(time[1])*60+Number(time[2]);return duration>0&&duration<=600&&Number(time[2])<60?duration:null;
}
export async function syncSportlinkMatches(actor:Principal,matches:SportlinkMatch[],settings:SportlinkSettings,requestId:string){
 authorize(actor,'settings','manage');const sql=sqlClient(),counts={imported:0,updated:0,unchanged:0,unresolved:0},unresolved:Unresolved[]=[];
 const locations=(await sql`select id,draft,deleted_at from cms_records where module='locations'`).filter(row=>!row.deleted_at&&row.draft.active).map(row=>({...row.draft,id:row.id}));
 const selected=matches.filter(match=>!settings.teamIds.length||[match.home.id,match.away.id].some(code=>settings.teamIds.some(id=>id.split(':')[0]===code)));
 for(const match of selected){
  if(!/^\d+$/.test(match.id))continue;const clubId=match.home.own?match.home.clubCode:match.away.clubCode;if(!clubId)continue;
  const sourceId=clubId+':'+match.id,id='sportlink-match-'+sourceId;
  const [old]=await sql`select id,version,draft,live,deleted_at from cms_records where module='activities' and (id=${id} or draft->>'sourceId'=${sourceId}) limit 1`;
  if(old?.deleted_at){counts.unchanged++;continue;}
  const title=match.home.name+' – '+match.away.name;
  let duration:number|null=null,fieldName=match.field||'',rooms=match.changingRooms||{home:'',away:'',official:''};
  try{const result=await cachedSportlinkArticle('wedstrijd-informatie',{wedstrijdcode:match.id},{settings,dataset:'assignments',force:true});
   if(!result.stale){const detail=record(result.value),info=record(detail.wedstrijdinformatie),changing=record(detail.kleedkamers);duration=sourceDuration(info.duur);fieldName=text(info.veldnaam)||fieldName;
    rooms={home:text(changing.thuis)||rooms.home,away:text(changing.uit)||rooms.away,official:text(changing.official)||rooms.official};}
  }catch{/* Keep verified programme data; never manufacture a duration. */}
  if(!duration&&old?.draft){const a=Temporal.PlainTime.from(old.draft.startTime),b=Temporal.PlainTime.from(old.draft.endTime);duration=b.since(a).total('minutes');}
  if(!duration){unresolved.push({matchId:match.id,title,reason:'Sportlink leverde geen bevestigde wedstrijdduur. Er is geen reservering aangemaakt.',fieldName});continue;}
  const start=Temporal.Instant.from(match.kickoff).toZonedDateTimeISO('Europe/Amsterdam'),end=start.add({minutes:duration});
  if(start.toPlainDate().toString()!==end.toPlainDate().toString()){unresolved.push({matchId:match.id,title,reason:'Deze wedstrijd loopt over middernacht en moet als twee momenten worden beoordeeld.',fieldName});continue;}
  const desired:string[]=[];const mapping=(type:'field'|'changing',value:string)=>{
   if(!value)return;const explicit=settings.locationMappings.find(row=>row.sourceType===type&&key(row.sourceValue)===key(value));
   const candidates=locations.filter(location=>location.type===type&&(explicit?location.id===explicit.locationId:type==='field'&&key(location.sportlinkFieldName||'')===key(value)));
   if(candidates.length===1)desired.push(candidates[0].id);else unresolved.push({matchId:match.id,title,fieldName,reason:`Sportlink ${type==='field'?'veld':'kleedkamer'} “${value}” heeft geen unieke actieve koppeling.`});
  };
  mapping('field',fieldName);for(const room of new Set(Object.values(rooms)))mapping('changing',room);
  const previousSource=new Set<string>(old?.draft.sourceData?.locationIds||[]);
  const extras=(old?.draft.locationIds||[]).filter((locationId:string)=>!previousSource.has(locationId)&&locations.some(location=>location.id===locationId&&location.type!=='field'));
  let locationIds=[...new Set([...desired,...extras])],sourceLocations=[...new Set(desired)];
  const mappedTeams=settings.teamMappings.filter(mapping=>[match.home.id,match.away.id].includes(mapping.teamId.split(':')[0])).map(mapping=>mapping.cmsTeamId);
  const previousTeams=new Set<string>(old?.draft.sourceData?.teamIds||[]),teamIds=[...new Set<string>([...(old?.draft.teamIds||[]).filter((teamId:string)=>!previousTeams.has(teamId)),...mappedTeams])];
  const revision=createHash('sha256').update(JSON.stringify([title,match.kickoff,match.status,fieldName,rooms,duration,sourceLocations,mappedTeams])).digest('hex');
  if(old?.draft.sourceData?.revision===revision&&JSON.stringify(old.draft.locationIds)===JSON.stringify(locationIds)){counts.unchanged++;continue;}
  const cancelled=/afgelast|vervallen|geannuleerd|cancelled/i.test(match.status);
  const maxAttempts=locationIds.length+1;
  for(let attempt=0;attempt<=maxAttempts;attempt++){
   const activityId=old?.id||id,candidate={...(old?.draft||{}),id:activityId,title,type:'match',date:start.toPlainDate().toString(),startTime:start.toPlainTime().toString({smallestUnit:'minute'}),endTime:end.toPlainTime().toString({smallestUnit:'minute'}),locationIds,personIds:old?.draft.personIds||[],committeeIds:old?.draft.committeeIds||[],teamIds,public:old?.draft.public||false,description:old?.draft.description||'',status:cancelled?'cancelled':'planned',source:'sportlink',sourceId,sourceData:{provider:'sportlink',clubId,matchId:match.id,fieldName,locationIds:sourceLocations,teamIds:mappedTeams,revision,lastSyncedAt:new Date().toISOString()}};
   try{await mutate(actor,[{module:'activities',id:activityId,expectedVersion:old?.version||0,action:'save',data:candidate}],crypto.randomUUID(),requestId,undefined,{sportlink:true});old?counts.updated++:counts.imported++;break;}
   catch(error){if(error instanceof CmsError&&error.code==='reservation-conflict'){
     const conflict=(error.details as any)?.locationId;const removed=locationIds.filter(locationId=>locationsOverlap(locations as any,locationId,conflict));if(!removed.length)throw error;
     locationIds=locationIds.filter(locationId=>!removed.includes(locationId));sourceLocations=sourceLocations.filter(locationId=>!removed.includes(locationId));unresolved.push({matchId:match.id,title,fieldName,reason:'Een bronlocatie of extra ruimte is bezet. Alleen de conflicterende toewijzing is opengelaten.'});continue;
    }throw error;}
  }
 }
 counts.unresolved=unresolved.length;
 await sql`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values ('sportlink-planning-review-v1',${JSON.stringify({items:unresolved})},${Date.now()},0,0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at`;
 return counts;
}

import {equalContent} from '../cms/compare';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {Temporal} from '@js-temporal/polyfill';
import {sqlClient} from '../../db';
import type {SportlinkMatch,SportlinkTeam} from '../sportlink-types';
import type {SportlinkSettings} from '../cms/sportlink-settings';
import type {CmsActivity} from '../cms/types';
import {locationsOverlap,planningInstant} from '../cms/planning';
import {record,text} from '../sportlink-team-normalize';
import {normalizeSportlink} from '../sportlink-normalize';
import {fetchSportlinkArticle,SportlinkSourceError} from './sportlink-client';
import {verifiedSportlinkCatalog,accommodationEvidence} from './sportlink-identity';
import {readSportlinkSettings} from './sportlink-config';
import {bumpPlanningRevision} from './planning-revision';
import {syncPlanningIndexes,validatePlanningWrite} from './planning';
import {mutate} from './records';
import {CmsError} from './errors';
import {authorize,actorPrincipal,type Principal} from './permissions';
const key=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('nl').replace(/\s+/g,' ');
export type PlanningReview={matchId:string;title:string;reason:string;fieldName?:string;accommodation?:string;sourceFingerprint?:string};
type Prepared={match:SportlinkMatch;detail:unknown;duration:number|null;evidence:ReturnType<typeof accommodationEvidence>};
export function sourceDuration(value:unknown):number|null{
 const raw=text(value);if(/^\d{1,3}$/.test(raw)){const duration=Number(raw);return duration>0&&duration<=600?duration:null;}
 const time=raw.match(/^(\d{1,2}):(\d{2})(?::00)?$/);if(!time)return null;const duration=Number(time[1])*60+Number(time[2]);return duration>0&&duration<=600&&Number(time[2])<60?duration:null;
}
export function verifiedMatchSide(match:SportlinkMatch,teams:SportlinkTeam[],clubCode:string){
 const own=(side:SportlinkMatch['home'])=>!!side.id&&side.clubCode===clubCode&&teams.filter(team=>team.teamCode===side.id).length===1;
 const home=own(match.home),away=own(match.away);return home!==away?(home?'home':'away'):null;
}
export function matchWithDetail(match:SportlinkMatch,detail:unknown):SportlinkMatch{
 const info=record(record(detail).wedstrijdinformatie);
 for(const side of ['home','away'] as const){const supplied=text(info[side==='home'?'thuisteamid':'uitteamid']);if(supplied&&supplied!==match[side].id)throw new SportlinkSourceError('Wedstrijd- en teamidentiteit in het detail wijken af. Vernieuw eerst het programma.');}
 const value=text(info.wedstrijddatetime)||text(info.wedstrijddatum);let kickoff=match.kickoff;
 if(value&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)))kickoff=new Date(value).toISOString();
 else if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&/^\d{2}:\d{2}(?::00)?$/.test(text(info.aanvangstijd)))try{kickoff=planningInstant(value+'T'+text(info.aanvangstijd));}catch{throw new SportlinkSourceError('Het brontijdstip is ongeldig of dubbel door wintertijd. De vorige planning blijft behouden.');}
 return {...match,kickoff};
}
/** Network preparation precedes a single DB transaction. A failed fetch cannot commit half a roster. */
async function prepare(matches:SportlinkMatch[],settings:SportlinkSettings,details?:Map<string,unknown>){
 const output:Prepared[]=new Array(matches.length);let index=0;const deadline=Date.now()+3*60000;let failed=false;
 const results=await Promise.allSettled(Array.from({length:Math.min(4,matches.length)},async()=>{while(!failed&&index<matches.length){try{const at=index++,match=matches[at];if(Date.now()>deadline)throw new SportlinkSourceError('De bronbatch duurde te lang. De vorige planning blijft behouden.');
  let detail=details?.get(match.id);if(!detail)detail=await fetchSportlinkArticle('wedstrijd-informatie',{wedstrijdcode:match.id},settings);
  output[at]={match:matchWithDetail(match,detail),detail,duration:sourceDuration(record(record(detail).wedstrijdinformatie).duur),evidence:accommodationEvidence(detail)};
 }catch(error){failed=true;throw error;}}}));const rejected=results.find(result=>result.status==='rejected');if(rejected?.status==='rejected')throw rejected.reason;return output;
}
/** Public fetches and scheduled refreshes enter this same processing path before their cache becomes visible. */
export async function processFreshPlanningArticle(name:string,params:Record<string,string>,value:unknown,observedAt:number,settings:SportlinkSettings,write:(tx:any)=>Promise<void>){
 const config=await readSportlinkSettings();
 if(!config.configured||!config.actorId||!settings.clubCode){await sqlClient().begin(write);return;}
 try{
 const actor=await actorPrincipal(config.actorId);authorize(actor,'settings','manage');if(actor.teamScoped)throw new CmsError('forbidden','Clubbrede rechten vereist.',403);
 const catalog=await verifiedSportlinkCatalog(settings);
 let matches:SportlinkMatch[],details:Map<string,unknown>|undefined;
 if(name==='programma'){
  if(!Array.isArray(value))throw new SportlinkSourceError('Ongeldig wedstrijdprogramma.');
  const unique=new Map<string,unknown>();for(const item of value){const id=text(record(item).wedstrijdcode);if(!id||unique.has(id)&&!equalContent(unique.get(id),item))throw new SportlinkSourceError('Het programma bevat ontbrekende of conflicterende wedstrijdidentiteiten. De vorige planning blijft bewaard.');unique.set(id,item);}
  matches=normalizeSportlink({verifiedClubCode:catalog.clubCode,teams:catalog.rows,clubFixtures:[...unique.values()],clubResults:[],leagueFixtures:[],leagueResults:[],standings:[]}).fixtures;
  if(matches.length!==unique.size)throw new SportlinkSourceError('Een wedstrijd heeft ongeldige datum- of teamgegevens. De volledige planning blijft behouden.');
 }else{
  const sql=sqlClient(),[old]=await sql`select payload_json from sportlink_cache where cache_key='sportlink-assignments-v1'`;
  matches=old?.payload_json?(JSON.parse(old.payload_json).matches||[]).filter((m:SportlinkMatch)=>m.id===params.wedstrijdcode):[];
  details=new Map([[params.wedstrijdcode,value]]);
 }
 await syncSportlinkMatches(actor,matches,settings,crypto.randomUUID(),{catalog,observedAt,details,write});
 }catch(error){await sqlClient().begin(async tx=>{await tx`select pg_advisory_xact_lock(736402)`;await bumpPlanningRevision(tx,{status:'failed',message:'De bronupdate is niet verwerkt. De vorige volledige planning blijft behouden. Controleer de clubidentiteit en bronstatus bij Sportlink-instellingen.'});});throw error;}
}
export async function syncSportlinkMatches(actor:Principal,matches:SportlinkMatch[],settings:SportlinkSettings,requestId:string,options:{catalog?:Awaited<ReturnType<typeof verifiedSportlinkCatalog>>;observedAt?:number;details?:Map<string,unknown>;write?:(tx:any)=>Promise<void>}={}){
 authorize(actor,'settings','manage');if(actor.teamScoped)throw new CmsError('forbidden','Clubbrede rechten vereist.',403);
 const sql=sqlClient(),catalog=options.catalog||await verifiedSportlinkCatalog(settings),observedAt=options.observedAt||Date.now();
 const unresolved:PlanningReview[]=[],selected:SportlinkMatch[]=[];
 const counts={imported:0,updated:0,unchanged:0,skipped:0,unresolved:0,received:matches.length};
 for(const match of matches){const side=verifiedMatchSide(match,catalog.teams,catalog.clubCode),title=match.home.name+' – '+match.away.name;
  if(!/^\d+$/.test(match.id)||!side){counts.skipped++;unresolved.push({matchId:match.id,title,reason:'Onbekende of conflicterende club-/teamidentiteit. Geen eigen wedstrijd geïmporteerd.'});continue;}
  const own=catalog.teams.find(team=>team.teamCode===match[side].id)!;
  if(settings.teamIds.length&&!settings.teamIds.includes(own.id)){counts.skipped++;continue;}
  if(!settings.teamMappings.some(mapping=>mapping.teamId===own.id)){counts.skipped++;unresolved.push({matchId:match.id,title,reason:'Mapping nodig: koppel dit geverifieerde eigen team aan een bestaand CMS-team.'});continue;}
  selected.push(match);
 }
 const streamKey='sportlink-planning-stream-v1',lease=Date.now()+4*60000;await sql`insert into sportlink_cache(cache_key) values (${streamKey}) on conflict do nothing`;let claimed=false;for(let attempt=0;attempt<4;attempt++){const rows=await sql`update sportlink_cache set refresh_after=${lease} where cache_key=${streamKey} and refresh_after<=${Date.now()} returning cache_key`;if(rows.length){claimed=true;break;}await delay(250*2**attempt);}
 if(!claimed)throw new SportlinkSourceError('Een andere bronbatch wordt verwerkt. Deze update wordt met begrensde back-off opnieuw opgehaald.');
 await sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(736402)`;await bumpPlanningRevision(tx,{status:'running',message:'Geverifieerde wedstrijdinformatie wordt verwerkt.'});});
 try{
 const prepared=await prepare(selected,settings,options.details);
 return await sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(736402)`;
  // The source lease is fenced before ANY activity change. Rollback includes cache/revision writes.
  const [owned]=await tx`select cache_key from sportlink_cache where cache_key=${streamKey} and refresh_after=${lease} for update`;if(!owned)throw new SportlinkSourceError('De bronverwerkingslease is verlopen; de volledige batch wordt teruggedraaid.');
  if(options.write)await options.write(tx);
  const currentConfig=await readSportlinkSettings(tx,true);if(currentConfig.version&&!equalContent(currentConfig.settings,settings)){
   // Explicit refreshes can temporarily enable paused schedules, but mapping changes must never race a prepared batch.
   for(const field of ['clubCode','ownPark','parkConfirmations','teamIds','teamMappings','locationMappings'] as const)if(!equalContent(currentConfig.settings[field],settings[field]))throw new CmsError('conflict','De bronkoppelingen zijn gewijzigd. De volledige batch wordt opnieuw opgehaald.',409);
  }
  const currentActor=await actorPrincipal(actor.id,tx);authorize(currentActor,'settings','manage');if(currentActor.teamScoped)throw new CmsError('forbidden','Clubbrede rechten vereist.',403);
  const [latestSource]=await tx`select payload_json from sportlink_cache where cache_key='sportlink-assignments-v1' for update`;
  const sourceWater:Record<string,number>=latestSource?.payload_json?JSON.parse(latestSource.payload_json).observedAtByMatch||{}:{};
  const locations=(await tx`select id,draft from cms_records where module='locations' and deleted_at is null`).filter(row=>row.draft.active).map(row=>({...row.draft,id:row.id}));
  const batchRevision=crypto.randomUUID(),stamp=new Date().toISOString();
  const plans:{candidate:CmsActivity;old:any}[]=[];
  for(const entry of prepared){const {match,evidence}=entry,side=verifiedMatchSide(match,catalog.teams,catalog.clubCode)!,title=match.home.name+' – '+match.away.name;
   const sourceId=catalog.clubCode+':'+match.id,id='sportlink-match-'+sourceId;
   const [old]=await tx`select * from cms_records where module='activities' and (id=${id} or draft->>'sourceId'=${sourceId}) limit 1 for update`;
   if(old?.deleted_at||Math.max(old?.draft.sourceData?.observedAt||0,sourceWater[match.id]||0)>=observedAt){counts.unchanged++;continue;}
   const info=record(record(entry.detail).wedstrijdinformatie),changing=record(record(entry.detail).kleedkamers);
   const duration=entry.duration||old?.draft.sourceData?.durationMinutes||null;
   const fieldName=Object.hasOwn(info,'veldnaam')?text(info.veldnaam):match.field||'',rooms={home:Object.hasOwn(changing,'thuis')?text(changing.thuis):match.changingRooms?.home||'',away:Object.hasOwn(changing,'uit')?text(changing.uit):match.changingRooms?.away||'',official:Object.hasOwn(changing,'official')?text(changing.official):match.changingRooms?.official||''};
   const review=(reason:string)=>unresolved.push({matchId:match.id,title,fieldName,reason,accommodation:evidence.label,sourceFingerprint:evidence.fingerprint||undefined});
   if(!duration){counts.skipped++;review('Bron niet beschikbaar: een bevestigde wedstrijdduur ontbreekt. Bestaande tijden en boekingen blijven behouden.');continue;}
   const start=Temporal.Instant.from(match.kickoff).toZonedDateTimeISO('Europe/Amsterdam'),end=start.add({minutes:duration});
   if(start.toPlainDate().toString()!==end.toPlainDate().toString()){counts.skipped++;review('Een wedstrijd over middernacht vereist beoordeling; er is niets verplaatst.');continue;}
   const park=settings.ownPark,confirmation=settings.parkConfirmations.find(row=>row.matchId===match.id);
   const verified=side==='home'&&!!park&&!!evidence.fingerprint&&confirmation?.accommodationId===park.id&&confirmation.sourceFingerprint===evidence.fingerprint;
   const desired:string[]=[];
   if(side==='home'&&!verified)review('Mapping nodig: bevestig de wedstrijdaccommodatie binnen het geverifieerde eigen sportpark. Er is geen automatische eigen boeking.');
   const map=(type:'field'|'changing',value:string)=>{
    if(!value){if(type==='field')review('Bron niet beschikbaar: Sportlink leverde geen veldindeling.');return;}
    const mappings=settings.locationMappings.filter(row=>row.confirmed&&row.clubCode===catalog.clubCode&&row.accommodationId===park?.id&&row.sourceType===type&&key(row.sourceValue)===key(value)&&!row.resourceId);
    const candidates=locations.filter(location=>location.type===type&&mappings.some(row=>row.locationId===location.id));
    if(candidates.length===1)desired.push(candidates[0].id);else review(`Mapping nodig: ${type==='field'?'veld':'kleedkamer'} “${value}” binnen het eigen park is niet uniek bevestigd.`);
   };
   if(verified){map('field',fieldName);for(const value of new Set(Object.values(rooms)))map('changing',value);}
   const previousSource=new Set<string>(old?.draft.sourceData?.locationIds||[]);
   // Legacy source allocations have uncertain ownership. Keep their provenance in the review, never promote them to manual extras.
   if(old?.draft.sourceData&&!old.draft.sourceData.side)review('Controlepunt oude koppeling: de oude automatische locaties zijn opnieuw getoetst. Handmatige nevenreserveringen blijven behouden.');
   const extras=(old?.draft.locationIds||[]).filter((locationId:string)=>!previousSource.has(locationId));
   const own=catalog.teams.find(team=>team.teamCode===match[side].id)!;
   const mappedTeams=settings.teamMappings.filter(row=>row.teamId===own.id).map(row=>row.cmsTeamId),previousTeams=new Set<string>(old?.draft.sourceData?.teamIds||[]);
   const teamIds=[...new Set<string>([...(old?.draft.teamIds||[]).filter((teamId:string)=>!previousTeams.has(teamId)),...mappedTeams])];
   const cancelled=/afgelast|vervallen|geannuleerd|cancelled/i.test(match.status);
   const sourceData={provider:'sportlink' as const,clubId:catalog.clubCode,matchId:match.id,fieldName,locationIds:cancelled?[]:[...new Set(desired)],teamIds:mappedTeams,side,venue:evidence.label||match.venue,accommodationVerified:verified,...(verified?{accommodationId:park!.id}:{}),observedAt,durationMinutes:duration,batchRevision,lastSyncedAt:stamp};
   const candidate:CmsActivity={...(old?.draft||{}),id:old?.id||id,title,type:'match',date:start.toPlainDate().toString(),startTime:start.toPlainTime().toString({smallestUnit:'minute'}),endTime:end.toPlainTime().toString({smallestUnit:'minute'}),locationIds:[...new Set([...sourceData.locationIds,...extras])],personIds:old?.draft.personIds||[],committeeIds:old?.draft.committeeIds||[],teamIds,public:old?.draft.public||false,description:old?.draft.description||'',status:cancelled?'cancelled':'planned',source:'sportlink',sourceId,sourceData};
   plans.push({candidate,old});sourceWater[match.id]=observedAt;
  }
  const ids=plans.map(plan=>plan.candidate.id);if(ids.length)await tx`delete from cms_activity_reservations where activity_id in ${tx(ids)}`;
  // Stage deliberate manual extras first so an automatic assignment cannot steal a later match's room.
  for(const {candidate,old} of plans){const manual={...candidate,locationIds:candidate.locationIds.filter(id=>!candidate.sourceData!.locationIds.includes(id))};if(manual.status==='planned'&&manual.locationIds.length){await validatePlanningWrite(tx,currentActor,'activities',manual.id,manual,old,'save',true);await syncPlanningIndexes(tx,'activities',manual.id,manual,false);}}
  for(const {candidate,old} of plans){
   // Recheck all bookings while holding the same lock as every manual CMS mutation.
   const source=candidate.sourceData!,extras=candidate.locationIds.filter(id=>!source.locationIds.includes(id));
   if(candidate.status==='planned')for(const locationId of [...source.locationIds]){
    const overlaps=await tx`select location_id from cms_activity_reservations where activity_id<>${candidate.id} and starts_at<${planningInstant(candidate.date+'T'+candidate.endTime,candidate.occurrence||'reject')}::timestamptz and ends_at>${planningInstant(candidate.date+'T'+candidate.startTime,candidate.occurrence||'reject')}::timestamptz`;
    if(extras.some(id=>locationsOverlap(locations as any,locationId,id))||overlaps.some(booking=>locationsOverlap(locations as any,locationId,booking.location_id))){source.locationIds=source.locationIds.filter(id=>id!==locationId);unresolved.push({matchId:source.matchId,title:candidate.title,reason:'Overlap: een automatische bronlocatie is bezet en blijft open voor beoordeling.'});}
   }
   // A collision with a deliberate manual extra aborts the WHOLE source batch; it is never silently removed.
   candidate.locationIds=[...new Set([...source.locationIds,...extras])];
   source.revision=createHash('sha256').update(JSON.stringify([candidate.title,candidate.date,candidate.startTime,candidate.endTime,candidate.status,source.side,source.venue,source.accommodationId,source.locationIds,source.teamIds])).digest('hex');
   if(old?.draft.sourceData?.revision===source.revision){counts.unchanged++;await syncPlanningIndexes(tx,'activities',candidate.id,old.draft,false);continue;}
   await mutate(currentActor,[{module:'activities',id:candidate.id,expectedVersion:old?.version||0,action:'save',data:candidate}],crypto.randomUUID(),requestId,tx,{sportlink:true});old?counts.updated++:counts.imported++;
  }
  counts.unresolved=unresolved.length;
  const [previous]=await tx`select payload_json from sportlink_cache where cache_key='sportlink-assignments-v1' for update`;
  const merged=new Map<string,SportlinkMatch>((previous?.payload_json?JSON.parse(previous.payload_json).matches||[]:[]).map((m:SportlinkMatch)=>[m.id,m]));
  for(const {match} of prepared)if(observedAt>=(sourceWater[match.id]||0))merged.set(match.id,match);
  // Missing matches outside the fetched source window are retained, never treated as cancellations.
  const payload={matches:[...merged.values()],revision:batchRevision,observedAtByMatch:sourceWater};
  for(const [cacheKey,value] of [['sportlink-assignments-v1',payload],['sportlink-planning-review-v1',{items:unresolved}]] as const)await tx`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values (${cacheKey},${JSON.stringify(value)},${Date.now()},${Date.now()+6*3600000},0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at`;
  await bumpPlanningRevision(tx,{status:'success',revision:batchRevision,lastSuccessAt:stamp,counts,message:'Wedstrijden en bezetting zijn samen verwerkt.'});return counts;
 });
 }catch(error){await sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(736402)`;await bumpPlanningRevision(tx,{status:'failed',message:'De bronupdate is niet verwerkt. De vorige volledige planning blijft bewaard. Controleer de bronstatus bij Sportlink-instellingen.'});});throw error;}finally{await sql`update sportlink_cache set refresh_after=0 where cache_key=${streamKey} and refresh_after=${lease}`;}
}

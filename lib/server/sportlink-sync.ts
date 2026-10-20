import {sqlClient} from '../../db';
import {SPORTLINK_DATASETS,nextSportlinkRun,type SportlinkDataset,type SportlinkSettings} from '../cms/sportlink-settings';
import {normalizeSportlink} from '../sportlink-normalize';
import {getSportlinkTeamDetail} from '../sportlink-team-server';
import {record,text,normalizeRoster,seasonForDate} from '../sportlink-team-normalize';
import {readSportlinkSettings,withSportlinkSettings} from './sportlink-config';
import {cachedSportlinkArticle,fetchSportlinkArticle,SportlinkSourceError} from './sportlink-client';
import {authorize,actorPrincipal,has,type Principal} from './permissions';
import {CmsError} from './errors';
import {mutate} from './records';

export type SportlinkSyncState={status:'never'|'queued'|'running'|'success'|'partial'|'failed'|'paused';lastAttemptAt?:string;lastSuccessAt?:string;nextRunAt?:string;message?:string;counts?:Record<string,number>};
const stateKey=(dataset:SportlinkDataset)=>'sportlink-sync-v1:'+dataset;
async function setSyncState(dataset:SportlinkDataset,patch:Partial<SportlinkSyncState>,transaction?:any){
 const sql=transaction||sqlClient(),[row]=await sql`select payload_json from sportlink_cache where cache_key=${stateKey(dataset)} for update`;
 const previous:SportlinkSyncState=row?.payload_json?JSON.parse(row.payload_json):{status:'never'},value={...previous,...patch};
 await sql`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values (${stateKey(dataset)},${JSON.stringify(value)},${Date.now()},0,0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at`;
}
export async function sportlinkStatus(actor:Principal){
 authorize(actor,'settings','read');const sql=sqlClient(),config=await readSportlinkSettings();
 const [rows,teams,assignmentRows]=await Promise.all([sql`select cache_key,payload_json from sportlink_cache where cache_key in ${sql(SPORTLINK_DATASETS.map(stateKey))}`,sql`select id,name,team_code as "teamCode",local_team_code as "localTeamCode",active from sportlink_teams order by name,id`,sql`select cache_key,payload_json from sportlink_cache where cache_key in ('sportlink-assignments-v1','sportlink-planning-review-v1')`]);
 const datasets=Object.fromEntries(SPORTLINK_DATASETS.map(dataset=>{const row=rows.find(r=>r.cache_key===stateKey(dataset));return [dataset,row?.payload_json?JSON.parse(row.payload_json):{status:'never'}];}));
 const matches=JSON.parse(assignmentRows.find(row=>row.cache_key==='sportlink-assignments-v1')?.payload_json||'{"matches":[]}').matches;
 const fields=[...new Set<string>(matches.map((match:any)=>match.field).filter(Boolean))].map(name=>({name}));
 const changingRooms=[...new Set<string>(matches.flatMap((match:any)=>Object.values(match.changingRooms||{})).filter(Boolean))].map(name=>({name}));
 const unresolved=JSON.parse(assignmentRows.find(row=>row.cache_key==='sportlink-planning-review-v1')?.payload_json||'{"items":[]}').items;
 return {...config,actorId:undefined,canManage:has(actor,'settings','manage'),credentialConfigured:!!process.env.SPORTLINK_CLIENT_ID,automaticActive:config.configured&&config.settings.enabled&&!!process.env.SPORTLINK_CLIENT_ID,datasets,teams,fields,changingRooms,unresolved};
}
export async function rescheduleSportlink(settings:SportlinkSettings){
 const sql=sqlClient();await sql.begin(async tx=>{for(const dataset of SPORTLINK_DATASETS){const [row]=await tx`select payload_json from sportlink_cache where cache_key=${stateKey(dataset)} for update`;if(!row?.payload_json)continue;const previous:SportlinkSyncState=JSON.parse(row.payload_json);if(previous.lastSuccessAt)await setSyncState(dataset,{nextRunAt:new Date(nextSportlinkRun(settings.schedules[dataset],new Date(previous.lastSuccessAt))).toISOString()},tx);}});
}
export async function queueSportlinkSync(actor:Principal,dataset:SportlinkDataset,operationId:string,scheduled=false){
 authorize(actor,'settings','manage');if(!SPORTLINK_DATASETS.includes(dataset))throw new CmsError('sportlink-dataset','Kies een geldig Sportlink-onderdeel.',422);
 if(!process.env.SPORTLINK_CLIENT_ID)throw new CmsError('sportlink-config','Stel SPORTLINK_CLIENT_ID in GitHub production in.',422);
 const sql=sqlClient(),config=await readSportlinkSettings();if(!config.configured)throw new CmsError('sportlink-settings','Bewaar eerst de Sportlink-instellingen.',422);
 return sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtext(${stateKey(dataset)}))`;
  const [pending]=await tx`select id,status from cms_jobs where kind='sportlink-sync' and payload->>'dataset'=${dataset} and status in ('pending','processing') order by created_at limit 1`;
  if(pending)return {id:pending.id,status:pending.status,alreadyQueued:true};
  const id=crypto.randomUUID(),key='sportlink-'+operationId;
  const [previous]=await tx`select id,status from cms_jobs where operation_id=${key}`;if(previous)return {...previous,alreadyQueued:true};
  await tx`insert into cms_jobs(id,operation_id,kind,payload,max_attempts) values (${id},${key},'sportlink-sync',${tx.json({dataset,actorId:actor.id,scheduled})},4)`;
  await setSyncState(dataset,{status:'queued',message:'Synchronisatie staat klaar.'},tx);
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${actor.id},'sportlink-sync-queued','site-sportlink',${operationId},${tx.json({dataset,scheduled})})`;
  return {id,status:'pending',alreadyQueued:false};
 });
}
/** Durable due times; no dependency on a visitor opening the website. */
export async function scheduleSportlinkSync(){
 const config=await readSportlinkSettings();if(!config.configured||!config.settings.enabled||!config.actorId||!process.env.SPORTLINK_CLIENT_ID)return;
 const actor=await actorPrincipal(config.actorId);authorize(actor,'settings','manage');const sql=sqlClient();
 for(const dataset of SPORTLINK_DATASETS){if(!config.settings.schedules[dataset].enabled)continue;
  const [row]=await sql`select payload_json from sportlink_cache where cache_key=${stateKey(dataset)}`,state:SportlinkSyncState=row?.payload_json?JSON.parse(row.payload_json):{status:'never'};
  if(state.nextRunAt&&new Date(state.nextRunAt).getTime()>Date.now())continue;
  await queueSportlinkSync(actor,dataset,crypto.randomUUID(),true);
 }
}
async function teams(settings:SportlinkSettings,force=false){
 const data=await cachedSportlinkArticle('teams',{competitieperiode:'ALLES'},{settings,force,dataset:'teams'});if(data.stale)throw new SportlinkSourceError('De teamlijst is tijdelijk niet beschikbaar.');
 if(!Array.isArray(data.value))throw new SportlinkSourceError('Sportlink leverde geen geldige teams.');
 const snapshot=normalizeSportlink({teams:data.value,standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:[]});if(!snapshot.teams.length)throw new SportlinkSourceError('Een lege teamresponse wordt niet als verwijderlijst verwerkt.');
 return {rows:data.value,teams:snapshot.teams,updatedAt:data.updatedAt};
}
export type SportlinkPersonCandidate={sourceId:string;name:string;role:string;teamId:string};
async function personCandidates(settings:SportlinkSettings):Promise<{items:SportlinkPersonCandidate[];failures:number;observed:number}>{
 const catalog=await teams(settings),items=new Map<string,SportlinkPersonCandidate>();let failures=0,observed=0;
 for(const team of catalog.teams.filter(team=>!settings.teamIds.length||settings.teamIds.includes(team.id))){
  try{const raw=await fetchSportlinkArticle('team-indeling',{teamcode:team.teamCode,lokaleteamcode:team.localTeamCode,toonlidfoto:'NEE'},settings);if(!Array.isArray(raw))throw Error();
   for(const row of raw.map(record)){if(!normalizeRoster([row],team.id).players.length)continue;observed++;const sourceId=text(row.relatiecode).toUpperCase();if(!/^[A-Z0-9][A-Z0-9-]{2,79}$/.test(sourceId))continue;
    items.set(sourceId,{sourceId,name:text(row.naam),role:text(row.functie)||text(row.rol),teamId:settings.teamMappings.find(mapping=>mapping.teamId===team.id)?.cmsTeamId||''});
   }
  }catch{failures++;}
 }
 return {items:[...items.values()],failures,observed};
}
export async function previewSportlinkPeople(actor:Principal){
 authorize(actor,'people','read');authorize(actor,'people','create');if(actor.teamScoped)throw new CmsError('forbidden','Sportlink-personenimport vereist clubbrede personenrechten.',403);
 if(!process.env.SPORTLINK_CLIENT_ID)return {items:[],available:false,reason:'De Sportlink-sleutel is niet beschikbaar. Gebruik een bevoegde CSV-export met stabiele bron-ID’s.'};
 const result=await personCandidates((await readSportlinkSettings()).settings);
 return {items:result.items,available:!!result.items.length,reason:result.failures?'Een deel van de teamindelingen ontbreekt. Alleen bevestigde personen met bron-ID zijn beschikbaar.':!result.items.length?'Sportlink leverde geen toegestane personen met stabiele ledennummers. Gebruik de CSV-voorbereiding.':undefined};
}
export async function importSportlinkPeople(actor:Principal,sourceIds:string[],operationId:string){
 const preview=await previewSportlinkPeople(actor),selected=preview.items.filter(row=>sourceIds.includes(row.sourceId));
 if(selected.length!==new Set(sourceIds).size||!selected.length)throw new CmsError('sportlink-selection','Haal de voorvertoning opnieuw op en kies beschikbare personen.',422);
 const sql=sqlClient(),changes=[];let skipped=0;
 for(const person of selected){const [existing]=await sql`select id,deleted_at from cms_records where module='people' and upper(draft->>'sportlinkId')=${person.sourceId}`;if(existing){skipped++;continue;}
  const id='sportlink-person-'+crypto.randomUUID();changes.push({module:'people' as const,id,expectedVersion:0,action:'save' as const,data:{id,name:person.name,role:person.role,group:'',teamId:person.teamId,bio:'',mediaId:'',email:'',phone:'',showContact:false,published:false,order:0,sportlinkId:person.sourceId}});
 }
 if(changes.length>50)throw new CmsError('sportlink-selection','Importeer maximaal 50 personen per keer.',422);
 const versions=changes.length?await mutate(actor,changes,operationId,crypto.randomUUID()):{};
 return {imported:changes.length,skipped,versions};
}

export async function processSportlinkSync(payload:{dataset:SportlinkDataset;actorId:string;scheduled?:boolean},jobId:string){
 const actor=await actorPrincipal(payload.actorId);authorize(actor,'settings','manage');const {settings}=await readSportlinkSettings(),sql=sqlClient(),dataset=payload.dataset;
 if(!SPORTLINK_DATASETS.includes(dataset))throw new CmsError('sportlink-dataset','Onbekende synchronisatietaak.',422);
 if(payload.scheduled&&(!settings.enabled||!settings.schedules[dataset].enabled)){await sql.begin(tx=>setSyncState(dataset,{status:'paused',message:'Automatische synchronisatie is gepauzeerd.'},tx));return;}
 const effective=settings;effective.enabled=true;effective.schedules[dataset].enabled=true;effective.schedules.teams.enabled=true;
 return withSportlinkSettings(effective,async()=>{
 const started=new Date().toISOString();await sql.begin(tx=>setSyncState(dataset,{status:'running',lastAttemptAt:started,message:'Sportlink wordt opgehaald.'},tx));
 const counts:Record<string,number>={};let failures=0;
 try{
  if(dataset==='teams'){
   const catalog=await teams(settings,true);counts.active=catalog.teams.length;
   await sql.begin(async tx=>{await tx`update sportlink_teams set active=0`;for(const team of catalog.teams)await tx`insert into sportlink_teams(id,team_code,local_team_code,name,category,gender,sport,day,competitions_json,active,updated_at) values (${team.id},${team.teamCode},${team.localTeamCode},${team.name},${team.category},${team.gender},${team.sport},${team.day},${JSON.stringify(team.competitions)},1,${Date.now()}) on conflict(id) do update set name=excluded.name,team_code=excluded.team_code,local_team_code=excluded.local_team_code,category=excluded.category,gender=excluded.gender,sport=excluded.sport,day=excluded.day,active=1,competitions_json=excluded.competitions_json,updated_at=excluded.updated_at`;
    await tx`update sportlink_cache set expires_at=0 where cache_key='club-competition-v1' or cache_key like 'team-catalog-v1:%'`;});
  }else if(dataset==='matches'||dataset==='assignments'){
   const catalog=await teams(settings),days=dataset==='assignments'?settings.assignmentDays:settings.programmeDays;
   const raw=await cachedSportlinkArticle('programma',{weekoffset:'0',aantaldagen:String(days),aantalregels:'500'},{settings,force:true,dataset});if(raw.stale||!Array.isArray(raw.value))throw new SportlinkSourceError('Het programma is tijdelijk niet beschikbaar.');
   const snapshot=normalizeSportlink({teams:catalog.rows,standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:raw.value});counts.received=snapshot.fixtures.length;
   const {syncSportlinkMatches}=await import('./sportlink-planning');const result=await syncSportlinkMatches(actor,snapshot.fixtures,settings,jobId);Object.assign(counts,result);
   await sql`insert into sportlink_cache(cache_key,payload_json,updated_at,expires_at,refresh_after) values ('sportlink-assignments-v1',${JSON.stringify({matches:snapshot.fixtures})},${Date.now()},${nextSportlinkRun(settings.schedules.assignments)},0) on conflict(cache_key) do update set payload_json=excluded.payload_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at`;
   await sql`update sportlink_cache set expires_at=0 where cache_key='club-competition-v1'`;
  }else{
   const catalog=await teams(settings),selected=catalog.teams.filter(team=>!settings.teamIds.length||settings.teamIds.includes(team.id));
   const prefixes=dataset==='players'?['team-roster-v1:']:dataset==='teamInfo'?['team-photo-v1:']:dataset==='results'?['team-results-v1:','team-pool-results-v1:']:['team-pool-standing-v1:'];
   await sql`update sportlink_cache set expires_at=0 where cache_key like any(${sql.array(prefixes.map(prefix=>prefix+'%'))}::text[])`;
   await sql`update sportlink_cache set expires_at=0 where cache_key like ${'sportlink-article-v2:'+dataset+':%'}`;
   for(const team of selected){try{const fetchedAt=Date.now(),detail=await getSportlinkTeamDetail(team.id,undefined,undefined,dataset);const available=dataset==='players'?detail.availability.players:dataset==='results'?detail.availability.results:dataset==='standings'?detail.availability.standings:'available';if(available==='unavailable')throw Error();const season=detail.selectedSeasonId,targetKey=dataset==='players'?`team-roster-v1:${season}:${team.id}`:dataset==='teamInfo'?`team-photo-v1:${season}:${team.id}:team`:dataset==='results'?`team-results-v1:${season}:${team.id}`:`team-pool-standing-v1:${season}:${detail.selectedPoolId}`;const [observed]=await sql`select updated_at from sportlink_cache where cache_key=${targetKey}`;if(!(dataset==='standings'&&!detail.selectedPoolId)&&Number(observed?.updated_at||0)<fetchedAt)throw Error();counts.teams=(counts.teams||0)+1;if(dataset==='players')counts.players=(counts.players||0)+detail.players.length;}catch{failures++;}}
   if(dataset==='players'&&settings.updateImportedPeople){const result=await personCandidates(settings);counts.importable=result.items.length;failures+=result.failures;
    for(const person of result.items){const [old]=await sql`select id,version,draft from cms_records where module='people' and upper(draft->>'sportlinkId')=${person.sourceId} and deleted_at is null`;
     if(old&&(old.draft.name!==person.name||old.draft.role!==person.role)){await mutate(actor,[{module:'people',id:old.id,expectedVersion:old.version,action:'save',data:{...old.draft,name:person.name,role:person.role}}],crypto.randomUUID(),jobId);counts.updated=(counts.updated||0)+1;}
    }
   }
  }
  if(failures)throw new SportlinkSourceError('Een deel van de onderdelen kon niet worden opgehaald. Geslaagde deelgegevens blijven bewaard.');
  await sql.begin(tx=>setSyncState(dataset,{status:'success',lastSuccessAt:new Date().toISOString(),nextRunAt:new Date(nextSportlinkRun(settings.schedules[dataset])).toISOString(),message:'Synchronisatie geslaagd.',counts},tx));
  }catch(error){await sql.begin(tx=>setSyncState(dataset,{status:failures?'partial':'failed',nextRunAt:new Date(Date.now()+settings.retryMinutes*60000).toISOString(),message:error instanceof CmsError?error.message:'Sportlink kon niet volledig worden bijgewerkt. De laatst geslaagde gegevens blijven behouden.',counts},tx));throw error;}
 });
}

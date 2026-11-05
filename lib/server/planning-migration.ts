import {z} from 'zod';
import {sqlClient} from '../../db';
import {activitySchema} from '../cms/planning';
import {equalContent} from '../cms/compare';
import {loadState,mutate} from './records';
import {planningPreview,migrationActivityId,activityAuthorization} from './planning';
import {authorize,type Principal} from './permissions';
import {CmsError} from './errors';

export const planningMigrationSchema=z.object({mode:z.enum(['preview','apply']),source:z.enum(['agenda','training']),sourceVersion:z.number().int().min(1),legacyId:z.string().min(1).max(150),activity:activitySchema,until:z.string().optional(),weekdays:z.array(z.number().int().min(0).max(6)).optional(),operationId:z.string().uuid()}).strict();
export type PlanningMigrationInput=z.infer<typeof planningMigrationSchema>;

// The caller may supply the existing transaction; all occurrences and the
// compatibility mapping must commit together, including on repeated requests.
export async function migrateLegacyPlanning(p:Principal,input:PlanningMigrationInput,transaction?:any){
 authorize(p,'settings','manage');
 if(p.teamScoped)throw new CmsError('forbidden','Een legacy-overname vereist clubbrede rechten.',403);
 const perform=async(tx:any)=>{
  await tx`select pg_advisory_xact_lock(736402)`;
  const sourceId=input.source==='agenda'?'site-agenda':'site-training';
  const [source]=await tx`select * from cms_records where id=${sourceId} for update`;
  if(!source||source.version!==input.sourceVersion)throw new CmsError('conflict','De oude agenda of het weekrooster is ondertussen gewijzigd. Laad het migratievoorstel opnieuw.',409);
  const [mapped]=await tx`select * from cms_planning_legacy where source_id=${sourceId} and legacy_id=${input.legacyId}`;
  if(mapped&&input.mode==='apply')return {alreadyApplied:true,count:mapped.report.count,activityId:mapped.activity_id};
  let activity={...input.activity,id:migrationActivityId(sourceId,input.legacyId),legacyId:input.legacyId,source:'manual' as const};
  delete activity.sourceId;delete activity.sourceData;
  let wasPublic=false,privateChanges=false;
  if(input.source==='agenda'){
   const legacy=source.draft.items?.find((item:any)=>item.id===input.legacyId);
   if(!legacy)throw new CmsError('legacy-missing','Deze oude activiteit bestaat niet meer.',404);
   activity={...activity,title:legacy.title,date:legacy.date,startTime:legacy.time,description:legacy.description};
   const approved=source.live?.items?.find((item:any)=>item.id===input.legacyId);
   wasPublic=!!approved;privateChanges=!!approved&&!equalContent(approved,legacy);
  }else{
   if(!/^\d+:\d+$/.test(input.legacyId))throw new CmsError('legacy-missing','Dit oude trainingsmoment bestaat niet meer.',404);
   const [index,offset]=input.legacyId.split(':').map(Number),session=source.draft.items?.[index]?.sessions?.[offset];
   if(!session)throw new CmsError('legacy-missing','Dit oude trainingsmoment bestaat niet meer.',404);
   if(!input.until||!input.weekdays?.length)throw new CmsError('training-period','Bevestig een periode en weekdagen voor de overname.',422);
   activity={...activity,type:'training',startTime:session.start,endTime:session.end};
   const approved=source.live?.items?.[index]?.sessions?.[offset];
   wasPublic=!!approved;privateChanges=!!approved&&!equalContent(approved,session);
  }
  activityAuthorization(p,'create',activity);
  const {state}=await loadState(false,undefined,tx),preview=planningPreview(state,activity,input.source==='training'?input.until:undefined,input.weekdays,p);
  if(input.mode==='preview')return {...preview,wasPublic,privateChanges};
  if(!preview.count||preview.conflicts.length)throw new CmsError('migration-conflict','De overname is niet opgeslagen. Los eerst de ontbrekende gegevens en reserveringsconflicten op.',409,preview.conflicts);
  const publish=wasPublic&&activity.public&&!privateChanges;
  const changes=preview.activities.map(value=>({module:'activities' as const,id:value.id,expectedVersion:0,action:publish?'publish' as const:'save' as const,data:value}));
  const result=await mutate(p,changes,input.operationId,crypto.randomUUID(),tx);
  await tx`insert into cms_planning_legacy(source_id,legacy_id,activity_id,source_version,report) values (${sourceId},${input.legacyId},${preview.activities[0].id},${source.version},${tx.json({count:preview.count,activityIds:preview.activities.map(item=>item.id),activatedPublic:publish})})`;
  return {...preview,...result};
 };
 return transaction?perform(transaction):sqlClient().begin(perform);
}

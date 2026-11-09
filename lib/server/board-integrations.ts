import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {applyBoardTransition,projectBoardState} from '../cms/board-transitions';
import {makeBase} from '../cms/board';
import {activitySchema,validPlanningDate} from '../cms/planning';
import {textDoc} from '../cms/model';
import {createNewsletterSeed} from '../cms/newsletter';
import {newsletterContentSchema} from '../cms/newsletter-schema';
import type {NewsletterCampaign} from '../cms/newsletter-types';
import {validatePlanningWrite,syncPlanningIndexes} from './planning';
import {saveNewsletterResource} from './newsletter-workspace';
import {CmsError} from './errors';
import {boardOperationInput,boardTransaction} from './board-workspace';

const planningInput=boardOperationInput.extend({decisionId:z.string().min(1).max(150),date:z.string().refine(validPlanningDate)}).strict();
const communicationInput=boardOperationInput.extend({communicationId:z.string().min(1).max(150).optional(),decisionId:z.string().min(1).max(150),title:z.string().trim().min(1).max(200),audience:z.string().trim().min(1).max(500),body:z.string().trim().min(1).max(100000),status:z.enum(['draft','ready'])}).strict();
export async function stageBoardPlanning(request:Request,value:unknown){
 const input=planningInput.parse(value);
 return boardTransaction(request,input,'planning',async(tx,context,record,validation)=>{
  const actor=context.actor!,decision=record.board.decisions.find(row=>row.id===input.decisionId);
  if(!decision||decision.outcome!=='adopted')throw new CmsError('missing','Kies een bestaand aangenomen besluit.',404);
  const next=projectBoardState(record.board,actor),existing=record.board.handoffs.find(row=>row.decisionId===decision.id);
  if(existing){
   const current=validation.planning?.find(row=>row.id===existing.activityId);
   if(!current||current.status==='cancelled')throw new CmsError('planning-missing','Het gekoppelde agenda-item is niet meer beschikbaar. Controleer dit in de jaaragenda.',409);
   if(current.date!==input.date)throw new CmsError('planning-existing','Dit besluit heeft al een agenda-item. Pas de datum bewust aan in de jaaragenda.',409);
   next.handoffs.find(row=>row.id===existing.id)!.date=input.date;
  }else{
   const activity=activitySchema.parse({id:randomUUID(),title:decision.title.slice(0,200),type:'event',date:input.date,startTime:'19:00',endTime:'20:00',locationIds:[],personIds:[actor.id],committeeIds:[],teamIds:[],public:false,description:(decision.code+'\n'+decision.text).slice(0,20000),status:'planned',source:'manual'});
   await validatePlanningWrite(tx,context.p,'activities',activity.id,activity,null,'save');
   await tx`insert into cms_records(id,module,title,status,draft) values (${activity.id},'activities',${activity.title},'draft',${tx.json(activity as any)})`;
   await syncPlanningIndexes(tx,'activities',activity.id,activity,false);
   await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${randomUUID()},${activity.id},1,${tx.json(activity as any)},'Intern jaaragendaconcept vanuit bestuursbesluit',${actor.userId})`;
   next.handoffs.push({...makeBase(next,'handoff'),decisionId:decision.id,activityId:activity.id,date:activity.date});
   validation.planning=[...(validation.planning||[]),{id:activity.id,date:activity.date,status:activity.status,public:false}];
  }
  return applyBoardTransition(record.board,next,actor,{...validation,integration:'planning'});
 });
}
export async function saveBoardCommunication(request:Request,value:unknown){
 const input=communicationInput.parse(value);
 return boardTransaction(request,input,'communication',async(tx,context,record,validation)=>{
  const actor=context.actor!,decision=record.board.decisions.find(row=>row.id===input.decisionId);
  if(!decision||decision.outcome!=='adopted')throw new CmsError('missing','Kies een bestaand aangenomen besluit.',404);
  const next=projectBoardState(record.board,actor),old=input.communicationId?record.board.communications.find(row=>row.id===input.communicationId&&row.decisionId===decision.id):undefined;
  if(input.communicationId&&!old)throw new CmsError('missing','Conceptbericht niet gevonden.',404);
  const campaignId=old?.campaignId||randomUUID();
  const [campaign]=old?.campaignId?await tx`select data,version from cms_newsletter_resources where id=${campaignId} and kind='campaign' for update`:[];
  if(old?.campaignId&&(!campaign||campaign.data.deletedAt||campaign.data.status!=='draft'))throw new CmsError('communication-locked','De gekoppelde clubpost is verwerkt of niet meer beschikbaar. Maak een nieuw conceptbericht.',409);
  const [settings]=await tx`select data from cms_newsletter_resources where id='newsletter-settings' and kind='settings'`;
  const defaults=settings?.data||createNewsletterSeed().settings;
  const content=newsletterContentSchema.parse({name:'Bestuur · '+input.title,subject:input.title,preheader:input.audience.slice(0,250),fromName:campaign?.data.fromName||defaults.fromName,replyTo:campaign?.data.replyTo||defaults.replyTo,audienceIds:campaign?.data.audienceIds||[],blocks:[{id:randomUUID(),type:'text',body:textDoc(input.body.split('\n'))}]});
  const saved:NewsletterCampaign={...content,id:campaignId,status:'draft',updatedAt:validation.now,scheduledAt:''};
  await saveNewsletterResource(tx,campaignId,'campaign',saved,campaign?.version||0);
  const changed=!!old&&(old.title!==input.title||old.body!==input.body||old.audience!==input.audience);
  // Ready is an internal board preparation state. Editing a ready message must
  // return it to draft; its linked newsletter is always unsent draft content.
  const status=old?.status==='ready'&&changed?'draft':input.status;
  const values={decisionId:decision.id,title:input.title,body:input.body,audience:input.audience,status,campaignId};
  if(old)Object.assign(next.communications.find(row=>row.id===old.id)!,values);
  else next.communications.push({...makeBase(next,'communication'),...values});
  validation.campaigns=[...(validation.campaigns||[]).filter(row=>row.id!==campaignId),{id:campaignId,status:'draft'}];
  return applyBoardTransition(record.board,next,actor,{...validation,integration:'communication'});
 });
}

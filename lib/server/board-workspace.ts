import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sqlClient} from '../../db';
import {applyBoardTransition,BoardTransitionError,type BoardValidationContext} from '../cms/board-transitions';
import type {BoardState} from '../cms/board';
import {verifyOrigin,has} from './permissions';
import {CmsError} from './errors';
import {workspaceLocks,workspaceRate} from './sponsor-access';
import {requestBoardActor,currentBoardContext,type BoardContext} from './board-access';
import {readBoardRecord,boardWorkspace,cleanSharedBoard,boardPlanning,boardCampaigns,type BoardRecord} from './board-store';

const operation=z.object({operationId:z.string().uuid(),expectedVersion:z.number().int().min(0)});
const stateInput=operation.extend({board:z.unknown()}).strict();
export const boardOperationInput=operation;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function readBoard(request:Request){
 const actor=await requestBoardActor(request.headers);
 return sqlClient().begin('isolation level repeatable read read only',async tx=>boardWorkspace(tx,await currentBoardContext(tx,actor)));
}
export type BoardMutationResult=ReturnType<typeof applyBoardTransition>;
export type BoardRecipe=(tx:any,context:BoardContext,record:BoardRecord,validation:BoardValidationContext)=>Promise<BoardMutationResult>;
/** The same lock order covers account, planning and board changes and retries. */
export async function boardTransaction(request:Request,input:{operationId:string;expectedVersion:number},kind:'state'|'planning'|'communication',recipe:BoardRecipe){
 verifyOrigin(request);const session=await requestBoardActor(request.headers),requestHash=hash({kind,input});
 await workspaceRate('board-write:'+session.p.id,120,3600);
 return sqlClient().begin(async tx=>{
  await workspaceLocks(tx);await tx`select pg_advisory_xact_lock(736575)`;
  const context=await currentBoardContext(tx,session,true),actor=context.actor!;
  if(kind!=='state'&&!['chair','secretary'].includes(actor.role))throw new CmsError('forbidden','Deze koppeling wordt voorbereid door de voorzitter of secretaris.',403);
  if(kind==='planning'&&(!has(context.p,'pages','read')||!has(context.p,'pages','create')))throw new CmsError('forbidden','Een jaaragendaconcept vereist bestaande rechten om de jaaragenda te bekijken en aan te maken.',403);
  if(kind==='communication'&&(!has(context.p,'news','read')||!has(context.p,'news','create')||!has(context.p,'news','update')))throw new CmsError('forbidden','Een berichtconcept vereist bestaande nieuwsrechten voor bekijken, aanmaken en wijzigen.',403);
  const scopeHash=hash({personId:actor.id,userId:actor.userId,role:actor.role,committeeIds:[...actor.committeeIds].sort(),targetRights:{planningRead:has(context.p,'pages','read'),planningCreate:has(context.p,'pages','create'),newsRead:has(context.p,'news','read'),newsCreate:has(context.p,'news','create'),newsUpdate:has(context.p,'news','update')}});
  const [prior]=await tx`select request_hash,scope_hash from cms_board_operations where actor_id=${actor.userId} and operation_id=${input.operationId}::uuid`;
  if(prior){
   if(prior.request_hash!==requestHash)throw new CmsError('operation-conflict','Deze aanvraagcode hoort bij andere invoer. Herlaad voordat je opnieuw opslaat.',409);
   if(prior.scope_hash!==scopeHash)throw new CmsError('forbidden','Je bestuursrol of commissietoegang is gewijzigd. Open de actuele werkruimte opnieuw.',403);
   return boardWorkspace(tx,context);
  }
  const record=await readBoardRecord(tx,context,true);
  if(record.version!==input.expectedVersion)throw new CmsError('board-conflict','Bestuur is ondertussen gewijzigd. Je invoer blijft open; laad de actuele versie opnieuw.',409,{version:record.version});
  const validation:BoardValidationContext={now:new Date().toISOString(),people:context.people,committees:context.committees.map(({id,name,active})=>({id,name,active})),planning:await boardPlanning(tx),campaigns:await boardCampaigns(tx)};
  let result:BoardMutationResult;
  try{result=await recipe(tx,context,record,validation);}catch(error){
   if(error instanceof CmsError||error instanceof z.ZodError)throw error;
   if(error instanceof BoardTransitionError){const problem=error as BoardTransitionError&{status?:number};throw new CmsError(problem.status===403?'forbidden':problem.status===409?'board-conflict':'board-validation',problem.message,problem.status||422);}
   throw error;
  }
  const board=cleanSharedBoard(result.board),version=record.version+1;
  // Persist notes separately; their content never enters shared snapshots or audits.
  for(const note of result.privateNotes){
   if(note.userId!==actor.userId||note.personId!==actor.id)throw new CmsError('forbidden','Een privénotitie mag alleen door de schrijver worden gewijzigd.',403);
   if(!note.text)await tx`delete from cms_board_private_notes where user_id=${actor.userId} and person_id=${actor.id} and meeting_id=${note.meetingId} and point_id=${note.pointId}`;
   else await tx`insert into cms_board_private_notes(user_id,person_id,meeting_id,point_id,text) values (${actor.userId},${actor.id},${note.meetingId},${note.pointId},${note.text}) on conflict(user_id,meeting_id,point_id) do update set text=excluded.text,person_id=excluded.person_id,updated_at=now()`;
  }
  const updated=await tx`update cms_board_state set data=${tx.json(board as any)},version=${version},updated_by=${actor.userId},updated_at=now() where id='club' and version=${record.version} returning version`;
  if(!updated.length)throw new CmsError('board-conflict','Bestuur is ondertussen gewijzigd. Laad de actuele versie opnieuw.',409);
  await tx`insert into cms_board_revisions(id,version,snapshot,actor_id,person_id,role) values (${randomUUID()}::uuid,${version},${tx.json(board as any)},${actor.userId},${actor.id},${actor.role})`;
  await tx`insert into cms_board_operations(actor_id,operation_id,person_id,scope_hash,request_hash,kind,version) values (${actor.userId},${input.operationId}::uuid,${actor.id},${scopeHash},${requestHash},${kind},${version})`;
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${randomUUID()},${actor.userId},${'board-'+kind},'club',${input.operationId},${tx.json({personId:actor.id,role:actor.role,version,changes:result.changes} as any)})`;
  // Re-read fresh note projection, rather than returning the raw submitted JSON.
  return boardWorkspace(tx,context);
 });
}
export async function writeBoard(request:Request,value:unknown){
 const input=stateInput.parse(value);
 return boardTransaction(request,input,'state',async(_tx,context,record,validation)=>{
  const result=applyBoardTransition(record.board,input.board,context.actor!,validation);
  // Date acknowledgement reads the linked planning record and needs the same
  // current target-module permission as viewing that source in the workspace.
  if(result.board.handoffs.some(row=>record.board.handoffs.some(previous=>previous.id===row.id&&previous.date!==row.date))&&!has(context.p,'pages','read'))throw new CmsError('forbidden','De actuele jaaragendadatum controleren vereist recht om de jaaragenda te bekijken.',403);
  return result;
 });
}

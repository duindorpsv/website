import {createEmptyBoard,type BoardState,type BoardPerson} from '../cms/board';
import {boardSchema} from '../cms/board-schema';
import {projectBoardState} from '../cms/board-transitions';
import type {BoardContext} from './board-access';
import {has} from './permissions';

export type BoardRecord={board:BoardState;version:number};
export async function readBoardRecord(tx:any,context:BoardContext,lock=false):Promise<BoardRecord>{
 const [row]=lock?await tx`select data,version from cms_board_state where id='club' for update`:await tx`select data,version from cms_board_state where id='club'`;
 const board=boardSchema.parse(row?.data||createEmptyBoard());
 // Shared snapshots are required to be clean even if a legacy/raw SQL row was malformed.
 for(const meeting of board.meetings)for(const point of meeting.points)point.privateNotes={};
 if(context.actor){
  const notes=await tx`select meeting_id,point_id,text from cms_board_private_notes where user_id=${context.actor.userId} and person_id=${context.actor.id}`;
  for(const note of notes){const point=board.meetings.find(meeting=>meeting.id===note.meeting_id)?.points.find(point=>point.id===note.point_id);if(point)point.privateNotes={[context.actor.id]:note.text};}
 }
 return {board,version:row?.version||0};
}
export async function boardPlanning(tx:any){
 const rows=await tx`select id,title,draft,status from cms_records where module='activities' and deleted_at is null order by id`;
 return rows.map((row:any)=>({id:row.id,title:row.title,date:row.draft.date,status:row.draft.status,public:row.draft.public,published:row.status==='published'}));
}
export async function boardCampaigns(tx:any){return (await tx`select id,data->>'status' as status from cms_newsletter_resources where kind='campaign' and data->>'deletedAt' is null`).map((row:any)=>({id:row.id,status:row.status}));}
export function cleanSharedBoard(board:BoardState){const copy=structuredClone(board);for(const meeting of copy.meetings)for(const point of meeting.points)point.privateNotes={};return copy;}
export async function boardWorkspace(tx:any,context:BoardContext,record?:BoardRecord){
 const configure=context.configure,actor=context.actor;
 if(!actor)return {board:createEmptyBoard(),actor:null,people:[],committees:[],version:0,canManageAccess:configure,permissions:{configure,planning:false,communications:false},planning:[]};
 const {board:source,version}=record||await readBoardRecord(tx,context),board=projectBoardState(source,actor);
 const canPlan=['chair','secretary'].includes(actor.role)&&has(context.p,'pages','read')&&has(context.p,'pages','create');
 const canCommunicate=['chair','secretary'].includes(actor.role)&&has(context.p,'news','read')&&has(context.p,'news','create')&&has(context.p,'news','update');
 let people:BoardPerson[]=context.people.filter(person=>person.active!==false),committees=context.committees.filter(committee=>committee.active);
 if(actor.role==='committee'){
  const relevant=new Set([actor.id,...board.actions.flatMap(row=>[row.ownerId,row.portfolioOwnerId])]);
  people=people.filter(person=>relevant.has(person.id)||person.committeeIds.some(id=>actor.committeeIds.includes(id)));
  committees=committees.filter(committee=>actor.committeeIds.includes(committee.id));
 }
 const linkedIds=new Set(board.handoffs.map(row=>row.activityId));
 const planning=has(context.p,'pages','read')?(await boardPlanning(tx)).filter((row:any)=>linkedIds.has(row.id)).map(({public:_,published:__,...row}:any)=>row):[];
 return {board,actor,people:people.map(({id,name,committeeIds,role})=>({id,name,committeeIds:actor.role==='committee'?committeeIds.filter(id=>actor.committeeIds.includes(id)):committeeIds,...(role?{role}:{})})),committees:committees.map(({id,name})=>({id,name})),version,canManageAccess:configure,permissions:{configure,planning:canPlan,communications:canCommunicate},planning};
}

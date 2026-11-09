import {actorPrincipal,has,type Principal} from './permissions';
import {freshActor,workspaceActor,type WorkspaceActor} from './sponsor-access';
import {CmsError} from './errors';
import type {BoardActor,BoardPerson,BoardRole} from '../cms/board';

export const boardRoles:BoardRole[]=['chair','secretary','member','committee'];
export const boardReadRight=(p:Principal)=>!p.teamScoped&&has(p,'board','read');
export const boardManageRight=(p:Principal)=>!p.teamScoped&&has(p,'board','manage');
export function explicitBoardRole(p:Principal):BoardRole|null{
 const roles=[...new Set(p.grants.filter(g=>g.module==='board'&&boardRoles.includes(g.action as BoardRole)).map(g=>g.action as BoardRole))];
 return roles.length===1?roles[0]:null;
}
export type BoardCommittee={id:string;name:string;active:boolean;members:{personId:string;role:string}[]};
export type BoardContext={p:Principal;actor:BoardActor|null;people:BoardPerson[];committees:BoardCommittee[];configure:boolean};

/** Account authority and person/committee assignments are read fresh inside every operation. */
export async function boardContext(tx:any,p:Principal,requireWorkflow=false):Promise<BoardContext>{
 const configure=boardManageRight(p);
 if(!boardReadRight(p)&&!configure)throw new CmsError('forbidden','Je hebt geen toegang tot Bestuur.',403);
 const role=boardReadRight(p)?explicitBoardRole(p):null;
 if(!role){
  if(configure&&!requireWorkflow)return {p,actor:null,people:[],committees:[],configure};
  throw new CmsError('board-role','Bestuur vereist precies één persoonlijke bestuursrol en het recht Bestuur bekijken.',403);
 }
 const peopleRows=await tx`select r.id,r.draft->>'name' as name,r.deleted_at,dp.data->>'status' as directory_status,a.user_id,m.active,u.banned,role.team_scoped,
  coalesce((select jsonb_agg(jsonb_build_object('module',g.module,'action',g.action)) from cms_grants g where g.role_id=m.role_id),'[]'::jsonb) as grants
  from cms_records r left join cms_person_accounts a on a.person_id=r.id
  left join cms_memberships m on m.user_id=a.user_id left join cms_roles role on role.id=m.role_id left join auth_user u on u.id=a.user_id
  left join cms_directory_profiles dp on dp.person_id=r.id
  where r.module='people' order by lower(r.draft->>'name'),r.id`;
 const committeeRows=await tx`select id,draft,deleted_at from cms_records where module='committees' order by lower(draft->>'name'),id`;
 const committees:BoardCommittee[]=committeeRows.map((row:any)=>({id:row.id,name:row.draft.name,active:!row.deleted_at&&row.draft.active===true,members:row.draft.members||[]}));
 const people:BoardPerson[]=peopleRows.map((row:any)=>{
  const grants=row.grants as Principal['grants'];const roles=[...new Set(grants.filter(g=>g.module==='board'&&boardRoles.includes(g.action as BoardRole)).map(g=>g.action as BoardRole))];
  const canRead=grants.some(g=>(g.module==='board'||g.module==='*')&&['read','*'].includes(g.action));
  const active=!row.deleted_at&&row.directory_status!=='archived';
  return {id:row.id,name:row.name||'Clubpersoon',committeeIds:committees.filter(c=>c.active&&c.members.some(member=>member.personId===row.id)).map(c=>c.id),...(row.user_id?{userId:row.user_id}:{}),active,...(active&&row.active&&!row.banned&&!row.team_scoped&&canRead&&roles.length===1?{role:roles[0]}:{})};
 });
 const linked=peopleRows.find((row:any)=>row.user_id===p.id),person=linked&&people.find(row=>row.id===linked.id);
 if(!person||person.active===false){
  if(configure&&!requireWorkflow)return {p,actor:null,people:[],committees:[],configure};
  throw new CmsError('board-person','Koppel dit persoonlijke account eerst aan een actieve persoon in het personenregister.',403);
 }
 const actor:BoardActor={...person,role,userId:p.id};
 return {p,actor,people,committees,configure};
}
export async function currentBoardContext(tx:any,session:WorkspaceActor,required=false){return boardContext(tx,await freshActor(tx,session),required);}
export async function requestBoardActor(headers:Headers){return workspaceActor(headers);}
export async function currentBoardPrincipal(userId:string,tx:any){return actorPrincipal(userId,tx);}

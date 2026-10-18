import {z} from 'zod';
import {sqlClient} from '@/db';
import {principal,authorize,has,verifyOrigin,writeAudit} from '@/lib/server/permissions';
import {contentModules,loadState,mutate,permissionModule,recordOutput,scope,type RecordRow,type Change} from '@/lib/server/records';
import {bodyJson,CmsError,errorResponse} from '@/lib/server/errors';
import {listSubscribers,changeSubscriber} from '@/lib/server/newsletter';
export const dynamic='force-dynamic';
const change=z.object({module:z.enum(contentModules),id:z.string().min(1).max(160),expectedVersion:z.number().int().min(0),action:z.enum(['save','publish','unpublish','trash','restore','schedule','cancelSchedule']),data:z.record(z.unknown()).optional(),scheduledAt:z.string().optional()}).strict();
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){try{
 const p=await principal(request.headers),{path}=await params,sql=sqlClient();
 if(path[0]==='newsletter'&&path.length===1)return Response.json(await listSubscribers(p,Object.fromEntries(new URL(request.url).searchParams)),{headers:{'Cache-Control':'no-store'}});
 if(path[0]==='bootstrap'){
  const result=await loadState(false,p);result.state.roles=[{id:p.roleId,name:p.roleId,description:'',permissions:[...new Set(p.grants.map(g=>g.module==='*'?'settings':g.module==='submissions'?'forms':g.module).filter(m=>['news','pages','media','people','forms','settings','users'].includes(m))) as any],teamScoped:p.teamScoped}];
  if(p.grants.some(g=>g.module==='*'))result.state.roles[0].permissions=['news','pages','media','people','forms','settings','users','publish'];else if(p.grants.some(g=>g.action==='publish'))result.state.roles[0].permissions.push('publish');
  result.state.members=[{id:p.id,name:p.name,email:p.email,roleId:p.roleId,teamIds:p.teams,active:true}];
  return Response.json({...result,principal:p},{headers:{'Cache-Control':'no-store'}});
 }
 if(path[0]==='audit'){authorize(p,'settings','manage');const rows=await sql`select id,actor_id,action,record_id,request_id,created_at from cms_audit order by created_at desc limit 100`;return Response.json({items:rows});}
 if(path[0]==='integrations'){authorize(p,'settings','read');const rows=await sql`select id,kind,status,attempts,last_error,run_at from cms_jobs where status in ('failed','waiting','pending') order by created_at desc limit 100`;return Response.json({mailProvider:'resend',mailConfigured:!!(process.env.RESEND_API_KEY&&process.env.MAIL_FROM),sportlinkReadConfigured:!!process.env.SPORTLINK_CLIENT_ID,sportlinkRegistration:'manual-follow-up',newsletterManagement:'cms',jobs:rows});}
 if(path[0]==='submissions'){
  const url=new URL(request.url),kind=url.searchParams.get('kind');if(!['contact','registration','request'].includes(kind||''))throw new CmsError('kind-required','Kies contact, aanmeldingen of aanvragen.');
  const rawLimit=Number(url.searchParams.get('limit')||50),rawOffset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(rawLimit)||!Number.isInteger(rawOffset)||rawLimit<1||rawOffset<0)throw new CmsError('pagination','Gebruik geldige paginagrenzen.',422);const limit=Math.min(100,rawLimit),offset=Math.min(10000,rawOffset);
  if(path[1]){const [row]=await sql`select * from cms_submissions where id=${path[1]} and kind=${kind!}`;if(!row)throw new CmsError('missing','Inzending niet beschikbaar.',404);authorize(p,'submissions','read',{departmentId:row.department_id,kind:row.kind});const notes=await sql`select note,actor_id,created_at from cms_submission_notes where submission_id=${row.id} order by created_at`,history=await sql`select from_status,to_status,actor_id,created_at from cms_submission_history where submission_id=${row.id} order by created_at`;return Response.json({...row,notes,history});}
  const departmentIds=p.departments.filter(d=>d.kind===kind).map(d=>d.id),hasRead=p.grants.some(g=>['*','submissions'].includes(g.module)&&['*','read'].includes(g.action));
  const rows=await sql`select * from cms_submissions where kind=${kind!} and ${hasRead&&(p.roleId==='admin'||departmentIds.length)?p.roleId==='admin'?sql`true`:sql`department_id in ${sql(departmentIds)}`:sql`false`} order by created_at desc,id limit ${limit} offset ${offset}`;
  return Response.json({items:rows,limit,offset});
 }
 const module=path[0];if(!contentModules.includes(module as any))throw new CmsError('missing','Onderdeel niet gevonden.',404);
 const url=new URL(request.url),limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit')||50))),offset=Math.max(0,Math.min(10000,Number(url.searchParams.get('offset')||0)));
 if(path[1]){const [row]=await sql<RecordRow[]>`select * from cms_records where id=${path[1]} and module=${module}`;if(!row)throw new CmsError('missing','Record niet gevonden.',404);authorize(p,permissionModule(module,row.draft),'read',scope(row));const revisions=await sql`select id,snapshot as data,label,created_at as at from cms_revisions where record_id=${row.id} order by created_at desc limit 30`;return Response.json(path[2]==='revisions'?{items:revisions}:recordOutput(row,revisions));}
 if(!Number.isInteger(limit)||!Number.isInteger(offset))throw new CmsError('pagination','Gebruik geldige paginagrenzen.',422);
 const type=url.searchParams.get('contentType');const rows=await sql<RecordRow[]>`select * from cms_records where module=${module} and ${type?sql`content_type=${type}`:sql`true`} order by updated_at desc,id limit ${limit} offset ${offset}`;
 return Response.json({items:rows.filter(r=>has(p,permissionModule(module,r.draft),'read',scope(r))).map(r=>recordOutput(r)),limit,offset});
 }catch(error){return errorResponse(error);}}
export async function POST(request:Request,{params}:{params:Promise<{path:string[]}>}){const requestId=crypto.randomUUID();let actorId:string|null=null;try{
 verifyOrigin(request);const p=await principal(request.headers);actorId=p.id;const {path}=await params;
 if(path[0]==='newsletter'&&path.length===2)return Response.json(await changeSubscriber(p,path[1],await bodyJson(request),requestId));
 if(path[0]==='mutations'){const parsed=z.object({operationId:z.string().uuid(),changes:z.array(change).min(1).max(50)}).strict().safeParse(await bodyJson(request));if(!parsed.success)throw new CmsError('validation','Ongeldige wijzigingsopdracht.',422);const versions=await mutate(p,parsed.data.changes as Change[],parsed.data.operationId,requestId);return Response.json({versions});}
 if(path[0]==='submissions'&&path[1]){const input=z.object({expectedVersion:z.number().int(),status:z.string().optional(),note:z.string().max(10000).optional(),assigneeId:z.string().optional(),externalRef:z.string().max(200).optional()}).strict().parse(await bodyJson(request));const sql=sqlClient();await sql.begin(async tx=>{const [row]=await tx`select * from cms_submissions where id=${path[1]} for update`;if(!row)throw new CmsError('missing','Inzending niet gevonden.',404);authorize(p,'submissions','update',{departmentId:row.department_id,kind:row.kind});if(row.version!==input.expectedVersion)throw new CmsError('conflict','De inzending is ondertussen gewijzigd.',409);if(input.status){const statuses=row.kind==='contact'?['new','in-progress','done']:row.kind==='request'?['new','in-progress','accepted','declined','done']:['new','in-progress','accepted','waitlist','declined','done'];if(!statuses.includes(input.status))throw new CmsError('status','Deze status hoort niet bij deze stroom.');await tx`insert into cms_submission_history(id,submission_id,actor_id,from_status,to_status) values (${crypto.randomUUID()},${row.id},${p.id},${row.status},${input.status})`;}
 if(input.note)await tx`insert into cms_submission_notes(id,submission_id,actor_id,note) values (${crypto.randomUUID()},${row.id},${p.id},${input.note})`;
 if(input.externalRef){authorize(p,'submissions','manage',{departmentId:row.department_id,kind:row.kind});if(row.kind!=='registration'||row.snapshot.definition.registrationPurpose!=='membership')throw new CmsError('kind','Alleen ledenaanmeldingen hebben een externe registratie.');}
 await tx`update cms_submissions set status=${input.status||row.status},assignee_id=${input.assigneeId||row.assignee_id},external_ref=${input.externalRef||row.external_ref},integration_status=${input.externalRef?'processed':row.integration_status},version=version+1 where id=${row.id}`;
 await tx`insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},'submission-update',${row.id},${requestId})`;});return Response.json({ok:true});}
 throw new CmsError('missing','Actie niet gevonden.',404);
 }catch(error){if(actorId&&error instanceof CmsError&&error.status===403)await writeAudit(actorId,'denied',null,requestId,{code:error.code});return errorResponse(error,requestId);}}

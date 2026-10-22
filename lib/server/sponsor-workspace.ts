import {z} from 'zod';
import {sqlClient} from '../../db';
import {workspaceActor,freshActor} from './sponsor-access';
import {readDomainStore,staffProjection,portalProjection,directoryListing,fullDirectory,sponsorStaff,globalRight,contextFingerprint,type WorkspaceQuery} from './sponsor-store';
import {CmsError} from './errors';
const query=z.object({mode:z.enum(['directory','sponsorship','portal','accounts']).default('directory'),companyId:z.string().max(191).default(''),personId:z.string().max(191).default(''),search:z.string().max(150).default(''),feature:z.string().max(40).default(''),source:z.string().max(40).default(''),account:z.string().max(40).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().refine(n=>[25,50,100].includes(n)).default(25)});
export function parseWorkspaceQuery(url:string):WorkspaceQuery{return query.parse(Object.fromEntries(new URL(url).searchParams));}
export async function workspaceRead(request:Request,portal=false){
 const q=parseWorkspaceQuery(request.url);if(portal)q.mode='portal';else if(q.mode==='portal')throw new CmsError('forbidden','Gebruik het persoonlijke portaal.',403);
 const actor=await workspaceActor(request.headers);
 return sqlClient().begin(async tx=>{
  const p=await freshActor(tx,actor);
  if(q.mode==='directory'&&!fullDirectory(p)&&!sponsorStaff(p)||q.mode==='sponsorship'&&!sponsorStaff(p)||q.mode==='accounts'&&!globalRight(p,'users','manage'))throw new CmsError('forbidden','Je hebt geen toegang tot dit onderdeel.',403);
  const listing=q.mode==='directory'?await directoryListing(tx,p,q):undefined;
  const store=await readDomainStore(tx,p,{peopleIds:listing?.ids,companyId:q.companyId,portal});
  const projection=portal?portalProjection(store,p,q.companyId):staffProjection(store,p,q.mode);
  const [revision]=await tx`select version from cms_domain_revision where id=true`;
  const read=portal?await tx`select reference_id from cms_sponsor_notification_reads where user_id=${p.id}`:[];
  const abilities=Object.fromEntries(['users','people','directory','sponsors'].map(module=>[module,!p.teamScoped&&p.grants.some(g=>(g.module==='*'||g.module===module)&&(module==='users'?['*','manage']:['*','update','create','manage']).includes(g.action))]));
  return {...projection,abilities,personal:'personal' in projection?projection.personal:undefined,notificationReadIds:read.map(r=>r.reference_id),listing,revision:String(revision.version),context:contextFingerprint(p,store)};
 });
}

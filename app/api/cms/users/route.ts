import {sqlClient} from '@/db';
import {principal,authorize,verifyOrigin} from '@/lib/server/permissions';
import {invite} from '@/lib/server/accounts';
import {bodyJson,errorResponse} from '@/lib/server/errors';
export async function GET(request:Request){try{const p=await principal(request.headers);authorize(p,'users','read');const rows=await sqlClient()`select u.id,u.name,u.email,u.two_factor_enabled,m.role_id,m.active,m.version,coalesce((select jsonb_agg(t.team_id) from cms_user_teams t where t.user_id=u.id),'[]') as team_ids,coalesce((select jsonb_agg(jsonb_build_object('id',d.department_id,'kind',d.kind)) from cms_user_departments d where d.user_id=u.id),'[]') as department_scopes from auth_user u join cms_memberships m on m.user_id=u.id order by u.name limit 100`;return Response.json({items:rows});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await invite(await principal(request.headers),await bodyJson(request)));}catch(e){return errorResponse(e);}}

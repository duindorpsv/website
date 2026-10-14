import { getAuth } from './auth';
import { sqlClient } from '../../db/index';
import { CmsError } from './errors';
import { env } from './env';
export type Principal = {
    id: string;
    name: string;
    email: string;
    roleId: string;
    teamScoped: boolean;
    teams: string[];
    departments: {
        id: string;
        kind: string;
    }[];
    grants: {
        module: string;
        action: string;
    }[];
    mfa: boolean;
};
export async function principal(headers: Headers): Promise<Principal> {
    const session = await getAuth().api.getSession({ headers });
    if (!session)
        throw new CmsError('unauthenticated', 'Log in om clubbeheer te openen.', 401);
    const sql = sqlClient();
    const [member] = await sql `select m.*,r.team_scoped from cms_memberships m join cms_roles r on r.id=m.role_id join auth_user u on u.id=m.user_id where m.user_id=${session.user.id} and m.active=true and coalesce(u.banned,false)=false`;
    if (!member)
        throw new CmsError('forbidden', 'Dit account heeft geen actieve CMS-toegang.', 403);
    const [teams, departments, grants] = await Promise.all([sql `select team_id as id from cms_user_teams where user_id=${session.user.id}`, sql `select department_id as id,kind from cms_user_departments where user_id=${session.user.id}`, sql `select module,action from cms_grants where role_id=${member.role_id}`]);
    return { id: session.user.id, name: session.user.name, email: session.user.email, roleId: member.role_id, teamScoped: member.team_scoped, teams: teams.map(t => String(t.id)), departments: departments as unknown as Principal['departments'], grants: grants as unknown as Principal['grants'], mfa: !!session.user.twoFactorEnabled };
}
export function has(p: Principal, module: string, action: string, scope?: {
    teamId?: string;
    departmentId?: string;
    kind?: string;
}) {
    if (!p.grants.some(g => (g.module === module || g.module === '*') && (g.action === action || g.action === '*')))
        return false;
    if (p.teamScoped && !['users', 'roles','submissions'].includes(module) && (!scope?.teamId || !p.teams.includes(scope.teamId)))
        return false;
    if (module === 'submissions' && p.roleId !== 'admin' && !p.departments.some(d => d.id === scope?.departmentId && d.kind === scope?.kind))
        return false;
    return true;
}
export function authorize(p: Principal, module: string, action: string, scope?: Parameters<typeof has>[3]) { if (!has(p, module, action, scope))
    throw new CmsError('forbidden', 'Je hebt geen rechten voor deze actie of dit team/deze afdeling.', 403); if (p.roleId === 'admin' && env().APP_ENV === 'production' && !p.mfa)
    throw new CmsError('mfa-required', 'Activeer eerst de tweede factor voor dit beheerdersaccount.', 403); }
export function verifyOrigin(request: Request) { if (request.headers.get('origin') !== new URL(env().APP_BASE_URL).origin)
    throw new CmsError('origin-rejected', 'De herkomst van dit verzoek is niet toegestaan.', 403); }
export async function writeAudit(actorId: string | null, action: string, recordId: string | null, requestId: string, metadata: Record<string, unknown> = {}) { await sqlClient() `insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${actorId},${action},${recordId},${requestId},${sqlClient().json(metadata as any)})`; }

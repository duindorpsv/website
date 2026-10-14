import {syncHomepage,moveChildPaths} from './publication-effects';
import { validClubNavigation } from '../clubmuur-navigation';
import { validHeroCards } from '../clubmuur-config';
import { parseGroups } from '../narrowcasting-config';
import { sqlClient } from '../../db/index';
import { createCmsSeed } from '../cms/seed';
import { cmsStateSchema } from '../cms/validation';
import { articleContent, pageContent, publishArticle, publishPage, validatePage, validateArticle } from '../cms/model';
import { assertLayout, migrateLayout, referencesIn, validateDocument, safeDestination } from '../cms/layout/document';
import type { CmsState, CmsArticle, CmsPage } from '../cms/types';
import { CmsError } from './errors';
import { authorize, has, type Principal } from './permissions';
export const contentModules = ['articles', 'pages', 'people', 'media', 'folders', 'albums', 'forms', 'documents', 'settings', 'navigation', 'hero', 'narrowcasting', 'patterns'] as const;
export type ContentModule = typeof contentModules[number];
export type RecordRow = {
    id: string;
    module: ContentModule;
    version: number;
    draft: Record<string, any>;
    live: Record<string, any> | null;
    team_id: string | null;
    department_id: string | null;
    status: string;
    deleted_at: string | null;
    updated_at: string;
};
export function emptyState(): CmsState { const s = createCmsSeed(); for (const key of ['articles', 'pages', 'people', 'media', 'folders', 'albums', 'departments', 'forms', 'submissions', 'roles', 'members', 'documents', 'redirects', 'audit'] as const)
    s[key] = [] as never; return s; }
const alias: Record<string, string> = { articles: 'news', albums: 'media', folders: 'media', documents: 'pages', navigation: 'pages', hero: 'pages', narrowcasting: 'pages',patterns:'pages' };
export function permissionModule(module: string,data?:Record<string,any>) { return module==='articles'&&data?.contentType==='story'?'stories':alias[module] || module; }
export function scope(row: RecordRow) { return { teamId: row.team_id || '', departmentId: row.department_id || '', kind: String(row.draft.kind || '') }; }
export function recordOutput(row: RecordRow, revisions: unknown[] = []) { const data: Record<string, any> = { ...row.draft, id: row.id, version: row.version }; if (['articles', 'pages'].includes(row.module))
    Object.assign(data, { status: row.status, scheduledAt: (row as any).scheduled_at || row.draft.scheduledAt || '', updatedAt: new Date(row.updated_at).toISOString(), live: row.live || undefined, revisions });
else
    Object.assign(data, { published: !!row.live, live: row.live || undefined }); if (row.module === 'media' && String(data.src).startsWith('/api/media/'))
    data.src = `/api/cms/media/${row.id}/file`; if (row.deleted_at)
    Object.assign(data, { deletedAt: row.deleted_at }); return data; }
export async function loadState(publicOnly = false, p?: Principal): Promise<{
    state: CmsState;
    versions: Record<string, number>;
}> {
    const sql = sqlClient(), state = emptyState(), versions: Record<string, number> = {};
    const rows = await sql<RecordRow[]> `select *, (select run_at from cms_jobs j where j.kind='publish' and j.payload->>'id'=cms_records.id and j.status in ('pending','processing') limit 1) as scheduled_at from cms_records where ${publicOnly ? sql `live is not null and deleted_at is null` : sql `true`} and ${!publicOnly&&p?sql`(module!='media' or id in (select id from cms_records where module='media' order by updated_at desc,id limit 100) or id in (select target_id from cms_references))`:sql`true`} order by case when module in ('settings','navigation','hero') then 0 else 1 end,updated_at desc,id limit 1500`;
    for (const row of rows) {
        const fallbackPublic=!publicOnly&&!!p&&!has(p,permissionModule(row.module,row.draft),'read',scope(row));if(fallbackPublic&&(!row.live||row.deleted_at))continue;
        versions[row.id] = row.version;
        if (['navigation', 'hero'].includes(row.module)) {
            state.appearance ||= {};
            (state.appearance as any)[row.module] = (publicOnly||fallbackPublic ? row.live : row.draft)?.items;
            continue;
        }
        if (row.module === 'settings') {
            if (row.live || !publicOnly)
                state.settings = (publicOnly||fallbackPublic ? row.live : row.draft) as unknown as CmsState['settings'];
            continue;
        }
        if (!['articles', 'pages', 'people', 'media', 'folders', 'albums', 'forms', 'documents'].includes(row.module))
            continue;
        const data: Record<string, any> = publicOnly||fallbackPublic ? { ...row.live, id: row.id } : recordOutput(row);
        if ((publicOnly||fallbackPublic) && ['articles', 'pages'].includes(row.module))
            Object.assign(data, { live: row.live, status: 'published', revisions: [], updatedAt: new Date(row.updated_at).toISOString() });
        if ((publicOnly||fallbackPublic) && row.module === 'people' && !data.showContact) {
            data.email = '';
            data.phone = '';
        }
        if ((publicOnly||fallbackPublic) && row.module === 'forms') {
            delete data.retentionDays;
            delete data.departmentId;
        }
        (state[row.module as keyof CmsState] as unknown as Record<string, unknown>[]).push(data);
    }
    const ds = await sql `select * from cms_departments where ${publicOnly ? sql `active=true` : sql `true`} order by id`;
    state.departments = ds.filter(d => publicOnly || !p || has(p, 'forms', 'read') || p.departments.some(assignment=>assignment.id===String(d.id)&&has(p,'submissions','read',{departmentId:assignment.id,kind:assignment.kind}))).map(d => ({ id: String(d.id), name: String(d.name), description: String(d.description), active: !!d.active, confirmation: String(d.confirmation), emails: publicOnly ? [] : d.emails as string[] }));
    const redirects = await sql `select from_path as "from",to_path as "to" from cms_redirects`;
    state.redirects = redirects.map(r => ({ from: String(r.from).replace(/^\/clubmuur\//, ''), to: String(r.to).replace(/^\/clubmuur\//, '') }));
    return { state, versions };
}
function pathFor(module: string, data: Record<string, any>): string | null { if (!data.slug)return null; if (module === 'pages')
    return `/clubmuur/${data.slug}`; if (module === 'articles')
    return `/clubmuur/${data.contentType === 'story' ? 'verhalen' : 'nieuws'}/${data.slug}`; if (module === 'albums')
    return `/clubmuur/media/fotos/${data.slug}`; return null; }
export function validateCandidate(module: ContentModule, value: Record<string, any>) {
    if (JSON.stringify(value).length > 1500000)
        throw new CmsError('too-large', 'Inhoud is te groot.', 413);
    const clean = structuredClone(value);
    for (const key of ['live', 'revisions', 'version', 'updatedAt', 'deletedAt', 'scheduledAt'])
        delete clean[key];
    if (module === 'pages' && clean.bodyFormat !== 'page-layout-v2') {
        clean.body = migrateLayout(clean.body, clean.id);
        clean.bodyFormat = 'page-layout-v2';
    }
    if (module === 'pages' || module === 'articles') {
        const issues = validateDocument(clean.body, module === 'pages' ? 'page-layout-v2' : 'article');
        if (issues.length)
            throw new CmsError('invalid-document', 'Controleer de editorinhoud.', 422, issues);
    }
    if (module === 'pages')
        assertLayout(clean.body);
    if(clean.slug&&(!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(clean.slug)||clean.slug.length>240))throw new CmsError('slug','Gebruik een geldig en begrensd pad.',422);
    if(module==='patterns'){if(typeof clean.title!=='string'||!clean.title.trim()||clean.title.length>150)throw new CmsError('pattern-title','Geef het rijpatroon een naam.',422);assertLayout({type:'doc',content:[clean.row]});return clean;}
    if (module === 'navigation') {
        if (!validClubNavigation(clean.items))
            throw new CmsError('navigation', 'Controleer namen en bestemmingen van het menu.', 422);
        return clean;
    }
    if (module === 'hero') {
        if (!validHeroCards(clean.items))
            throw new CmsError('hero', 'Controleer de vier hero-vakken.', 422);
        return clean;
    }
    if (module === 'narrowcasting') {
        const groups = parseGroups(clean.groups);
        if (!groups.length || groups.length !== clean.groups?.length)
            throw new CmsError('narrowcasting', 'Controleer de schermgroepen.', 422);
        return { ...clean, groups };
    }
    const shape = cmsStateSchema.shape;
    const member = module === 'settings' ? shape.settings : (shape[module as keyof typeof shape] as unknown as {
        unwrap?: () => unknown;
    });
    const schema = module === 'settings' ? member : (member as any)._def.schema?.element || (member as any).element;
    const check = ['articles', 'pages'].includes(module) ? { ...clean, status: 'draft', updatedAt: new Date().toISOString(), ...(module==='articles'?{scheduledAt:''}:{}), revisions: [] } : clean;
    if(schema?.shape){const allowed=new Set([...Object.keys(schema.shape),'published']);for(const key of Object.keys(check))if(!allowed.has(key))throw new CmsError('unknown-field',`Onbekend veld: ${key}.`,422);}
    const parsed = (schema as any)?.safeParse(check);
    if (parsed && !parsed.success)throw new CmsError('validation','Controleer de ingevulde velden.',422,parsed.error.issues.map((i:any)=>({path:i.path.join('.'),message:i.message})));
    for(const key of ['url','src'])if(clean[key]&&!safeDestination(clean[key]))throw new CmsError('unsafe-url','Gebruik een veilige web- of interne bestemming.',422,{field:key});
    // Keep explicit versioned fields (layout/filters) after the legacy schema check.
    return clean;
}
export type Change = {
    module: ContentModule;
    id: string;
    expectedVersion: number;
    action: 'save' | 'publish' | 'unpublish' | 'trash' | 'restore' | 'schedule' | 'cancelSchedule';
    data?: Record<string, any>;
    scheduledAt?: string;
};
export async function mutate(p: Principal, changes: Change[], operationId: string, requestId: string) {
    const sql = sqlClient();
    return sql.begin(async (tx) => {
        const [operation] = await tx `select response from cms_operations where id=${operationId} and actor_id=${p.id}`;
        if (operation)
            return operation.response;
        // Serializes route reservations/parent changes and cross-record publication.
        await tx `select pg_advisory_xact_lock(736402)`;
        const state = (await loadState(false)).state;
        const output: Record<string, number> = {};
        for (const change of changes) {
            if (!contentModules.includes(change.module))
                throw new CmsError('module', 'Onbekende module.');
            const [old] = await tx<RecordRow[]> `select * from cms_records where id=${change.id} for update`;
            if (old && old.module !== change.module)
                throw new CmsError('module', 'Het record behoort aan een andere module.');
            if ((old?.version || 0) !== change.expectedVersion)
                throw new CmsError('conflict', 'Deze inhoud is ondertussen gewijzigd. Je werkversie blijft bewaard; laad de serverversie opnieuw.', 409, { id: change.id, expected: change.expectedVersion, actual: old?.version || 0 });
            const module = permissionModule(change.module,old?.draft||change.data), action = change.action === 'publish' || change.action === 'unpublish' || change.action === 'schedule' || change.action === 'cancelSchedule' ? 'publish' : change.action === 'trash' ? 'delete' : old ? 'update' : 'create';
            const candidate = change.data ? validateCandidate(change.module, { ...change.data, id: change.id }) : structuredClone(old?.draft || {});
            if(change.module==='pages'){let id=candidate.parentId;const visited=new Set([change.id]);while(id){if(visited.has(id))throw new CmsError('parent-cycle','De paginahiërarchie bevat een kringverwijzing.',422);visited.add(id);const [parent]=await tx`select draft from cms_records where id=${id} and module='pages' and deleted_at is null`;if(!parent)throw new CmsError('parent-missing','Kies een bestaande bovenliggende pagina.',422);id=parent.draft.parentId;}}
            if(candidate.authorId&&!(await tx`select id from cms_records where id=${candidate.authorId} and module='people' and deleted_at is null`).length)throw new CmsError('author','Kies een bestaande persoon als auteur.',422);
            if (!old && !change.data)
                throw new CmsError('missing', 'Inhoud ontbreekt.');
            const newScope = { teamId: candidate.teamId || '', departmentId: candidate.departmentId || '', kind: candidate.kind || '' };
            authorize(p, module, action, old ? scope(old) : newScope);
            if (old)
                authorize(p, permissionModule(change.module,candidate), action, newScope);
            if (old?.deleted_at && !['restore', 'trash'].includes(change.action))
                throw new CmsError('trashed', 'Herstel dit record eerst.');
            if (change.action === 'trash' && old?.live)
                authorize(p, module, 'publish', scope(old));
            if (change.action === 'trash') {
                const used = await tx `select record_id from cms_references where target_id=${change.id} and snapshot='live' limit 30`;
                if (used.length)
                    throw new CmsError('in-use', 'Dit record wordt gebruikt. Trek de publicatie bewust in of werk de verwijzingen bij.', 409, used);
            }
            if(change.module==='settings')for(const t of candidate.teams||[])await tx`insert into cms_teams(id,name) values (${t.id},${t.name}) on conflict(id) do update set name=excluded.name`;
            const version = (old?.version || 0) + 1;
            let live = old?.live || null, status = old?.status === 'scheduled' && change.action === 'save' ? 'scheduled' : candidate.status || 'draft';
            let deletedAt: Date | null = old?.deleted_at ? new Date(old.deleted_at) : null;
            if (change.action === 'restore') {
                deletedAt = null;
                status = 'draft';
            }
            if (change.action === 'trash') {
                deletedAt = new Date();
                live = null;
                status = 'archived';
            }
            if (change.action === 'unpublish') {
                live = null;
                status = 'draft';
            }
            if (change.action === 'schedule' && !['articles','pages'].includes(change.module)) throw new CmsError('schedule-module','Alleen pagina’s en artikelen kunnen worden ingepland.',422);
            let planned: Record<string,any> | null = null;
            if (change.action === 'publish' || change.action === 'schedule') {
                if (change.module === 'media') {
                    const [object] = await tx `select state from cms_media_objects where id=${change.id}`;
                    if (object && object.state !== 'ready')
                        throw new CmsError('processing', 'Deze foto wordt nog verwerkt.', 422);
                    if (!candidate.alt)
                        throw new CmsError('alt-required', 'Voeg alt-tekst toe voordat je publiceert.', 422);
                    candidate.src = candidate.src.replace(/^\/api\/cms\/media\/(.*?)\/file$/, '/api/media/$1');
                }
                if (['articles', 'pages'].includes(change.module)) {
                    const collection = state[change.module as 'articles' | 'pages'] as (CmsArticle | CmsPage)[];
                    const i = collection.findIndex(r => r.id === change.id);
                    const record = { ...candidate, id: change.id, status: 'draft', updatedAt: new Date().toISOString(), revisions: [], live: old?.live || undefined };
                    if (i < 0)
                        collection.push(record as any);
                    else
                        collection[i] = record as any;
                    const errors = change.module === 'articles' ? validateArticle(record as unknown as CmsArticle, state) : validatePage(record as unknown as CmsPage, state);
                    if (errors.length)
                        throw new CmsError('publication-invalid', 'Publicatie is nog niet mogelijk.', 422, errors);
                    const issues = change.module === 'articles' ? publishArticle(state, change.id) : publishPage(state, change.id);
                    if (issues.length)
                        throw new CmsError('publication-invalid', 'Publicatie is nog niet mogelijk.', 422, issues);
                    live = change.module === 'articles' ? articleContent(record as unknown as CmsArticle) : pageContent(record as unknown as CmsPage);
                }
                else
                    live = { ...candidate, published: true };
                const refs = referencesIn(live);
                if (change.module === 'settings')
                    refs.push(...candidate.homepageArticleIds || [], ...candidate.homepageStoryIds || [], ...candidate.homepageAlbumIds || [], ...candidate.homepagePhotoIds || []);
                for (const id of refs) {
                    const [target] = await tx `select live,deleted_at from cms_records where id=${id}`;
                    if ((!target?.live || target.deleted_at)&&!(await tx`select id from cms_teams where id=${id}`).length&&!(await tx`select id from cms_departments where id=${id} and active=true`).length)
                        throw new CmsError('reference-invalid', `Verwijzing ${id} is niet gepubliceerd.`, 422, { id });
                }
                status = 'published';
                if(change.action==='schedule'){if(change.module==='articles')live!.publishedAt=candidate.publishedAt||change.scheduledAt;planned=live;live=old?.live||null;status='scheduled';}
            }
            if (['schedule', 'cancelSchedule', 'publish', 'unpublish', 'trash'].includes(change.action))
                await tx `update cms_jobs set status='cancelled' where kind='publish' and payload->>'id'=${change.id} and status in ('pending','processing')`;
            if(change.action==='cancelSchedule')status='draft';
            if (change.action === 'schedule') {
                if (!change.scheduledAt || !Number.isFinite(Date.parse(change.scheduledAt)) || Date.parse(change.scheduledAt) <= Date.now())
                    throw new CmsError('schedule', 'Kies een toekomstig publicatietijdstip.');
                status = 'scheduled';
            }
            const draftPath = pathFor(change.module, candidate), livePath = live ? pathFor(change.module, live) : null, oldPath = old?.live ? pathFor(change.module, old.live) : null;
            for (const path of new Set([draftPath, livePath].filter(Boolean))) {
                const [used] = await tx `select record_id from cms_paths where path=${path!}`;
                if (used && used.record_id !== change.id)
                    throw new CmsError('path-conflict', 'Dit pad is al gereserveerd.', 409, { path });
            }
            await tx `insert into cms_records(id,module,title,slug,content_type,story_format,author_id,parent_id,season,category,team_id,department_id,status,version,draft,live,deleted_at) values (${change.id},${change.module},${candidate.title || candidate.name || ''},${candidate.slug || null},${candidate.contentType || null},${candidate.storyFormat || null},${candidate.authorId||null},${candidate.parentId||null},${candidate.season||null},${candidate.category||null},${candidate.teamId || null},${candidate.departmentId || null},${status},${version},${tx.json(candidate)},${live ? tx.json(live) : null},${deletedAt?.toISOString()||null}) on conflict(id) do update set title=excluded.title,slug=excluded.slug,content_type=excluded.content_type,story_format=excluded.story_format,author_id=excluded.author_id,parent_id=excluded.parent_id,season=excluded.season,category=excluded.category,team_id=excluded.team_id,department_id=excluded.department_id,status=excluded.status,version=excluded.version,draft=excluded.draft,live=excluded.live,deleted_at=excluded.deleted_at,updated_at=now()`;
            if (change.action === 'publish') {
                const publicationId = crypto.randomUUID();
                await tx `insert into cms_publications(id,record_id,record_version,snapshot,actor_id) values (${publicationId},${change.id},${version},${tx.json(live)},${p.id})`;
                await tx `update cms_records set live_id=${publicationId} where id=${change.id}`;
            }
            else if (!live)
                await tx `update cms_records set live_id=null where id=${change.id}`;
            await tx `insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},${change.id},${version},${tx.json(candidate)},${change.action},${p.id})`;
            await tx `delete from cms_paths where record_id=${change.id}`;
            for (const path of new Set([draftPath, livePath].filter(Boolean)))
                await tx `insert into cms_paths(path,record_id,kind) values (${path!},${change.id},${path === livePath ? 'live' : 'draft'})`;
            if (change.action === 'publish' && oldPath && livePath && oldPath !== livePath) {
                await tx `delete from cms_redirects where from_path=${livePath}`;
                await tx `update cms_redirects set to_path=${livePath} where record_id=${change.id}`;
                await tx `insert into cms_redirects(from_path,to_path,record_id) values (${oldPath},${livePath},${change.id}) on conflict(from_path) do update set to_path=excluded.to_path,record_id=excluded.record_id`;
            }
            if(change.action==='publish'&&change.module==='pages')await moveChildPaths(tx,change.id,old?.live,live,p);
            if(['publish','unpublish','trash'].includes(change.action)&&change.module==='articles')await syncHomepage(tx,change.id,old?.live,live,p.id);
            for (const part of ['draft', 'live'] as const) {
                await tx `delete from cms_references where record_id=${change.id} and snapshot=${part}`;
                for (const ref of referencesIn(part === 'draft' ? candidate : live)) {
                    const [exists] = await tx `select id from cms_records where id=${ref}`;
                    if (exists)
                        await tx `insert into cms_references(record_id,target_id,snapshot) values (${change.id},${ref},${part}) on conflict do nothing`;
                }
            }
            if (change.module === 'albums') {
                await tx `delete from cms_album_media where album_id=${change.id}`;
                for (const [i, id] of (candidate.mediaIds || []).entries())
                    await tx `insert into cms_album_media(album_id,media_id,position) values (${change.id},${id},${i})`;
            }
            await tx `insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},${change.action},${change.id},${requestId})`;
            if (['publish', 'unpublish', 'trash'].includes(change.action))
                await tx `insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${`${operationId}:${change.id}:cache`},'cache',${tx.json({ id: change.id })})`;
            if (change.action === 'schedule')
                await tx `insert into cms_jobs(id,operation_id,kind,payload,run_at) values (${crypto.randomUUID()},${`${operationId}:${change.id}:schedule`},'publish',${tx.json({ id: change.id, module: change.module, version, actorId: p.id, draft: planned })},${new Date(change.scheduledAt!).toISOString()})`;
            output[change.id] = version;
        }
        await tx `insert into cms_operations(id,actor_id,response) values (${operationId},${p.id},${tx.json(output)})`;
        return output;
    });
}

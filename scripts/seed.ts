import {seedClubArchive} from '../lib/server/archive-seed';
import {rebuildReferences} from '../lib/server/imports';
import { sqlClient } from '../db/index';
import { createCmsSeed } from '../lib/cms/seed';
import { migrateLayout } from '../lib/cms/layout/document';
import { createHash } from 'node:crypto';
import {putObject} from '../lib/server/storage';
import { env } from '../lib/server/env';
const state = createCmsSeed(), sql = sqlClient();
const original = JSON.stringify(state), checksum = createHash('sha256').update(original).digest('hex');
await putObject(`imports/seed-${checksum}.json`,Buffer.from(original),'application/json');
try {
    await sql.begin(async (tx) => {
        await tx `select pg_advisory_xact_lock(736402)`;
        const [existing] = await tx `select id from cms_imports where checksum=${checksum}`;
        for (const r of state.redirects) await tx`insert into cms_redirects(from_path,to_path) values (${`/clubmuur/${r.from}`},${`/clubmuur/${r.to}`}) on conflict do nothing`;
        if (existing) {
            await rebuildReferences(tx);console.log('Seed was al geïmporteerd; verwijzingsindex gecontroleerd.');
            return;
        }
        for (const t of state.settings.teams)
            await tx `insert into cms_teams(id,name) values (${t.id},${t.name}) on conflict do nothing`;
        for (const d of state.departments)
            await tx `insert into cms_departments(id,name,description,emails,active,confirmation) values (${d.id},${d.name},${d.description},${tx.json(d.emails)},${d.active},${d.confirmation}) on conflict do nothing`;
        for (const r of state.roles) {
            await tx `insert into cms_roles(id,name,description,team_scoped) values (${r.id},${r.name},${r.description},${r.teamScoped}) on conflict do nothing`;
            if (r.id === 'admin')
                await tx `insert into cms_grants(role_id,module,action) values (${r.id},'*','*') on conflict do nothing`;
            else
                for (const module of r.permissions.filter(x => x !== 'publish')) {
                    for (const action of ['read', 'create', 'update', 'delete', ...(r.permissions.includes('publish') ? ['publish'] : [])])
                        await tx `insert into cms_grants(role_id,module,action) values (${r.id},${module},${action}) on conflict do nothing`;
                }
        }
        const batch = crypto.randomUUID();
        const modules = ['articles', 'pages', 'people', 'media', 'folders', 'albums', 'forms', 'documents'] as const;
        for (const module of modules)
            for (const input of state[module]) {
                const data = structuredClone(input) as any;
                let live = data.live || ((['people', 'media', 'albums', 'documents'].includes(module) && data.published) || (['forms', 'folders'].includes(module) && data.active !== false) ? structuredClone(data) : null);
                if (module === 'pages') {
                    data.body = migrateLayout(data.body, `${data.id}:draft`);
                    data.bodyFormat = 'page-layout-v2';
                    if (live) {
                        live.body = migrateLayout(live.body, `${data.id}:live`);
                        live.bodyFormat = 'page-layout-v2';
                    }
                }
                if (module === 'media' && data.blobKey) {
                    throw new Error('Bronseed bevat onverwacht browserlokale upload.');
                }
                const revisions = data.revisions || [];
                delete data.revisions;
                delete data.live;
                await tx `insert into cms_records(id,module,title,slug,content_type,story_format,team_id,department_id,status,draft,live,deleted_at,import_batch) values (${data.id},${module},${data.title || data.name || ''},${data.slug || null},${data.contentType || null},${data.storyFormat || null},${data.teamId || null},${data.departmentId || null},${data.status || (live ? 'published' : 'draft')},${tx.json(data)},${live ? tx.json(live) : null},${data.deletedAt ? new Date(data.deletedAt).toISOString() : null},${batch}) on conflict do nothing`;
                if (live) {
                    const publicationId = `seed:${data.id}`;
                    await tx `insert into cms_publications(id,record_id,record_version,snapshot) values (${publicationId},${data.id},1,${tx.json(live)}) on conflict do nothing`;
                    await tx `update cms_records set live_id=${publicationId} where id=${data.id} and live_id is null`;
                }
                const path = module === 'pages' ? `/clubmuur/${data.slug}` : module === 'articles' ? `/clubmuur/${data.contentType === 'story' ? 'verhalen' : 'nieuws'}/${data.slug}` : module === 'albums' ? `/clubmuur/media/fotos/${data.slug}` : null;
                if (path)
                    await tx `insert into cms_paths(path,record_id,kind) values (${path},${data.id},${live ? 'live' : 'draft'}) on conflict do nothing`;
                for (const [i, revision] of revisions.entries()) {
                    if (module === 'pages') {
                        revision.data.body = migrateLayout(revision.data.body, `${data.id}:revision:${revision.id}`);
                        revision.data.bodyFormat = 'page-layout-v2';
                    }
                    await tx `insert into cms_revisions(id,record_id,version,snapshot,label) values (${revision.id},${data.id},${-i - 1},${tx.json(revision.data)},${revision.label}) on conflict do nothing`;
                }
            }
        await tx `insert into cms_records(id,module,status,draft,live,import_batch) values ('settings','settings','published',${tx.json(state.settings)},${tx.json(state.settings)},${batch}) on conflict do nothing`;
        await tx `insert into cms_publications(id,record_id,record_version,snapshot) values ('seed:settings','settings',1,${tx.json(state.settings)}) on conflict do nothing`;
        await tx `update cms_records set live_id='seed:settings' where id='settings' and live_id is null`;
        for (const r of state.redirects)
            await tx `insert into cms_redirects(from_path,to_path) values (${`/clubmuur/${r.from}`},${`/clubmuur/${r.to}`}) on conflict do nothing`;
        for (const a of state.albums)
            for (const [i, id] of a.mediaIds.entries())
                await tx `insert into cms_album_media(album_id,media_id,position) values (${a.id},${id},${i}) on conflict do nothing`;
        await tx`insert into cms_grants(role_id,module,action) select role_id,'stories',action from cms_grants where module='news' on conflict do nothing`;
        await rebuildReferences(tx);
        const report = { source: 'Sites v44 seed', environment: env().APP_ENV, counts: Object.fromEntries(modules.map(k => [k, state[k].length])), demoAccountsImported: 0, demoSubmissionsImported: 0, userBrowserDataImported: false };
        await tx `insert into cms_imports(id,checksum,archive_key,report) values (${batch},${checksum},${`imports/seed-${checksum}.json`},${tx.json(report)})`;
        console.log(JSON.stringify(report));
    });
    console.log(JSON.stringify({archive:await seedClubArchive()}));
}
finally {
    await sql.end();
}

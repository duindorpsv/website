import {matchPreviewDraftSchema,matchPreviewScheduleSchema,validateMatchPreview} from '../cms/match-preview';
import {validateMatchPreviewWrite} from './match-previews';
import {bumpPlanningRevision} from './planning-revision';
import {committeeSchema,locationSchema,activitySchema,addPlanningDays} from '../cms/planning';
import {heroSliderSchema} from '../cms/hero-slider';
import {sportlinkSettingsSchema} from '../cms/sportlink-settings';
import {validatePlanningWrite,syncPlanningIndexes,activityAuthorization,publicActivity} from './planning';
import {heroPageOptions,resolveHeroPage} from '../cms/hero-pages';
import {equalContent} from '../cms/compare';
import {importedNewsContent} from '../cms/import-publication';
import {formDefinitionErrors} from '../cms/form-definition';
import {trainingSchema} from '../cms/training';
import {agendaSchema} from '../club-agenda';
import {validHeroPortraits} from '../cms/hero-portraits';
import {validHeroPhotoIds} from '../clubmuur-layouts';
import {currentClubLinks} from '../current-club-links';
import {syncHomepage,moveChildPaths} from './publication-effects';
import {heroNewsRows} from './hero-news';
import { clubNavigationDestinations,validClubNavigation } from '../clubmuur-navigation';
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
export const contentModules = ['matchPreviews','articles', 'pages', 'people', 'media', 'folders', 'albums', 'forms', 'documents', 'settings', 'navigation', 'hero', 'heroPhotos', 'agenda', 'training', 'narrowcasting', 'patterns','committees','locations','activities','heroSlider','sportlinkSettings'] as const;
export type ContentModule = typeof contentModules[number];
export type RecordRow = {
    id: string;
    imported?: boolean;
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
export function emptyState(): CmsState { const s = createCmsSeed(); for (const key of ['matchPreviews','articles', 'pages', 'people', 'media', 'folders', 'albums', 'departments', 'forms', 'submissions', 'roles', 'members', 'documents', 'redirects', 'audit'] as const)
    s[key] = [] as never; return s; }
const alias: Record<string, string> = { matchPreviews:'news',articles: 'news', albums: 'media', folders: 'media', documents: 'pages', navigation: 'pages', hero: 'pages', heroPhotos: 'pages', agenda: 'pages', training:'pages', narrowcasting: 'pages',patterns:'pages',committees:'people',locations:'settings',activities:'pages',heroSlider:'pages',sportlinkSettings:'settings' };
export function permissionModule(module: string,data?:Record<string,any>) { return module==='articles'&&data?.contentType==='story'?'stories':alias[module] || module; }
export function scope(row: RecordRow) { return { teamId: row.module==='activities'?row.draft.teamIds?.[0]||'':row.team_id || '', departmentId: row.department_id || '', kind: String(row.draft.kind || '') }; }
export function recordOutput(row: RecordRow, revisions: unknown[] = []) { const data: Record<string, any> = { ...row.draft, id: row.id, version: row.version, ...(row.module==='articles'?{imported:!!row.imported}:{}) }; if (['articles', 'pages','matchPreviews'].includes(row.module))
    Object.assign(data, { status: row.status, scheduledAt: (row as any).scheduled_at || row.draft.scheduledAt || '',...(row.module==='matchPreviews'?{publishAt:(row as any).scheduled_at||''}:{}), updatedAt: new Date(row.updated_at).toISOString(), live: row.live || undefined, revisions });
else
    Object.assign(data, { published: !!row.live, live: row.live || undefined }); if (row.module === 'media' && String(data.src).startsWith('/api/media/'))
    data.src = `/api/cms/media/${row.id}/file`; if (row.deleted_at)
    Object.assign(data, { deletedAt: row.deleted_at }); return data; }
// Read the complete register independently from the mixed-content bootstrap.
// Each query remains bounded; stable IDs allow subsequent import batches to be
// found without imposing another silent total cap on the people collection.
async function peopleRecords(sql:any,publicOnly:boolean):Promise<RecordRow[]>{
 const records:RecordRow[]=[];let cursor='';
 while(true){const batch:RecordRow[]=await sql`select * from cms_records where module='people' and id>${cursor} and ${publicOnly?sql`live is not null and deleted_at is null`:sql`true`} order by id limit 1000`;records.push(...batch);if(batch.length<1000)return records;cursor=batch[batch.length-1].id;}
}
function locationChoice(row:RecordRow){const value=row.draft;return {id:row.id,name:value.name,type:value.type,capacity:value.capacity,active:value.active,color:value.color,parentId:value.parentId||'',description:'',sportlinkFieldName:'',published:false,...(row.deleted_at?{deletedAt:new Date(row.deleted_at).toISOString()}: {})};}
export async function loadState(publicOnly = false, p?: Principal,transaction?:any,requiredIds:string[]=[]): Promise<{
    state: CmsState;
    versions: Record<string, number>;
}> {
    const sql:ReturnType<typeof sqlClient> = transaction||sqlClient(), state = emptyState(), versions: Record<string, number> = {};
    const rows = await sql<RecordRow[]> `with plans as materialized (select distinct on (payload->>'id') payload->>'id' as record_id,run_at from cms_jobs where kind='publish' and status in ('pending','processing') order by payload->>'id',run_at) select cms_records.*,i.record_id is not null as imported,plans.run_at as scheduled_at from cms_records left join cms_news_import_identities i on i.record_id=cms_records.id left join plans on plans.record_id=cms_records.id where ${publicOnly ? sql `live is not null and deleted_at is null` : sql `true`} and ${!publicOnly&&p?sql`(module!='media' or id in (select id from cms_records where module='media' order by updated_at desc,id limit 100) or id in (select target_id from cms_references))`:sql`true`} order by case when deleted_at is not null then 3 when module in ('settings','navigation','hero','heroPhotos','agenda','training') then 0 when module!='media' then 1 else 2 end,updated_at desc,id limit 1500`;
    const requested=requiredIds.length?await sql<RecordRow[]>`select *,exists(select 1 from cms_news_import_identities i where i.record_id=cms_records.id) as imported from cms_records where id in ${sql([...new Set(requiredIds)])}`:[];
    const planningRows=await sql<RecordRow[]>`select * from cms_records where module in ('committees','locations','activities') and ${publicOnly?sql`live is not null and deleted_at is null`:sql`true`} order by updated_at desc,id limit 22000`;
    const peopleRows=await peopleRecords(sql,publicOnly);
    // People and planning dependencies must survive the mixed-content bootstrap limit too.
    const refs=[...new Set([...rows.filter(row=>row.module!=='media'&&!row.deleted_at),...planningRows,...peopleRows,...requested].flatMap(row=>referencesIn(publicOnly?row.live:row.draft)))].filter(id=>!rows.some(row=>row.id===id)&&!requested.some(row=>row.id===id));
    const related=refs.length?await sql<RecordRow[]>`select *,exists(select 1 from cms_news_import_identities i where i.record_id=cms_records.id) as imported from cms_records where id in ${sql(refs)} and ${publicOnly?sql`live is not null and deleted_at is null`:sql`true`}`:[];
    const records=[...new Map([...rows,...requested,...related,...planningRows,...peopleRows,...(publicOnly?await heroNewsRows(sql):[])].map(row=>[row.id,row])).values()];
    const planningPublicLocations=publicOnly?(await sql`select id,draft->>'name' as name from cms_records where module='locations' and deleted_at is null`):[];
    const locationChoices=!!p&&!publicOnly&&(p.teamScoped?p.teams.some(teamId=>has(p,'pages','read',{teamId})):has(p,'pages','read'));
    for (const row of records) {
        if(row.module==='locations'&&locationChoices&&!has(p!,'settings','read',scope(row))){state.planning.locations.push(locationChoice(row));versions[row.id]=row.version;continue;}
        const fallbackPublic=!publicOnly&&!!p&&!has(p,permissionModule(row.module,row.draft),'read',scope(row));if(fallbackPublic&&(!row.live||row.deleted_at))continue;
        versions[row.id] = row.version;
        if(row.module==='sportlinkSettings')continue;
        if(['committees','locations','activities'].includes(row.module)){
            if(!publicOnly&&p&&row.module==='activities'){try{activityAuthorization(p,'read',row.draft);}catch{continue;}}
            if(publicOnly||fallbackPublic){
                if(row.module==='activities'&&row.live?.public&&row.live.status==='planned'&&row.draft.status!=='cancelled'){const locations=publicOnly?planningPublicLocations:records.filter(item=>item.module==='locations'&&!item.deleted_at).map(item=>({...item.draft,id:item.id}));state.planning.activities.push({...publicActivity({...row.live,id:row.id},locations),public:true,published:true,status:'planned'} as any);}
                if(row.module==='committees'&&row.live?.active){const allowed=new Set(records.filter(item=>item.module==='people'&&item.live&&!item.deleted_at).map(item=>item.id));state.planning.committees.push({...row.live,id:row.id,published:true,members:(row.live.members||[]).filter((member:any)=>allowed.has(member.personId))} as any);}
            }else (state.planning as any)[row.module].push(recordOutput(row));
            continue;
        }
        if(row.module==='heroSlider'){state.appearance||={};const slider={...(publicOnly||fallbackPublic?row.live:row.draft)};delete slider.published;delete slider.id;state.appearance.heroSlider=slider as any;continue;}
        if (['navigation', 'hero', 'heroPhotos', 'agenda', 'training'].includes(row.module)) {
            state.appearance ||= {};
            (state.appearance as any)[row.module] = (publicOnly||fallbackPublic ? row.live : row.draft)?.items;
            if(row.module==='heroPhotos')state.appearance.heroPortraits=(publicOnly||fallbackPublic?row.live:row.draft)?.portraits||[];
            continue;
        }
        if (row.module === 'settings') {
            if (row.live || !publicOnly)
                state.settings = (publicOnly||fallbackPublic ? row.live : row.draft) as unknown as CmsState['settings'];
            continue;
        }
        if(publicOnly&&row.module==='matchPreviews')continue;
        if (!['matchPreviews','articles', 'pages', 'people', 'media', 'folders', 'albums', 'forms', 'documents'].includes(row.module))
            continue;
        const data: Record<string, any> = publicOnly||fallbackPublic ? { ...row.live, id: row.id } : recordOutput(row);
        if ((publicOnly||fallbackPublic) && ['articles', 'pages','matchPreviews'].includes(row.module))
            Object.assign(data, { live: row.live, status: 'published', revisions: [], updatedAt: new Date(row.updated_at).toISOString() });
        if((publicOnly||fallbackPublic)&&row.module==='people'){delete data.backofficeUserId;delete data.sportlinkId;}
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
    if(publicOnly)await projectPublicPlanning(sql,state);
    return { state:publicOnly?currentClubLinks(state,state.redirects):state, versions };
}
function pathFor(module: string, data: Record<string, any>): string | null { if (!data.slug)return null; if (module === 'pages')
    return `/clubmuur/${data.slug}`; if (module === 'articles')
    return `/clubmuur/${data.contentType === 'story' ? 'verhalen' : 'nieuws'}/${data.slug}`; if (module === 'albums')
    return `/clubmuur/media/fotos/${data.slug}`; return null; }
export function validateCandidate(module: ContentModule, value: Record<string, any>):Record<string,any> {
    if (JSON.stringify(value).length > 1500000)
        throw new CmsError('too-large', 'Inhoud is te groot.', 413);
    const clean = structuredClone(value);
    for (const key of ['live', 'revisions', 'version', 'updatedAt', 'deletedAt', 'scheduledAt'])
        delete clean[key];
    // Settings use a command ID, but their singleton content has no ID field.
    if (module === 'settings')
        delete clean.id;
    if(module==='matchPreviews'){for(const key of ['status','publishAt','published'])delete clean[key];const parsed=matchPreviewDraftSchema.safeParse(clean);if(!parsed.success)throw new CmsError('match-preview','Controleer de velden van de vooruitblik.',422,parsed.error.issues);return parsed.data;}
    if(module==='articles')delete clean.imported;
    if(module==='people'&&typeof clean.sportlinkId==='string')clean.sportlinkId=clean.sportlinkId.trim().toUpperCase();
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
    if (module === 'heroPhotos' || module === 'agenda' || module==='training') {
        delete clean.id;
        delete clean.published;
        if (Object.keys(clean).some(key=>key!=='items'&&(module!=='heroPhotos'||key!=='portraits')))throw new CmsError('unknown-field','Gebruik alleen de items van dit onderdeel.',422);
        if(module==='heroPhotos'){
            if(!validHeroPortraits(clean.portraits||[])||!validHeroPhotoIds(clean.items,clean.portraits||[]))throw new CmsError('hero-photos','Selecteer minimaal één geldige spelersfoto.',422);
            return {items:clean.items,portraits:clean.portraits||[]};
        }
        const result=(module==='training'?trainingSchema:agendaSchema).safeParse(clean.items);
        if(!result.success)throw new CmsError('agenda',module==='training'?'Controleer teams, dagen, tijden en velden.':'Controleer titel, datum, tijd en beschrijving van de activiteiten.',422,result.error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message})));
        return {items:result.data};
    }
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
    if(['committees','locations','activities','heroSlider','sportlinkSettings'].includes(module)){
        if(module==='sportlinkSettings'){delete clean.id;delete clean.published;}
        if(module==='heroSlider'){delete clean.id;delete clean.published;}
        const schema=module==='committees'?committeeSchema:module==='locations'?locationSchema:module==='activities'?activitySchema:module==='heroSlider'?heroSliderSchema:sportlinkSettingsSchema;
        const parsed=schema.safeParse(clean);if(!parsed.success)throw new CmsError('validation','Controleer de ingevulde velden.',422,parsed.error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message})));return parsed.data as Record<string,any>;
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
    if(module==='articles')for(const key of ['publishedAt','featuredUntil'])if(clean[key])clean[key]=new Date(clean[key]).toISOString();
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
async function prepareImportedMedia(tx:any,p:Principal,changes:Change[],requestId:string){
    const selected=changes.filter(change=>change.module==='articles'&&change.action==='publish');
    const imported=new Set<string>(),versions:Record<string,number>={};
    if(!selected.length)return {imported,versions};
    const origins=await tx`select i.record_id,i.provenance,r.draft from cms_news_import_identities i join cms_records r on r.id=i.record_id where i.record_id in ${tx(selected.map(change=>change.id))}`;
    const eligible=new Map<string,string>();
    for(const origin of origins){
        imported.add(origin.record_id);
        const data=selected.find(change=>change.id===origin.record_id)?.data||origin.draft;
        if(data.contentType!=='news')continue;
        const refs=new Set(referencesIn(data));
        for(const asset of origin.provenance?.media||[])if(typeof asset.mediaId==='string'&&refs.has(asset.mediaId))eligible.set(asset.mediaId,data.title);
    }
    if(!eligible.size)return {imported,versions};
    const assets:RecordRow[]=await tx`select * from cms_records where id in ${tx([...eligible.keys()])} and module in ('media','documents') and live is null and deleted_at is null order by id`;
    if(assets.length){
        const commands=assets.map((asset:RecordRow)=>({module:asset.module,id:asset.id,expectedVersion:asset.version,action:'publish' as const,data:{...asset.draft,...(asset.module==='media'&&!asset.draft.alt?.trim()?{alt:`Beeld bij: ${eligible.get(asset.id)}`}:{})}}));
        Object.assign(versions,await mutate(p,commands,crypto.randomUUID(),requestId,tx));
    }
    return {imported,versions};
}
export async function mutate(p: Principal, changes: Change[], operationId: string, requestId: string, transaction?:any,integration?:{sportlink?:boolean}) {
    const sql = sqlClient();
    const perform=async (tx:any) => {
        const [operation] = await tx `select response from cms_operations where id=${operationId} and actor_id=${p.id}`;
        if (operation)
            return operation.response;
        // Serializes route reservations/parent changes and cross-record publication.
        await tx `select pg_advisory_xact_lock(736402)`;
        const [replayed]=await tx`select response from cms_operations where id=${operationId} and actor_id=${p.id}`;if(replayed)return replayed.response;
        const prepared=await prepareImportedMedia(tx,p,changes,requestId);
        const required=changes.flatMap(change=>[change.id,...referencesIn(change.data)]);
        const state = (await loadState(false,undefined,tx,required)).state;
        const output: Record<string, number> = {...prepared.versions};
        const homepageChanges: {id:string;before:any;live:any}[] = [];
        for (const change of changes) {
            if (!contentModules.includes(change.module))
                throw new CmsError('module', 'Onbekende module.');
            if((change.module==='heroPhotos'&&change.id!=='site-hero-photos')||(change.module==='agenda'&&change.id!=='site-agenda'))throw new CmsError('configuration-id','Ongeldige website-instelling.',422);
            if(['agenda','training'].includes(change.module)&&change.action!=='unpublish'&&(await tx`select source_id from cms_planning_legacy where source_id=${change.id} limit 1`).length)throw new CmsError('planning-migrated','Dit onderdeel wordt centraal gepland. Beheer nieuwe wijzigingen in Jaaragenda of Trainingen en neem resterende oude momenten via de migratiereview over.',409);
            if(change.module==='sportlinkSettings'&&(change.id!=='site-sportlink'||change.action!=='save'))throw new CmsError('private-settings','Sportlink-instellingen zijn privé en kunnen alleen worden bewaard.',422);
            if(change.module==='heroSlider'&&change.id!=='site-hero-slider')throw new CmsError('configuration-id','Ongeldige hero-sliderinstelling.',422);
            const [old]:RecordRow[] = await tx `select * from cms_records where id=${change.id} for update`;
            if (old && old.module !== change.module)
                throw new CmsError('module', 'Het record behoort aan een andere module.');
            if ((old?.version || 0) !== change.expectedVersion)
                throw new CmsError('conflict', 'Deze inhoud is ondertussen gewijzigd. Je werkversie blijft bewaard; laad de serverversie opnieuw.', 409, { id: change.id, expected: change.expectedVersion, actual: old?.version || 0 });
            const module = permissionModule(change.module,old?.draft||change.data), action = change.action === 'publish' || change.action === 'unpublish' || change.action === 'schedule' || change.action === 'cancelSchedule' ? 'publish' : change.action === 'trash' ? 'delete' : old ? 'update' : 'create';
            if(change.module==='heroPhotos'&&change.action==='publish'&&change.data?.portraits===undefined&&!equalContent(old?.draft.portraits||[],old?.live?.portraits||[]))throw new CmsError('conflict','De portretinstellingen bevatten een nieuwere werkversie. Laad de serverversie en publiceer de volledige selectie.',409,{id:change.id});
            const candidate = change.data ? validateCandidate(change.module, { ...change.data,...(change.module==='heroPhotos'&&change.data.portraits===undefined?{portraits:old?.draft.portraits||[]}:{}), id: change.id }) : structuredClone(old?.draft || {});
            if(prepared.imported.has(change.id)&&candidate.contentType==='news'&&change.action==='publish')Object.assign(candidate,importedNewsContent(candidate as any));
            if(change.module==='pages'){let id=candidate.parentId;const visited=new Set([change.id]);while(id){if(visited.has(id))throw new CmsError('parent-cycle','De paginahiërarchie bevat een kringverwijzing.',422);visited.add(id);const [parent]=await tx`select draft from cms_records where id=${id} and module='pages' and deleted_at is null`;if(!parent)throw new CmsError('parent-missing','Kies een bestaande bovenliggende pagina.',422);id=parent.draft.parentId;}}
            if(candidate.authorId&&!(await tx`select id from cms_records where id=${candidate.authorId} and module='people' and deleted_at is null`).length)throw new CmsError('author','Kies een bestaande persoon als auteur.',422);
            if (!old && !change.data)
                throw new CmsError('missing', 'Inhoud ontbreekt.');
            const newScope = { teamId: change.module==='activities'?candidate.teamIds?.[0]||'':candidate.teamId || '', departmentId: candidate.departmentId || '', kind: candidate.kind || '' };
            authorize(p, module, action, old ? scope(old) : newScope);
            if (old)
                authorize(p, permissionModule(change.module,candidate), action, newScope);
            if(change.module==='matchPreviews'&&change.data&&(!old||!equalContent(candidate,old.draft)))authorize(p,'news',old?'update':'create',newScope);
            if(change.module==='matchPreviews')await validateMatchPreviewWrite(tx,candidate,old?.draft,change.action);
            await validatePlanningWrite(tx,p,change.module,change.id,candidate,old,change.action,!!integration?.sportlink);
            if (old?.deleted_at && !['restore', 'trash'].includes(change.action))
                throw new CmsError('trashed', 'Herstel dit record eerst.');
            if (change.action === 'trash' && old?.live)
                authorize(p, module, 'publish', scope(old));
            // People are soft-deleted without erasing historical bylines or memberships.
            if (change.action === 'trash'&&change.module!=='people') {
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
            if (change.action === 'schedule' && !['articles','pages','matchPreviews'].includes(change.module)) throw new CmsError('schedule-module','Dit onderdeel kan niet worden ingepland.',422);
            if(change.module==='matchPreviews'&&change.action==='schedule'&&!matchPreviewScheduleSchema.safeParse(change.scheduledAt).success)throw new CmsError('schedule','Gebruik een geldige UTC-publicatiedatum. Zet de Nederlandse invoertijd eerst om.',422);
            let sourcePublication=false;
            if(integration?.sportlink&&change.module==='activities'&&change.action==='save'&&old?.live){
                const patched={...old.live};for(const key of ['date','startTime','endTime','type','title','status','source','sourceId','sourceData'])patched[key]=candidate[key];
                const previousSource:string[]=old.live.sourceData?.locationIds||[];patched.locationIds=[...new Set([...(old.live.locationIds||[]).filter((id:string)=>!previousSource.includes(id)),...(candidate.sourceData?.locationIds||[])])];
                if(!equalContent(patched,old.live)){live=patched;sourcePublication=true;}
            }
            let planned: Record<string,any> | null = null;
            if (change.action === 'publish' || change.action === 'schedule') {
                if(change.module==='hero'){
                    const targets=[...new Set<string>(candidate.items.filter((card:any)=>card.kind==='page').map((card:any)=>resolveHeroPage(card.target,state.redirects)))];
                    if(targets.length){
                        const rows=await tx`select draft->>'slug' as slug,live,deleted_at from cms_records where module='pages' and (draft->>'slug' in ${tx(targets)} or live->>'slug' in ${tx(targets)})`;
                        const available=new Set(heroPageOptions(rows.map((row:any)=>({slug:row.slug,live:row.live,deletedAt:row.deleted_at}))).map(page=>page.value));
                        for(const card of candidate.items)if(card.kind==='page'){
                            const target=resolveHeroPage(card.target,state.redirects);
                            if(!available.has(target))throw new CmsError('hero-destination','Publiceer eerst de bestemmingspagina van ‘'+card.title+'’.',422);
                            card.target=target;
                        }
                    }
                }
                if(change.module==='navigation'){const known=new Set(['/clubmuur',...clubNavigationDestinations.map(item=>item.href.split(/[?#]/)[0]),...state.pages.filter(page=>page.live&&!page.deletedAt).map(page=>'/clubmuur/'+page.live!.slug)]);for(const group of candidate.items.filter((group:any)=>group.enabled!==false))for(const link of [group,...group.children||[]])if(link.enabled!==false&&!known.has(link.href.split(/[?#]/)[0]))throw new CmsError('navigation-destination','Publiceer eerst de bestemmingspagina van ‘'+link.label+'’.',422);}
                if(change.module==='matchPreviews'){const issues=validateMatchPreview(candidate as any);if(issues.length)throw new CmsError('publication-invalid','Publicatie is nog niet mogelijk.',422,issues);}
                if(change.module==='forms'){const issues=formDefinitionErrors(candidate as any);const [department]=await tx`select id from cms_departments where id=${candidate.departmentId} and active=true`;if(!department)issues.push('Kies een actieve afdeling met ontvangers.');if(issues.length)throw new CmsError('form-definition','Controleer de formulierinstellingen.',422,issues);}
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
                    if(change.module==='articles'&&change.action==='publish')Object.assign(candidate,live);
                }
                else
                    live = { ...candidate, published: true };
                const refs = ['activities','committees'].includes(change.module)?[]:referencesIn(live);
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
            await tx `insert into cms_records(id,module,title,slug,content_type,story_format,author_id,parent_id,season,category,team_id,department_id,status,version,draft,live,deleted_at) values (${change.id},${change.module},${candidate.title || candidate.name || ''},${candidate.slug || null},${candidate.contentType || null},${candidate.storyFormat || null},${candidate.authorId||null},${candidate.parentId||null},${candidate.season||null},${candidate.category||null},${change.module==='activities'?candidate.teamIds?.[0]||null:candidate.teamId || null},${candidate.departmentId || null},${status},${version},${tx.json(candidate)},${live ? tx.json(live) : null},${deletedAt?.toISOString()||null}) on conflict(id) do update set title=excluded.title,slug=excluded.slug,content_type=excluded.content_type,story_format=excluded.story_format,author_id=excluded.author_id,parent_id=excluded.parent_id,season=excluded.season,category=excluded.category,team_id=excluded.team_id,department_id=excluded.department_id,status=excluded.status,version=excluded.version,draft=excluded.draft,live=excluded.live,deleted_at=excluded.deleted_at,updated_at=now()`;
            if (change.action === 'publish'||sourcePublication) {
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
            if(['publish','unpublish','trash'].includes(change.action)&&change.module==='articles')homepageChanges.push({id:change.id,before:old?.live,live});
            if(change.action==='publish'&&change.module==='articles'&&candidate.contentType==='news'){
                const [origin]=await tx`select provenance->>'sourceUrl' as url from cms_news_import_identities where record_id=${change.id}`;
                if(origin?.url){let url:URL|null=null;try{url=new URL(origin.url);}catch{}if(url&&url.hostname.replace(/^www\./,'')==='duindorpsv.nl'&&/^\/1\/\d+\//.test(url.pathname))await tx`insert into cms_redirects(from_path,to_path,record_id) values (${url.pathname},${livePath!},${change.id}) on conflict(from_path) do nothing`;}
            }
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
            await syncPlanningIndexes(tx,change.module,change.id,candidate,!!deletedAt);
            if(['activities','locations','committees','sportlinkSettings'].includes(change.module))await bumpPlanningRevision(tx);
            if(change.module==='activities'&&change.action==='publish'&&candidate.public){const mappings=await tx`select source_id,legacy_id,report from cms_planning_legacy where activity_id=${change.id} or report->'activityIds' ? ${change.id}`;for(const mapping of mappings){const ids=mapping.report.activityIds||[change.id];const [count]=await tx`select count(*)::int as n from cms_records where id in ${tx(ids)} and live is not null and coalesce((live->>'public')::boolean,false)=true`;if(count.n===ids.length)await tx`update cms_planning_legacy set report=report || '{"activatedPublic":true}'::jsonb where source_id=${mapping.source_id} and legacy_id=${mapping.legacy_id}`;}}
            await tx `insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${p.id},${change.action},${change.id},${requestId})`;
            if (['publish', 'unpublish', 'trash'].includes(change.action)||sourcePublication)
                await tx `insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${`${operationId}:${change.id}:cache`},'cache',${tx.json({ id: change.id })})`;
            if (change.action === 'schedule')
                await tx `insert into cms_jobs(id,operation_id,kind,payload,run_at) values (${crypto.randomUUID()},${`${operationId}:${change.id}:schedule`},'publish',${tx.json({ id: change.id, module: change.module, version, actorId: p.id, draft: planned })},${new Date(change.scheduledAt!).toISOString()})`;
            output[change.id] = version;
        }
        // Apply derived selections after explicit commands, so a publication cannot
        // invalidate the settings version supplied in the very same transaction.
        for(const change of homepageChanges){
            const version=await syncHomepage(tx,change.id,change.before,change.live,p.id);
            if(version!==undefined)output.settings=version;
        }
        await tx `insert into cms_operations(id,actor_id,response) values (${operationId},${p.id},${tx.json(output)})`;
        return output;
    };
    return transaction?perform(transaction):sql.begin(perform);
}

async function projectPublicPlanning(sql:any,state:CmsState){
 const migrated=await sql`select source_id,legacy_id,activity_id,report from cms_planning_legacy`;
 const hidden=new Set(migrated.filter((row:any)=>row.source_id==='site-agenda'&&row.report?.activatedPublic).map((row:any)=>row.legacy_id));
 const oldAgenda=(state.appearance?.agenda||[]).filter(item=>!hidden.has(item.id));
 const items=state.planning.activities.map((item:any)=>({id:item.id,title:item.title,date:item.date,time:item.startTime,endTime:item.endTime,description:item.description,location:item.location,type:item.type}));
 state.appearance||={};state.appearance.agenda=[...oldAgenda,...items].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 const legacyTraining=state.appearance.training||[];
 const hiddenTraining=new Set(migrated.filter((row:any)=>row.source_id==='site-training'&&row.report?.activatedPublic).map((row:any)=>row.legacy_id));
 const kept=legacyTraining.map((team,index)=>({...team,sessions:team.sessions.filter((_,offset)=>!hiddenTraining.has(index+':'+offset))})).filter(team=>team.sessions.length);
 const from=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 // Only the next seven calendar days form the compatible weekly view; exceptions remain concrete dates.
 const rows=await sql`select id,live from cms_records where module='activities' and live is not null and deleted_at is null and live->>'type'='training' and (live->>'public')::boolean=true and live->>'status'='planned' and draft->>'status'='planned' and live->>'date'>=${from} and live->>'date'<${addPlanningDays(from,7)}`;
 const locations=await sql`select id,draft->>'name' as name from cms_records where module='locations' and deleted_at is null`;
 for(const row of rows)for(const teamId of row.live.teamIds||[]){const name=state.settings.teams.find(team=>team.id===teamId)?.name;if(!name)continue;let team=kept.find(team=>team.teamLabel===name);if(!team){team={teamLabel:name,sessions:[]};kept.push(team);}const day=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'long'}).format(new Date(row.live.date+'T12:00:00Z'));const session={day:day.charAt(0).toUpperCase()+day.slice(1),start:row.live.startTime,end:row.live.endTime,field:(row.live.locationIds||[]).map((id:string)=>locations.find((location:any)=>location.id===id)?.name).filter(Boolean).join(', ')};if(!team.sessions.some(value=>JSON.stringify(value)===JSON.stringify(session)))team.sessions.push(session);}
 state.appearance.training=kept;
}

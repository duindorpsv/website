import sharp, { type Metadata } from 'sharp';
import { createHash } from 'node:crypto';
import { sqlClient } from '../../db/index';
import { putObject, getObject, deleteObject } from './storage';
import { authorize, type Principal } from './permissions';
import { CmsError } from './errors';
export async function uploadMedia(p: Principal, file: File, metadata: {
    teamId: string;
    season: string;
    folderId: string;
}) {
    authorize(p, 'media', 'create', { teamId: metadata.teamId });
    if (file.size > 12000000 || !file.size)
        throw new CmsError('file-size', 'De foto mag maximaal 12 MB zijn.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let info: Metadata;
    try {
        info = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
    }
    catch {
        throw new CmsError('file-type', 'Dit bestand is geen geldige afbeelding.', 422);
    }
    if (!['jpeg', 'png', 'webp', 'avif'].includes(info.format || '') || info.pages && info.pages > 1)
        throw new CmsError('file-type', 'Gebruik een niet-geanimeerde JPG, PNG, WebP of AVIF.', 422);
    const id = crypto.randomUUID(), key = `originals/${id}.${info.format}`;
    await putObject(key, bytes, `image/${info.format}`);
    const draft = { id, name: file.name.slice(0, 180), src: `/api/media/${id}`, folderId: metadata.folderId, alt: '', caption: '', credit: '', teamId: metadata.teamId, season: metadata.season, published: false, featured: false, order: 0, focusX: 50, focusY: 50, createdAt: new Date().toISOString() };
    try {
        await sqlClient().begin(async (tx) => { await tx `insert into cms_records(id,module,title,team_id,draft) values (${id},'media',${draft.name},${draft.teamId || null},${tx.json(draft)})`; await tx `insert into cms_media_objects(id,storage_key,checksum,mime,bytes,width,height,state) values (${id},${key},${createHash('sha256').update(bytes).digest('hex')},${`image/${info.format}`},${file.size},${info.width || 0},${info.height || 0},'processing')`; await tx `insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${`image:${id}`},'image',${tx.json({ id })})`; });
    }
    catch (e) {
        await deleteObject(key);
        throw e;
    }
    return draft;
}
export async function processImage(id: string) { const sql = sqlClient(), [object] = await sql `select * from cms_media_objects where id=${id}`; if (!object)
    return; const bytes = await getObject(object.storage_key); const variants = []; for (const width of [640, 1280, 1920]) {
    const key = `variants/${id}/${width}.webp`;
    const result = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await putObject(key, result, 'image/webp');
    variants.push({ key, width, mime: 'image/webp' });
} await sql `update cms_media_objects set state='ready',variants=${sql.json(variants)} where id=${id}`; }
export async function mediaResponse(id: string, p?: Principal, original = false) { const sql = sqlClient(), [record] = await sql `select r.*,o.storage_key,o.variants,o.mime,o.state from cms_records r join cms_media_objects o on o.id=r.id where r.id=${id}`; if (!record || record.module!=='media'||record.deleted_at)
    throw new CmsError('missing', 'Foto niet beschikbaar.', 404); if (!record.live) {
    if (!p)
        throw new CmsError('missing', 'Foto niet beschikbaar.', 404);
    authorize(p, 'media', 'read', { teamId: record.team_id });
} if (original) {
    if (!p)
        throw new CmsError('forbidden', 'Originelen vereisen toegang.', 403);
    authorize(p, 'media', 'read', { teamId: record.team_id });
} const variant = record.variants?.[1] || record.variants?.[0]; if (!original && !variant)
    throw new CmsError('processing', 'Foto wordt verwerkt.', 503); const key = original ? record.storage_key : variant.key; const bytes = await getObject(key); return new Response(Buffer.from(bytes), { headers: { 'Content-Type': original ? record.mime : 'image/webp', 'Cache-Control': original || !record.live ? 'private, no-store' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', ...(original ? { 'Content-Disposition': 'attachment; filename="origineel"' } : {}) } }); }

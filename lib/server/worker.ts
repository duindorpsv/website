import {deliverEmailCode} from './auth';
import {syncHomepage,moveChildPaths} from './publication-effects';
import {has,type Principal} from './permissions';
import {permissionModule} from './records';
import {settleLegacyNewsletterJob} from './newsletter';
import { referencesIn } from '../cms/layout/document';
import { sqlClient } from '../../db/index';
import { processImage } from './media';
import { sendMail } from './mail';
import { storageReady } from './storage';
import { env } from './env';
import {listObjects,deleteObject} from './storage';
import {analyzeNewsSession,processNewsBatch,failNewsJob,cleanExpiredNews} from './news-imports';
import {CmsError} from './errors';
export async function runOnce(workerId = crypto.randomUUID()) {
    const sql = sqlClient();
    await storageReady();
    await sql `insert into cms_heartbeats(id,at) values ('worker',now()) on conflict(id) do update set at=now()`;
    const claimed = await sql `update cms_jobs set status='processing',lease_owner=${workerId},lease_until=now()+interval '60 seconds',attempts=attempts+1 where id=(select id from cms_jobs where (status='pending' or (status='processing' and lease_until<now())) and run_at<=now() and attempts<max_attempts order by run_at,id for update skip locked limit 1) returning *`;
    const job = claimed[0];
    if (!job)
        return false;
    let status = 'done';
    const renewal=setInterval(()=>{void sql`update cms_jobs set lease_until=now()+interval '60 seconds' where id=${job.id} and lease_owner=${workerId} and status='processing'`.catch(()=>{});},20000);
    try {
        if(['news-analyze','news-import'].includes(job.kind)){
            try{if(job.kind==='news-analyze')await analyzeNewsSession(job.payload.sessionId);else await processNewsBatch(job.payload.sessionId,job.payload.run,job.payload.batch);}
            catch(e){if(e instanceof CmsError)await failNewsJob(job.payload.sessionId,e.message);else throw e;}
        }
        else if(['newsletter-provider','newsletter-unsubscribe'].includes(job.kind)){await settleLegacyNewsletterJob(job.payload.id);}
        else if (job.kind === 'image')
            await processImage(job.payload.id);
        else if (job.kind === 'auth-code-mail')
            await deliverEmailCode(job.payload, `<${job.operation_id}@duindorp.invalid>`);
        else if (job.kind === 'mail')
            await sendMail({ ...job.payload, messageId: `<${job.operation_id}@duindorp.invalid>` });
        else if (job.kind === 'submission-mail') {
            const [s] = await sql `select * from cms_submissions where id=${job.payload.submissionId}`;
            if (s) {
                const d = s.snapshot.definition;
                await sendMail({ to: d.destination, subject: `${s.snapshot.formName} — nieuwe inzending`, text: s.snapshot.message, messageId: `<${job.operation_id}@duindorp.invalid>`, replyTo: s.snapshot.email || undefined });
                if (s.snapshot.email && d.confirmation)
                    await sendMail({ to: [s.snapshot.email], subject: `Duindorp SV — ${s.snapshot.formName} ontvangen`, text: d.confirmation, messageId: `<confirmation-${job.operation_id}@duindorp.invalid>` });
                await sql `update cms_submissions set delivery_status='sent' where id=${s.id}`;
            }
        }
        else if (job.kind === 'sportlink-registration') {
            // Club.Data Service grants read access only. No invented write endpoint.
            await sql `update cms_submissions set integration_status='manual-follow-up' where id=${job.payload.submissionId} and integration_status!='processed'`;
            status = 'waiting';
        }
        else if (job.kind === 'publish') {
            await sql.begin(async (tx) => {
                await tx `select pg_advisory_xact_lock(736402)`;
                const [record] = await tx `select * from cms_records where id=${job.payload.id} for update`;
                if (!record || record.deleted_at || record.status !== 'scheduled')
                    return;
                const frozen = job.payload.draft;
                const [member] = await tx`select m.*,r.team_scoped,u.two_factor_enabled from cms_memberships m join cms_roles r on r.id=m.role_id join auth_user u on u.id=m.user_id where m.user_id=${job.payload.actorId} and m.active=true and coalesce(u.banned,false)=false`;
                if(!member)throw new Error('Publicatierechten zijn ingetrokken.');
                const teams=await tx`select team_id from cms_user_teams where user_id=${job.payload.actorId}`,grants=await tx`select module,action from cms_grants where role_id=${member.role_id}`;
                const actor={name:'Worker actor',email:'',mfa:!!member.two_factor_enabled,id:job.payload.actorId,roleId:member.role_id,teamScoped:member.team_scoped,teams:teams.map(t=>t.team_id),departments:[],grants:grants.map(g=>({module:String(g.module),action:String(g.action)}))} as Principal;
                if(!has(actor,permissionModule(record.module,frozen),'publish',{teamId:frozen.teamId||'',departmentId:frozen.departmentId||''})||!has(actor,permissionModule(record.module,record.draft),'publish',{teamId:record.team_id||'',departmentId:record.department_id||''}))throw new Error('Publicatierechten zijn ingetrokken.');
                const currentJob = await tx `select status,lease_owner from cms_jobs where id=${job.id}`;
                if (currentJob[0]?.status !== 'processing'||currentJob[0]?.lease_owner!==workerId)
                    return;
                const references = referencesIn(frozen);
                for (const id of references) {
                    const [target] = await tx `select live from cms_records where id=${id} and deleted_at is null`;
                    if (!target?.live && !(await tx`select id from cms_teams where id=${id}`).length && !(await tx`select id from cms_departments where id=${id} and active=true`).length)
                        throw new Error('Publicatieverwijzing is niet beschikbaar.');
                }
                const publicationId = crypto.randomUUID();
                await tx `insert into cms_publications(id,record_id,record_version,snapshot,actor_id) values (${publicationId},${record.id},${job.payload.version},${tx.json(frozen)},${job.payload.actorId})`;
                const path = record.module === 'pages' ? `/clubmuur/${frozen.slug}` : `/clubmuur/${frozen.contentType === 'story' ? 'verhalen' : 'nieuws'}/${frozen.slug}`;
                const old = record.live, oldPath = old ? (record.module === 'pages' ? `/clubmuur/${old.slug}` : `/clubmuur/${old.contentType === 'story' ? 'verhalen' : 'nieuws'}/${old.slug}`) : null;
                const [conflict] = await tx `select record_id from cms_paths where path=${path}`;
                if (conflict && conflict.record_id !== record.id)
                    throw new Error('Publicatiepad is niet beschikbaar.');
                await tx `update cms_records set live_id=${publicationId},live=${tx.json(frozen)},status=case when version=${job.payload.version} then 'published' else 'draft' end,version=version+1,updated_at=now() where id=${record.id}`;
                await tx`delete from cms_references where record_id=${record.id} and snapshot='live'`;
                for(const target of references){const [exists]=await tx`select id from cms_records where id=${target}`;if(exists)await tx`insert into cms_references(record_id,target_id,snapshot) values (${record.id},${target},'live') on conflict do nothing`;}
                await tx `insert into cms_paths(path,record_id,kind) values (${path},${record.id},'live') on conflict(path) do update set kind='live'`;
                if (oldPath && oldPath !== path){await tx`delete from cms_redirects where from_path=${path}`;await tx`update cms_redirects set to_path=${path} where record_id=${record.id}`;
                    await tx `insert into cms_redirects(from_path,to_path,record_id) values (${oldPath},${path},${record.id}) on conflict(from_path) do update set to_path=excluded.to_path`; }
                if(record.module==='articles')await syncHomepage(tx,record.id,old,frozen,job.payload.actorId);
                if(record.module==='pages')await moveChildPaths(tx,record.id,old,frozen,actor);
                await tx `insert into cms_audit(id,actor_id,action,record_id,request_id) values (${crypto.randomUUID()},${job.payload.actorId},'scheduled-publish',${record.id},${job.id})`;
            });
        }
        else if (job.kind !== 'cache')
            throw new Error('Onbekende taaksoort.');
        await sql `update cms_jobs set status=${status},lease_until=null,lease_owner=null,last_error=null where id=${job.id} and lease_owner=${workerId} and status='processing'`;
    }
    catch (error) {
        const permanent = job.attempts >= job.max_attempts;
        const wait = Math.min(3600, 30 * 2 ** Math.max(0, job.attempts - 1));
        const code = error instanceof Error && 'code' in error ? String(error.code) : 'processing-failed';
        await sql `update cms_jobs set status=${permanent ? 'failed' : 'pending'},lease_until=null,lease_owner=null,last_error=${code.slice(0, 100)},run_at=now()+${wait}*interval '1 second' where id=${job.id} and lease_owner=${workerId} and status='processing'`;
        if (job.kind === 'submission-mail')
            await sql `update cms_submissions set delivery_status=${permanent ? 'failed' : 'retry'} where id=${job.payload.submissionId}`;
        if(permanent&&['news-analyze','news-import'].includes(job.kind))await failNewsJob(job.payload.sessionId,'De achtergrondtaak kon niet worden afgerond. Eerder opgeslagen berichten blijven behouden; probeer de mislukte geselecteerde berichten opnieuw.');
    }
    finally{clearInterval(renewal);}
    return true;
}
export async function retain() { const sql = sqlClient(); await sql.begin(async (tx) => { const rows = await tx `select id from cms_submissions where retain_until<now() for update skip locked limit 100`; for (const row of rows) {
    await tx `delete from cms_jobs where payload->>'submissionId'=${row.id}`;
    await tx `delete from cms_submissions where id=${row.id}`;
    await tx `insert into cms_audit(id,action,record_id,request_id) values (${crypto.randomUUID()},'retention-delete',${row.id},${crypto.randomUUID()})`;
} }); await sql `delete from cms_rate_limits where expires_at<now()`; await sql`delete from cms_jobs where kind='auth-code-mail' and status in ('done','failed','cancelled') and created_at<now()-interval '1 day'`; await sql`delete from cms_auth_login_challenges where expires_at<now()`; await sql`delete from cms_auth_email_sessions where created_at<now()-interval '12 hours'`; await cleanExpiredNews(); }
export async function cleanOrphans(){
    const sql=sqlClient(),objects=await sql`select storage_key,variants from cms_media_objects`;
    const kept=new Set<string>();for(const object of objects){kept.add(object.storage_key);for(const variant of object.variants||[])kept.add(variant.key);}
    // Only unregistered upload keys older than 48 hours; archived originals and
    // every registered variant remain available for revision/backup recovery.
    for(const prefix of ['originals/','variants/','documents/'])for(const object of await listObjects(prefix))if(Date.now()-object.at.getTime()>48*3600000&&!kept.has(object.key)){
      const [nowRegistered]=await sql`select id from cms_media_objects where storage_key=${object.key} or variants @> ${sql.json([{key:object.key}])} limit 1`;
      if(!nowRegistered)await deleteObject(object.key);
    }
}

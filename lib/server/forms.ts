import { z } from 'zod';
import { createHash } from 'node:crypto';
import { sqlClient } from '../../db/index';
import {submittedFormValues,validateFormValues} from '../cms/form-validation';
import { createSubmissionSnapshot } from '../cms/forms';
import type { CmsForm } from '../cms/types';
import { CmsError } from './errors';
const input = z.object({ operationId: z.string().uuid(), answers: z.record(z.string().max(10000)), website: z.string().max(1000).optional() }).strict();
export async function receiveForm(formId: string, body: unknown, ip: string) {
    const parsed = input.safeParse(body);
    if (!parsed.success)
        throw new CmsError('validation', 'Controleer de ingevulde velden.', 422);
    const data = parsed.data;
    if (data.website)
        throw new CmsError('spam', 'Deze inzending kan niet worden ontvangen.', 422);
    const sql = sqlClient();
    return sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${'form:'+data.operationId},0))`;
        const [prior] = await tx `select id,form_id from cms_submissions where operation_id=${data.operationId}`;
        if (prior) {
            if (prior.form_id !== formId)
                throw new CmsError('operation-conflict', 'Deze verzendcode hoort bij een ander formulier.', 409);
            return { id: prior.id, status: 'received' };
        }
        const [record] = await tx `select r.id,p.record_version as version,r.live from cms_records r join cms_publications p on p.id=r.live_id where r.id=${formId} and r.module='forms' and r.live is not null and r.deleted_at is null`;
        const form = record?.live as CmsForm | undefined;
        if (!form?.active)
            throw new CmsError('form-unavailable', 'Dit formulier is niet beschikbaar.', 404);
        const [department] = await tx `select * from cms_departments where id=${form.departmentId} and active=true`;
        if (!department)
            throw new CmsError('department-unavailable', 'Dit formulier wacht op afdelingsconfiguratie.', 503);
        if (Object.keys(data.answers).some(id => !form.fields.some(f => f.id === id)))
            throw new CmsError('unknown-field', 'Een veld behoort niet bij dit formulier.', 422);
        const answers=submittedFormValues(form,data.answers);
        const [problem]=validateFormValues(form,answers);
        if(problem)throw new CmsError('validation',problem.message,422,{fieldId:problem.fieldId});
        for(const field of form.fields)if(field.type==='email'&&answers[field.id]&&!z.string().email().safeParse(answers[field.id]).success)
            throw new CmsError('invalid-email','Controleer het e-mailadres.',422,{fieldId:field.id});
        const key = createHash('sha256').update(`${ip}:${formId}`).digest('hex');
        const [rate] = await tx `insert into cms_rate_limits(key,count,expires_at) values (${key},1,now()+interval '15 minutes') on conflict(key) do update set count=case when cms_rate_limits.expires_at<now() then 1 else cms_rate_limits.count+1 end,expires_at=case when cms_rate_limits.expires_at<now() then now()+interval '15 minutes' else cms_rate_limits.expires_at end returning count`;
        if (rate.count > 10)
            throw new CmsError('rate-limit', 'Probeer het over een kwartier opnieuw.', 429);
        const id = crypto.randomUUID(), at = new Date();
        const snapshot = createSubmissionSnapshot(form, answers, { id, departmentId: form.departmentId, createdAt: at.toISOString(), demo: false });
        const definition = { ...form, departmentName: department.name, destination: department.emails, confirmation: department.confirmation };
        const retainUntil = form.retentionDays > 0 ? new Date(at.getTime() + form.retentionDays * 86400000) : null;
        await tx `insert into cms_submissions(id,operation_id,form_id,form_version,kind,department_id,snapshot,answers,retain_until,integration_status) values (${id},${data.operationId},${formId},${record.version},${form.kind},${form.departmentId},${tx.json({ ...snapshot, definition })},${tx.json(snapshot.answers)},${retainUntil?.toISOString()||null},${form.kind === 'registration' && form.registrationPurpose === 'membership' ? 'waiting' : 'not-applicable'}) on conflict(operation_id) do nothing`;
        // The job stores only a reference; historical recipient/definition is in the
        // committed submission, and internal notes never enter notification payloads.
        await tx `insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'notify:' + data.operationId},'submission-mail',${tx.json({ submissionId: id })}) on conflict(operation_id) do nothing`;
        if (form.kind === 'registration' && form.registrationPurpose === 'membership')
            await tx `insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'register:' + data.operationId},'sportlink-registration',${tx.json({ submissionId: id })}) on conflict(operation_id) do nothing`;
        return { id, status: 'received' };
    });
}

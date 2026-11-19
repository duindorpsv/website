import {createHash,randomUUID} from 'node:crypto';
import {sqlClient} from '../../db';
import {CmsError} from './errors';
import {trustedAddress,workspaceRate} from './sponsor-access';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Public callbacks only record a bounded hint; the worker verifies with Mollie. */
export async function queueMollieWebhook(request:Request,providerId:string){
 if(!/^tr_[a-zA-Z0-9]{1,160}$/.test(providerId))throw new CmsError('payment-id','Ongeldige betaalmelding.',422);
 // Ignore untrusted forwarding headers and user agents. Without a trusted
 // proxy, callbacks share a conservative bucket rather than a spoofable key.
 await workspaceRate('mollie:webhook-ip:'+digest(trustedAddress(request)||'untrusted'),120,60);
 await workspaceRate('mollie:webhook-id:'+digest(providerId),20,60);
 const sql=sqlClient(),[attempt]=await sql`select id from cms_mollie_payment_attempts where provider_id=${providerId}`;
 if(!attempt)return;
 // Reuse the initial post-create verification task. A callback during a
 // running fetch clears the old lease, so its completion cannot discard the
 // new hint; the worker must fetch the provider's latest state once more.
 await sql`insert into cms_jobs(id,operation_id,kind,payload) values (${randomUUID()},${'mollie-payment-verify-'+attempt.id},'mollie-payment-verify',${sql.json({providerId})}) on conflict(operation_id) do update set status='pending',attempts=0,run_at=now(),lease_until=null,lease_owner=null,last_error=null where cms_jobs.kind='mollie-payment-verify'`;
}

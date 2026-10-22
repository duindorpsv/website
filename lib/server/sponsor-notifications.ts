import {z} from 'zod';
import {sqlClient} from '../../db';
import {workspaceActor,freshActor} from './sponsor-access';
import {readDomainStore,portalProjection} from './sponsor-store';
import {getSponsorReminders} from '../cms/sponsorship';
import {verifyOrigin} from './permissions';
export async function readSponsorNotifications(request:Request,body:unknown){
 verifyOrigin(request);const input=z.object({companyId:z.string().max(191),ids:z.array(z.string().max(250)).max(1000)}).strict().parse(body),actor=await workspaceActor(request.headers);
 return sqlClient().begin(async tx=>{const p=await freshActor(tx,actor),store=await readDomainStore(tx,p,{portal:true,companyId:input.companyId}),safe=portalProjection(store,p,input.companyId);const available=new Set(getSponsorReminders(safe.state).map(r=>r.id));for(const id of input.ids.filter(id=>available.has(id)))await tx`insert into cms_sponsor_notification_reads(user_id,reference_id) values (${p.id},${id}) on conflict do nothing`;return {ok:true};});
}

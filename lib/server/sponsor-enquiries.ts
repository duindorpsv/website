import {sqlClient} from '../../db';
import {emptyState} from './records';
import {submitSponsorEnquiry} from '../cms/sponsorship';
import {withDomainIds} from '../cms/domain-commands';
import {workspaceLocks} from './sponsor-access';
/** A received form remains the inbox source; retrying its CRM projection cannot duplicate a lead. */
export async function processSponsorEnquiry(submissionId:string){
 const sql=sqlClient();return sql.begin(async tx=>{
  await workspaceLocks(tx);const [submission]=await tx`select * from cms_submissions where id=${submissionId} and form_id='sponsorship'`;
  if(!submission)return;
  const id='sponsor-enquiry-'+submissionId;if((await tx`select id from cms_sponsor_companies where id=${id}`).length)return;
  const answers=Object.fromEntries((submission.answers as {fieldId:string;value:string}[]).map(answer=>[answer.fieldId,answer.value])),state=emptyState();
  const sponsor=withDomainIds(submissionId,0,()=>submitSponsorEnquiry(state,{company:answers.company||'Sponsorinteresse',name:answers.name||submission.snapshot.name||'Contactpersoon',email:answers.email||submission.snapshot.email,phone:answers.phone||'',message:answers.message||''}));
  sponsor.id=id;sponsor.demo=false;
  await tx`insert into cms_sponsor_companies(id,data) values (${id},${tx.json(sponsor)})`;
  await tx`insert into cms_sponsor_records(id,kind,sponsor_id,data) values (${'sponsor-enquiry-activity-'+submissionId},'activities',${id},${tx.json({id:'sponsor-enquiry-activity-'+submissionId,sponsorId:id,actorId:'',at:new Date().toISOString(),kind:'note',title:'Sponsorinteresse ontvangen via de website',detail:'Contactgegevens en het bericht staan in dit sponsordossier en in Formulieren & inbox.',internal:true})})`;
  await tx`insert into cms_audit(id,action,record_id,request_id) values (${crypto.randomUUID()},'sponsor-enquiry-projected',${id},${submissionId})`;
 });
}

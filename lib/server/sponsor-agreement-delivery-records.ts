import type {SponsorAgreementDelivery} from '../cms/sponsorship-types';
import {assertSponsorAgreementDeliverySource,type SponsorAgreementDeliverySource} from '../cms/sponsor-agreement-delivery';

export function agreementDeliverySourceFromRow(row:any):SponsorAgreementDeliverySource{
 const source={proposalId:row.proposal_id,sponsorId:row.sponsor_id,agreementId:row.agreement_id,agreementNumber:row.agreement_number,version:row.document_version,snapshot:JSON.parse(row.snapshot_bytes),snapshotBytes:row.snapshot_bytes,documentHash:row.document_hash};
 assertSponsorAgreementDeliverySource(source);return source;
}
export function agreementDeliveryProjection(row:any):SponsorAgreementDelivery{
 return {...agreementDeliverySourceFromRow(row),agreementId:row.agreement_id,id:row.id,recipient:row.recipient,subject:row.subject,message:row.message,createdBy:row.created_by,createdAt:new Date(row.created_at).toISOString(),status:row.status,...(row.accepted_at?{acceptedAt:new Date(row.accepted_at).toISOString()}:{}),...(row.last_error?{error:row.last_error}:{}),...(row.provider_id?{providerId:row.provider_id}:{})};
}
/** Private staff history; the caller supplies its authorized company scope. */
export async function readAgreementDeliveryRows(tx:any,sponsorIds:string[]):Promise<SponsorAgreementDelivery[]>{
 if(!sponsorIds.length)return [];
 const rows=await tx`select * from cms_sponsor_agreement_deliveries where sponsor_id in ${tx(sponsorIds)} order by created_at desc,id desc`;
 return rows.map(agreementDeliveryProjection);
}

import type {SponsorAgreement} from './sponsorship-types';
import type {SponsorPdfOptions} from './sponsor-pdf';
import {buildSponsorAgreementDocumentPdf} from './sponsor-pdf';
import {assertSponsorAgreementDeliverySource,type SponsorAgreementDeliverySource} from './sponsor-agreement-delivery';

/** Render the exact preview or delivery source; this never allocates a number or writes data. */
export async function buildSponsorAgreementDeliveryPdf(source:SponsorAgreementDeliverySource,options:SponsorPdfOptions={}):Promise<Uint8Array>{
 assertSponsorAgreementDeliverySource(source);
 const document:SponsorAgreement={
  id:source.agreementId||'preview:'+source.proposalId,
  sponsorId:source.sponsorId,proposalId:source.proposalId,
  number:source.agreementNumber,version:source.version,status:'awaiting-signature',
  snapshot:structuredClone(source.snapshot),documentHash:source.documentHash,
  snapshotBytes:source.snapshotBytes||JSON.stringify(source.snapshot),hashFormat:'json-utf8-v1',
  signingMode:'dual-email-otp',signatures:[],createdAt:source.snapshot.capturedAt,signedAt:'',
 };
 return buildSponsorAgreementDocumentPdf(document,options);
}

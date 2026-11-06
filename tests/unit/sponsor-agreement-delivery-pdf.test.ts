import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildSponsorAgreementDeliveryPdf} from '../../lib/cms/sponsor-agreement-delivery-pdf';
import {sponsorDocumentHash} from '../../lib/cms/sponsorship';
import {sponsorPdfFixture} from '../helpers/sponsor-pdf-fixture';

async function assets(){
 const [logoPng,bodyFont,boldFont,headingFont,brushFont]=await Promise.all(['assets/logo.png','fonts/club-font-4.ttf','fonts/club-font-7.ttf','fonts/club-font-3.ttf','fonts/club-font-9.ttf'].map(path=>readFile('public/'+path)));
 return {logoPng,bodyFont,boldFont,headingFont,brushFont};
}
function source(){
 const agreement=sponsorPdfFixture().sponsorship!.agreements[0];
 return {proposalId:agreement.proposalId,sponsorId:agreement.sponsorId,agreementNumber:'Nog toe te kennen',version:agreement.version,snapshot:agreement.snapshot,documentHash:agreement.documentHash,snapshotBytes:agreement.snapshotBytes};
}

test('agreement preview renders an actual embedded-font PDF from captured data without changing its source',async()=>{
 const preview=source(),before=JSON.stringify(preview),bytes=await buildSponsorAgreementDeliveryPdf(preview,{assets:await assets()}),pdf=new TextDecoder('latin1').decode(bytes);
 assert.ok(pdf.startsWith('%PDF-'));assert.ok(pdf.includes('/FontFile2'));assert.ok((pdf.match(/\/Type \/Page\b/g)?.length||0)>=3);
 assert.equal(JSON.stringify(preview),before);assert.equal(preview.agreementNumber,'Nog toe te kennen');
});

test('agreement preview refuses altered content and invalid prices even with a recomputed hash',async()=>{
 const changed=source();changed.snapshot.sponsorName='Changed after approval';
 await assert.rejects(buildSponsorAgreementDeliveryPdf(changed));
 const invalid=source();invalid.snapshot.lines[0].quantity=-1;invalid.snapshotBytes=JSON.stringify(invalid.snapshot);invalid.documentHash=sponsorDocumentHash(invalid.snapshotBytes);
 await assert.rejects(buildSponsorAgreementDeliveryPdf(invalid));
});

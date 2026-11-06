import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {sponsorPdfFixture} from '../tests/helpers/sponsor-pdf-fixture';
import {buildSponsorAgreementDeliveryPdf} from '../lib/cms/sponsor-agreement-delivery-pdf';
import {buildSponsorConceptPdf} from '../lib/cms/sponsor-concept-pdf';
import {calculateSponsorProposalTotals,sponsorDocumentHash} from '../lib/cms/sponsorship';
import {getSponsorContractYear} from '../lib/cms/sponsor-contract-year';
import {createDefaultSponsorContractTemplate,getSponsorContractVariables,renderSponsorContractTemplate} from '../lib/cms/sponsor-contracts';

// All documents are generated from fictitious in-memory data, without database or provider access.
const destination='.runtime/v72/pdf';
await mkdir(destination,{recursive:true});
const [logoPng,bodyFont,boldFont,headingFont,brushFont]=await Promise.all(['assets/logo.png','fonts/club-font-4.ttf','fonts/club-font-7.ttf','fonts/club-font-3.ttf','fonts/club-font-9.ttf'].map(path=>readFile('public/'+path)));
const assets={logoPng,bodyFont,boldFont,headingFont,brushFont};
const agreement=sponsorPdfFixture().sponsorship!.agreements[0],snapshot=structuredClone(agreement.snapshot);
Object.assign(snapshot,getSponsorContractYear('2026-11-06'));
snapshot.name='Jaarovereenkomst · direct ondertekenen';
const template=createDefaultSponsorContractTemplate(),company=snapshot.contract!.company,totals=calculateSponsorProposalTotals(snapshot),variables=getSponsorContractVariables(snapshot,company,'Wijkpartner',totals);
snapshot.contract={...snapshot.contract!,...renderSponsorContractTemplate(template,variables),variables,totals};
const snapshotBytes=JSON.stringify(snapshot),source={proposalId:agreement.proposalId,sponsorId:agreement.sponsorId,agreementNumber:'Nog toe te kennen',version:1,snapshot,documentHash:sponsorDocumentHash(snapshotBytes),snapshotBytes};
await writeFile(destination+'/overeenkomst-preview.pdf',await buildSponsorAgreementDeliveryPdf(source,{assets}));
await writeFile(destination+'/overeenkomst-verzendversie.pdf',await buildSponsorAgreementDeliveryPdf({...source,agreementId:agreement.id,agreementNumber:'PDF-TEST-v72-001'},{assets}));
const {contract:unusedContract,...draft}=structuredClone(snapshot);
const conceptSnapshot={...draft,issuer:{legalName:'Duindorp SV',address:'Fictief clubadres 1',companyNumber:'87654321',email:'club@example.invalid'},totals};
const concept={proposalId:agreement.proposalId,sponsorId:agreement.sponsorId,version:1,snapshot:conceptSnapshot,documentHash:sponsorDocumentHash(JSON.stringify(conceptSnapshot))};
await writeFile(destination+'/conceptvoorstel-watermerk.pdf',await buildSponsorConceptPdf(concept,{assets}));
await writeFile(destination+'/README.txt','Fictieve PDF-voorbeelden uit de actuele renderer. Geen database, nummerreeks, reservering, factuur of e-mail aangemaakt. PDF-TEST-v72-001 is uitsluitend een voorbeeldlabel.\n');
console.log('Drie echte PDF-voorbeelden geschreven; uitsluitend fictieve in-memory gegevens.');

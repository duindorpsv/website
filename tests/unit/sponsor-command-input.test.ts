import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandArgs} from '../../lib/server/sponsor-command-input';

test('custom proposal commands accept the explicit empty package sent by the starter and the omitted optional argument',()=>{
 assert.deepEqual(commandArgs.createSponsorProposal.parse(['company-test','']),['company-test','']);
 assert.deepEqual(commandArgs.createSponsorProposal.parse(['company-test']),['company-test',undefined]);
 assert.deepEqual(commandArgs.createSponsorProposal.parse(['company-test','package-test']),['company-test','package-test']);
});

test('the custom-proposal empty choice does not weaken company, package or other command identifiers',()=>{
 for(const packageId of [null,0,{},' ','ongeldig pakket','/package','package?query=1','p'.repeat(192)])assert.equal(commandArgs.createSponsorProposal.safeParse(['company-test',packageId]).success,false);
 for(const companyId of ['', ' ', '/company'])assert.equal(commandArgs.createSponsorProposal.safeParse([companyId,'']).success,false);
 for(const name of ['sendSponsorProposal','acceptSponsorProposal','createSponsorAgreement'])assert.equal(commandArgs[name].safeParse(['']).success,false);
});

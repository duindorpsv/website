import test from 'node:test';
import assert from 'node:assert/strict';
import {getSponsorContractYear,getSponsorRenewalContractYear} from '../../lib/cms/sponsor-contract-year';

test('club year uses literal dates and Amsterdam time across the Aug1 boundary',()=>{
 const old={startDate:'2026-08-01',endDate:'2027-07-31',season:'2026–2027'},next={startDate:'2027-08-01',endDate:'2028-07-31',season:'2027–2028'};
 for(const value of ['2026-11-06','2027-07-31','2027-07-31T21:59:59Z',new Date('2027-07-31T21:59:59Z')])assert.deepEqual(getSponsorContractYear(value),old);
 for(const value of ['2027-08-01','2027-07-31T22:00:00Z','2027-08-01T00:00:00+02:00',new Date('2027-07-31T22:00:00Z')])assert.deepEqual(getSponsorContractYear(value),next);
 assert.equal(getSponsorContractYear('2028-02-29').endDate,'2028-07-31');
});
test('club year rejects invalid calendars, unzoned or rollover timestamps and out-of-range years',()=>{
 for(const value of ['','2026-02-30','2027-02-29','0000-01-01','0001-01-01','9999-08-01','2027-07-31T22:00:00','2027-07-31T24:00:00Z','2027-07-31T23:60:00Z','2027-07-31T23:59:60Z','2027-02-30T12:00:00Z','not a date',new Date('0000-08-01T12:00:00Z'),new Date('+010000-08-01T12:00:00Z'),new Date(NaN)])assert.throws(()=>getSponsorContractYear(value),/geldige datum/);
});
test('renewal begins at the first Aug1 strictly after the previous end, including manual old periods',()=>{
 for(const value of ['2027-01-31','2027-07-31'])assert.deepEqual(getSponsorRenewalContractYear(value),{startDate:'2027-08-01',endDate:'2028-07-31',season:'2027–2028'});
 for(const value of ['2027-08-01','2027-12-31'])assert.deepEqual(getSponsorRenewalContractYear(value),{startDate:'2028-08-01',endDate:'2029-07-31',season:'2028–2029'});
 assert.throws(()=>getSponsorRenewalContractYear('9999-07-31'),/geldige datum/);
});

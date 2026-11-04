import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePeopleCsv} from '../../lib/cms/people-csv';

test('people CSV preserves stable IDs, original columns, accents and quoted data', () => {
 const rows = parsePeopleCsv('\uFEFFbronId;naam;email;telefoon;functie\r\n"AB123";"Émile; van Duin";emile@example.invalid;0612345678;"Trainer ""jeugd"""\r\nCD456;Naamgenoot;;;');
 assert.deepEqual(rows, [
  {id:'AB123',name:'Émile; van Duin',email:'emile@example.invalid',phone:'0612345678',role:'Trainer "jeugd"',sourceFields:{bronId:'AB123',naam:'Émile; van Duin',email:'emile@example.invalid',telefoon:'0612345678',functie:'Trainer "jeugd"'}},
  {id:'CD456',name:'Naamgenoot',email:'',phone:'',role:'',sourceFields:{bronId:'CD456',naam:'Naamgenoot',email:'',telefoon:'',functie:''}},
 ]);
});

test('Sportlink imports all 77 columns including future fields and blank values', () => {
 const headers = ['Naam','Rel. code','E-mailadres','Mobiel nummer','Telefoonnummer','Geb.dat.','Volledig adres','Postcode','Plaats','Lidsoort', ...Array.from({length:67},(_,i)=>`Toekomstig veld ${i + 1}`)];
 const cells = ['Voorbeeldlid','SL123','lid@example.invalid','0612345678','0701234567','9-2-2004','Voorbeeldstraat 1','1234 AB','Den Haag','Spelend lid', ...Array.from({length:67},(_,i)=>i % 2 ? '' : `Waarde ${i + 1}`)];
 const [row] = parsePeopleCsv(headers.join(';') + '\r\n' + cells.join(';'));
 assert.deepEqual(Object.keys(row.sourceFields), headers);
 assert.deepEqual(Object.values(row.sourceFields), cells);
 assert.equal(row.id, 'SL123');
 assert.equal(row.email, 'lid@example.invalid');
 assert.equal(row.phone, '0612345678');
 assert.equal(row.birthDate, '2004-02-09');
 assert.equal(row.address, 'Voorbeeldstraat 1');
 assert.equal(row.postalCode, '1234 AB');
 assert.equal(row.city, 'Den Haag');
 assert.equal(row.membership, 'playing');
});

test('delimiter detection ignores delimiters in quoted headers and handles tab files and multiline values', () => {
 const [comma] = parsePeopleCsv('bronId,naam,"Vrij; veld"\r\n123,Jan,"Eerste regel\r\nTweede ""regel"""\r\n');
 assert.equal(comma.sourceFields['Vrij; veld'], 'Eerste regel\r\nTweede "regel"');
 const [tab] = parsePeopleCsv('bronId\tnaam\tVrij veld\n456\tJan\t"Waarde; met, leestekens"');
 assert.equal(tab.sourceFields['Vrij veld'], 'Waarde; met, leestekens');
});

test('phone fallback, optional fields and explicit membership mapping preserve source values', () => {
 const rows = parsePeopleCsv('bronId;naam;Mobiel nummer;Telefoonnummer;Geb.dat.;adres;postcode;plaats;Lidsoort\n1;Jan;;0701234567;;;;;Niet-spelend lid\n2;Jan;0612345678;0701234567;;;;;Bondslid\n3;Jan;;;;;;;Geen lid');
 assert.equal(rows[0].phone, '0701234567');
 assert.equal(rows[0].birthDate, '');
 assert.equal(rows[0].address, '');
 assert.equal(rows[0].postalCode, '');
 assert.equal(rows[0].city, '');
 assert.equal(rows[0].membership, 'non-playing');
 assert.equal(rows[1].phone, '0612345678');
 assert.equal(rows[1].membership, undefined);
 assert.equal(rows[1].sourceFields.Lidsoort, 'Bondslid');
 assert.equal(rows[2].membership, 'none');
 const [minimal] = parsePeopleCsv('bronId,naam\n4,Jan');
 assert.equal('birthDate' in minimal, false);
 assert.equal('address' in minimal, false);
 assert.equal('membership' in minimal, false);
});

test('birthdates support ISO and Dutch formats and reject impossible dates', () => {
 for (const [input, expected] of [['2000-02-29','2000-02-29'],['29/2/2000','2000-02-29'],['1-12-1999','1999-12-01']]) {
  assert.equal(parsePeopleCsv(`bronId,naam,birthDate\n123,Jan,${input}`)[0].birthDate, expected);
 }
 for (const input of ['1900-02-29','31-4-2000','31-9-2000','2025-02-29','1/13/2000','0000-01-01','2020-00-01','geen datum']) {
  assert.throws(() => parsePeopleCsv(`bronId,naam,Geboortedatum\n123,Jan,${input}`), /geboortedatum/);
 }
});

test('people CSV requires reviewed identifiers and rejects duplicates, examples and broken files', () => {
 for (const input of ['naam,email\nJan,jan@example.invalid','bronId,naam\n,Jan','bronId,naam\nDEMO-SL-1,Jan','bronId,naam\nab1,Jan\nAB1,Ander','bronId,naam\n123,"Jan','bronId,naam,email\n123,Jan,ongeldig','bronId,naam\n123,"Jan"extra','bronId,naam\n123,Ja"n','bronId,naam\nID with spaces,Jan']) assert.throws(() => parsePeopleCsv(input));
 assert.equal(parsePeopleCsv('bronId,naam\n123,Jan\n456,Jan').length, 2, 'Names alone must never deduplicate people');
});

test('headers and row widths are validated to prevent silent column loss', () => {
 for (const input of ['bronId,naam,\n123,Jan,extra','bronId,naam,naam\n123,Jan,Ander','bronId,naam, Naam \n123,Jan,Ander','bronId,naam,email\n123,Jan','bronId,naam\n123,Jan,extra']) assert.throws(() => parsePeopleCsv(input), /kolom/);
 assert.throws(() => parsePeopleCsv(`bronId,naam,${'x'.repeat(151)}\n123,Jan,extra`), /150/);
 const fields = Array.from({length:199},(_,i)=>`Veld ${i}`);
 assert.throws(() => parsePeopleCsv(['bronId','naam',...fields].join(',') + '\n' + ['123','Jan',...fields].join(',')), /200 kolommen/);
 const maxHeaders = ['bronId','naam',...fields.slice(0,198)];
 assert.equal(Object.keys(parsePeopleCsv(maxHeaders.join(',') + '\n' + ['123','Jan',...fields.slice(0,198)].join(','))[0].sourceFields).length, 200);
});

test('up to 2,000 people are supported and import bounds are enforced', () => {
 const people = Array.from({length:2000},(_,index)=>`${index},Jan`);
 assert.equal(parsePeopleCsv('bronId,naam\n' + people.join('\n')).length, 2000);
 assert.throws(() => parsePeopleCsv('bronId,naam\n' + [...people,'2000,Jan'].join('\n')), /2.000/);
 assert.throws(() => parsePeopleCsv('a'.repeat(5_000_001)), /5 MB/);
 assert.throws(() => parsePeopleCsv('é'.repeat(2_500_001)), /5 MB/);
 assert.throws(() => parsePeopleCsv('bronId,naam,Vrij veld\n123,Jan,' + 'x'.repeat(10_001)), /10.000/);
 assert.equal(parsePeopleCsv('bronId,naam,Vrij veld\n123,Jan,' + 'x'.repeat(10_000))[0].sourceFields['Vrij veld'].length, 10_000);
 assert.throws(() => parsePeopleCsv('bronId,naam\n' + 'x'.repeat(101) + ',Jan'), /100/);
 assert.throws(() => parsePeopleCsv('bronId,naam,phone\n123,Jan,' + '0'.repeat(101)), /telefoonnummer/);
});

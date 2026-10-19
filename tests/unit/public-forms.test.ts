import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicFormPresets} from '../../lib/cms/form-presets';
import {ageOnDate,contextualContactForm,submittedFormValues,validateFormValues,visibleFormFields} from '../../lib/cms/form-validation';
import {createSubmissionSnapshot} from '../../lib/cms/forms';
import {currentClubHref,currentClubLinks} from '../../lib/current-club-links';
import {cmsStateSchema} from '../../lib/cms/validation';
import {createCmsSeed} from '../../lib/cms/seed';
const membership=publicFormPresets.find(form=>form.id==='membership')!;
const adult={firstName:'Robin',lastName:'Test',birthDate:'2000-01-01',email:'robin@example.invalid',phone:'0612345678',street:'Teststraat',houseNumber:'12 A',postalCode:'1234 AB',city:'Den Haag',otherClub:'Nee'};
const today='2026-10-19';

test('complete membership form is accepted without optional KNVB code or remarks',()=>{
  assert.deepEqual(validateFormValues(membership,adult,today),[]);
  assert.ok(cmsStateSchema.safeParse(createCmsSeed()).success);
  assert.equal(publicFormPresets.find(form=>form.id==='sponsorship')!.departmentId,'sponsoring');
  assert.equal(contextualContactForm('?onderwerp=sponsoring'),'sponsorship');
  assert.equal(contextualContactForm('?afdeling=sponsoring'),'sponsorship');
  assert.equal(contextualContactForm('?utm_campaign=sponsor'),'contact');
});
test('guardian details are conditional, required for a minor and discarded for adults',()=>{
  assert.equal(ageOnDate('2008-10-19',today),18);assert.equal(ageOnDate('2008-10-20',today),17);
  assert.equal(ageOnDate('2027-01-01',today),null);assert.equal(ageOnDate('2010-02-30',today),null);
  const minor={...adult,birthDate:'2010-05-01'};
  assert.deepEqual(validateFormValues(membership,minor,today).map(problem=>problem.fieldId),['guardianName','guardianEmail','guardianPhone']);
  assert.deepEqual(validateFormValues(membership,{...minor,guardianName:'Ouder Test',guardianEmail:'ouder@example.invalid',guardianPhone:'+31 6 87654321'},today),[]);
  const values=submittedFormValues(membership,{...adult,guardianName:'Onnodig',guardianEmail:'hidden@example.invalid',guardianPhone:'0611111111'},today);
  assert.equal(values.guardianName,undefined);assert.equal(values.guardianEmail,undefined);
  assert.ok(!visibleFormFields(membership,adult,today).some(field=>field.id.startsWith('guardian')));
});
test('current club is required only when already registered elsewhere; malformed dates and telephone numbers fail',()=>{
  assert.ok(validateFormValues(membership,{...adult,otherClub:'Ja'},today).some(problem=>problem.fieldId==='currentClub'));
  assert.deepEqual(validateFormValues(membership,{...adult,otherClub:'Ja',currentClub:'Andere vereniging'},today),[]);
  for(const birthDate of ['2000-02-30','2027-01-01'])assert.ok(validateFormValues(membership,{...adult,birthDate},today).some(problem=>problem.fieldId==='birthDate'));
  assert.ok(validateFormValues(membership,{...adult,phone:'abc'},today).some(problem=>problem.fieldId==='phone'));
});
test('membership snapshot keeps all visible answers and addresses confirmations to the guardian for minors',()=>{
  const data={...adult,birthDate:'2010-05-01',guardianName:'Ouder Test',guardianEmail:'ouder@example.invalid',guardianPhone:'0687654321',otherClub:'Ja',currentClub:'Andere club',knvbCode:'ABCD123',message:'Aanvullende informatie'};
  const snapshot=createSubmissionSnapshot(membership,data,{id:'synthetic',departmentId:'secretariaat',createdAt:'2026-10-19T12:00:00Z',demo:false});
  assert.equal(snapshot.name,'Robin Test');assert.equal(snapshot.email,'ouder@example.invalid');
  assert.match(snapshot.message,/Teststraat/);assert.match(snapshot.message,/Andere club/);assert.match(snapshot.message,/ABCD123/);
  assert.equal(snapshot.demo,false);
});
test('all old club page links resolve to current routes, including imported news redirects',()=>{
  assert.equal(currentClubHref('https://www.duindorpsv.nl/705/inschrijven/'),'/clubmuur/club/lidmaatschap#inschrijven');
  assert.equal(currentClubHref('/643/trainingstijden/'),'/clubmuur/teams/trainingen');
  assert.equal(currentClubHref('https://duindorpsv.nl/1/465/oud-nieuws/',[{from:'/1/465/oud-nieuws/',to:'nieuws/nieuw-bericht'}]),'/clubmuur/nieuws/nieuw-bericht');
  assert.equal(currentClubHref('/999/onbekend/'),'/clubmuur/club/contact');
  assert.equal(currentClubHref('/888/sponsor-worden/'),'/clubmuur/club/contact?onderwerp=sponsoring');
  assert.equal(currentClubHref('https://clubs.stanno.com/collectie'),'https://clubs.stanno.com/collectie');
  const data=currentClubLinks({body:{attrs:{href:'https://duindorpsv.nl/411/contributie/',src:'https://duindorpsv.nl/1/media.jpg'}}});
  assert.equal(data.body.attrs.href,'/clubmuur/club/lidmaatschap#contributie');assert.equal(data.body.attrs.src,'https://duindorpsv.nl/1/media.jpg');
});

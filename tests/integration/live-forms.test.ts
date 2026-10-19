import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {sqlClient,closeDb} from '../../db';
import {receiveForm} from '../../lib/server/forms';
import {applyLaunchContent,upgradeLaunchContent} from '../../lib/server/launch-content';
import {publicFormPresets} from '../../lib/cms/form-presets';
import {retiredLaunchCopy} from '../../lib/cms/retired-launch-copy';
import {runOnce} from '../../lib/server/worker';
import {mutate,recordOutput,type RecordRow} from '../../lib/server/records';
import type {Principal} from '../../lib/server/permissions';

assertLocalSupabaseTests();
const sql=sqlClient();
const adult={firstName:'Synthetische',lastName:'Aanmelding',birthDate:'2000-01-01',email:'adult@example.invalid',phone:'0612345678',street:'Teststraat',houseNumber:'1 A',postalCode:'1234 AB',city:'Den Haag',otherClub:'Nee'};

test('FORM07: deployment content upgrade preserves drafts and history, fixes old links and is applied once',async()=>{
  const id='launch-media-'+crypto.randomUUID(),publication=crypto.randomUUID(),revision=crypto.randomUUID();
  const old={id,name:'Foto',alt:'Gegenereerd sfeerbeeld van supporters',credit:'Gegenereerd sfeerbeeld · te vervangen door eigen clubfoto',caption:'Live bijschrift',src:'/assets/terrace.webp'};
  await sql`insert into cms_records(id,module,title,draft,live) values (${id},'media','Foto',${sql.json({...old,caption:'Nog niet gepubliceerd'})},${sql.json(old)})`;
  await sql`insert into cms_publications(id,record_id,record_version,snapshot) values (${publication},${id},1,${sql.json(old)})`;
  await sql`update cms_records set live_id=${publication} where id=${id}`;
  // Normal CMS edits already have an immutable revision at the current version.
  const previousDraft={...old,caption:'Nog niet gepubliceerd'};
  await sql`insert into cms_revisions(id,record_id,version,snapshot,label) values (${revision},${id},1,${sql.json(previousDraft)},'Bestaande redactierevisie')`;
  const pageId='launch-page-'+crypto.randomUUID(),page={title:'Bestaande inhoud',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Inhoud van de club',marks:[{type:'link',attrs:{href:'https://www.duindorpsv.nl/705/inschrijven/'}}]}]},{type:'paragraph',content:[{type:'text',text:retiredLaunchCopy[0]}]}]}};
  await sql`insert into cms_records(id,module,title,draft,live) values (${pageId},'pages',${page.title},${sql.json(page)},${sql.json(page)})`;
  const [contact]=await sql`select live from cms_records where id='contact'`;
  await sql`update cms_records set draft=${sql.json({...contact.live,name:'Nog niet gepubliceerd contactformulier'})} where id='contact'`;
  try{
    await sql.begin(async tx=>applyLaunchContent(tx));
    const [updated]=await sql`select draft,live,version from cms_records where id=${id}`;
    assert.equal(updated.draft.caption,'Nog niet gepubliceerd');assert.equal(updated.live.caption,'Live bijschrift');
    assert.equal(updated.live.credit,'');assert.equal(updated.live.alt,'Supporters');
    assert.equal((await sql`select snapshot from cms_publications where id=${publication}`)[0].snapshot.credit,old.credit);
    assert.deepEqual((await sql`select snapshot from cms_revisions where id=${revision}`)[0].snapshot,previousDraft);
    assert.equal((await sql`select id from cms_revisions where record_id=${id} and version=1`).length,1);
    const [changed]=await sql`select live from cms_records where id=${pageId}`;
    assert.equal(changed.live.body.content.length,1);assert.equal(changed.live.body.content[0].content[0].marks[0].attrs.href,'/clubmuur/club/lidmaatschap#inschrijven');
    const [current]=await sql`select draft,live from cms_records where id='contact'`;
    assert.equal(current.draft.name,'Nog niet gepubliceerd contactformulier');assert.equal(current.live.name,contact.live.name);
    const before=await sql`select id,version from cms_records order by id`;
    await upgradeLaunchContent(sql);await upgradeLaunchContent(sql);
    assert.deepEqual(await sql`select id,version from cms_records order by id`,before);
  }finally{await sql`update cms_records set draft=${sql.json(contact.live)} where id='contact'`;}
});

test('FORM08: a complete adult membership is stored once, routed to the secretariat and queues manual registration',async()=>{
  const operationId=crypto.randomUUID(),body={operationId,answers:{...adult,guardianEmail:'must-not-store@example.invalid'}};
  const [a,b]=await Promise.all([receiveForm('membership',body,'adult-'+operationId),receiveForm('membership',body,'adult-'+operationId)]);
  assert.equal(a.id,b.id);
  const [row]=await sql`select * from cms_submissions where id=${a.id}`;
  assert.equal(row.kind,'registration');assert.equal(row.integration_status,'waiting');
  assert.deepEqual(row.snapshot.definition.destination,['secretariaat@duindorpsv.nl']);
  assert.ok(!row.answers.some((answer:any)=>answer.fieldId==='guardianEmail'));
  assert.equal(row.snapshot.name,'Synthetische Aanmelding');
  assert.equal((await sql`select id from cms_jobs where kind='submission-mail' and payload->>'submissionId'=${a.id}`).length,1);
  assert.equal((await sql`select id from cms_jobs where kind='sportlink-registration' and payload->>'submissionId'=${a.id}`).length,1);
});

test('FORM09: the server requires guardian details for minors, a current club when applicable, and valid dates',async()=>{
  const minor={...adult,birthDate:'2015-01-01'};
  for(const answers of [minor,{...adult,otherClub:'Ja'},{...adult,birthDate:'2099-01-01'},{...adult,birthDate:'2000-02-30'}]){
    await assert.rejects(receiveForm('membership',{operationId:crypto.randomUUID(),answers},crypto.randomUUID()),(error:any)=>error.status===422);
  }
  const response=await receiveForm('membership',{operationId:crypto.randomUUID(),answers:{...minor,guardianName:'Ouder',guardianEmail:'parent@example.invalid',guardianPhone:'0687654321',otherClub:'Ja',currentClub:'Synthetische club',knvbCode:'TEST123',message:'Een opmerking'}},crypto.randomUUID());
  const [saved]=await sql`select snapshot from cms_submissions where id=${response.id}`;
  assert.equal(saved.snapshot.email,'parent@example.invalid');assert.match(saved.snapshot.message,/TEST123/);
});

test('FORM10: contact, sponsor and friendly requests use their configured recipients and real mail jobs',async()=>{
  const cases=[['contact',{name:'Synthetisch contact',email:'contact@example.invalid',message:'Vraag voor het secretariaat'},'secretariaat@duindorpsv.nl'],['sponsorship',{name:'Synthetische sponsor',company:'Testbedrijf',email:'sponsor@example.invalid',message:'Interesse in sponsoring'},'sponsoring@duindorpsv.nl'],['friendly-request',{name:'Synthetisch team',email:'team@example.invalid',club:'Testvereniging',team:'JO15',date:'2099-01-01',venue:'In overleg'},'secretariaat@duindorpsv.nl']] as const;
  const ids:string[]=[];
  for(const [id,answers,destination] of cases){
    const response=await receiveForm(id,{operationId:crypto.randomUUID(),answers},crypto.randomUUID());ids.push(response.id);
    const [row]=await sql`select snapshot from cms_submissions where id=${response.id}`;
    assert.deepEqual(row.snapshot.definition.destination,[destination]);
  }
  // The existing CI sink accepts only the synthetic TEST_MAIL_TO address.
  if(process.env.TEST_MAIL_API_URL){
    await sql`update cms_jobs set run_at='1800-01-01T00:00:00Z' where kind='submission-mail' and payload->>'submissionId' in ${sql(ids)}`;
    for(let count=0;count<20;count++){
      if((await sql`select id from cms_submissions where id in ${sql(ids)} and delivery_status!='sent'`).length===0)break;
      await runOnce();
    }
    assert.equal((await sql`select id from cms_submissions where id in ${sql(ids)} and delivery_status!='sent'`).length,0);
  }
  for(const preset of publicFormPresets){const [row]=await sql`select live,live_id from cms_records where id=${preset.id}`;assert.ok(row.live_id);assert.equal(row.live.departmentId,preset.departmentId);}
});

test('FORM14: CMS save and publish preserve conditional fields and section labels',async()=>{
  const id='form-config-'+crypto.randomUUID(),actorId='forms-owner-'+crypto.randomUUID();
  await sql`insert into auth_user(id,name,email) values (${actorId},'Formulierenproef',${actorId+'@example.invalid'})`;
  const owner:Principal={id:actorId,name:'Formulierenproef',email:actorId+'@example.invalid',roleId:'admin',teamScoped:false,teams:[],departments:[],grants:[{module:'*',action:'*'}],mfa:false};
  const form={...publicFormPresets.find(form=>form.id==='membership')!,id};
  await mutate(owner,[{module:'forms',id,expectedVersion:0,action:'save',data:form}],crypto.randomUUID(),crypto.randomUUID());
  const [saved]=await sql`select * from cms_records where id=${id}`;assert.equal(saved.live,null);
  await mutate(owner,[{module:'forms',id,expectedVersion:saved.version,action:'publish',data:recordOutput(saved as RecordRow)}],crypto.randomUUID(),crypto.randomUUID());
  const [published]=await sql`select live from cms_records where id=${id}`;
  const field=published.live.fields.find((field:any)=>field.id==='guardianEmail');
  assert.deepEqual(field.condition,{fieldId:'birthDate',operator:'under18'});assert.equal(field.section,'Ouder of voogd');
});
after(closeDb);

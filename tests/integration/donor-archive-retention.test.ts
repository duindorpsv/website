import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertLocalSupabaseTests} from '../helpers/supabase-auth';
import {getAuth} from '../../lib/server/auth';
import {sqlClient,closeDb} from '../../db';
import {archiveDonorInvoice} from '../../lib/server/donor-invoices';
import {calculateSponsorTotals} from '../../lib/cms/sponsorship';
import {workspaceLocks} from '../../lib/server/sponsor-access';
import {cleanOrphans} from '../../lib/server/worker';
import {getObject,putObject} from '../../lib/server/storage';
import {uploadDocument} from '../../lib/server/documents';
import type {DonorInvoice,Donor,SponsorLine} from '../../lib/cms/sponsorship-types';
import type {Principal} from '../../lib/server/permissions';
assertLocalSupabaseTests();const sql=sqlClient();after(closeDb);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function invoice():DonorInvoice{
 const id=crypto.randomUUID(),createdAt=new Date().toISOString(),recipient:Donor={id:crypto.randomUUID(),name:'Fictieve archiefdonateur',kind:'person',email:'archief@example.invalid',phone:'',address:'Teststraat 1',postalCode:'1234 AB',city:'Teststad',notes:'',active:true,createdAt,updatedAt:createdAt};
 const lines:SponsorLine[]=[{id:crypto.randomUUID(),itemId:'',name:'Fictieve bijdrage',description:'Permanente archiefcontrole',quantity:1,unitPriceCents:1000,taxRate:'exempt',startDate:'2099-01-01',endDate:''}],totals=calculateSponsorTotals(lines);
 return {id,donorId:recipient.id,contributionId:lines[0].id,number:'CLN'+id.replace(/-/g,'').slice(0,20)+'-2099-001',issueDate:'2099-01-01',dueDate:'2099-02-01',status:'open',issuer:{legalName:'Fictieve testclub',address:'Testadres 1',companyNumber:'',email:'club@example.invalid'},recipient,lines,totals,totalCents:totals.totalCents,paidAt:'',createdAt};
}
test('archive retention: aged donor invoices and registration races survive while only scoped unregistered uploads expire',async()=>{
 const {user}=await getAuth().api.createUser({body:{email:'retention-'+crypto.randomUUID()+'@example.invalid',name:'Fictieve archiefbeheerder',password:crypto.randomUUID()+crypto.randomUUID()}});
 const first=invoice(),racing=invoice(),uploaded:string[]=[];
 async function archive(value:DonorInvoice){const line=value.lines[0],contribution={id:value.contributionId,donorId:value.donorId,itemId:line.itemId,description:line.description,quantity:line.quantity,unitPriceCents:line.unitPriceCents,taxRate:line.taxRate,startDate:line.startDate,endDate:line.endDate,status:'active',createdAt:value.createdAt,updatedAt:value.createdAt};await sql.begin(async tx=>{await workspaceLocks(tx);await tx`insert into cms_sponsor_records(id,kind,data) values (${value.donorId},'donorPeople',${tx.json(value.recipient)}),(${value.contributionId},'donorContributions',${tx.json(contribution)}),(${value.id},'donorInvoices',${tx.json(value)})`;await archiveDonorInvoice(tx,value,user.id,uploaded);});const [document]=await sql`select * from cms_donor_invoice_documents where invoice_id=${value.id}`;assert.ok(document);return document;}
 const existing=await archive(first),bytes=await getObject(existing.storage_key);assert.equal(hash(bytes),existing.file_hash);
 const principal:Principal={id:user.id,name:'Fictieve archiefbeheerder',email:user.email,roleId:'fixture',teamScoped:false,teams:[],departments:[],grants:[{module:'pages',action:'create'}],mfa:false};
 const media=await uploadDocument(principal,new File([Buffer.from(bytes)],'Fictief-archief.pdf',{type:'application/pdf'})),[registered]=await sql`select storage_key from cms_media_objects where id=${media.id}`;
 const variant='variants/'+crypto.randomUUID()+'.pdf',orphan='documents/'+crypto.randomUUID()+'.pdf',fresh='documents/'+crypto.randomUUID()+'.pdf';
 for(const key of [variant,orphan,fresh])await putObject(key,bytes,'application/pdf');await sql`update cms_media_objects set variants=${sql.json([{key:variant}])} where id=${media.id}`;
 const old=new Date(Date.now()-49*3600000);let late:any;const scanned:string[]=[];
 // Listing is deliberately limited to this fixture. No shared object listing,
 // timestamps, records, sessions or cleanup jobs are modified or drained.
 await cleanOrphans(async prefix=>{
  scanned.push(prefix);
  if(prefix==='variants/')return [{key:variant,at:old}];
  if(prefix!=='documents/')return [];
  late=await archive(racing); // committed after the initial keep-set query
  return [{key:existing.storage_key,at:old},{key:late.storage_key,at:old},{key:registered.storage_key,at:old},{key:orphan,at:old},{key:fresh,at:new Date()}];
 });
 assert.deepEqual(scanned,['originals/','variants/','documents/']);assert.ok(late);
 for(const document of [existing,late]){assert.equal(hash(await getObject(document.storage_key)),document.file_hash);const [stored]=await sql`select file_hash,storage_key from cms_donor_invoice_documents where invoice_id=${document.invoice_id}`;assert.equal(stored.file_hash,document.file_hash);assert.equal(stored.storage_key,document.storage_key);}
 for(const key of [registered.storage_key,variant,fresh])assert.equal(hash(await getObject(key)),hash(bytes));
 await assert.rejects(getObject(orphan),'Only the fixture\'s aged, genuinely unregistered upload is removed');
});

import {retiredLaunchCopy} from '../cms/retired-launch-copy';
import {docText} from '../cms/model';
import {equalContent} from '../cms/compare';
import {publicFormPresets} from '../cms/form-presets';
import {currentClubLinks} from '../current-club-links';

const release='public-forms-live-v1';
// A versioned content upgrade, run by the existing migration command on deployment.
// Historical submissions and immutable publication snapshots are never rewritten.
export async function upgradeLaunchContent(sql:any){
  await sql.begin(async(tx:any)=>{
    await tx`select pg_advisory_xact_lock(736402)`;
    if((await tx`select id from cms_audit where action=${release} and record_id is null`).length)return;
    await applyLaunchContent(tx);
    await tx`insert into cms_audit(id,action,request_id,metadata) values (${crypto.randomUUID()},${release},${crypto.randomUUID()},${tx.json({forms:publicFormPresets.map(form=>form.id)})})`;
  });
}

/** Applies the supported content changes inside the caller's transaction. */
export async function applyLaunchContent(tx:any){
  await tx`select pg_advisory_xact_lock(736402)`;
  for(const [id,name,email] of [['secretariaat','Secretariaat','secretariaat@duindorpsv.nl'],['sponsoring','Sponsoring','sponsoring@duindorpsv.nl']]){
    await tx`insert into cms_departments(id,name,emails,active,confirmation) values (${id},${name},${tx.json([email])},true,${'Bedankt voor je bericht. '+name+' neemt contact met je op.'})
      on conflict(id) do update set emails=excluded.emails,active=true,version=cms_departments.version+1`;
  }
  const redirects=await tx`select from_path as "from",to_path as "to" from cms_redirects`;
  async function write(old:any,draft:any,live:any,module:string,id:string){
    if(old&&equalContent(old.draft,draft)&&equalContent(old.live,live))return;
    const version=(old?.version||0)+1;
    if(old)await tx`insert into cms_revisions(id,record_id,version,snapshot,label) values (${crypto.randomUUID()},${id},${old.version},${tx.json(old.draft)},'Voor update websiteformulieren') on conflict(record_id,version) do nothing`;
    await tx`insert into cms_records(id,module,title,department_id,status,version,draft,live) values (${id},${module},${draft.name||draft.title||old?.title||''},${draft.departmentId||null},${old?.status||'published'},${version},${tx.json(draft)},${live?tx.json(live):null})
      on conflict(id) do update set title=excluded.title,department_id=excluded.department_id,version=excluded.version,draft=excluded.draft,live=excluded.live,updated_at=now()`;
    if(live){const publication=crypto.randomUUID();await tx`insert into cms_publications(id,record_id,record_version,snapshot) values (${publication},${id},${version},${tx.json(live)})`;await tx`update cms_records set live_id=${publication} where id=${id}`;}
    await tx`insert into cms_audit(id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${release},${id},${crypto.randomUUID()},${tx.json({version})})`;
  }
  for(const preset of publicFormPresets){
    const [old]=await tx`select * from cms_records where id=${preset.id} for update`;
    if(old&&old.module!=='forms')throw new Error('Een formulier-ID wordt door andere inhoud gebruikt: '+preset.id);
    function definition(source:any){
      const extras=source?.fields?.filter((field:any)=>!preset.fields.some(item=>item.id===field.id))||[];
      return preset.id==='contact'&&source?{...source,departmentId:'secretariaat',active:true}:{...preset,fields:[...preset.fields,...extras]};
    }
    await write(old,definition(old?.draft),definition(old?.live||old?.draft),'forms',preset.id);
  }
  const rows=await tx`select * from cms_records where module in ('media','articles','pages','settings','navigation','hero','documents') and deleted_at is null for update`;
  for(const old of rows){
    function clean(source:any){
      if(!source)return null;
      let data=currentClubLinks(source,redirects);
      function removeRetired(value:any):any {
        if(Array.isArray(value))return value.filter(item=>!(item?.type==='paragraph'&&retiredLaunchCopy.includes(docText(item).trim()))).map(removeRetired);
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,removeRetired(item)]));
        return value;
      }
      data=removeRetired(data);
      if(old.module==='media'){
        if(/^gegenereerd sfeerbeeld|^voorbeeldbeeld$/i.test(data.credit||''))data.credit='';
        if(/^gegenereerd sfeerbeeld[: ]*/i.test(data.alt||''))data.alt=data.alt.replace(/^gegenereerd sfeerbeeld[: ]*(?:van )?/i,'').replace(/^./,(first:string)=>first.toUpperCase());
      }
      return data;
    }
    await write(old,clean(old.draft),clean(old.live),old.module,old.id);
  }
}

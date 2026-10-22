import {z} from 'zod';
import {sqlClient} from '../../db';
import {parsePeopleCsv} from '../cms/people-csv';
import {importDirectoryPeople} from '../cms/directory';
import {readSportlinkSettings} from './sportlink-config';
import {workspaceActor,freshActor,workspaceLocks,requireWrite,secureCodeHash} from './sponsor-access';
import {readDomainStore,fullDirectory,globalRight} from './sponsor-store';
import {persistDomainStore,requireVersion} from './sponsor-persistence';
import {verifyOrigin} from './permissions';
import {CmsError} from './errors';
import {withDomainIds} from '../cms/domain-commands';
const row=z.object({sportlinkId:z.string().trim().min(1).max(100).regex(/^(?!DEMO-SL-)[a-zA-Z0-9._-]+$/i).transform(v=>v.toUpperCase()),name:z.string().trim().min(1).max(120),email:z.union([z.string().trim().email().max(254),z.literal('')]),phone:z.string().max(100),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),membership:z.enum(['playing','non-playing','none']).optional(),teamIds:z.array(z.string().max(191)).max(100).optional()}).strict();
async function access(request:Request){const actor=await workspaceActor(request.headers);if(!fullDirectory(actor.p))throw new CmsError('forbidden','Geen toegang tot de ledenimport.',403);if(!globalRight(actor.p,'users','manage'))requireWrite(actor.p,'directory');return actor;}
export async function directoryImportStatus(request:Request){await access(request);const configuration=await readSportlinkSettings();return {clubCode:configuration.settings.clubCode,liveMembersConfigured:false,message:'De publieke Sportlink-wedstrijdkoppeling geeft geen toegang tot private ledengegevens. Importeer een geautoriseerde export van de eigen club. Er wordt geen live ledensynchronisatie voorgespiegeld.'};}
export async function directoryImportAction(request:Request,body:unknown){
 verifyOrigin(request);const actor=await access(request),input=z.discriminatedUnion('action',[
  z.object({action:z.literal('preview'),clubCode:z.string().trim().min(1).max(80),csv:z.string().max(5000000).optional(),people:z.array(row).max(1000).optional()}).strict(),
  z.object({action:z.literal('apply'),previewId:z.string().uuid()}).strict()
 ]).parse(body);
 return sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);if(!fullDirectory(p))throw new CmsError('forbidden','Je registerrechten zijn gewijzigd.',403);if(!globalRight(p,'users','manage'))requireWrite(p,'directory');
  const configuration=await readSportlinkSettings(tx,true),clubCode=configuration.settings.clubCode;
  if(!clubCode)throw new CmsError('club-unconfirmed','Bevestig eerst de eigen clubidentiteit bij Instellingen → Sportlink.',422);
  const before=await readDomainStore(tx,p);
  if(input.action==='preview'){
   if(input.clubCode!==clubCode)throw new CmsError('club-mismatch','Deze bron hoort niet bij de ingestelde eigen club.',422);
   const rows=z.array(row).min(1).max(1000).parse(input.csv?parsePeopleCsv(input.csv).map(r=>({sportlinkId:r.id,name:r.name,email:r.email,phone:r.phone})):input.people);
   if(new Set(rows.map(r=>r.sportlinkId)).size!==rows.length)throw new CmsError('duplicate-source','Gebruik unieke Sportlink-referenties.',422);
   for(const r of rows){const old=[...before.profiles.values()].find(v=>v.source_ref===r.sportlinkId);if(old?.source_club&&old.source_club!==clubCode)throw new CmsError('club-mismatch','Een bronreferentie is aan een andere club gekoppeld.',409);}
   const id=crypto.randomUUID(),state=structuredClone(before.state);let counts;
   try{counts=withDomainIds(id,0,()=>importDirectoryPeople(state,p.id,rows));}catch(e){throw new CmsError('import-invalid',e instanceof Error?e.message:'Controleer de brongegevens.',422);}
   const result={kind:'directory-import-preview',clubCode,rows,versions:before.versions,expiresAt:Date.now()+1800000};
   await tx`insert into cms_domain_operations(id,actor_id,request_hash,result) values (${id}::uuid,${p.id},${secureCodeHash('import',id,JSON.stringify(rows))},${tx.json(result)})`;
   return {previewId:id,counts,people:rows.map(r=>({sourceId:r.sportlinkId,name:r.name,status:before.state.people.some(p=>p.sportlinkId===r.sportlinkId)?'Bijwerken':'Toevoegen'})),fieldOwnership:'Sportlink: naam, contactgegevens en meegeleverde geboortedatum/lidmaatschap/teams. Lokaal: privé-adres, login, account, functies en ouderrelaties. Ontbrekende bronpersonen worden niet automatisch gearchiveerd.'};
  }
  const [preview]=await tx`select * from cms_domain_operations where id=${input.previewId}::uuid and actor_id=${p.id} for update`;
  if(!preview||preview.result.kind!=='directory-import-preview'||preview.result.clubCode!==clubCode||preview.result.expiresAt<Date.now())throw new CmsError('preview-expired','Maak een nieuwe voorvertoning van deze bron.',409);
  if(preview.result.applied)return {ok:true,counts:preview.result.counts};
  const rows=z.array(row).parse(preview.result.rows);
  for(const r of rows){const old=before.state.people.find(p=>p.sportlinkId===r.sportlinkId);if(old){requireVersion(preview.result.versions,before.versions,'person:'+old.id);requireVersion(preview.result.versions,before.versions,'profile:'+old.id);}}
  const state=structuredClone(before.state),counts=withDomainIds(input.previewId,0,()=>importDirectoryPeople(state,p.id,rows));
  for(const person of state.people){const old=before.state.people.find(value=>value.id===person.id);if(old?.published&&JSON.stringify(old)!==JSON.stringify(person)&&(!globalRight(p,'people','update')||!globalRight(p,'people','publish')))throw new CmsError('forbidden','Voor het wijzigen van gepubliceerde contactpersonen zijn bewerk- en publicatierechten nodig.',403);} 
  await persistDomainStore(tx,p,before,state,input.previewId);
  for(const r of rows){const person=state.people.find(p=>p.sportlinkId===r.sportlinkId)!;await tx`update cms_directory_profiles set source_club=${clubCode} where person_id=${person.id}`;}
  await tx`update cms_domain_operations set result=${tx.json({...preview.result,applied:true,counts})} where id=${input.previewId}::uuid`;
  return {ok:true,counts};
 });
}

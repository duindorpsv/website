import {domainCommandVersionKey} from '../cms/domain-commands';
import {queueSponsorDocumentMail} from './sponsor-document-mail';
import {queueSponsorReminder} from './sponsor-reminders';
import {randomBytes,randomInt} from 'node:crypto';
import {sqlClient} from '../../db';
import * as directory from '../cms/directory';
import * as sponsorship from '../cms/sponsorship';
import * as donors from '../cms/donors';
import * as numbering from '../cms/invoice-numbering';
import {reserveNewInvoiceNumbers,validateStoredNumbering} from './invoice-numbers';
import {queueDonorInvoiceMail} from './donor-invoices';
import {deleteObject} from './storage';
import {withDomainIds} from '../cms/domain-commands';
import type {SponsorSigningParty} from '../cms/sponsorship-types';
import {commandEnvelope,commandArgs} from './sponsor-command-input';
import {workspaceActor,freshActor,requireWrite,requireDonorRight,workspaceLocks,workspaceRate,secureCodeHash,codeMatches,signingEmail,trustedAddress,type WorkspaceActor} from './sponsor-access';
import {readDomainStore,digestText,fullDirectory,globalRight,sponsorStaff,type DomainStore} from './sponsor-store';
import {persistDomainStore,requireVersion} from './sponsor-persistence';
import {CmsError} from './errors';
import {sponsorMail} from './sponsor-mail';
import {requestKey} from './request-key';
import {env} from './env';
import {checkSponsorLogoReference,claimSponsorLogoUploads} from './sponsor-logos';
const portalCommands=new Set(['acceptSponsorProposal','requestSponsorBusinessChange','requestSponsorProfile','saveSponsorMaterial','registerSponsorEvent','cancelSponsorEvent','requestDirectoryGuardian','requestSponsorSigningCode','trySignSponsorAgreement']);
const donorCommands=new Set(['saveDonor','saveDonorContribution','issueDonorInvoice','markDonorInvoicePaid','cancelDonorInvoice','sendDonorInvoice']);
const documentMailCommands=new Set(['sendSponsorProposal','createSponsorAgreement','sendSponsorDocumentEmail']);
const directoryCommands=new Set(['saveDirectoryPerson','bindDirectoryAccount','setDirectoryAccountActive','createDirectoryInvitation','revokeDirectoryInvitation','saveDirectoryGuardian','approveDirectoryGuardian','saveDirectoryAssignment','removeDirectoryAssignment','importDirectoryPeople']);
type PreparedMail={to:string;subject:string;text:string;id:string;kind:'invitation'|'signature';link?:{label:string;href:string}};
const failOtp=()=>new CmsError('otp-invalid','De ondertekeningscode is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.',422);
function asError(error:unknown):never{if(error instanceof CmsError)throw error;throw new CmsError('validation',error instanceof Error?error.message:'Controleer de ingevoerde gegevens.',422);}
function commandAction(name:string,args:any[],before?:DomainStore):'create'|'update'|'delete'|'publish'|'manage'{
 if(['tryCountersignSponsorAgreement','saveSponsorSettings'].includes(name)||name==='requestSponsorSigningCode'&&args[1]==='club')return 'manage';
 if(name==='approveSponsorProfile')return 'publish';
 if(['removeDirectoryAssignment','revokeDirectoryInvitation','removeSponsorMembership','removeSponsorContractTemplate'].includes(name))return 'delete';
 if(name==='saveDirectoryPerson')return before?.people.has(args[0].person.id)?'update':'create';
 if(name==='saveSponsor')return before?.state.sponsorship!.sponsors.some(value=>value.id===args[0].id)?'update':'create';
 if(name==='saveDirectoryAssignment')return before?.state.directory!.assignments.some(value=>value.id===args[0].id)?'update':'create';
 if(name==='saveDirectoryGuardian')return before?.state.directory!.guardians.some(value=>value.id===args[0].id)?'update':'create';
 if(['saveSponsorItem','saveSponsorPackage','saveSponsorContractTemplate','saveSponsorEvent'].includes(name))return before?.records.has(args[0].id)?'update':'create';
 if(name.startsWith('create')||['addSponsorNote','renewSponsorAgreement','logSponsorReminder','requestSponsorSigningCode'].includes(name))return 'create';
 return 'update';
}
function checkCommandRight(p:WorkspaceActor['p'],mode:string,name:string,args:any[]=[],before?:DomainStore){
 if(mode==='donors'&&!donorCommands.has(name)&&name!=='saveInvoiceNumberingSettings')throw new CmsError('forbidden','Deze handeling hoort niet bij Donateurs.',403);
 if(donorCommands.has(name)){if(mode==='portal')throw new CmsError('forbidden','Deze handeling is niet beschikbaar in het portaal.',403);requireDonorRight(p,['saveDonor','saveDonorContribution'].includes(name)?'manage':'invoice');return;}
 if(name==='saveInvoiceNumberingSettings'){if(mode==='portal')throw new CmsError('forbidden','Deze handeling is niet beschikbaar in het portaal.',403);if(args[0]?.donors)requireDonorRight(p,'settings');if(args[0]?.sponsors)requireWrite(p,'sponsors','manage');return;}
 if(documentMailCommands.has(name))requireWrite(p,'sponsors','update');
 if(mode==='portal'){if(!portalCommands.has(name))throw new CmsError('forbidden','Deze handeling is niet beschikbaar in het portaal.',403);return;}
 if(portalCommands.has(name)&&!['requestSponsorSigningCode'].includes(name)&&name!=='requestDirectoryGuardian')throw new CmsError('forbidden','Gebruik je eigen bedrijfsportaal voor deze handeling.',403);
 if(['saveMembership','removeSponsorMembership'].includes(name)&&globalRight(p,'users','manage'))return;
 if(directoryCommands.has(name)){
  if(['bindDirectoryAccount','setDirectoryAccountActive'].includes(name)){if(!globalRight(p,'users','manage'))throw new CmsError('forbidden','Alleen gebruikersbeheer kan accounts wijzigen.',403);return;}
  if(globalRight(p,'users','manage'))return;
  const contact=['saveDirectoryPerson','createDirectoryInvitation','revokeDirectoryInvitation'].includes(name),module=contact&&!fullDirectory(p)?'sponsors':'directory';
  requireWrite(p,module,commandAction(name,args,before));
 }else requireWrite(p,'sponsors',commandAction(name,args,before));
}

function assertPortalCompany(before:DomainStore,companyId:string,name:string,args:any[]){
 if(name==='requestDirectoryGuardian')return;
 if(!companyId||!before.state.sponsorship!.memberships.some(m=>m.sponsorId===companyId)){
  // The server loader already validates the authenticated actor's membership.
  if(!companyId)throw new CmsError('forbidden','Kies een gekoppeld sponsorbedrijf.',403);
 }
 const data=before.state.sponsorship!;
 const actual=['requestSponsorBusinessChange','requestSponsorProfile','saveSponsorMaterial'].includes(name)?args[0]:['registerSponsorEvent','cancelSponsorEvent'].includes(name)?args[1]:[...data.proposals,...data.agreements].find(r=>r.id===args[0])?.sponsorId;
 if(actual!==companyId||name==='requestSponsorSigningCode'&&args[1]!=='sponsor')throw new CmsError('forbidden','Deze handeling hoort niet bij het gekozen sponsorbedrijf.',403);
}

async function committedVersions(tx:any,commands:{name:string;args:any[]}[],before:DomainStore){
 const keys=new Set(commands.map(command=>domainCommandVersionKey(command.name,command.args)).filter(Boolean));
 for(const command of commands){if(command.name==='saveDirectoryPerson')keys.add('profile:'+command.args[0].person.id);if(command.name==='bindDirectoryAccount'){for(const id of [command.args[0],before.accounts.get(command.args[1])?.person_id].filter(Boolean)){keys.add('person:'+id);keys.add('profile:'+id);}}}
 const tables:Record<string,[string,string]>={person:['cms_records','id'],profile:['cms_directory_profiles','person_id'],company:['cms_sponsor_companies','id'],record:['cms_sponsor_records','id'],membership:['cms_sponsor_memberships','id'],guardian:['cms_directory_guardians','id'],assignment:['cms_directory_assignments','id']},versions:Record<string,number>={};
 for(const key of keys){const separator=key.indexOf(':'),definition=tables[key.slice(0,separator)];if(!definition)continue;const [row]=await tx`select version from ${tx(definition[0])} where ${tx(definition[1])}=${key.slice(separator+1)}`;versions[key]=row?.version||0;}
 return versions;
}
async function existingOperation(id:string,actorId:string,hash:string){const [old]=await sqlClient()`select * from cms_domain_operations where id=${id}::uuid`;if(!old)return null;if(old.actor_id!==actorId||old.request_hash!==hash)throw new CmsError('operation-conflict','Dit verzoeknummer is al gebruikt.',409);if(old.result.mailStatus==='prepared')throw new CmsError('mail-pending','De mailaanvraag is nog niet bevestigd. Vernieuw het scherm; vraag zo nodig een nieuwe uitnodiging of code aan.',409);if(old.result.mailStatus==='failed')throw new CmsError('mail-failed','De e-mail kon niet worden bevestigd. Vraag een nieuwe link of code aan.',503);return old.result;}
export async function workspaceCommands(request:Request,value:unknown,portal=false){
 const input=commandEnvelope.parse(value);if((input.mode==='portal')!==portal)throw new CmsError('forbidden','Deze werkplek is niet beschikbaar.',403);
 const actor=await workspaceActor(request.headers),hash=secureCodeHash('operation',input.operationId,JSON.stringify(input));
 const commands=input.commands.map(c=>{
  const schema=commandArgs[c.name];if(!schema)throw new CmsError('unknown-command','Deze handeling wordt niet ondersteund.',422);
  return {...c,args:schema.parse(c.args) as any[]};
 });
 // Cached results still require current session validity and current command rights.
 await sqlClient().begin(async tx=>{const p=await freshActor(tx,actor);for(const command of commands)if(donorCommands.has(command.name)||command.name==='saveInvoiceNumberingSettings'||documentMailCommands.has(command.name))checkCommandRight(p,input.mode,command.name,command.args);});
 const cached=await existingOperation(input.operationId,actor.p.id,hash);if(cached)return cached;
 if(commands.some(c=>c.name==='requestSponsorSigningCode'||c.name.startsWith('try'))&&commands.length!==1)throw new CmsError('validation','Voer de ondertekenstap afzonderlijk uit.',422);
 const signing=commands.find(c=>c.name==='trySignSponsorAgreement'||c.name==='tryCountersignSponsorAgreement');
 let attempted:any;
 if(commands.some(c=>c.name==='requestSponsorSigningCode')){await workspaceRate('sponsor:code-ip:'+requestKey(request),20,900);}
 if(commands.some(c=>c.name==='createDirectoryInvitation'))await workspaceRate('directory:invite:'+actor.p.id,100,3600);
 if(signing){
  checkCommandRight(actor.p,input.mode,signing.name);await workspaceRate('sponsor:verify:'+requestKey(request),100,900);
  const [agreementId,proof]=signing.args,party=signing.name==='trySignSponsorAgreement'?'sponsor':'club',email=signingEmail(actor,actor.p);
  // An incorrect attempt is committed independently of the business transaction.
  [attempted]=await sqlClient()`update cms_sponsor_signing_challenges set attempts=attempts+1 where id=${proof.challengeId} and agreement_id=${agreementId} and user_id=${actor.p.id} and party=${party} and email=${email} and status='pending' and mail_status='accepted' and issued_at is not null and expires_at>now() and attempts<5 returning *`;
  if(!attempted||!codeMatches(attempted.code_hash,secureCodeHash('signature',attempted.id,proof.verificationCode)))throw failOtp();
 }
 const mails:PreparedMail[]=[];
 const uploaded:string[]=[];
 let result:any;try{result=await sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);
  const [old]=await tx`select * from cms_domain_operations where id=${input.operationId}::uuid`;
  if(old){if(old.actor_id!==p.id||old.request_hash!==hash)throw new CmsError('operation-conflict','Dit verzoeknummer is al gebruikt.',409);for(const command of commands)if(donorCommands.has(command.name)||command.name==='saveInvoiceNumberingSettings'||documentMailCommands.has(command.name))checkCommandRight(p,input.mode,command.name,command.args);return old.result;}
  const before=await readDomainStore(tx,p,{portal,companyId:input.companyId});
  const state=structuredClone(before.state);
  const logoUploads=new Set<string>();
  const extraIds=new Set<string>();
  let documentMailStatus='none';
  const documentMailIntents:{id:string;phase:'proposal'|'agreement'|'signed'}[]=[];
  if(portal&&commands.some(c=>c.name==='acceptSponsorProposal')){
   const rows=await tx`select id,kind,data from cms_sponsor_records where kind in ('items','packages','proposals','agreements') and (sponsor_id is null or sponsor_id<>${input.companyId})`;
   for(const r of rows){if((state.sponsorship as any)[r.kind].some((v:any)=>v.id===r.id))continue;(state.sponsorship as any)[r.kind].push({...r.data,id:r.id});extraIds.add(r.id);}
  }
  for(const command of commands){
   const {name,args,offset}=command;checkCommandRight(p,input.mode,name,args,before);if(portal){assertPortalCompany(before,input.companyId,name,args);
    const roles=state.sponsorship!.memberships.find(m=>m.userId===p.id&&m.sponsorId===input.companyId)?.roles||[];
    const wanted=['acceptSponsorProposal','requestSponsorSigningCode','trySignSponsorAgreement'].includes(name)?['signer']:name==='requestSponsorBusinessChange'?['signer','billing']:['requestSponsorProfile','saveSponsorMaterial'].includes(name)?['marketing']:[];
    if(wanted.length&&!roles.some(r=>wanted.includes(r)))throw new CmsError('forbidden','Je hebt niet de benodigde bedrijfsrol.',403);
   }
   for(const [source,field] of [[args[0]?.publicProfile,'logoUrl'],[args[0],'logoUrl'],[args[1],'logoUrl'],[args[1],'proofUrl']] as const){
    const url=source?.[field];if(!url)continue;
    if(typeof url!=='string'||/^data:/i.test(url))throw new CmsError('upload-required','Upload het bestand naar de beveiligde opslag.',422);
    let target:URL;try{target=new URL(url,env().APP_BASE_URL);}catch{throw new CmsError('validation','Gebruik een geldige bestands- of afbeeldingslink.',422);}
    const local=target.origin===new URL(env().APP_BASE_URL).origin;
    const match=local?/^\/api\/sponsorship\/(logos|files|previews)\/([a-zA-Z0-9-]+)$/.exec(target.pathname):null;
    if(local&&/^\/api\/sponsorship\/(?:logos|files|previews)\//.test(target.pathname)&&!match)throw new CmsError('file-scope','Gebruik de beveiligde bestandslink voor deze relatie.',422);
    if(match){const company=name==='updateSponsorTask'?state.sponsorship!.tasks.find(t=>t.id===args[0])?.sponsorId:typeof args[0]==='string'?args[0]:args[0]?.id;
     if(field==='logoUrl'||match[1]==='logos'){const temporary=await checkSponsorLogoReference(tx,actor,p,match[2],company,['saveSponsor','requestSponsorProfile','saveSponsorMaterial'].includes(name));if(temporary)logoUploads.add(match[2]);}
     else{const [file]=await tx`select sponsor_id from cms_sponsor_files where id=${match[2]}`;if(!file||file.sponsor_id!==company)throw new CmsError('file-scope','Dit bestand hoort niet bij het gekozen bedrijf.',403);}
     // Store internal references without a host, query or fragment so the
     // same stable file keeps working after promotion from dev to staging.
     source[field]=field==='logoUrl'?'/api/sponsorship/logos/'+match[2]:target.pathname;
    }
   }
   const key=domainCommandVersionKey(name,args);if(key)requireVersion(input.versions,before.versions,key);
   if(name==='saveDirectoryGuardian'){
    const value=args[0],old=state.directory!.guardians.find(g=>g.id===value.id);value.requestedBy=old?.requestedBy||p.id;value.requestedAt=old?.requestedAt||new Date().toISOString();
   }
   if(name==='saveSponsor'){
    const value=args[0],old=before.state.sponsorship!.sponsors.find(company=>company.id===value.id),profileKeys=['name','description','website','logoUrl'] as const;
    if((old?.publicEnabled||false)!==value.publicEnabled||value.publicEnabled&&(!old||old.publicFrom!==value.publicFrom||old.publicUntil!==value.publicUntil||profileKeys.some(key=>old.publicProfile[key]!==value.publicProfile[key])))requireWrite(p,'sponsors','publish');
   }
   if(name==='saveDirectoryPerson'){
    requireVersion(input.versions,before.versions,'profile:'+args[0].person.id);
    const old=before.state.people.find(person=>person.id===args[0].person.id),value=args[0].person;
    if(old?.published&&['name','email','phone'].some(key=>(old as any)[key]!==value[key].trim())&&(!globalRight(p,'people','update')||!globalRight(p,'people','publish')))throw new CmsError('public-contact','Wijzig gepubliceerde contactgegevens via Websiteprofielen met bewerk- en publicatierechten.',403);
   }
   if(name==='importDirectoryPeople')throw new CmsError('import-preview','Gebruik de gecontroleerde Sportlink-import met voorvertoning.',422);
   if(name==='requestDirectoryGuardian')throw new CmsError('family-code','Gebruik de persoonscode via Mijn club.',422);
   if(name==='setDirectoryAccountActive'){
    const [account]=await tx`select m.*,u.banned from cms_memberships m join auth_user u on u.id=m.user_id where m.user_id=${args[0]} for update`;
    if(account?.role_id==='admin'&&p.roleId!=='admin')throw new CmsError('forbidden','Alleen een volledige beheerder kan dit account wijzigen.',403);
    if(account?.role_id==='admin'&&!args[1]){const [count]=await tx`select count(*)::int as n from cms_memberships m join auth_user u on u.id=m.user_id where m.role_id='admin' and m.active and not coalesce(u.banned,false) and u.supabase_user_id is not null`;if(count.n<=1)throw new CmsError('last-admin','Behoud minimaal één actieve volledige beheerder.',409);}
   }
   if(name==='createDirectoryInvitation'){
    const v=args[0];const existing=await tx`select a.person_id,u.banned,m.active,u.email from auth_user u left join cms_person_accounts a on a.user_id=u.id left join cms_memberships m on m.user_id=u.id where lower(u.email)=${v.email}`;
    if(existing.some((r:any)=>r.person_id!==v.personId||r.banned||!r.active))throw new CmsError('email-claimed','Dit inlogadres is niet beschikbaar voor deze persoon. Laat gebruikersbeheer dit beoordelen.',409);
    const reserved=await tx`select person_id from cms_directory_invitations where email=${v.email} and status='pending' and expires_at>now() and person_id<>${v.personId}`;if(reserved.length)throw new CmsError('email-claimed','Dit inlogadres is al gereserveerd voor een andere persoon.',409);
   }
   const invoiceIds=new Set([...state.sponsorship!.invoices,...(state.sponsorship!.donors?.invoices||[])].map(row=>row.id));
   const previousNumbering=numbering.getInvoiceNumbering(state.sponsorship!);
   try{
    if(signing){
     signingEmail(actor,p);const [id,proof]=args,party:SponsorSigningParty=name==='trySignSponsorAgreement'?'sponsor':'club';
     const [consumed]=await tx`update cms_sponsor_signing_challenges set status='consumed',consumed_at=now() where id=${attempted.id} and code_hash=${attempted.code_hash} and user_id=${p.id} and email=${p.email.toLowerCase()} and status='pending' and expires_at>now() and mail_status='accepted' returning *`;
     const agreement=state.sponsorship!.agreements.find(a=>a.id===id);
     if(!consumed||!agreement||consumed.document_hash!==agreement.documentHash)throw failOtp();
     withDomainIds(input.operationId,offset,()=>sponsorship.appendVerifiedSponsorSignature(state,p.id,id,party,{function:proof.function,consent:proof.consent},{email:consumed.email,challengeId:consumed.id,verifiedAt:new Date(consumed.consumed_at).toISOString(),ipAddress:trustedAddress(request)}));
     const signature=agreement.signatures.at(-1)!;
     await tx`insert into cms_sponsor_signatures(id,agreement_id,user_id,party,document_hash,challenge_id,proof) values (${signature.id},${id},${p.id},${party},${agreement.documentHash},${consumed.id},${tx.json(signature)})`;
    }else{
     const fn=({...directory,...sponsorship,...donors,...numbering} as unknown as Record<string,Function>)[name];
     if(!fn)throw new CmsError('unknown-command','Deze handeling bestaat niet.',422);
     const changed=withDomainIds(input.operationId,offset,()=>fn(state,p.id,...args));
     if([...state.sponsorship!.invoices,...(state.sponsorship!.donors?.invoices||[])].some(row=>!invoiceIds.has(row.id)))await reserveNewInvoiceNumbers(tx,state.sponsorship!,previousNumbering,invoiceIds);
     if(name==='saveInvoiceNumberingSettings')await validateStoredNumbering(tx,state.sponsorship!);
     if(name==='sendDonorInvoice'){const invoice=state.sponsorship!.donors!.invoices.find(row=>row.id===args[0])!;await queueDonorInvoiceMail(tx,invoice,p.id,input.operationId);}
     if(donorCommands.has(name)||name==='saveInvoiceNumberingSettings')await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${p.id},${name},null,${input.operationId},${tx.json({reference:typeof args[0]==='string'?args[0]:args[0]?.id||null,...(name==='markDonorInvoicePaid'?{paymentReference:args[1],method:'manual'}:{}),...(name==='cancelDonorInvoice'?{reason:args[1]}:{})})})`;
     if(name==='sendSponsorDocumentEmail')documentMailIntents.push({id:args[0],phase:args[1]==='agreement'&&changed.status==='signed'?'signed':args[1]});
     if(name==='sendSponsorProposal')documentMailIntents.push({id:changed.id,phase:'proposal'});
     if(name==='createSponsorAgreement')documentMailIntents.push({id:changed.id,phase:'agreement'});
     if(name==='logSponsorReminder')await queueSponsorReminder(tx,state,args[0],input.operationId);
     if(name==='createDirectoryInvitation'){
      const token=randomBytes(32).toString('hex');changed.token=digestText(token);
      mails.push({id:changed.id,to:changed.email,kind:'invitation',subject:'Je uitnodiging voor Duindorp SV',text:'Je bent uitgenodigd voor het persoonlijke Duindorp SV-portaal. De uitnodiging is 72 uur geldig. Je bevestigt je eigen e-mailadres met een achtcijferige code.',link:{label:'Uitnodiging openen',href:env().APP_BASE_URL.replace(/\/$/,'')+'/portaal/uitnodiging#code='+token}});
     }
     if(name==='requestSponsorSigningCode'){
      signingEmail(actor,p);await workspaceRate('sponsor:code:'+p.id,1,60,tx);const code=String(randomInt(0,100000000)).padStart(8,'0');
      await tx`update cms_sponsor_signing_challenges set status='revoked' where agreement_id=${changed.agreementId} and user_id=${p.id} and party=${changed.party} and status='pending'`;
      await tx`insert into cms_sponsor_signing_challenges(id,agreement_id,sponsor_id,user_id,party,email,document_hash,code_hash,expires_at) values (${changed.id},${changed.agreementId},${changed.sponsorId},${p.id},${changed.party},${changed.email},${changed.documentHash},${secureCodeHash('signature',changed.id,code)},${changed.expiresAt})`;
      mails.push({id:changed.id,to:changed.email,kind:'signature',subject:'Je ondertekeningscode voor Duindorp SV',text:'Je code: '+code+'\nDeze code is tien minuten geldig en geldt alleen voor jouw ondertekening van deze overeenkomst.\nDocumenthash: '+changed.documentHash});
     }
    }
   }catch(error){asError(error);}
  }
  for(const kind of ['items','packages','proposals','agreements'] as const)state.sponsorship![kind]=state.sponsorship![kind].filter(v=>!extraIds.has(v.id)) as never;
  for(const kind of ['agreements'] as const){
   const fresh=state.sponsorship![kind].filter(value=>!before.records.has(value.id));if(!fresh.length)continue;
   const prefix='DSV-'+new Date().getFullYear()+'-';
   const used=await tx`select data->>'number' as number from cms_sponsor_records where kind=${kind} and data->>'number' like ${prefix+'%'}`;
   let sequence=used.reduce((highest:number,r:any)=>{const value=Number(String(r.number).slice(prefix.length));return Number.isSafeInteger(value)?Math.max(highest,value):highest;},0);
   for(const value of fresh)value.number=prefix+String(++sequence).padStart(3,'0');
  }
  await persistDomainStore(tx,p,before,state,input.operationId,uploaded);
  await claimSponsorLogoUploads(tx,actor,logoUploads);
  for(const intent of documentMailIntents)documentMailStatus=(await queueSponsorDocumentMail(tx,intent.id,intent.phase,input.operationId,p.id)).status;
  for(const a of state.sponsorship!.agreements)if(a.status==='signed'&&before.state.sponsorship!.agreements.find(v=>v.id===a.id)?.status!=='signed')await tx`insert into cms_jobs(id,operation_id,kind,payload) values (${crypto.randomUUID()},${'sponsor-pdf-'+a.id},'sponsor-final-pdf',${tx.json({agreementId:a.id,actorId:p.id})}) on conflict(operation_id) do nothing`;
  for(const agreement of state.sponsorship!.agreements)if(agreement.status==='signed'&&!before.state.sponsorship!.agreements.some(old=>old.id===agreement.id&&old.status==='signed'))await queueSponsorDocumentMail(tx,agreement.id,'signed',input.operationId,p.id,false);
  const response={ok:true,mailStatus:mails.length?'prepared':commands.some(command=>command.name==='sendDonorInvoice')?'queued':documentMailStatus,issuedDonorInvoices:commands.filter(command=>command.name==='issueDonorInvoice').map(command=>state.sponsorship!.donors!.invoices.find(invoice=>invoice.contributionId===command.args[0]&&invoice.status!=='cancelled')?.id).filter((id):id is string=>typeof id==='string'),versions:await committedVersions(tx,commands,before)};
  await tx`insert into cms_domain_operations(id,actor_id,request_hash,result) values (${input.operationId}::uuid,${p.id},${hash},${tx.json(response)})`;
  return response;
 });}catch(error){await Promise.allSettled(uploaded.map(key=>deleteObject(key)));throw error;}
 if(mails.length){
  try{
   for(const mail of mails){
    await sponsorMail(mail.to,mail.subject,mail.text,'sponsor-'+mail.id,mail.link);
    const sql=sqlClient();if(mail.kind==='invitation')await sql`update cms_directory_invitations set mail_status='accepted' where id=${mail.id} and status='pending'`;
    else await sql`update cms_sponsor_signing_challenges set mail_status='accepted',issued_at=now() where id=${mail.id} and status='pending'`;
   }
   result.mailStatus='accepted';await sqlClient()`update cms_domain_operations set result=${sqlClient().json(result)} where id=${input.operationId}::uuid`;
  }catch(error){
   const sql=sqlClient();for(const mail of mails){if(mail.kind==='invitation')await sql`update cms_directory_invitations set mail_status='failed',status='revoked' where id=${mail.id} and mail_status<>'accepted'`;else await sql`update cms_sponsor_signing_challenges set mail_status='failed',status='revoked' where id=${mail.id} and mail_status<>'accepted'`;}
   await sql`update cms_domain_operations set result=${sql.json({ok:false,mailStatus:'failed'})} where id=${input.operationId}::uuid`;throw error;
  }
 }
 return result;
}

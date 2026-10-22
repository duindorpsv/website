import {z} from 'zod';
import {env} from './env';
import {sqlClient} from '../../db';
import {workspaceActor,freshActor,workspaceLocks,requireWrite,secureCodeHash} from './sponsor-access';
import {CmsError} from './errors';
import {verifyOrigin} from './permissions';
import {emptyState,validateCandidate} from './records';
import {textDoc,emptySEO,slugify} from '../cms/model';
import {createCampaign} from '../cms/newsletter';
import {newsletterSchema} from '../cms/newsletter-schema';
import {saveNewsletterResource} from './newsletter-workspace';
/** Sponsors may prepare this constrained draft; redaction retains publication/audience rights. */
export async function sponsorChannelDraft(request:Request,body:unknown){
 verifyOrigin(request);const input=z.object({operationId:z.string().uuid(),companyId:z.string().min(1).max(191),kind:z.enum(['news','newsletter'])}).strict().parse(body),actor=await workspaceActor(request.headers),hash=secureCodeHash('channel',input.operationId,JSON.stringify(input));
 return sqlClient().begin(async tx=>{
  await workspaceLocks(tx);const p=await freshActor(tx,actor);requireWrite(p,'sponsors','create');
  const [existing]=await tx`select * from cms_domain_operations where id=${input.operationId}::uuid`;
  if(existing){if(existing.actor_id!==p.id||existing.request_hash!==hash)throw new CmsError('conflict','Dit verzoeknummer is al gebruikt.',409);return existing.result;}
  const [company]=await tx`select data from cms_sponsor_companies where id=${input.companyId}`;
  if(!company?.data.publicEnabled||!company.data.publicProfile?.name?.trim())throw new CmsError('profile-not-approved','Keur eerst het publieke sponsorprofiel goed.',422);
  const profile=company.data.publicProfile,title=('Samen voor de club: '+profile.name).slice(0,200),intro=(profile.description||profile.name+' steunt Duindorp SV. Samen bouwen we aan onze club en onze wijk.').slice(0,400),at=new Date().toISOString();
  let id='';
  if(input.kind==='news'){
   id='sponsor-news-'+input.operationId;
   const content=validateCandidate('articles',{id,contentType:'news',storyFormat:'story',title,slug:slugify(title).slice(0,150)+'-'+input.operationId,intro,body:textDoc([intro,'Met steun van onze sponsoren geven we voetbal en het clubleven in Duindorp ruimte.']),coverId:'',author:'Sponsorcommissie Duindorp SV',category:'Vereniging',tags:['sponsoring'],teamId:'',season:'',seo:emptySEO(),featured:false,publishedAt:'',status:'review',scheduledAt:'',updatedAt:at,revisions:[],demo:false});
   await tx`insert into cms_records(id,module,title,slug,content_type,status,draft) values (${id},'articles',${content.title},${content.slug},'news','review',${tx.json(content)})`;
   await tx`insert into cms_revisions(id,record_id,version,snapshot,label,actor_id) values (${crypto.randomUUID()},${id},1,${tx.json(content)},'Sponsorconcept ter beoordeling door redactie',${p.id})`;
  }else{
   const state=emptyState();const [settings]=await tx`select data from cms_newsletter_resources where id='newsletter-settings'`;
   if(settings)state.newsletter={campaigns:[],audiences:[],contacts:[],logs:[],settings:settings.data};
   const campaign=createCampaign(state);id=campaign.id;campaign.name=('Sponsoruitlichting · '+profile.name).slice(0,250);campaign.subject=title;campaign.preheader='Onze partners. Onze club. Onze trots.';campaign.audienceIds=[];campaign.status='draft';const destination=profile.website||new URL('/clubmuur/club/sponsoren#'+encodeURIComponent(input.companyId),env().APP_BASE_URL).href;campaign.blocks=[...(profile.logoUrl?[{id:crypto.randomUUID(),type:'image' as const,imageUrl:new URL(profile.logoUrl,env().APP_BASE_URL).href,imageAlt:'Logo '+profile.name,url:destination}]:[]),{id:crypto.randomUUID(),type:'text',body:textDoc([intro])},{id:crypto.randomUUID(),type:'button',title:'Maak kennis met '+profile.name,url:destination}];
   const parsed=newsletterSchema.shape.campaigns.parse([campaign])[0];await saveNewsletterResource(tx,id,'campaign',parsed,0);
  }
  await tx`insert into cms_audit(id,actor_id,action,record_id,request_id,metadata) values (${crypto.randomUUID()},${p.id},'sponsor-editorial-draft',${id},${input.operationId},${tx.json({kind:input.kind,sponsorId:input.companyId})})`;
  const result={ok:true,id,kind:input.kind,message:input.kind==='news'?'Nieuwsbericht staat ter beoordeling bij de redactie.':'Nieuwsbriefconcept staat klaar. De redactie kiest doelgroep en verzendmoment.'};
  await tx`insert into cms_domain_operations(id,actor_id,request_hash,result) values (${input.operationId}::uuid,${p.id},${hash},${tx.json(result)})`;
  return result;
 });
}

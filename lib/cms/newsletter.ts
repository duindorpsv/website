import type {CmsDoc,CmsState} from './types';
import type {NewsletterAudience,NewsletterBlock,NewsletterBlockType,NewsletterCampaign,NewsletterContact,NewsletterSnapshot,NewsletterState} from './newsletter-types';
import {contentPath,textDoc,uid} from './model';
import {newsletterEmailSchema} from './newsletter-schema';

const normalized=(value:string)=>value.trim().toLowerCase();
export function publicNewsletterHost(host:string):boolean{return !!host&&!/^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)/i.test(host)&&!/[.]local$|[.]internal$|[.]localhost$/i.test(host);}
export function validNewsletterEmail(value:string):boolean{return newsletterEmailSchema.safeParse(value).success;}
export function validNewsletterLink(value:string):boolean{try{const input=value.trim();if(!input||/[\s\u0000-\u001f\u007f<>"'\\]/.test(input)||input.startsWith('//')||!(/^(https?:\/\/|\/(?!\/))/.test(input)))return false;const url=new URL(input,'https://duindorpsv.nl');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&publicNewsletterHost(url.hostname);}catch{return false;}}
/** CMS thumbnails require login; email images use the published public media endpoint. */
export function newsletterImageUrl(value:string):string{
 const match=/^\/api\/cms\/media\/([^/?#]+)\/file$/.exec(value);
 return match?'/api/media/'+match[1]:value;
}
export function validNewsletterImageUrl(value:string):boolean{try{return validNewsletterLink(value)&&!new URL(value,'https://duindorpsv.nl').pathname.startsWith('/api/cms/');}catch{return false;}}
export function newsletterDocText(doc:CmsDoc|undefined):string{return !doc?'':doc.text||(doc.content||[]).map(newsletterDocText).join(doc.type==='doc'?'\n':' ');}

export function createBlock(type:NewsletterBlockType):NewsletterBlock{
 const block:NewsletterBlock={id:uid('mail-block'),type};
 if(type==='text')block.body=textDoc(['Schrijf hier je bericht.']);
 if(type==='button'){block.title='Bekijk de website';block.url='/clubmuur';}
 if(type==='image'){block.imageUrl='';block.imageAlt='';}
 if(type==='spacer')block.gap=24;
 return block;
}

export function createNewsletterSeed():NewsletterState{return {campaigns:[],contacts:[],audiences:[],logs:[],settings:{fromName:'Duindorp SV',replyTo:'secretariaat@duindorpsv.nl',footer:'Duindorp SV · Sportpark Houtrust · Houtrustlaan 1 · 2566 ZW Den Haag',siteUrl:'https://duindorpsv.nl'}};}
export function getNewsletterState(state:{newsletter?:NewsletterState}):NewsletterState{return state.newsletter||createNewsletterSeed();}
export function ensureNewsletterState(state:{newsletter?:NewsletterState}):NewsletterState{return state.newsletter??=createNewsletterSeed();}

/** Audience membership is a union. Global suppression always wins, also across
 * duplicate contact rows or when a subscribed record belongs to another group.
 */
export function resolveRecipients(newsletter:NewsletterState,audienceIds:string[]):NewsletterContact[]{
 const groups=new Set(audienceIds),audiences=newsletter.audiences.filter(audience=>groups.has(audience.id));
 const blocked=new Set(newsletter.contacts.filter(contact=>contact.status==='unsubscribed'||contact.status==='suppressed').map(contact=>normalized(contact.email)));
 const result=new Map<string,NewsletterContact>();
 for(const contact of newsletter.contacts){
  const email=normalized(contact.email);
  if(contact.source==='demo'||email.endsWith('.invalid')||contact.status!=='subscribed'||blocked.has(email)||!validNewsletterEmail(email)||!contact.consentAt||!Number.isFinite(Date.parse(contact.consentAt)))continue;
  const tags=new Set(contact.tags.map(normalized));
  if(!audiences.some(audience=>audience.mode==='manual'?audience.contactIds.includes(contact.id):audience.tags.some(tag=>tags.has(normalized(tag)))))continue;
  if(!result.has(email))result.set(email,{...contact,email,tags:[...contact.tags]});
 }
 return [...result.values()];
}

export function audienceRecipients(newsletter:NewsletterState,audience:NewsletterAudience):NewsletterContact[]{return resolveRecipients({...newsletter,audiences:[audience]},[audience.id]);}

/** A copied article never reads the editor's unpublished working version. */
export function articleToBlock(state:CmsState,articleId:string):NewsletterBlock{
 const article=state.articles.find(row=>row.id===articleId&&!row.deletedAt&&row.live?.contentType==='news');
 if(!article?.live)throw new Error('Kies een gepubliceerd nieuwsbericht.');
 const live=article.live,cover=state.media.find(media=>media.id===live.coverId&&media.published&&!media.deletedAt);
 return {id:uid('mail-block'),type:'article',sourceArticleId:article.id,title:live.title,text:live.intro,url:`/clubmuur/${contentPath(live)}`,...(cover?.src&&validNewsletterLink(cover.src)?{imageUrl:newsletterImageUrl(cover.src),imageAlt:cover.alt||live.title}:{})};
}

/** Return a new draft; the caller decides when to persist it in campaigns. */
export function createCampaign(state:CmsState,articleId?:string,at=new Date().toISOString()):NewsletterCampaign{
 const newsletter=getNewsletterState(state as CmsState & {newsletter?:NewsletterState}),block=articleId?articleToBlock(state,articleId):null;
 const campaign:NewsletterCampaign={id:uid('newsletter'),name:block?`Nieuwsbericht · ${block.title}`.slice(0,250):'Nieuwe clubpost',subject:(block?.title||'Nieuws van Duindorp SV').slice(0,200),preheader:(block?.text||'').slice(0,250),fromName:newsletter.settings.fromName,replyTo:newsletter.settings.replyTo,audienceIds:newsletter.audiences[0]?[newsletter.audiences[0].id]:[],blocks:[],status:'draft',updatedAt:at,scheduledAt:''};
 if(block){
  const live=state.articles.find(article=>article.id===articleId)!.live!;
  block.body=structuredClone(live.body);
  if(normalized(newsletterDocText(live.body.content?.[0]))===normalized(live.intro))block.text='';
  campaign.blocks=[block];
 }else campaign.blocks=[{...createBlock('text'),body:textDoc(['Beste {{voornaam}},','Hier begint de nieuwe clubpost. Voeg je nieuws, foto’s en activiteiten toe.'])},createBlock('button')];
 return campaign;
}

export function captureCampaign(campaign:NewsletterCampaign,at=new Date().toISOString()):NewsletterSnapshot{
 return structuredClone({name:campaign.name,subject:campaign.subject,preheader:campaign.preheader,fromName:campaign.fromName,replyTo:campaign.replyTo,audienceIds:campaign.audienceIds,blocks:campaign.blocks,capturedAt:at});
}

export function validateCampaign(campaign:Pick<NewsletterCampaign,'subject'|'fromName'|'replyTo'|'blocks'|'audienceIds'>,newsletter:NewsletterState):string[]{
 const errors:string[]=[];
 if(!campaign.subject.trim())errors.push('Vul een onderwerp in.');
 if(campaign.subject.length>200||/[\u0000-\u001f\u007f]/.test(campaign.subject))errors.push('Gebruik een onderwerp op één regel van maximaal 200 tekens.');
 if(!campaign.fromName.trim())errors.push('Vul een afzendernaam in.');
 if(campaign.fromName.length>150||/[\u0000-\u001f\u007f<>]/.test(campaign.fromName))errors.push('Gebruik een afzendernaam op één regel van maximaal 150 tekens.');
 if(!validNewsletterEmail(campaign.replyTo))errors.push('Vul een geldig antwoordadres in.');
 if(!campaign.audienceIds.length)errors.push('Kies minimaal één doelgroep.');
 if(campaign.audienceIds.some(id=>!newsletter.audiences.some(audience=>audience.id===id)))errors.push('Een geselecteerde doelgroep bestaat niet meer.');
 if(!resolveRecipients(newsletter,campaign.audienceIds).length)errors.push('Er zijn geen bevestigde ontvangers in deze selectie.');
 if(!campaign.blocks.some(block=>block.type==='text'?newsletterDocText(block.body).trim():block.type==='article'?block.title?.trim():block.type==='image'?block.imageUrl?.trim():block.type==='button'?block.title?.trim():false))errors.push('Voeg inhoud toe aan de nieuwsbrief.');
 for(const block of campaign.blocks){
  if((block.type==='article'||block.type==='button')&&(!block.url||!validNewsletterLink(block.url)))errors.push('Geef ieder nieuws- en knopblok een geldige link.');
  if(block.type==='button'&&!block.title?.trim())errors.push('Geef iedere knop een tekst.');
  if(block.type==='image'&&(!block.imageUrl||!validNewsletterLink(block.imageUrl)))errors.push('Geef ieder fotoblok een geldige afbeeldingslink.');
  if(block.imageUrl&&!validNewsletterLink(block.imageUrl))errors.push('Een afbeelding bevat geen geldige link.');
 }
 return [...new Set(errors)];
}

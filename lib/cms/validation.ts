import {newsletterSchema} from './newsletter-schema';
import {matchPreviewStateSchema} from './match-preview';
import {z} from 'zod';
import {planningSchema} from './planning';
import {heroSliderSchema} from './hero-slider';
import {safeDestination} from './layout/document';
import {validHeroCards,type HeroCardConfig} from '../clubmuur-config';
import {validHeroPortraits,type HeroPortrait} from './hero-portraits';
import {validClubNavigation,type ClubNavigationItem} from '../clubmuur-navigation';
import {trainingSchema} from './training';
import {agendaSchema} from '../club-agenda';
import {validHeroPhotoIds,type HeroPhotoId} from '../clubmuur-layouts';
import type {CmsState} from './types';

const text=z.string();
const id=text.min(1);
const number=z.number().finite();
const date=text.refine(value=>Number.isFinite(Date.parse(value)),'Ongeldige datum');
const optionalDate=text.refine(value=>!value||Number.isFinite(Date.parse(value)),'Ongeldige datum');
const permissions=['news','stories','pages','media','people','forms','settings','users','publish'] as const;
const statuses=z.enum(['draft','review','scheduled','published','archived']);
const seo=z.object({title:text,description:text,noIndex:z.boolean()});
const widget=z.object({committeeId:text.optional(),contentType:z.enum(['news','story']).optional(),title:text.optional(),text:text.optional(),refId:text.optional(),ids:z.array(text).optional(),url:text.optional(),label:text.optional(),layout:text.optional(),items:z.array(z.object({title:text,text,url:text.optional()})).optional()});
const widgetKinds=['person','people','image','textImage','columns','album','news','documents','faq','timeline','cta','team','contact','form','story','training','newsletter','matches'];
const doc:z.ZodType<unknown>=z.lazy(()=>z.object({
  type:id,text:text.optional(),attrs:z.record(z.unknown()).optional(),
  marks:z.array(z.object({type:id,attrs:z.record(z.unknown()).optional()})).optional(),
  content:z.array(doc).optional(),
}).superRefine((node,context)=>{
  if(node.type==='cmsWidget'&&(!widgetKinds.includes(String(node.attrs?.kind))||!widget.safeParse(node.attrs?.data).success))context.addIssue({code:'custom',message:'Ongeldig paginablok'});
}));
const body=doc.refine(value=>!!value&&typeof value==='object'&&'type'in value&&value.type==='doc','De editorinhoud moet een document zijn');
const articleContent=z.object({contentType:z.enum(['news','story']).default('news'),storyFormat:z.enum(['column','interview','story']).default('story'),title:text,slug:text,intro:text,body,coverId:text,authorId:text.optional(),author:text,category:text,tags:z.array(text),teamId:text,season:text,seo,featured:z.boolean(),featuredUntil:optionalDate.optional(),publishedAt:optionalDate});
const pageContent=z.object({coverId:text.optional(),coverSrc:text.refine(safeDestination).optional(),bodyFormat:z.enum(['legacy-tiptap-v1','page-layout-v2']).optional(),title:text,slug:text,intro:text,body,parentId:text,menuGroup:text,menuVisible:z.boolean(),order:number,seo,useBuilder:z.boolean()});
const revision=<T extends z.ZodTypeAny>(data:T)=>z.object({id,at:date,label:text,data});
const uniqueIds=<T extends z.ZodTypeAny>(item:T)=>z.array(item).refine(rows=>new Set(rows.map(row=>(row as {id:string}).id)).size===rows.length,'Dubbele identifiers');
export const cmsStateSchema=z.object({
  newsletter:newsletterSchema.optional(),schemaVersion:z.literal(1),matchPreviews:z.array(matchPreviewStateSchema).refine(rows=>new Set(rows.map(row=>row.matchId)).size===rows.length,'Dubbele wedstrijdvooruitblik').default([]),
  planning:planningSchema.default({committees:[],locations:[],activities:[],lastSportlinkSync:null}),
  appearance:z.object({heroSlider:heroSliderSchema.optional(),heroPortraits:z.custom<HeroPortrait[]>(validHeroPortraits).optional(),hero:z.custom<HeroCardConfig[]>(validHeroCards).optional(),navigation:z.custom<ClubNavigationItem[]>(validClubNavigation).optional(),heroPhotos:z.custom<HeroPhotoId[]>(value=>Array.isArray(value)&&value.length>0&&value.length<=300&&new Set(value).size===value.length&&value.every(id=>typeof id==='string')).optional(),agenda:agendaSchema.optional(),training:trainingSchema.optional()}).superRefine((appearance,context)=>{if(appearance.heroPhotos&&!validHeroPhotoIds(appearance.heroPhotos,appearance.heroPortraits||[]))context.addIssue({code:'custom',path:['heroPhotos'],message:'Kies bestaande spelersportretten.'});}).optional(),
  articles:uniqueIds(articleContent.extend({id,imported:z.boolean().optional(),status:statuses,updatedAt:date,scheduledAt:optionalDate,live:articleContent.optional(),revisions:z.array(revision(articleContent)),deletedAt:date.optional(),demo:z.boolean().optional()})),
  pages:uniqueIds(pageContent.extend({id,scheduledAt:optionalDate.optional(),status:statuses,updatedAt:date,live:pageContent.optional(),revisions:z.array(revision(pageContent)),deletedAt:date.optional(),system:z.boolean().optional()})),
  people:uniqueIds(z.object({backofficeUserId:text.max(150).optional(),sportlinkId:text.trim().max(150).transform(value=>value.toUpperCase()).optional(),id,name:text,role:text,group:text,teamId:text,bio:text,mediaId:text,email:text,phone:text,showContact:z.boolean(),published:z.boolean(),order:number,deletedAt:date.optional()})),
  media:uniqueIds(z.object({id,name:text,src:text,blobKey:text.optional(),folderId:text,alt:text,caption:text,credit:text,teamId:text,season:text,published:z.boolean(),featured:z.boolean(),order:number,focusX:number,focusY:number,createdAt:date,deletedAt:date.optional()})),
  folders:uniqueIds(z.object({id,name:text})),
  albums:uniqueIds(z.object({id,title:text,slug:text,description:text,date:optionalDate,teamId:text,season:text,coverId:text,mediaIds:z.array(text),published:z.boolean(),order:number,deletedAt:date.optional()})),
  departments:uniqueIds(z.object({id,name:text,description:text,emails:z.array(text),active:z.boolean(),confirmation:text})),
  forms:uniqueIds(z.object({id,registrationPurpose:z.enum(['membership','activity','volunteer']).optional(),consentVersion:text.optional(),kind:z.enum(['contact','registration','request']).default('contact'),name:text,departmentId:text,active:z.boolean(),retentionDays:number,fields:uniqueIds(z.object({id,label:text,type:z.enum(['text','email','textarea','tel','select','radio','checkbox','date','consent']),required:z.boolean(),options:z.array(text.max(200)).max(100).optional(),section:text.max(100).optional(),condition:z.object({fieldId:id,operator:z.enum(['under18','equals']),value:text.max(200).optional()}).optional()}))})),
  submissions:uniqueIds(z.object({id,kind:z.enum(['contact','registration','request']),formName:text,answers:z.array(z.object({fieldId:text,label:text,type:z.enum(['text','email','textarea','tel','select','radio','checkbox','date','consent']),value:text})),formId:text,departmentId:text,name:text,email:text,message:text,createdAt:date,status:z.enum(['new','in-progress','done','accepted','declined','waitlist']),note:text,demo:z.boolean()})),
  roles:uniqueIds(z.object({id,name:text,description:text,permissions:z.array(z.enum(permissions)),teamScoped:z.boolean()})),
  members:uniqueIds(z.object({id,name:text,email:text,roleId:text,teamIds:z.array(text),active:z.boolean()})),
  documents:uniqueIds(z.object({id,title:text,url:text,category:text,published:z.boolean(),deletedAt:date.optional()})),
  settings:z.object({sponsors:z.array(z.object({name:z.string().trim().min(1).max(150),src:z.string().min(1).refine(safeDestination),imageId:z.string().optional(),url:z.string().refine(value=>!value||/^https?:\/\//.test(value)&&safeDestination(value)).optional(),width:z.number().positive().max(10000),height:z.number().positive().max(10000)})).max(100).optional(),siteCopy:z.record(z.string().max(2000)).optional(),clubName:text,siteDescription:text,contactEmail:text,season:text,newsCategories:z.array(text),teams:uniqueIds(z.object({id,name:text})),homepageArticleIds:z.array(text),homepageStoryIds:z.array(text).default([]),homepageAlbumIds:z.array(text),homepagePhotoIds:z.array(text),homepageHeading:text,newsletterEnabled:z.boolean(),newsletterLabel:text,socials:z.array(z.object({label:text,url:text}))}),
  redirects:z.array(z.object({from:text,to:text})),
  audit:uniqueIds(z.object({id,at:date,action:text,role:text})),
});

export function parseCmsState(raw:string):CmsState{
  if(raw.length>8_000_000)throw new Error('Dit CMS-bestand is te groot.');
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new Error('Dit bestand bevat geen geldige JSON.');}
  const result=cmsStateSchema.safeParse(migrateLegacySubmissions(value));
  if(!result.success){const problem=result.error.issues[0];throw new Error(`Dit CMS-bestand is onvolledig of ongeldig${problem?.path.length?` (${problem.path.join('.')})`:''}.`);}
  const state=result.data as CmsState;
  const admin=state.roles.find(role=>role.id==='admin');
  if(!admin||admin.teamScoped||!permissions.filter(permission=>permission!=='stories').every(permission=>admin.permissions.includes(permission)))throw new Error('De volledige beheerdersrol ontbreekt in dit CMS-bestand.');
  if(!state.members.some(member=>member.active&&state.roles.some(role=>role.id===member.roleId&&!role.teamScoped&&permissions.filter(permission=>permission!=='stories').every(permission=>role.permissions.includes(permission)))))throw new Error('Een actief beheerdersprofiel ontbreekt in dit CMS-bestand.');
  if(state.members.some(member=>!state.roles.some(role=>role.id===member.roleId)))throw new Error('Een profiel verwijst naar een ontbrekende rol.');
  return state;
}

// Submission metadata is a historical snapshot; changing a form later must not
// reclassify an existing message or rewrite the fields that were submitted.
function migrateLegacySubmissions(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const state=value as Record<string,unknown>;
 if(!Array.isArray(state.submissions))return value;
 const forms=Array.isArray(state.forms)?state.forms:[];
 state.submissions=state.submissions.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
  const entry=raw as Record<string,unknown>;
  const form=forms.find(f=>f&&typeof f==='object'&&f.id===entry.formId);
  return {...entry,kind:entry.kind??form?.kind??'contact',formName:entry.formName??form?.name??'Oorspronkelijk formulier',answers:entry.answers??[
   {fieldId:'name',label:'Naam',type:'text',value:entry.name},
   {fieldId:'email',label:'E-mailadres',type:'email',value:entry.email},
   {fieldId:'message',label:'Oorspronkelijke inzending',type:'textarea',value:entry.message}
  ]};
 });
 return state;
}

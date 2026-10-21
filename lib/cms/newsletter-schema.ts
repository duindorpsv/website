import {z} from 'zod';
import type {CmsDoc} from './types';

const id=z.string().min(1).max(150),text=z.string();
export const newsletterEmailSchema=text.trim().toLowerCase().max(254).email();
const date=text.datetime(),optionalDate=z.union([z.literal(''),date]);
const unique=<T extends z.ZodTypeAny>(schema:T,max=10000)=>z.array(schema).max(max).refine(rows=>new Set(rows.map(row=>(row as {id:string}).id)).size===rows.length,'Dubbele identifiers');
export const newsletterTags=z.array(text.trim().min(1).max(80)).max(20).transform(values=>[...new Set(values.map(value=>value.toLowerCase()))]);
const doc:z.ZodType<any>=z.lazy(()=>z.object({type:id,text:text.max(100000).optional(),attrs:z.record(z.unknown()).optional(),marks:z.array(z.object({type:id,attrs:z.record(z.unknown()).optional()})).max(12).optional(),content:z.array(doc).max(1000).optional()}).strict());
export const newsletterBody=doc.superRefine((value,context)=>{
 let count=0;const visit=(node:CmsDoc,depth:number)=>{if(++count>10000||depth>24){context.addIssue({code:'custom',message:'De e-mailtekst is te groot of te diep genest.'});return;}for(const child of node.content||[])visit(child,depth+1);};
 if(value.type!=='doc')context.addIssue({code:'custom',message:'De inhoud moet een TipTap-document zijn.'});visit(value,0);
});
export const newsletterBlockSchema=z.object({id,type:z.enum(['text','article','image','button','divider','spacer']),body:newsletterBody.optional(),title:text.max(500).optional(),text:text.max(10000).optional(),url:text.max(4000).optional(),imageUrl:text.max(4000).optional(),imageAlt:text.max(500).optional(),sourceArticleId:id.optional(),gap:z.number().int().min(0).max(120).optional()}).strict();
export const newsletterContentSchema=z.object({name:text.max(250),subject:text.max(200),preheader:text.max(250),fromName:text.max(150),replyTo:text.max(254),audienceIds:z.array(id).max(100),blocks:unique(newsletterBlockSchema,200)}).strict();
export const newsletterSettingsSchema=z.object({fromName:text.trim().min(1).max(150).regex(/^[^\r\n<>]+$/),replyTo:newsletterEmailSchema,footer:text.trim().min(1).max(1500),siteUrl:text.url().max(1000)}).strict();
export const newsletterAudienceSchema=z.object({id,name:text.trim().min(1).max(150),description:text.max(1000),color:text.regex(/^#[a-f\d]{6}$/i),mode:z.enum(['manual','tags']),contactIds:z.array(id).max(10000),tags:newsletterTags}).strict();
export const newsletterContactSchema=z.object({id,name:text.trim().max(150),email:newsletterEmailSchema,status:z.enum(['subscribed','pending','unsubscribed','suppressed']),tags:newsletterTags,consentAt:optionalDate,source:z.enum(['demo','manual','signup']),version:z.number().int().positive().optional()}).strict();
const snapshot=newsletterContentSchema.extend({capturedAt:date,settings:newsletterSettingsSchema.optional(),templateVersion:text.optional(),mailFrom:text.optional(),editionId:id.optional()});
const campaign=newsletterContentSchema.extend({id,status:z.enum(['draft','scheduled','queued','processed','failed','cancelled','simulated']),updatedAt:date,scheduledAt:optionalDate,snapshot:snapshot.optional(),processedAt:date.optional(),deletedAt:date.optional(),simulatedAt:date.optional(),version:z.number().optional(),stats:z.record(z.number()).optional(),testStats:z.record(z.number()).optional()}).refine(row=>row.status==='draft'||!!row.snapshot,'De vastgelegde editie ontbreekt');
/** Optional in old CMS backups: validation must never initialize a module on read. */
export const newsletterSchema=z.object({campaigns:unique(campaign),contacts:unique(newsletterContactSchema),audiences:unique(newsletterAudienceSchema),settings:newsletterSettingsSchema,logs:unique(z.object({id,campaignId:id,kind:text,at:date,count:z.number().int().nonnegative(),target:text.max(254).optional(),subject:text.max(200)}))}).strict();

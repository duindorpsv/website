import {z} from 'zod';
import {sponsorshipEntitySchemas as s} from '../cms/sponsorship-schema';
import {directorySchema} from '../cms/directory-schema';
const d=directorySchema.innerType().shape;
const tuple=(schemas:[z.ZodTypeAny,...z.ZodTypeAny[]])=>z.preprocess(value=>Array.isArray(value)?[...value,...Array(Math.max(0,schemas.length-value.length)).fill(undefined)]:value,z.tuple(schemas));
const id=z.string().min(1).max(191).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/),text=z.string().max(20000),email=z.string().trim().toLowerCase().email().max(254);
function entity(schema:z.ZodTypeAny){return z.unknown().transform((value,ctx)=>{const r=schema.safeParse([value]);if(!r.success){for(const issue of r.error.issues)ctx.addIssue({...issue,path:issue.path.slice(1)});return z.NEVER;}return r.data[0];});}
const person=z.object({id,name:z.string().trim().min(1).max(500),role:text.default(''),group:text.default(''),teamId:text.default(''),bio:text.default(''),mediaId:text.default(''),email:z.union([email,z.literal('')]).default(''),phone:z.string().max(100).default(''),showContact:z.boolean().default(false),published:z.boolean().default(false),order:z.number().int().default(0),sportlinkId:z.string().max(100).optional()});
const signature=z.object({name:z.string().max(500).optional(),function:z.string().trim().min(1).max(200),consent:z.literal(true),verificationCode:z.string().regex(/^\d{8}$/),challengeId:id});
const business=z.unknown().transform((v,ctx)=>{const schema=s.businessChangeRequests.unwrap().innerType().element.shape.details;const parsed=schema.safeParse(v);if(!parsed.success){ctx.addIssue({code:'custom',message:'Controleer de bedrijfsgegevens.'});return z.NEVER;}return parsed.data;});
export const commandArgs:Record<string,z.ZodTypeAny>={
 saveDirectoryPerson:tuple([z.object({person,profile:entity(d.profiles),sponsorId:id.optional()})]),
 bindDirectoryAccount:tuple([id,id]),setDirectoryAccountActive:tuple([id,z.boolean()]),
 createDirectoryInvitation:tuple([z.object({personId:id,email,scope:z.enum(['club','sponsor']),sponsorId:id.optional(),sponsorRoles:z.array(z.enum(['signer','billing','marketing'])).max(3).optional()})]),
 revokeDirectoryInvitation:tuple([id]),saveDirectoryGuardian:tuple([entity(d.guardians)]),approveDirectoryGuardian:tuple([id,z.boolean()]),
 saveDirectoryAssignment:tuple([entity(d.assignments)]),removeDirectoryAssignment:tuple([id]),
 requestDirectoryGuardian:tuple([z.object({childPersonId:z.string().min(1).max(100),relationship:z.enum(['parent','guardian','carer']),permissions:z.array(z.enum(['schedule','attendance','forms','profile','finance'])).min(1).max(5)})]),
 importDirectoryPeople:tuple([z.array(z.object({sportlinkId:z.string().min(1).max(100),name:z.string().min(1).max(500),email:z.union([email,z.literal('')]),phone:z.string().max(100),birthDate:text.optional(),membership:z.enum(['playing','non-playing','none']).optional(),teamIds:z.array(id).max(100).optional()})).max(1000)]),
 saveSponsor:tuple([entity(s.sponsors)]),saveSponsorBusinessDetails:tuple([id,business,z.boolean().optional()]),requestSponsorBusinessChange:tuple([id,business,z.string().max(2000).optional()]),reviewSponsorBusinessChange:tuple([id,z.boolean(),z.string().max(2000).optional()]),
 saveSponsorContractTemplate:tuple([entity(s.contractTemplates)]),removeSponsorContractTemplate:tuple([id]),saveMembership:tuple([entity(s.memberships)]),removeSponsorMembership:tuple([id]),saveSponsorItem:tuple([entity(s.items)]),saveSponsorPackage:tuple([entity(s.packages)]),
 createSponsorProposal:tuple([id,id.optional()]),saveSponsorProposal:tuple([entity(s.proposals)]),sendSponsorProposal:tuple([id]),acceptSponsorProposal:tuple([id]),createSponsorAgreement:tuple([id]),
 requestSponsorSigningCode:tuple([id,z.enum(['sponsor','club'])]),trySignSponsorAgreement:tuple([id,signature]),tryCountersignSponsorAgreement:tuple([id,signature]),
 createSponsorInvoice:tuple([id,text.optional()]),createSponsorInvoicePlan:tuple([id,z.object({count:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(6),z.literal(12)]),firstDueDate:text,intervalMonths:z.number().int().min(1).max(12).optional()})]),
 recordSponsorManualPayment:tuple([id,z.string().trim().min(1).max(500)]),updateSponsorTask:tuple([id,z.object({title:z.string().max(500).optional(),status:z.enum(['open','in-progress','done']).optional(),ownerId:text.optional(),dueDate:text.optional(),note:text.optional(),proofUrl:text.optional(),visibleToSponsor:z.boolean().optional()}).strict()]),
 addSponsorNote:tuple([id,z.string().max(500),text.optional()]),requestSponsorProfile:tuple([id,z.object({name:z.string().max(500),description:text,website:z.string().max(2000),logoUrl:z.string().max(2000)})]),approveSponsorProfile:tuple([id,z.boolean().optional()]),
 saveSponsorMaterial:tuple([id,z.object({logoUrl:z.string().max(2000).optional(),note:text.optional(),proofUrl:z.string().max(2000).optional()}).strict()]),registerSponsorEvent:tuple([id,id,z.number().int().min(1).max(20).optional()]),cancelSponsorEvent:tuple([id,id]),renewSponsorAgreement:tuple([id]),logSponsorReminder:tuple([id]),saveSponsorSettings:tuple([s.settings]),saveSponsorEvent:tuple([entity(s.events)])
};
export const commandEnvelope=z.object({operationId:z.string().uuid(),mode:z.enum(['directory','sponsorship','portal']),companyId:z.string().max(191).default(''),versions:z.record(z.number().int().nonnegative()).default({}),commands:z.array(z.object({name:z.string().max(80),args:z.array(z.unknown()).max(6),offset:z.number().int().min(0).max(10000)}).strict()).min(1).max(100)}).strict();

import {z} from 'zod';
import type {BoardState} from './board';
import {validPlanningDate,validPlanningTime} from './planning';

const text=z.string().max(50000);
const id=z.string().min(1).max(180);
const day=text.refine(validPlanningDate,'Ongeldige bestuursdatum');
const optionalDay=z.union([day,z.literal('')]);
const time=text.refine(validPlanningTime,'Ongeldige vergadertijd');
const timestamp=text.refine(value=>Number.isFinite(Date.parse(value)),'Ongeldig tijdstip');
const count=z.number().int().nonnegative().safe();
const version=count.min(1);
const outcome=z.enum(['adopted','rejected']);
const pointKind=z.enum(['info','discussion','decision','risk']);
const base=z.object({id,code:id,createdAt:timestamp,createdBy:id.optional(),createdByUserId:id.optional()}).strict();
const titled=base.extend({title:text});

function records<T extends z.ZodType<{id:string;code:string}>>(item:T){
 return z.array(item).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,'Dubbele bestuursrecords');
}

const proposal=titled.extend({
 kind:pointKind,summary:text,request:text,ownerId:text,committeeId:text,dossierId:text.optional(),
 status:z.enum(['draft','submitted','changes','ready','scheduled','handled']),
 versions:z.array(z.object({number:version,at:timestamp,summary:text,request:text,hash:text.optional(),personId:id.optional(),userId:id.optional(),snapshot:z.object({title:text,kind:pointKind,summary:text,request:text,committeeId:text,dossierId:text.optional(),attachment:text.optional()}).strict().optional()}).strict()),
 reviewReason:text.optional(),attachment:text.optional(),
});

const meetingPoint=titled.extend({
 kind:pointKind,description:text,ownerId:text,proposalId:text.optional(),carriedFrom:text.optional(),
 reviewReason:text.optional(),notes:text,privateNotes:z.record(z.string(),z.string().max(20000)),
 votes:z.record(z.string(),z.enum(['voor','tegen','onthouding','afwezig'])),voteText:text.optional(),
 committeeId:text.optional(),portfolioId:text.optional(),
 outcome:z.enum(['decided','work','deferred','alv','noted']).optional(),result:text.optional(),dueDate:optionalDay.optional(),
 decisionId:text.optional(),actionId:text.optional(),alvItemId:text.optional(),
});

const section=z.object({heading:text,text}).strict();
const agendaSnapshot=z.object({title:text,date:day,time,location:text,version,points:z.array(z.object({id,code:id,title:text,kind:pointKind,description:text,ownerId:text,proposalId:text.optional(),carriedFrom:text.optional(),portfolioId:text.optional(),committeeId:text.optional()}).strict())}).strict();
const minutesSnapshot=z.object({title:text,date:day,time,location:text,code:id,version,summary:text,attendance:text,sections:z.array(section)}).strict();
const alvMinutesSnapshot=z.object({title:text,date:day,time,location:text,code:id,version,minutes:text,promises:z.array(text),sections:z.array(section)}).strict();
const snapshotVersion=<T extends z.ZodType>(snapshot:T)=>z.object({version,at:timestamp,personId:id,userId:id,hash:z.string().regex(/^[a-f0-9]{64}$/),snapshot}).strict();
const meeting=titled.extend({
 date:day,time,location:text,status:z.enum(['draft','review','approved','live','closed']),
 points:records(meetingPoint),attendeeIds:z.array(id),
 minutesStatus:z.enum(['draft','review','approved']),minutesVersion:version,minutesSummary:text,
 feedback:text.optional(),agendaVersion:version,agendaApprovedAt:timestamp.optional(),
 agendaEstablishedAt:timestamp.optional(),closedAt:timestamp.optional(),minutesApprovedAt:timestamp.optional(),
 minutesSubmittedAt:timestamp.optional(),minutesCode:text.optional(),
 minutesSnapshot:z.object({attendance:text,sections:z.array(z.object({heading:text,text}).strict())}).strict().optional(),
 agendaHash:text.optional(),agendaSnapshot:agendaSnapshot.optional(),agendaHistory:z.array(snapshotVersion(agendaSnapshot)).optional(),minutesHash:text.optional(),minutesHistory:z.array(snapshotVersion(minutesSnapshot)).optional(),
});

const decision=titled.extend({
 text,effectiveFrom:optionalDay,effectiveUntil:optionalDay,source:z.enum(['bestuur','alv']),
 meetingId:text.optional(),pointId:text.optional(),proposalId:text.optional(),alvItemId:text.optional(),
 dossierId:text.optional(),replacesId:text.optional(),outcome,votes:text.optional(),
});

const action=titled.extend({
 description:text,ownerId:text,committeeId:text,portfolioOwnerId:text,dueDate:optionalDay,
 status:z.enum(['pending','open','progress','blocked','done']),progress:text,helpRequest:text.optional(),
 decisionId:text.optional(),meetingId:text.optional(),pointId:text.optional(),proposalId:text.optional(),
});

const alvItem=titled.extend({
 description:text,ownerId:text,kind:z.enum(['info','discussion','decision']),status:z.enum(['work','ready','scheduled','handled']),
 alvId:text.optional(),meetingId:text.optional(),pointId:text.optional(),fromItemId:text.optional(),
 stance:text,document:text,question:text,checklist:z.object({stance:z.boolean(),document:z.boolean(),question:z.boolean()}).strict(),
 documentReleased:z.boolean().optional(),notes:text,
});

const alvAgendaPoint=z.object({id,title:text,document:text,question:text,stance:text,kind:pointKind,documentReleased:z.boolean().optional()}).strict();
const alvVote=base.extend({
 itemId:id,text,kind:z.enum(['motion','amendment']),counts:z.object({voor:count,tegen:count,onthouding:count,ongeldig:count}).strict(),
 countedBy:id,countedByUserId:id.optional(),confirmedBy:text.optional(),confirmedByUserId:id.optional(),confirmedAt:timestamp.optional(),outcome,decisionId:text.optional(),
});

const alv=titled.extend({
 date:day,time,location:text,status:z.enum(['draft','approved','live','closed']),agendaIds:z.array(id),
 agendaSnapshot:z.array(alvAgendaPoint),agendaHash:text.optional(),agendaApprovedAt:timestamp.optional(),agendaApprovedBy:id.optional(),agendaApprovedByUserId:id.optional(),previousId:text.optional(),minutes:text,votes:records(alvVote),promises:z.array(text),
 minutesVersion:version.optional(),minutesHash:text.optional(),minutesHistory:z.array(snapshotVersion(alvMinutesSnapshot)).optional(),
});

export const boardSchema=z.object({
 counters:z.record(z.string(),count),meetings:records(meeting),proposals:records(proposal),decisions:records(decision),actions:records(action),
 alvs:records(alv),alvItems:records(alvItem),
 communications:records(titled.extend({decisionId:id,body:text,audience:text,status:z.enum(['draft','ready']),campaignId:id.optional()})),
 handoffs:records(base.extend({decisionId:id,activityId:id,date:day})),
 portfolios:records(titled.extend({ownerId:text,committeeId:text,description:text,status:z.enum(['info','issue','decision']),update:text})),
 dossiers:records(titled.extend({ownerId:text,committeeId:text,description:text})),
}).strict().transform(value=>value as BoardState);

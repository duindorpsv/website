import {Temporal} from '@js-temporal/polyfill';
import {z} from 'zod';

export const SPORTLINK_DATASETS=['teams','players','matches','assignments','results','standings','teamInfo'] as const;
export type SportlinkDataset=typeof SPORTLINK_DATASETS[number];
export const sportlinkDatasetLabels:Record<SportlinkDataset,{name:string;description:string}>={
 teams:{name:'Teams',description:'Controleert welke teams actief zijn. Bestaande CMS-team-ID’s en inhoud blijven bewaard.'},
 players:{name:'Spelers en begeleiding',description:'Vernieuwt openbare teamindelingen. Alleen expliciet geïmporteerde personen met een echte bron-ID worden gekoppeld; dit is geen volledige ledenadministratie.'},
 matches:{name:'Wedstrijdprogramma',description:'Haalt het programma voor de gekozen periode op en werkt bronwedstrijden in de centrale planning bij.'},
 assignments:{name:'Velden, kleedkamers en afgelastingen',description:'Controleert het programma op korte termijn vaker. Sportlink bepaalt altijd datum, tijd, wedstrijdstatus, veld en kleedkamers.'},
 results:{name:'Uitslagen',description:'Vernieuwt uitslagen; respecteert competities waarin Sportlink geen scores openbaar maakt.'},
 standings:{name:'Standen en poules',description:'Vernieuwt de standen voor de actieve competitiepoules.'},
 teamInfo:{name:'Teamgegevens en teamfoto’s',description:'Vernieuwt teaminformatie en toegestane teamfoto’s.'},
};
const scheduleSchema=z.object({enabled:z.boolean(),every:z.number().int().min(1).max(180),unit:z.enum(['minute','hour','day','month'])}).strict();
export type SportlinkSchedule=z.infer<typeof scheduleSchema>;
export const sportlinkSettingsSchema=z.object({
 clubCode:z.string().trim().max(80).default(''),
 ownPark:z.object({id:z.string().trim().min(1).max(160),name:z.string().trim().min(1).max(160),verificationNote:z.string().trim().min(10).max(1000)}).strict().optional(),
 parkConfirmations:z.array(z.object({matchId:z.string().regex(/^\d+$/),accommodationId:z.string().min(1).max(160),sourceFingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(1000).default([]),
 enabled:z.boolean(),schedules:z.object(Object.fromEntries(SPORTLINK_DATASETS.map(key=>[key,scheduleSchema])) as Record<SportlinkDataset,typeof scheduleSchema>).strict(),
 programmeDays:z.number().int().min(1).max(42),resultsDays:z.number().int().min(1).max(56),assignmentDays:z.number().int().min(1).max(7),
 includePhotos:z.boolean(),updateImportedPeople:z.boolean(),retryMinutes:z.number().int().min(1).max(60),requestTimeoutSeconds:z.number().int().min(5).max(30),
 teamIds:z.array(z.string().regex(/^-?\d+:-?\d+$/).max(40)).max(500),
 teamMappings:z.array(z.object({cmsTeamId:z.string().min(1).max(160),teamId:z.string().regex(/^-?\d+:-?\d+$/).max(40)}).strict()).max(500),
 locationMappings:z.array(z.object({sourceType:z.enum(['field','changing']),sourceValue:z.string().trim().min(1).max(160),locationId:z.string().min(1).max(160),clubCode:z.string().max(80).optional(),accommodationId:z.string().max(160).optional(),resourceId:z.string().max(160).optional(),confirmed:z.boolean().optional()}).strict()).max(500),
}).strict().superRefine((config,ctx)=>{
 for(const dataset of SPORTLINK_DATASETS){const schedule=config.schedules[dataset];const minutes=schedule.every*({minute:1,hour:60,day:1440,month:43200}[schedule.unit]);
  if(minutes<5||minutes>6*31*1440)ctx.addIssue({code:'custom',path:['schedules',dataset],message:'Kies minimaal 5 minuten en maximaal 6 maanden.'});
  if(dataset==='assignments'&&schedule.enabled&&minutes>60)ctx.addIssue({code:'custom',path:['schedules',dataset],message:'Controleer veld- en kleedkamerwijzigingen minimaal ieder uur.'});
 }
 if(new Set(config.teamIds).size!==config.teamIds.length)ctx.addIssue({code:'custom',path:['teamIds'],message:'Kies ieder team eenmaal.'});
 for(const field of ['cmsTeamId','teamId'] as const)if(new Set(config.teamMappings.map(row=>row[field])).size!==config.teamMappings.length)ctx.addIssue({code:'custom',path:['teamMappings'],message:'Koppel een CMS-team en een Sportlink-team ieder maximaal eenmaal.'});
 if(new Set(config.locationMappings.map(row=>[row.clubCode||'',row.accommodationId||'',row.sourceType,row.resourceId||''].join(':')+':'+row.sourceValue.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl').trim())).size!==config.locationMappings.length)ctx.addIssue({code:'custom',path:['locationMappings'],message:'Koppel iedere Sportlink-bronwaarde eenmaal.'});
 if(new Set(config.parkConfirmations.map(row=>row.matchId)).size!==config.parkConfirmations.length)ctx.addIssue({code:'custom',path:['parkConfirmations'],message:'Bevestig iedere wedstrijdaccommodatie eenmaal.'});
});
export type SportlinkSettings=z.infer<typeof sportlinkSettingsSchema>;
export function defaultSportlinkSettings():SportlinkSettings{return {
 clubCode:'',parkConfirmations:[],enabled:true,schedules:{teams:{enabled:true,every:3,unit:'month'},players:{enabled:true,every:1,unit:'month'},matches:{enabled:true,every:6,unit:'hour'},assignments:{enabled:true,every:15,unit:'minute'},results:{enabled:true,every:2,unit:'hour'},standings:{enabled:true,every:2,unit:'hour'},teamInfo:{enabled:true,every:1,unit:'month'}},
 programmeDays:42,resultsDays:56,assignmentDays:3,includePhotos:true,updateImportedPeople:true,retryMinutes:5,requestTimeoutSeconds:12,teamIds:[],teamMappings:[],locationMappings:[],
};}
/** Calendar months in Amsterdam; three months are not an assumed ninety days. */
export function nextSportlinkRun(schedule:SportlinkSchedule,from:Date|number=new Date()):number{
 const instant=Temporal.Instant.fromEpochMilliseconds(typeof from==='number'?from:from.getTime()).toZonedDateTimeISO('Europe/Amsterdam');
 return instant.add({[schedule.unit+'s']:schedule.every}).toInstant().epochMilliseconds;
}
export function sportlinkArticleDataset(name:string):SportlinkDataset{
 if(name==='teams')return 'teams';if(name==='team-indeling')return 'players';if(name==='team-gegevens')return 'teamInfo';
 if(name==='poulestand')return 'standings';if(name.includes('uitslagen'))return 'results';
 if(name.startsWith('wedstrijd-')||name==='afgelastingen')return 'assignments';return 'matches';
}

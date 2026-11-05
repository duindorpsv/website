import {z} from 'zod';
export const trainingDays=['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'] as const;
const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/,'Gebruik uu:mm.');
export const trainingSchema=z.array(z.object({teamLabel:z.string().trim().min(1).max(120),sessions:z.array(z.object({day:z.enum(trainingDays),start:time,end:time,field:z.string().trim().min(1).max(120)}).refine(session=>session.start<session.end,{message:'De eindtijd moet na de begintijd liggen.'})).max(14)})).max(150).refine(teams=>new Set(teams.map(team=>team.teamLabel.toLocaleLowerCase('nl').trim())).size===teams.length,{message:'Geef ieder team een unieke naam.'});

import {z} from 'zod';
import {planningInstant, planningZone} from './cms/planning';

export const agendaEventSchema=z.object({
  id:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  title:z.string().trim().min(1,'Vul een titel in.').max(150),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  description:z.string().trim().min(1,'Vul een beschrijving in.').max(5000),
}).strict().superRefine((event,ctx)=>{
  try { planningInstant(`${event.date}T${event.time}`,'earlier'); }
  catch { ctx.addIssue({code:'custom',path:['date'],message:'Kies een geldige datum en tijd. Dit tijdstip bestaat mogelijk niet door de zomertijd.'}); }
});
export type ClubAgendaEvent=z.infer<typeof agendaEventSchema>;
export const agendaSchema=z.array(agendaEventSchema).max(500).refine(items=>new Set(items.map(item=>item.id)).size===items.length,'Activiteiten moeten een unieke ID hebben.');
export const emptyAgenda:ClubAgendaEvent[]=[];

export function upcomingAgenda(items:ClubAgendaEvent[],now=Date.now()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:planningZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return items.filter(item=>item.date>=today).slice().sort((a,b)=>`${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)||a.id.localeCompare(b.id));
}
export function agendaDate(event:ClubAgendaEvent,short=false) {
  return new Intl.DateTimeFormat('nl-NL',{timeZone:planningZone,day:'numeric',month:short?'short':'long',...(short?{}:{year:'numeric'})}).format(new Date(planningInstant(`${event.date}T${event.time}`,'earlier')));
}

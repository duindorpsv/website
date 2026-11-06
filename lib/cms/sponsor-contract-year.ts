export type SponsorContractYear={startDate:string;endDate:string;season:string};

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const zonedTimestampPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const clubDayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'});
const invalidReference=()=>new Error('Kies een geldige datum voor het contractjaar.');

function isCalendarDay(value:string){
 if(!datePattern.test(value)||value.startsWith('0000'))return false;
 const parsed=new Date(value+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

function calendarDay(reference:Date|string){
 if(typeof reference==='string'&&datePattern.test(reference)){
  if(!isCalendarDay(reference))throw invalidReference();
  return reference;
 }
 if(typeof reference==='string'){
  // Reject host-local timestamps and rollover dates, which Date.parse otherwise accepts.
  if(!zonedTimestampPattern.test(reference)||!isCalendarDay(reference.slice(0,10)))throw invalidReference();
  const time=reference.slice(11).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/)!;
  if(Number(time[1])>23||Number(time[2])>59||Number(time[3]||0)>59)throw invalidReference();
 }
 const parsed=reference instanceof Date?reference:new Date(reference);
 if(!Number.isFinite(parsed.getTime())||parsed.getUTCFullYear()<1||parsed.getUTCFullYear()>9999)throw invalidReference();
 const parts=clubDayFormat.formatToParts(parsed);
 const part=(name:'year'|'month'|'day')=>parts.find(row=>row.type===name)?.value||'';
 const day=`${part('year').padStart(4,'0')}-${part('month')}-${part('day')}`;
 if(!isCalendarDay(day))throw invalidReference();
 return day;
}

/** A club year runs from 1 August through 31 July; date-only strings are literal days. */
export function getSponsorContractYear(reference:Date|string=new Date()):SponsorContractYear{
 const day=calendarDay(reference),year=Number(day.slice(0,4)),startYear=year-(day.slice(5,10)<'08-01'?1:0);
 if(startYear<1||startYear>=9999)throw invalidReference();
 const start=String(startYear).padStart(4,'0'),end=String(startYear+1).padStart(4,'0');
 return {startDate:`${start}-08-01`,endDate:`${end}-07-31`,season:`${start}–${end}`};
}

/** First 1 August strictly after the previous end; never alters the old document. */
export function getSponsorRenewalContractYear(previousEnd:Date|string):SponsorContractYear{
 const previous=getSponsorContractYear(previousEnd),nextYear=Number(previous.startDate.slice(0,4))+1;
 return getSponsorContractYear(`${String(nextYear).padStart(4,'0')}-08-01`);
}

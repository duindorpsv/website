import {planningInstant} from '../cms/planning';
import type {PublicActivity} from '../cms/types';
const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
function fold(line:string){let current='',bytes=0;const result:string[]=[];for(const char of line){const length=Buffer.byteLength(char,'utf8');if(bytes+length>75){result.push(current);current=' ';bytes=1;}current+=char;bytes+=length;}result.push(current);return result.join('\r\n');}
const local=(date:string,time:string)=>date.replaceAll('-','')+'T'+time.replace(':','')+'00';
export function activityICS(activity:PublicActivity){
 // RFC 5545 recurring rules describe the Amsterdam transition for every event year.
 const zone=['BEGIN:VTIMEZONE','TZID:Europe/Amsterdam','BEGIN:DAYLIGHT','DTSTART:19700329T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT','BEGIN:STANDARD','DTSTART:19701025T030000','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','END:VTIMEZONE'];
 const start=activity.date+'T'+activity.startTime,end=activity.date+'T'+activity.endTime;
 const utc=(value:string)=>planningInstant(value,activity.occurrence||'reject').replace(/[-:]/g,'');
 const repeated=(value:string)=>planningInstant(value,'earlier')!==planningInstant(value,'later');
 const when=(key:string,value:string,time:string)=>activity.occurrence==='later'&&repeated(value)?key+':'+utc(value):key+';TZID=Europe/Amsterdam:'+local(activity.date,time);
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Duindorp SV//Clubagenda//NL','CALSCALE:GREGORIAN','X-WR-TIMEZONE:Europe/Amsterdam',...zone,'BEGIN:VEVENT','UID:'+escape(activity.id)+'@duindorpsv.nl','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),when('DTSTART',start,activity.startTime),when('DTEND',end,activity.endTime),'SUMMARY:'+escape(activity.title),'DESCRIPTION:'+escape(activity.description),'LOCATION:'+escape(activity.location),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}

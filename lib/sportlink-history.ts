import type {SportlinkMatch} from './sportlink-types';
import {supportsPublicMatchResults} from './match-dossier';

export type SportlinkHistoricalResult={id:string;date:string;season:string;matchLabel:string;scoreLabel:string};
type Raw=Record<string,unknown>;
const record=(value:unknown):Raw=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Raw:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
const zone={timeZone:'Europe/Amsterdam'} as const;

function calendarDate(year:number,month:number,day:number):string|null{
 if(year<1900||year>2200||month<1||month>12||day<1||day>31)return null;
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}

/** Historical feeds have several documented date columns. Never use a locale-dependent Date parse. */
export function historicalDate(value:unknown):string|null{
 const input=text(value);if(!input)return null;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(input)){
  if(!calendarDate(Number(input.slice(0,4)),Number(input.slice(5,7)),Number(input.slice(8,10))))return null;
  const date=new Date(input.replace(/([+-]\d{2})(\d{2})$/,'$1:$2'));
  if(!Number.isFinite(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-CA',{...zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:string)=>Number(parts.find(item=>item.type===type)?.value);
  return calendarDate(part('year'),part('month'),part('day'));
 }
 const iso=input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/);
 if(iso)return calendarDate(Number(iso[1]),Number(iso[2]),Number(iso[3]));
 const dutch=input.match(/^(?:[a-zA-Z]{2,12}[,\s]+)?(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/);
 return dutch?calendarDate(Number(dutch[3]),Number(dutch[2]),Number(dutch[1])):null;
}

function seasonForDate(date:string){const year=Number(date.slice(0,4)),start=Number(date.slice(5,7))>=7?year:year-1;return `${start}/${start+1}`;}
function seasonLabel(value:unknown,date:string){
 const label=text(value),match=label.match(/(\d{4})\s*[-/]\s*['’]?(\d{2}|\d{4})(?!\d)/);
 if(match){const start=Number(match[1]);let end=Number(match[2]);if(end<100){end=Math.floor(start/100)*100+end;if(end<start)end+=100;}if(end===start+1)return `${start}/${end}`;}
 return label?label.slice(0,80):seasonForDate(date);
}
function scoreLabel(value:unknown):string|null{
 const score=text(value).match(/^(\d{1,3})\s*[-–:]\s*(\d{1,3})(\s*\(\s*\d{1,3}\s*[-–:]\s*\d{1,3}\s*\))?$/);
 return score?`${Number(score[1])} – ${Number(score[2])}${score[3]?` ${score[3].trim()}`:''}`:null;
}
function eligible(match:SportlinkMatch){return supportsPublicMatchResults(match.home)&&supportsPublicMatchResults(match.away);}

/** These rows come from the match-specific H2H endpoint. Keep its actual home/away label. */
export function normalizeHistoricalResults(rows:unknown[],target:SportlinkMatch,now:Date|number=new Date()):SportlinkHistoricalResult[]{
 if(!eligible(target))return [];
 const instant=typeof now==='number'?now:now.getTime();if(!Number.isFinite(instant))return [];
 const targetDate=historicalDate(target.kickoff),today=historicalDate(new Date(instant).toISOString());
 if(!targetDate||!today)return [];
 const results:SportlinkHistoricalResult[]=[];
 for(const input of rows){
  const row=record(input),date=[row.wedstrijddatetime,row.wedstrijddatum,row.datum].map(historicalDate).find(Boolean),label=text(row.wedstrijd),score=scoreLabel(row.uitslag);
  if(!date||date>=targetDate||date>today||!label||!score||/afgelast|geannuleerd|uitgesteld|gestaakt|vervallen|reglementair/i.test(text(row.status)))continue;
  const code=text(row.wedstrijdcode);
  results.push({id:code?`match:${code}`:`history:${date}:${normalized(label)}`,date,season:seasonLabel(row.seizoen,date),matchLabel:label,scoreLabel:score});
 }
 return mergeHistoricalResults([],results,target,now);
}

/** Converts only real, completed archive records; no current team IDs or scores are invented. */
export function historicalFromMatches(matches:SportlinkMatch[]):SportlinkHistoricalResult[]{
 const completed=/^(uitgespeeld|gespeeld|eindstand|beeindigd|afgelopen|finished|completed|na verlenging|na strafschoppen)$/;
 return matches.flatMap(match=>{
  const date=historicalDate(match.kickoff),score=scoreLabel(match.scoreLabel||`${match.homeScore} - ${match.awayScore}`);
  if(!date||!score||!eligible(match)||!completed.test(normalized(match.status)))return [];
  return [{id:`match:${match.id}`,date,season:seasonForDate(date),matchLabel:`${match.home.name} – ${match.away.name}`,scoreLabel:score}];
 });
}

/** Provider corrections win by ID and by date/match identity, even when an endpoint omits IDs. */
export function mergeHistoricalResults(archive:SportlinkHistoricalResult[],source:SportlinkHistoricalResult[],target:SportlinkMatch,now:Date|number=new Date()):SportlinkHistoricalResult[]{
 if(!eligible(target))return [];
 const targetDate=historicalDate(target.kickoff),instant=typeof now==='number'?now:now.getTime();
 if(!targetDate||!Number.isFinite(instant))return [];
 const today=historicalDate(new Date(instant).toISOString())!;
 const byId=new Map<string,SportlinkHistoricalResult>();
 for(const item of [...archive,...source])if(item.id&&item.date<targetDate&&item.date<=today&&item.matchLabel&&item.scoreLabel)byId.set(item.id,item);
 const byEncounter=new Map<string,SportlinkHistoricalResult>();
 for(const item of byId.values())byEncounter.set(`${item.date}:${normalized(item.matchLabel)}`,item);
 return [...byEncounter.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,5);
}

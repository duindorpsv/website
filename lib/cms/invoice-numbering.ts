import {domainMutation} from './domain-commands';
import type {CmsState} from './types';
import type {SponsorshipState} from './sponsorship-types';

export type InvoiceSeries='sponsors'|'donors';
export type InvoiceNumberSeries={prefix:string;digits:number;nextByYear:Record<string,number>;exhaustedYears?:string[]};
export type InvoiceNumberingSettings={sponsors:InvoiceNumberSeries;donors:InvoiceNumberSeries};
const MAX_SEQUENCE=999_999_999;
const seriesNames:InvoiceSeries[]=['sponsors','donors'];
const defaults:InvoiceNumberingSettings={sponsors:{prefix:'DSV-F',digits:3,nextByYear:{}},donors:{prefix:'DSV-D',digits:3,nextByYear:{}}};
function ensure(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
const copy=<T,>(value:T):T=>structuredClone(value);
function yearForDate(date:string){
 ensure(/^\d{4}-\d{2}-\d{2}$/.test(date),'Kies een geldige factuurdatum.');
 const year=Number(date.slice(0,4));
 ensure(year>=1900&&year<=9999&&Number.isFinite(Date.parse(`${date}T12:00:00Z`))&&new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date,'Kies een bestaande factuurdatum.');
 return String(year);
}
function yearKey(year:string){ensure(/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=9999,'Gebruik een geldig viercijferig factuurjaar.');}
function sequence(value:number){ensure(Number.isSafeInteger(value)&&value>=1&&value<=MAX_SEQUENCE,'Het volgende factuurnummer moet een geheel getal tussen 1 en 999.999.999 zijn.');}
export function validateInvoiceNumbering(settings:InvoiceNumberingSettings){
 for(const series of seriesNames){const config=settings[series];ensure(config&&typeof config.prefix==='string'&&/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,28}[A-Za-z0-9])?$/.test(config.prefix),'Gebruik een prefix van 1–30 letters, cijfers, punten, streepjes of underscores, met een letter of cijfer aan het begin en einde.');ensure(Number.isInteger(config.digits)&&config.digits>=1&&config.digits<=8,'Kies 1 tot en met 8 cijfers voor het volgnummer.');ensure(config.nextByYear&&typeof config.nextByYear==='object'&&!Array.isArray(config.nextByYear),'Controleer de volgnummers per jaar.');for(const [year,next] of Object.entries(config.nextByYear)){yearKey(year);sequence(next);}if(config.exhaustedYears!==undefined){ensure(Array.isArray(config.exhaustedYears)&&new Set(config.exhaustedYears).size===config.exhaustedYears.length,'Controleer de uitgeputte factuurjaren.');for(const year of config.exhaustedYears){yearKey(year);ensure(config.nextByYear[year]===MAX_SEQUENCE,'Een uitgeput factuurjaar mist zijn laatste reservering.');}}}
 ensure(settings.sponsors.prefix.toLowerCase()!==settings.donors.prefix.toLowerCase(),'Gebruik verschillende prefixes voor sponsor- en donateursfacturen.');
}
function numbers(data:SponsorshipState){return [...data.invoices.map(invoice=>invoice.number),...(data.donors?.invoices||[]).map(invoice=>invoice.number)];}
function usedMaximum(data:SponsorshipState,config:InvoiceNumberSeries,year:string){
 const prefix=`${config.prefix}-${year}-`.toLowerCase();let max=0;
 for(const number of numbers(data)){if(!number.toLowerCase().startsWith(prefix))continue;const tail=number.slice(prefix.length);if(/^\d+$/.test(tail)){const value=Number(tail);if(Number.isSafeInteger(value))max=Math.max(max,value);}}
 return max;
}
/** Returns a detached configuration; existing invoice numbers are never rewritten. */
export function getInvoiceNumbering(data:SponsorshipState):InvoiceNumberingSettings{
 const stored=data.settings.invoiceNumbering;
 const settings:InvoiceNumberingSettings={sponsors:{...defaults.sponsors,...stored?.sponsors,nextByYear:{...stored?.sponsors?.nextByYear},...(stored?.sponsors?.exhaustedYears?{exhaustedYears:[...stored.sponsors.exhaustedYears]}:{})},donors:{...defaults.donors,...stored?.donors,nextByYear:{...stored?.donors?.nextByYear},...(stored?.donors?.exhaustedYears?{exhaustedYears:[...stored.donors.exhaustedYears]}:{})}};
 validateInvoiceNumbering(settings);return settings;
}
/** The next usable sequence also includes historical and cancelled invoices. */
export function getNextInvoiceSequence(data:SponsorshipState,series:InvoiceSeries,year:string){yearKey(year);const config=getInvoiceNumbering(data)[series];ensure(!config.exhaustedYears?.includes(year),'De volgnummers voor dit factuurjaar zijn uitgeput.');const next=Math.max(config.nextByYear[year]||1,usedMaximum(data,config,year)+1);sequence(next);return next;}
function plan(data:SponsorshipState,series:InvoiceSeries,issueDate:string,count:number){
 ensure(seriesNames.includes(series),'Kies een geldige factuurreeks.');ensure(Number.isSafeInteger(count)&&count>=1&&count<=100,'Kies een geldig aantal facturen.');
 const year=yearForDate(issueDate),settings=getInvoiceNumbering(data),config=settings[series],first=getNextInvoiceSequence(data,series,year);
 sequence(first+count-1);const used=new Set(numbers(data).map(value=>value.toLowerCase()));
 const allocated=Array.from({length:count},(_,index)=>`${config.prefix}-${year}-${String(first+index).padStart(config.digits,'0')}`);
 ensure(allocated.every(number=>!used.has(number.toLowerCase())),'Dit factuurnummer bestaat al. Kies een hoger volgnummer.');
 settings[series].nextByYear[year]=Math.min(first+count,MAX_SEQUENCE);if(first+count>MAX_SEQUENCE)settings[series].exhaustedYears=[...new Set([...(settings[series].exhaustedYears||[]),year])];return {settings,allocated};
}
export function nextInvoiceNumber(data:SponsorshipState,series:InvoiceSeries,issueDate:string){return plan(data,series,issueDate,1).allocated[0];}
/** Call after validating all invoice inputs; reserves a whole batch atomically. */
export function reserveInvoiceNumbers(data:SponsorshipState,series:InvoiceSeries,issueDate:string,count=1):string[]{const allocation=plan(data,series,issueDate,count);data.settings.invoiceNumbering=allocation.settings;return allocation.allocated;}
export function canManageInvoiceSeries(state:CmsState,actorId:string,series:InvoiceSeries){const user=state.members.find(member=>member.id===actorId&&member.active),role=state.roles.find(row=>row.id===user?.roleId);return seriesNames.includes(series)&&!!role&&!role.teamScoped&&(series==='sponsors'?role.permissions.includes('sponsors'):role.permissions.includes('donors')&&role.permissions.includes('donors-settings'));}
/** Partial changes let a donor administrator manage their series independently. */
function _saveInvoiceNumberingSettings(state:CmsState,actorId:string,input:Partial<InvoiceNumberingSettings>){
 ensure(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>seriesNames.includes(key as InvoiceSeries)),'Kies geldige factuurreeksen.');
 const data=state.sponsorship;ensure(data,'Open eerst het sponsor- of donateursbeheer.');const old=getInvoiceNumbering(data),next=copy(old);
 for(const series of seriesNames){if(!Object.hasOwn(input,series))continue;ensure(canManageInvoiceSeries(state,actorId,series),'Je hebt geen rechten om deze factuurreeks aan te passen.');ensure(input[series],'Controleer de factuurreeks.');const candidate=copy(input[series]);if(candidate.exhaustedYears===undefined&&old[series].exhaustedYears)candidate.exhaustedYears=copy(old[series].exhaustedYears);candidate.prefix=candidate.prefix.trim();if(JSON.stringify(candidate)===JSON.stringify(old[series]))continue;next[series]=candidate;}
 validateInvoiceNumbering(next);
 for(const series of seriesNames){const config=next[series],previous=old[series];ensure((previous.exhaustedYears||[]).every(year=>config.exhaustedYears?.includes(year)),'Een uitgeput factuurjaar mag niet opnieuw worden vrijgegeven.');for(const [year,oldNext] of Object.entries(previous.nextByYear)){ensure(Object.hasOwn(config.nextByYear,year)&&config.nextByYear[year]>=oldNext,'Een reeds gereserveerd volgnummer mag niet worden teruggezet of verwijderd.');}for(const [year,nextNumber] of Object.entries(config.nextByYear)){ensure(nextNumber>usedMaximum(data,config,year)||config.exhaustedYears?.includes(year)&&nextNumber===MAX_SEQUENCE&&usedMaximum(data,config,year)<=MAX_SEQUENCE,'Dit volgnummer is al gebruikt. Kies een hoger volgnummer; ook geannuleerde facturen behouden hun nummer.');}}
 data.settings.invoiceNumbering=next;return copy(next);
}

export const saveInvoiceNumberingSettings=(...args:Parameters<typeof _saveInvoiceNumberingSettings>):ReturnType<typeof _saveInvoiceNumberingSettings>=>domainMutation('saveInvoiceNumberingSettings',args,()=>_saveInvoiceNumberingSettings(...args));

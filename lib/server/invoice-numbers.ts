import type {SponsorshipState} from '../cms/sponsorship-types';
import {getInvoiceNumbering,validateInvoiceNumbering,type InvoiceNumberingSettings,type InvoiceSeries} from '../cms/invoice-numbering';
import {CmsError} from './errors';
const MAX=999_999_999;
function maximum(numbers:string[],prefix:string,year:string){const start=(prefix+'-'+year+'-').toLowerCase();return numbers.reduce((max,value)=>{if(!value.toLowerCase().startsWith(start))return max;const tail=value.slice(start.length);return /^\d+$/.test(tail)?Math.max(max,Number(tail)):max;},0);}
/** Called with workspaceLocks already held, in the same transaction as invoices. */
export async function reserveNewInvoiceNumbers(tx:any,data:SponsorshipState,previous:InvoiceNumberingSettings,oldIds:Set<string>){
 const groups:[InvoiceSeries,{id:string;number:string;issueDate:string}[]][]=[['sponsors',data.invoices],['donors',data.donors?.invoices||[]]];
 const settings=structuredClone(previous),used=(await tx`select number from cms_invoice_numbers`).map((r:any)=>r.number) as string[];
 for(const [series,invoices] of groups)for(const invoice of invoices.filter(row=>!oldIds.has(row.id))){
  const date=invoice.issueDate,year=date.slice(0,4),yearNumber=Number(year);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||yearNumber<1900||yearNumber>9999||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new CmsError('validation','Kies een bestaande factuurdatum.',422);
  const config=settings[series];
  if(config.exhaustedYears?.includes(year))throw new CmsError('invoice-sequence-exhausted','De factuurreeks voor dit jaar is vol.',422);
  const sequence=Math.max(config.nextByYear[year]||1,maximum(used,config.prefix,year)+1);
  if(!Number.isSafeInteger(sequence)||sequence<1||sequence>MAX)throw new CmsError('invoice-sequence-exhausted','De factuurreeks voor dit jaar is vol. Kies een nieuwe prefix.',422);
  const number=config.prefix+'-'+year+'-'+String(sequence).padStart(config.digits,'0');
  await tx`insert into cms_invoice_numbers(number_key,number,record_id,source) values (${number.toLowerCase()},${number},${invoice.id},${series})`;
  invoice.number=number;used.push(number);config.nextByYear[year]=Math.min(sequence+1,MAX);
  if(sequence===MAX)config.exhaustedYears=[...new Set([...(config.exhaustedYears||[]),year])];
 }
 data.settings.invoiceNumbering=settings;
}
/** Also checks permanent reservations no longer represented in live projections. */
export async function validateStoredNumbering(tx:any,data:SponsorshipState){
 const settings=getInvoiceNumbering(data);validateInvoiceNumbering(settings);
 const numbers=(await tx`select number from cms_invoice_numbers`).map((row:any)=>row.number) as string[];
 for(const series of ['sponsors','donors'] as const)for(const [year,next] of Object.entries(settings[series].nextByYear))if(next<=maximum(numbers,settings[series].prefix,year)&&!(next===MAX&&settings[series].exhaustedYears?.includes(year)))throw new CmsError('invoice-number-used','Dit volgnummer is al gebruikt; ook geannuleerde facturen behouden hun nummer.',422);
}

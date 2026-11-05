import {publicCoachName} from './sportlink-match-coaches';
type Source=Record<string,unknown>;
const text=(value:unknown):string=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
const first=(row:Source,keys:string[])=>{for(const key of keys)if(Object.hasOwn(row,key))return text(row[key]);return '';};

/** Always return a complete fresh facilities value, including empty strings.
 * A removed assignment in Sportlink must remove the old assignment in the DB too.
 * Field names follow the public Club.Data programma output.
 */
export function normalizeMatchFacilities(row:Source){
 const address=first(row,['accommodatieadres','adres']);
 const postal=first(row,['accommodatiepostcode','postcode']);
 const place=first(row,['plaats','accommodatieplaats']);
 return {
  field:first(row,['veld','veldnaam']),
  homeDressingRoom:first(row,['kleedkamerthuisteam']),
  awayDressingRoom:first(row,['kleedkameruitteam']),
  referee:publicCoachName(first(row,['scheidsrechter']))||'',
  venueAddress:[address,postal,place].filter(Boolean).join(' · '),
 };
}

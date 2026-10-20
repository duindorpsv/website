import type {SportlinkMatch} from './sportlink-types';
const text=(value:unknown)=>typeof value==='string'?value.trim():typeof value==='number'?String(value):'';
export function sportlinkAssignmentFields(value:Record<string,unknown>):Pick<SportlinkMatch,'field'|'changingRooms'>{
 return {field:text(value.veld)||text(value.veldnaam),changingRooms:{home:text(value.kleedkamerthuisteam),away:text(value.kleedkameruitteam),official:text(value.kleedkamerscheidsrechter)}};
}

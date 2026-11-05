import {createHash} from 'node:crypto';
import {cachedSportlinkArticle,SportlinkSourceError} from './sportlink-client';
import {normalizeSportlink} from '../sportlink-normalize';
import {record,text} from '../sportlink-team-normalize';
import type {SportlinkSettings} from '../cms/sportlink-settings';

/** Only /clubgegevens and /teams under the same server credential establish ownership. */
export async function verifiedSportlinkCatalog(settings:SportlinkSettings,force=false,requireConfigured=true){
 const club=await cachedSportlinkArticle('clubgegevens',{}, {settings,dataset:'teams',force});
 const clubCode=text(record(record(club.value).gegevens).clubcode);
 if(club.stale||!clubCode||requireConfigured&&!settings.clubCode||settings.clubCode&&settings.clubCode!==clubCode)throw new SportlinkSourceError('Clubidentiteit ontbreekt of wijkt af. Bevestig de clubcode bij Sportlink-instellingen; bestaande gegevens blijven bewaard.');
 const result=await cachedSportlinkArticle('teams',{competitieperiode:'ALLES'},{settings,dataset:'teams',force});
 if(result.stale||!Array.isArray(result.value)||!result.value.length)throw new SportlinkSourceError('De geautoriseerde teamlijst is niet beschikbaar. Een lege lijst verwijdert geen teams.');
 const rows:unknown[]=[],conflicts:string[]=[];
 for(const value of result.value){const row=record(value),claimed=text(row.clubcode)||text(row.clubrelatiecode);
  if(claimed&&claimed!==clubCode){conflicts.push(text(row.teamcode)+':'+text(row.lokaleteamcode));continue;}rows.push(row);
 }
 const snapshot=normalizeSportlink({verifiedClubCode:clubCode,teams:rows,standings:[],leagueResults:[],leagueFixtures:[],clubResults:[],clubFixtures:[]});
 if(!snapshot.teams.length)throw new SportlinkSourceError('De bron bevat geen verifieerbare eigen teams. Controleer de clubidentiteit.');
 return {clubCode,clubName:text(record(record(club.value).gegevens).clubnaam),rows,teams:snapshot.teams,updatedAt:result.updatedAt,conflicts};
}
/** An observed address is evidence for an explicit human confirmation, never an accommodation ID. */
export function accommodationEvidence(detail:unknown){
 const source=record(record(detail).accommodatie);
 const value={name:text(source.naam),street:text(source.straat),city:text(source.plaats)};
 return {label:[value.name,value.street,value.city].filter(Boolean).join(', '),fingerprint:Object.values(value).some(Boolean)?createHash('sha256').update(JSON.stringify(value)).digest('hex'):''};
}

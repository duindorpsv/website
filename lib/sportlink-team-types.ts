import type {SportlinkMatch, SportlinkStanding, SportlinkTeam} from './sportlink-types';

export type TeamSeason = {id:string; label:string};
export type TeamPool = {
 id:string; label:string; seasonId:string; type:string; phase:string|null;
 competitionName:string; current:boolean;
};
export type TeamPlayer = {
 id:string; name:string; role:string; function:string; kind:'player'|'staff'; photoUrl:string|null;
};
export type TeamAvailability = 'available'|'empty'|'unavailable';
export type SportlinkTeamDetail = {
 team:SportlinkTeam; teamPhotoUrl:string|null; seasons:TeamSeason[]; pools:TeamPool[];
 selectedSeasonId:string; selectedPoolId:string|null;
 fixtures:SportlinkMatch[]; results:SportlinkMatch[]; standings:SportlinkStanding[];
 players:TeamPlayer[]; hiddenPlayers:number;
 updatedAt:string; stale:boolean; warning:string|null;
 availability:{fixtures:TeamAvailability; results:TeamAvailability; standings:TeamAvailability; players:TeamAvailability};
 notes:string[];
};

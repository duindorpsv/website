import type {SportlinkTeam} from './sportlink-types';

const legacyTeamNames:Record<string,string>={
 '1':'1','2':'2',jo19:'JO19-1',jo15:'JO15-1',mo17:'MO17-1',
};
const teamName=(value:string)=>value.toLocaleLowerCase('nl').replace(/^duindorp\s*(?:s\.?v\.?)?\s*/,'').replace(/\s+/g,'').trim();

// Old CMS cards use short demo IDs. Resolve those against the actual club
// directory; never open an unrelated placeholder team or invent a Sportlink ID.
export function heroTeamHref(target:string,teams:SportlinkTeam[],firstTeam?:SportlinkTeam|null){
 if(target==='walking')return '/clubmuur/teams/walking-football';
 const name=legacyTeamNames[target];
 const team=teams.find(item=>item.id===target)||(target==='1'?firstTeam:null)||(name?teams.find(item=>teamName(item.name)===teamName(name)):null);
 return team?`/clubmuur/teams/${encodeURIComponent(team.id)}`:'/clubmuur/teams';
}

export type FormResult='W'|'GL'|'V';
export type SportlinkCompetition={id:string;label:string;type:string};
export type SportlinkTeam={id:string;teamCode:string;localTeamCode:string;name:string;category:string;gender:string;sport:string;day:string;competitions:SportlinkCompetition[]};
export type SportlinkSide={id:string;name:string;clubCode:string;logoUrl:string|null;own:boolean};
export type SportlinkMatch={id:string;kickoff:string;home:SportlinkSide;away:SportlinkSide;homeScore:number|null;awayScore:number|null;scoreLabel:string|null;status:string;venue:string;competitionId:string;competitionLabel:string};
export type SportlinkStanding={rank:number;team:SportlinkSide;played:number;won:number;drawn:number;lost:number;goalsFor:number;goalsAgainst:number;goalDifference:number;points:number;form:FormResult[]};
export type SportlinkRound={label:string;startDate:string|null;endDate:string|null;matches:SportlinkMatch[]};
export type SportlinkSnapshot={
 updatedAt:string;stale:boolean;warning:string|null;
 teams:SportlinkTeam[];firstTeam:SportlinkTeam|null;competition:SportlinkCompetition|null;
 standings:SportlinkStanding[];previousRound:SportlinkRound;nextRound:SportlinkRound;
 nextMatch:SportlinkMatch|null;results:SportlinkMatch[];fixtures:SportlinkMatch[];
};

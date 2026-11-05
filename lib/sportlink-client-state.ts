import type {SportlinkMatch,SportlinkSnapshot} from './sportlink-types';

export type MatchVersions=Map<string,{match:SportlinkMatch;at:number}>;

/** A late page response cannot undo a newer match response (or vice versa). */
export function receiveMatchVersion(versions:MatchVersions,match:SportlinkMatch,updatedAt:string):SportlinkMatch{
 const at=Date.parse(match.sourceUpdatedAt||updatedAt),previous=versions.get(match.id);
 if(previous&&(!Number.isFinite(at)||previous.at>at))return previous.match;
 if(Number.isFinite(at))versions.set(match.id,{match,at});
 return match;
}

export function receiveSnapshot(versions:MatchVersions,snapshot:SportlinkSnapshot):SportlinkSnapshot{
 const receive=(rows:SportlinkMatch[])=>rows.map(match=>receiveMatchVersion(versions,match,snapshot.updatedAt));
 return {...snapshot,fixtures:receive(snapshot.fixtures),results:receive(snapshot.results),previousRound:{...snapshot.previousRound,matches:receive(snapshot.previousRound.matches)},nextRound:{...snapshot.nextRound,matches:receive(snapshot.nextRound.matches)},nextMatch:snapshot.nextMatch?receiveMatchVersion(versions,snapshot.nextMatch,snapshot.updatedAt):null};
}

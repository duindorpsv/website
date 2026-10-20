import {AsyncLocalStorage} from 'node:async_hooks';
const age=new AsyncLocalStorage<number>();
const observation=new AsyncLocalStorage<{at:number}>();
export function sportlinkReadMaxAge(){return age.getStore()??Infinity;}
export function observeSportlinkSource(at:number){const current=observation.getStore();if(current)current.at=Math.min(current.at,at);}
export async function collectSportlinkObservation<T>(read:()=>Promise<T>){const current={at:Date.now()};const value=await observation.run(current,read);return {value,updatedAt:current.at};}
/** A visible dossier needs fresher match datasets, without shortening catalog/roster schedules. */
export function withSportlinkReadAge<T>(maxAgeMs:number,read:()=>Promise<T>){return age.run(Math.max(1000,maxAgeMs),read);}

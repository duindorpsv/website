import {runOnce,retain,cleanOrphans} from '../lib/server/worker';
import {sqlClient} from '../db/index';
import {scheduleSportlinkSync} from '../lib/server/sportlink-sync';
let stopping=false,lastRetention=0,lastSportlink=0;const id=crypto.randomUUID();process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){try{if(Date.now()-lastSportlink>60000){lastSportlink=Date.now();try{await scheduleSportlinkSync();}catch{console.error(JSON.stringify({code:'sportlink-scheduler-unavailable'}));}}const active=await runOnce(id);if(Date.now()-lastRetention>3600000){await retain();await cleanOrphans();lastRetention=Date.now();}if(!active)await new Promise(resolve=>setTimeout(resolve,1000));}catch{console.error(JSON.stringify({code:'worker-dependency-unavailable'}));await new Promise(resolve=>setTimeout(resolve,5000));}}
await sqlClient().end();

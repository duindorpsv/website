import {runOnce,retain,cleanOrphans} from '../lib/server/worker';
import {sqlClient} from '../db/index';
let stopping=false,lastRetention=0;const id=crypto.randomUUID();process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){try{const active=await runOnce(id);if(Date.now()-lastRetention>3600000){await retain();await cleanOrphans();lastRetention=Date.now();}if(!active)await new Promise(resolve=>setTimeout(resolve,1000));}catch{console.error(JSON.stringify({code:'worker-dependency-unavailable'}));await new Promise(resolve=>setTimeout(resolve,5000));}}
await sqlClient().end();

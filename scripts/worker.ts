import {scheduleSponsorReminders} from '../lib/server/sponsor-reminders';
import {runOnce,retain,cleanOrphans} from '../lib/server/worker';
import {sqlClient} from '../db/index';
import {scheduleSportlinkSync} from '../lib/server/sportlink-sync';
import {ensureClubArchive} from '../lib/server/archive-seed';
import {safeDatabaseCode} from '../lib/server/database-diagnostics';
let stopping=false,archiveInitialized=false,lastRetention=0,lastSportlink=0,lastSponsors=0;const id=crypto.randomUUID();process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){try{if(!archiveInitialized){await ensureClubArchive();archiveInitialized=true;}if(Date.now()-lastSportlink>60000){lastSportlink=Date.now();try{await scheduleSportlinkSync();}catch{console.error(JSON.stringify({code:'sportlink-scheduler-unavailable'}));}}if(Date.now()-lastSponsors>300000){lastSponsors=Date.now();try{await scheduleSponsorReminders();}catch{console.error(JSON.stringify({code:'sponsor-scheduler-unavailable'}));}}const active=await runOnce(id);if(Date.now()-lastRetention>3600000){await retain();await cleanOrphans();lastRetention=Date.now();}if(!active)await new Promise(resolve=>setTimeout(resolve,1000));}catch(error){console.error(JSON.stringify({code:'worker-dependency-unavailable',stage:archiveInitialized?'jobs':'archive-initialization',reason:safeDatabaseCode(error)}));await new Promise(resolve=>setTimeout(resolve,5000));}}
await sqlClient().end();

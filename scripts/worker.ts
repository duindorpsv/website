import {scheduleSponsorReminders} from '../lib/server/sponsor-reminders';
import {runOnce,retain,cleanOrphans} from '../lib/server/worker';
import {sqlClient} from '../db/index';
import {scheduleSportlinkSync} from '../lib/server/sportlink-sync';
import {ensureClubArchive} from '../lib/server/archive-seed';
import {safeDatabaseCode} from '../lib/server/database-diagnostics';
import {createWorkerWatchdog} from '../lib/server/worker-watchdog';
let stopping=false,archiveInitialized=false,lastRetention=0,lastSportlink=0,lastSponsors=0;const id=crypto.randomUUID();process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const watchdog=createWorkerWatchdog();
try{
 while(!stopping){
  try{
   if(!archiveInitialized){watchdog.progress('archive-initialization');await ensureClubArchive(()=>watchdog.progress('archive-initialization'));archiveInitialized=true;}
   if(Date.now()-lastSportlink>60000){
    watchdog.progress('sportlink-scheduler');lastSportlink=Date.now();
    try{await scheduleSportlinkSync();}catch{console.error(JSON.stringify({code:'sportlink-scheduler-unavailable'}));}
   }
   if(Date.now()-lastSponsors>300000){
    watchdog.progress('sponsor-scheduler');lastSponsors=Date.now();
    try{await scheduleSponsorReminders();}catch{console.error(JSON.stringify({code:'sponsor-scheduler-unavailable'}));}
   }
   const active=await runOnce(id,watchdog.progress);
   if(Date.now()-lastRetention>3600000){
    watchdog.progress('retention');await retain(watchdog.progress);
    watchdog.progress('orphan-cleanup');await cleanOrphans(undefined,watchdog.progress);lastRetention=Date.now();
   }
   watchdog.progress('idle');
   if(!active)await new Promise(resolve=>setTimeout(resolve,1000));
  }catch(error){
   console.error(JSON.stringify({code:'worker-dependency-unavailable',stage:archiveInitialized?'jobs':'archive-initialization',reason:safeDatabaseCode(error)}));
   watchdog.progress('retry-delay');await new Promise(resolve=>setTimeout(resolve,5000));
  }
 }
 watchdog.progress('shutdown');await sqlClient().end();
}finally{watchdog.stop();}

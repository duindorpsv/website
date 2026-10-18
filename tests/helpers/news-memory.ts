import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
/** Linux RSS high-water marks for the actual runtime; no application credentials. */
export function runtimeMemory(){
 const result:Record<string,number>={};
 for(const kind of ['web','worker']){try{
  const pid=process.env['NEWS_TEST_'+kind.toUpperCase()+'_PID']||execFileSync('docker',['inspect','-f','{{.State.Pid}}','duindorp-ci-'+kind],{stdio:['ignore','pipe','ignore'],encoding:'utf8'}).trim();
  if(!/^\d+$/.test(pid)||pid==='0')continue;const status=readFileSync('/proc/'+pid+'/status','utf8');const peak=/VmHWM:\s+(\d+) kB/.exec(status);if(peak)result[kind]=Number(peak[1])*1024;
 }catch{/* Docker runtime measurements are available in CI; local runs can supply their own PIDs. */}}
 return result;
}

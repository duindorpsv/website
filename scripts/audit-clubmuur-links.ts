/** Read-only production smoke test. Run with the published Site origin. */
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const {clubContentPaths}=await import(new URL('../lib/clubmuur-page-routes.ts',import.meta.url).href) as typeof import('../lib/clubmuur-page-routes');
const {clubNavigationDestinations}=await import(new URL('../lib/clubmuur-navigation.ts',import.meta.url).href) as typeof import('../lib/clubmuur-navigation');
const base=new URL(process.argv[2]||'');
if(base.protocol!=='https:')throw new Error('Pass the HTTPS origin of the published site.');
const snapshotResponse=await fetch(new URL('/api/sportlink',base),{signal:AbortSignal.timeout(30000)});
if(!snapshotResponse.ok)throw new Error(`Sportlink overview returned ${snapshotResponse.status}`);
const snapshot=await snapshotResponse.json() as {teams:{id:string;name:string}[]};
if(!Array.isArray(snapshot.teams)||!snapshot.teams.length)throw new Error('No teams available for the link audit.');
const paths=new Set(['/', '/clubmuur','/clubmuur/nieuws','/clubmuur/teams','/clubmuur/wedstrijden','/beheer','/narrowcasting','/headers','/preview',
 ...clubContentPaths.map(path=>`/clubmuur/${path}`),
 ...clubNavigationDestinations.map(item=>item.href),
 ...snapshot.teams.map(team=>`/clubmuur/teams/${encodeURIComponent(team.id)}`),
 ...['v-line','clubhouse','floodlight','terrace'].flatMap(concept=>[`/${concept}`,`/${concept}/teams`]),
]);
const root=new URL('..',import.meta.url).pathname;
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):/\.(ts|tsx)$/.test(entry.name)?[join(dir,entry.name)]:[]);
for(const file of [...files(join(root,'components')),...files(join(root,'lib'))]){
 for(const match of readFileSync(file,'utf8').matchAll(/(?:href\s*[:=]\s*\{?\s*|location\.(?:href\s*=\s*|assign\())['"](\/clubmuur[^'"\s]*)['"]/g))paths.add(match[1]);
}
// Fragments and queries can share an HTTP page. Check each full href once.
const pending=[...paths], failures:string[]=[];
let passed=0;
await Promise.all(Array.from({length:4},async()=>{
 while(pending.length){
  const path=pending.shift()!;
  try{
   const response=await fetch(new URL(path,base),{redirect:'follow',signal:AbortSignal.timeout(30000)});
   const body=await response.text();
   if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_HTTP_ERROR_FALLBACK;500/.test(body))throw new Error(`HTTP ${response.status}`);
   const destination=new URL(response.url);
   if(path==='/'||/^\/(?:headers|preview|v-line|clubhouse|floodlight|terrace)(?:\/|$)/.test(path)){
    if(!destination.pathname.startsWith('/clubmuur'))throw new Error(`redirected to ${destination.pathname}`);
   }
   passed++;
  }catch(error){failures.push(`${path}: ${error instanceof Error?error.message:String(error)}`);}
 }
}));
console.log(JSON.stringify({pagesChecked:paths.size,teamsChecked:snapshot.teams.length,passed,failures},null,2));
if(failures.length)process.exitCode=1;

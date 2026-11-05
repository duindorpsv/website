import {readFile,writeFile} from 'node:fs/promises';
const payload=JSON.parse(await readFile('.runtime/supabase-advisors.json','utf8'));
function results(value:unknown):Record<string,unknown>[]|null{
 if(Array.isArray(value)&&value.every(v=>v&&typeof v==='object'&&typeof v.name==='string'))return value;
 if(value&&typeof value==='object')for(const key of ['results','data','result']){const found=results((value as Record<string,unknown>)[key]);if(found)return found;}
 return null;
}
const issues=results(payload);if(!issues)throw new Error('Geen geldig Supabase-advisorresultaat ontvangen.');
const summary=issues.map(issue=>({name:issue.name,level:issue.level,schema:(issue.metadata as Record<string,unknown>|undefined)?.schema}));
await writeFile('.runtime/supabase-advisors-summary.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({supabaseSecurityIssues:summary.length,issues:summary}));

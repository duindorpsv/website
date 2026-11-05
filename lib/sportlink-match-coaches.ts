const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const mainRoles=new Set(['hoofdtrainer','hoofdcoach','trainercoach']);

/** Sportlink may shield a member even when the function itself is public. */
export function publicCoachName(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const name=value.replace(/\s+/g,' ').trim();
 if(!name||name.length>120||!/[a-zA-ZÀ-ž]/.test(name)||/\*{2,}|afgeschermd|anoniem|onbekend|niet\s+(?:beschikbaar|openbaar)|hidden|private|niet\s+zichtbaar/i.test(name))return null;
 return name;
}

/** KNVB's Trainer/coach is the unique primary role; bare Trainer is not.
 * Do not choose an arbitrary person when conflicting primary registrations exist.
 */
export function publicMatchHeadCoach(rows:unknown):string|null{
 if(!Array.isArray(rows))return null;
 const names=new Map<string,string>();let ambiguous=false;
 for(const value of rows.slice(0,2000)){
  if(!value||typeof value!=='object')continue;
  const row=value as Record<string,unknown>;
  const roles=[row.functie,row.rol].filter((role):role is string=>typeof role==='string').map(normalized);
  if(roles.some(role=>/assistent|assistant|keeper|goalkeeper/.test(role))||!roles.some(role=>mainRoles.has(role)))continue;
  const name=publicCoachName(row.naam);if(name)names.set(name.toLocaleLowerCase('nl-NL'),name);else ambiguous=true;
 }
 return !ambiguous&&names.size===1?[...names.values()][0]:null;
}

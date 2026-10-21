
import {archiveYear} from './club-archive-schema';
import {archiveId,type ArchiveContribution,type ArchiveState} from './club-archive-types';

export function archivePublicationErrors(state:ArchiveState,entry:ArchiveContribution):string[]{
 const errors:string[]=[];
 if(!entry.title.trim())errors.push('Geef de bijdrage een titel.');
 if(!entry.description.trim())errors.push('Voeg een verhaal of toelichting toe.');
 if(!entry.anonymous&&!entry.name.trim())errors.push('Vul de publieke naam in of kies anoniem.');
 const year=entry.date.year;
 if(!entry.date.unknown&&(typeof year!=='number'||!Number.isInteger(year)||year<1900||year>archiveYear()))errors.push('Kies een geldig jaartal of Nog te dateren.');
 if(entry.date.month!==undefined&&(!Number.isInteger(entry.date.month)||entry.date.month<1||entry.date.month>12))errors.push('Kies een geldige maand.');
 if(entry.date.month&&(!entry.date.year||entry.date.unknown))errors.push('Een maand heeft ook een bekend jaartal nodig.');
 if(entry.media.some(m=>m.approved===true&&!m.src))errors.push('Een goedgekeurd bestand is niet beschikbaar. Laad het bestand opnieuw.');
 if(entry.kind==='addition'||entry.kind==='correction'){
  const target=entry.targetType==='object'?state.objects.find(o=>o.id===entry.targetId&&o.published):state.moments.find(m=>m.id===entry.targetId&&m.published);
  if(!target)errors.push('Koppel deze bijdrage aan een gepubliceerd moment of museumstuk.');
 }
 if(entry.kind==='object'&&entry.targetId&&!state.moments.some(m=>m.id===entry.targetId&&m.published))errors.push('Kies een bestaand gepubliceerd moment voor dit museumstuk.');
 if(state.contributions.some(c=>c.id===entry.id&&c.status==='published'))errors.push('Deze bijdrage is al gepubliceerd.');
 return errors;
}

/** Pure state mutation for a single atomic archive update. Corrections remain annotations. */
export function publishArchiveContribution(state:ArchiveState,entry:ArchiveContribution):string{
 const errors=archivePublicationErrors(state,entry);if(errors.length)throw new Error(errors.join(' '));
 const next=structuredClone(entry);next.title=next.title.trim();next.description=next.description.trim();
 next.media=next.media.map(m=>({...m,approved:m.approved===true}));next.status='published';
 if(next.date.unknown)next.date={unknown:true};
 const media=next.media.filter(m=>m.approved===true);
 const people=next.people.split(/[,;\n]/).map(p=>p.trim()).filter(Boolean);
 const sourceLabel=next.anonymous?'Clubarchief · anonieme bijdrage':`Clubarchief · ${next.name.trim()}`;
 const story=next.description.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
 if(next.kind==='moment'){
  const previous=state.moments.find(m=>m.id===next.publishedId);const id=previous?.id||archiveId('moment');const slug=previous?.slug||`${next.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'herinnering'}-${id.split('-').slice(-2).join('-')}`;
  const moment={id,slug,title:next.title,intro:next.description.slice(0,220),story,date:next.date,category:next.category,cover:media.find(m=>m.kind==='image')?.src||'/assets/logo.png',media,people,objectIds:previous?.objectIds||[],relatedMomentIds:previous?.relatedMomentIds||[],sourceLabel,sourceUrl:'',published:true};
  if(previous)state.moments[state.moments.indexOf(previous)]=moment;else state.moments.unshift(moment);next.publishedId=id;
 }else if(next.kind==='object'){
  const previous=state.objects.find(o=>o.id===next.publishedId);const id=previous?.id||archiveId('museum');const slug=previous?.slug||`${next.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'museumstuk'}-${id.split('-').slice(-2).join('-')}`;
  const target=state.moments.find(m=>m.id===next.targetId&&m.published);
  const object={id,slug,title:next.title,intro:next.description.slice(0,220),story,date:next.date,collection:'Bijdragen uit de club',kind:'Ingezonden museumstuk',cover:media.find(m=>m.kind==='image')?.src||'/assets/logo.png',media,people,momentIds:target?[target.id]:[],provenance:next.source.trim()||'Herkomst nog te onderzoeken',sourceLabel,sourceUrl:'',published:true};
  if(previous)state.objects[state.objects.indexOf(previous)]=object;else state.objects.unshift(object);
  for(const moment of state.moments)moment.objectIds=moment.objectIds.filter(objectId=>objectId!==id);
  if(target&&!target.objectIds.includes(id))target.objectIds.push(id);next.publishedId=id;
 }else{
  next.publishedId=next.targetId;
  if(next.kind==='correction')next.note=[next.note,'Goedgekeurd als herkenbare correctiebijdrage. Het oorspronkelijke verhaal is behouden.'].filter(Boolean).join('\n');
 }
 const index=state.contributions.findIndex(c=>c.id===next.id);if(index<0)state.contributions.unshift(next);else state.contributions[index]=next;
 return next.publishedId||next.id;
}

export function withdrawArchiveContribution(state:ArchiveState,id:string):void{
 const entry=state.contributions.find(c=>c.id===id);if(!entry)return;
 if(entry.kind==='moment'){const moment=state.moments.find(m=>m.id===entry.publishedId);if(moment)moment.published=false;}
 if(entry.kind==='object'){const object=state.objects.find(o=>o.id===entry.publishedId);if(object)object.published=false;}
 entry.status='pending';entry.note=[entry.note,'Publicatie ingetrokken; opnieuw ter beoordeling.'].filter(Boolean).join('\n');
}

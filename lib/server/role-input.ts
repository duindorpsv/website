import {z} from 'zod';

export const roleInput=z.object({
 id:z.string().regex(/^[a-z][a-z0-9-]{1,80}$/),
 name:z.string().min(1).max(100),description:z.string().max(500),teamScoped:z.boolean(),expectedVersion:z.number().int().min(0),
 grants:z.array(z.object({
  module:z.enum(['news','stories','pages','media','people','directory','sponsors','donors','board','forms','submissions','settings','users','roles']),
  action:z.enum(['read','create','update','delete','publish','manage','invoice','settings','chair','secretary','member','committee']),
 }).strict()).max(100),
}).strict().superRefine((value,ctx)=>{
 for(const [index,grant] of value.grants.entries()){
  const invalid=grant.module==='donors'?!['read','manage','invoice','settings'].includes(grant.action):grant.module==='board'?!['read','manage','chair','secretary','member','committee'].includes(grant.action):['invoice','settings','chair','secretary','member','committee'].includes(grant.action);
  if(invalid)ctx.addIssue({code:'custom',path:['grants',index,'action'],message:'Kies een geldige bevoegdheid voor dit onderdeel.'});
 }
 if(value.grants.some(g=>g.module==='donors'&&g.action!=='read')&&!value.grants.some(g=>g.module==='donors'&&g.action==='read'))ctx.addIssue({code:'custom',path:['grants'],message:'Donateurshandelingen vereisen ook Donateurs bekijken.'});
 const workflow=value.grants.filter(g=>g.module==='board'&&['chair','secretary','member','committee'].includes(g.action));
 if(workflow.length>1)ctx.addIssue({code:'custom',path:['grants'],message:'Kies precies één persoonlijke bestuursrol per accountrol.'});
 if(workflow.length&&!value.grants.some(g=>g.module==='board'&&g.action==='read'))ctx.addIssue({code:'custom',path:['grants'],message:'Een bestuursrol vereist ook Bestuur bekijken.'});
 if(value.teamScoped&&value.grants.some(g=>g.module==='board'))ctx.addIssue({code:'custom',path:['grants'],message:'Bestuursrollen zijn clubbreed en mogen niet teamgebonden zijn.'});
});

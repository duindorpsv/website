/** A UI recipe records intent; only the server can authorize and persist it. */
export type DomainCommand={name:string;args:unknown[];offset:number};
let recorder:DomainCommand[]|undefined;
let depth=0,sequence=0,operation='';

export function domainUid(prefix:string){
 return operation?`${prefix}-${operation}-${sequence++}`:`${prefix}-${crypto.randomUUID()}`;
}
export function withDomainIds<T>(id:string,offset:number,run:()=>T):T{
 const previous={operation,sequence};operation=id;sequence=offset;
 try{return run();}finally{operation=previous.operation;sequence=previous.sequence;}
}
export function captureDomainCommands<T>(id:string,run:()=>T){
 if(recorder)throw new Error('Een wijziging is al in behandeling.');
 const commands:DomainCommand[]=[];recorder=commands;
 try{return withDomainIds(id,0,()=>({commands,value:run()}));}finally{recorder=undefined;}
}
export function domainMutation<T>(name:string,args:unknown[],run:()=>T):T{
 if(!depth&&recorder)recorder.push({name,args:structuredClone(args.slice(2)),offset:sequence});
 // OTP verification is exclusively server-side. A UI recipe only previews
 // the return shape; update() succeeds after the real server response.
 if(recorder&&!depth&&['bindDirectoryAccount','saveDirectoryGuardian'].includes(name))return structuredClone(args[2]) as T;
 if(recorder&&!depth&&['trySignSponsorAgreement','tryCountersignSponsorAgreement'].includes(name)){
  const state=args[0] as {sponsorship?:{agreements:{id:string}[]}};
  return {ok:true,agreement:state.sponsorship?.agreements.find(a=>a.id===args[2])} as T;
 }
 depth++;try{return run();}finally{depth--;}
}

export function domainCommandVersionKey(name:string,args:any[]){
 if(name==='saveDirectoryPerson')return 'person:'+args[0].person.id;
 if(['saveSponsor','saveSponsorBusinessDetails'].includes(name))return 'company:'+(typeof args[0]==='string'?args[0]:args[0].id);
 if(name==='saveDirectoryAssignment')return 'assignment:'+args[0].id;
 if(name==='removeDirectoryAssignment')return 'assignment:'+args[0];
 if(name==='saveDirectoryGuardian')return 'guardian:'+args[0].id;
 if(name==='approveDirectoryGuardian')return 'guardian:'+args[0];
 if(name==='saveMembership')return 'membership:'+args[0].id;
 if(name==='removeSponsorMembership')return 'membership:'+args[0];
 if(name.startsWith('saveSponsor')||['reviewSponsorBusinessChange','approveSponsorProfile','sendSponsorProposal','createSponsorAgreement','updateSponsorTask','recordSponsorManualPayment','removeSponsorContractTemplate'].includes(name))return 'record:'+(typeof args[0]==='string'?args[0]:args[0]?.id||'sponsor-settings');
 return '';
}

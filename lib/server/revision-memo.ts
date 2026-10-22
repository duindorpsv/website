/** A bounded process cache: writes are observed through a database revision.
 * Private/session data must never be passed to this cache. */
export class RevisionMemo<T>{
 private entry?:{revision:string;value:T;expires:number};
 private flights=new Map<string,Promise<T>>();
 readonly stats={hits:0,loads:0,joins:0};
 constructor(private ttlMs:number,private now:()=>number=Date.now){}
 async read(revision:string,load:()=>Promise<T>):Promise<T>{
  if(this.entry?.revision===revision&&this.entry.expires>this.now()){
   this.stats.hits++;return structuredClone(this.entry.value);
  }
  const previous=this.flights.get(revision);
  if(previous){this.stats.joins++;return structuredClone(await previous);}
  this.stats.loads++;
  const started=this.now();
  const pending=Promise.resolve().then(load).then(value=>{
   // An old snapshot can finish after a newer one. It must not replace it.
   if(!this.entry||this.entry.expires<=this.now()||BigInt(revision)>=BigInt(this.entry.revision))this.entry={revision,value,expires:started+this.ttlMs};
   return value;
  }).finally(()=>this.flights.delete(revision));
  this.flights.set(revision,pending);
  return structuredClone(await pending);
 }
}

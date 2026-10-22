import {sqlClient} from '../../db';
import {workspaceActor,freshActor} from './sponsor-access';
/** Shared revision invalidation contains no names, roles, company IDs or PII. */
export async function workspaceEvents(request:Request){
 let actor=await workspaceActor(request.headers),checked=Date.now();let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const encoder=new TextEncoder();
 const body=new ReadableStream<Uint8Array>({start(controller){
  const tick=async()=>{if(closed)return;
   try{if(Date.now()-checked>15000){const current=await workspaceActor(request.headers);if(current.p.id!==actor.p.id)throw new Error('account changed');actor=current;checked=Date.now();}const version=await sqlClient().begin(async tx=>{await freshActor(tx,actor);const [r]=await tx`select version from cms_domain_revision where id=true`;return String(r.version);});controller.enqueue(encoder.encode('data: '+JSON.stringify({revision:version})+'\n\n'));}
   catch{controller.enqueue(encoder.encode('event: access-changed\ndata: {}\n\n'));closed=true;controller.close();return;}
   if(Date.now()-actor.session.session.createdAt>12*3600000){closed=true;controller.close();return;}
   if(!closed)timer=setTimeout(tick,2000);
  };void tick();request.signal.addEventListener('abort',()=>{closed=true;clearTimeout(timer);try{controller.close();}catch{}});
 },cancel(){closed=true;clearTimeout(timer);}});
 return new Response(body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
}

import {setTimeout as delay} from 'node:timers/promises';
import {principal} from '@/lib/server/permissions';
import {errorResponse} from '@/lib/server/errors';
import {planningSyncStatus} from '@/lib/server/planning-revision';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Private revision-only SSE. Polls saved DB state, never the external Sportlink API. */
export async function GET(request:Request){
 try{
  await principal(request.headers);
  const stream=new ReadableStream<Uint8Array>({async start(controller){
   let last='',authorizedAt=Date.now();const until=Date.now()+55000,encoder=new TextEncoder();
   try{while(!request.signal.aborted&&Date.now()<until){
    if(Date.now()-authorizedAt>=10000){await principal(request.headers);authorizedAt=Date.now();}
    const value=await planningSyncStatus(),payload=JSON.stringify(value);
    if(payload!==last){controller.enqueue(encoder.encode(`data: ${payload}\n\n`));last=payload;}
    else controller.enqueue(encoder.encode(': keepalive\n\n'));
    await delay(1000,undefined,{signal:request.signal});
   }}catch{/* Expiry, revoked membership, disconnect or outage ends the stream; reconnect reauthorizes. */}
   finally{try{controller.close();}catch{}}
  }});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'}});
 }catch(error){return errorResponse(error);}
}

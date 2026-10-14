import {getSportlinkSnapshot} from '@/lib/sportlink-server';

export async function GET(){
 try{
  return Response.json(await getSportlinkSnapshot(),{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(error){
  console.error('[Sportlink] Sync failed:',error instanceof Error?error.message.replace(/client_id=[^&\s]+/g,'client_id=[hidden]'):'Unknown error');
  return Response.json({error:'De Sportlink-gegevens zijn tijdelijk niet beschikbaar. Probeer het zo opnieuw.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});
 }
}

import {getSportlinkTeamDetail,TeamDataError} from '@/lib/sportlink-team-server';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 try{
  const data=await getSportlinkTeamDetail(params.get('team')||'',params.get('season'),params.get('pool'));
  return Response.json(data,{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(error){
  const status=error instanceof TeamDataError?error.status:503;
  return Response.json({error:error instanceof TeamDataError?error.message:'De teamgegevens zijn tijdelijk niet beschikbaar. Probeer het zo opnieuw.'},{status,headers:{'Cache-Control':'no-store',...(status===503?{'Retry-After':'30'}:{})}});
 }
}

import {getSportlinkTeamPhoto} from '@/lib/sportlink-team-server';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 try{
  const photo=await getSportlinkTeamPhoto(params.get('team')||'',params.get('person')||'',params.get('season'));
  if(!photo)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  const bytes=Uint8Array.from(atob(photo.data),character=>character.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':photo.mime,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}
}

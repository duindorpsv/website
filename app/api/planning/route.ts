import {loadPublicState} from '@/lib/server/public-content';
import {getPublicActivities} from '@/lib/cms/planning';
import {errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const url=new URL(request.url),from=url.searchParams.get('from')||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),to=url.searchParams.get('to')||undefined;return Response.json({items:getPublicActivities((await loadPublicState()).state,{from,to,limit:Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||5))})},{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}

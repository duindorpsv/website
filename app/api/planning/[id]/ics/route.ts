import {loadPublicState} from '@/lib/server/public-content';
import {getPublicActivities} from '@/lib/cms/planning';
import {activityICS} from '@/lib/server/planning-ics';
import {errorResponse,CmsError} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,item=getPublicActivities((await loadPublicState()).state).find(item=>item.id===id);if(!item)throw new CmsError('missing','Deze activiteit is niet openbaar beschikbaar.',404);return new Response(activityICS(item),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="duindorp-activiteit.ics"','Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}

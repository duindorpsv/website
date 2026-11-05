import {loadPublicState} from '@/lib/server/public-content';
import {getPublicActivities} from '@/lib/cms/planning';
import {errorResponse,CmsError} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const result=getPublicActivities((await loadPublicState()).state).find(item=>item.id===id);if(!result)throw new CmsError('missing','Deze activiteit is niet openbaar beschikbaar.',404);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}

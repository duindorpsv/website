import {principal} from '@/lib/server/permissions';
import {matchPreviewChoices} from '@/lib/server/match-previews';
import {errorResponse} from '@/lib/server/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await matchPreviewChoices(await principal(request.headers)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

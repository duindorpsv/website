import {submitArchive} from '@/lib/server/archive-uploads';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await submitArchive(request.headers,await bodyJson(request)),{status:201,headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

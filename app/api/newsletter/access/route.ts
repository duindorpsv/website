import {requestNewsletterAccess} from '@/lib/server/newsletter';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {requestKey} from '@/lib/server/request-key';
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await requestNewsletterAccess(await bodyJson(request,2000),requestKey(request,'newsletter-access')),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

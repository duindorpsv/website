import {requestKey} from '@/lib/server/request-key';
import {requestNewsletter} from '@/lib/server/newsletter';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
export async function POST(request:Request){try{verifyOrigin(request);const body=await bodyJson(request,20000) as any;return Response.json(await requestNewsletter(body,requestKey(request,String(body?.email||''))),{status:201});}catch(e){return errorResponse(e);}}

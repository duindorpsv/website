import {receiveForm} from '@/lib/server/forms';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {verifyOrigin} from '@/lib/server/permissions';
import {requestKey} from '@/lib/server/request-key';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{verifyOrigin(request);const {id}=await params;const body=await bodyJson(request,100_000) as any;return Response.json(await receiveForm(id,body,requestKey(request,String(body?.answers?.email||''))),{status:201,headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

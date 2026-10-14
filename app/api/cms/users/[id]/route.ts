import {principal,verifyOrigin} from '@/lib/server/permissions';
import {changeAccount} from '@/lib/server/accounts';
import {bodyJson,errorResponse} from '@/lib/server/errors';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{verifyOrigin(request);await changeAccount(await principal(request.headers),(await params).id,await bodyJson(request));return Response.json({ok:true});}catch(e){return errorResponse(e);}}

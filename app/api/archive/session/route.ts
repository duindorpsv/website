import {requestKey} from '@/lib/server/request-key';
import {archiveSession,archiveOwner,archiveCookie,ARCHIVE_COOKIE,archiveBatch} from '@/lib/server/archive-uploads';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {env} from '@/lib/server/env';
export async function POST(request:Request){try{verifyOrigin(request);const input:any=await bodyJson(request),headers=new Headers(request.headers);let token='';if(!archiveOwner(headers)){token=archiveCookie();headers.set('cookie',(headers.get('cookie')||'')+'; '+ARCHIVE_COOKIE+'='+token);}
 const result=input.action==='batch'?await archiveBatch(headers,{operationId:input.operationId,data:input.data,manifest:input.manifest},requestKey(request,'clubarchief')):await archiveSession(headers);
 return Response.json(result,{headers:{'Cache-Control':'no-store',...(token?{'Set-Cookie':`${ARCHIVE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${env().APP_ENV==='production'?'; Secure':''}`}:{})}});
}catch(e){return errorResponse(e);}}

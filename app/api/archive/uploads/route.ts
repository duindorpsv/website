import {requestKey} from '@/lib/server/request-key';
import {archiveUpload,archiveUploadGuard} from '@/lib/server/archive-uploads';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyBytes,errorResponse} from '@/lib/server/errors';
import {ARCHIVE_POLICY} from '@/lib/club-archive-schema';
export async function POST(request:Request){try{verifyOrigin(request);const u=new URL(request.url);await archiveUploadGuard(request.headers,u.searchParams.get('batch')||'',u.searchParams.get('operationId')||'',requestKey(request,'clubarchief-upload'));const result=await archiveUpload(request.headers,u.searchParams.get('batch')||'',u.searchParams.get('operationId')||'',decodeURIComponent(request.headers.get('X-File-Name')||'bestand'),request.headers.get('Content-Type')||'',await bodyBytes(request,ARCHIVE_POLICY.avBytes));return Response.json(result,{status:202,headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

import {downloadDocument} from '@/lib/server/documents';
import {principal} from '@/lib/server/permissions';
import {CmsError,errorResponse} from '@/lib/server/errors';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;try{return await downloadDocument(id);}catch(e){
  if(!(e instanceof CmsError)||e.status!==404||!request.headers.has('cookie'))throw e;
  return await downloadDocument(id,await principal(request.headers));
 }}catch(e){return errorResponse(e);}
}

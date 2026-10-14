import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyBytes,CmsError,errorResponse} from '@/lib/server/errors';
import {uploadDocument} from '@/lib/server/documents';
export async function POST(request:Request){try{verifyOrigin(request);const p=await principal(request.headers),form=await new Request(request.url,{method:'POST',headers:request.headers,body:Buffer.from(await bodyBytes(request,11_000_000))}).formData(),file=form.get('file');if(!(file instanceof File))throw new CmsError('file','Kies een PDF-document.');return Response.json(await uploadDocument(p,file),{status:201});}catch(e){return errorResponse(e);}}

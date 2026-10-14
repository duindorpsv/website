import {downloadDocument} from '@/lib/server/documents';
import {errorResponse} from '@/lib/server/errors';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await downloadDocument((await params).id);}catch(e){return errorResponse(e);}}

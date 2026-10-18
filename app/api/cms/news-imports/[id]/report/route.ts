import {principal} from '@/lib/server/permissions';
import {errorResponse} from '@/lib/server/errors';
import {newsImportReport} from '@/lib/server/news-imports';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const report=await newsImportReport(await principal(request.headers),(await params).id);return Response.json(report,{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="nieuws-importverslag.json"','X-Content-Type-Options':'nosniff'}});}catch(e){return errorResponse(e);}}

import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {newsImportStatus,newsRowPreview,newsImportIds,finishNewsUpload,startNewsImport,expireNewsSession} from '@/lib/server/news-imports';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{const {id}=await params,p=await principal(request.headers),search=new URL(request.url).searchParams;const data=search.has('sourceId')?await newsRowPreview(p,id,search.get('sourceId')!):search.get('ids')==='importable'?{sourceIds:await newsImportIds(p,id)}:await newsImportStatus(p,id,search);return Response.json(data,{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request,{params}:Context){try{verifyOrigin(request);const p=await principal(request.headers),{id}=await params,input=await bodyJson(request) as any;return Response.json(input?.action==='analyze'?await finishNewsUpload(p,id):await startNewsImport(p,id,input));}catch(e){return errorResponse(e);}}
export async function DELETE(request:Request,{params}:Context){try{verifyOrigin(request);return Response.json(await expireNewsSession(await principal(request.headers),(await params).id));}catch(e){return errorResponse(e);}}

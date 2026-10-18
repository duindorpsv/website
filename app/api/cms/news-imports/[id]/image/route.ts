import {principal} from '@/lib/server/permissions';
import {errorResponse} from '@/lib/server/errors';
import {newsImagePreview,newsCoverPreview} from '@/lib/server/news-imports';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const p=await principal(request.headers),{id}=await params,search=new URL(request.url).searchParams;
  return search.has('sourceId')?await newsCoverPreview(p,id,search.get('sourceId')!):await newsImagePreview(p,id,search.get('path')||'');
 }catch(e){return errorResponse(e);}
}

import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {inspectImport,applyImport,rollbackImport} from '@/lib/server/imports';
export async function POST(request:Request){try{verifyOrigin(request);const p=await principal(request.headers),input=await bodyJson(request,128_000_000) as any;if(input.mode==='rollback')return Response.json(await rollbackImport(p,String(input.batch||'')));if(input.mode==='apply')return Response.json(await applyImport(p,input.backup,input.resolutions));return Response.json((await inspectImport(p,input.backup)).report);}catch(e){return errorResponse(e);}}

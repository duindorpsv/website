import {principal,verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {newsletterWorkspace,mutateNewsletter} from '@/lib/server/newsletter-workspace';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await newsletterWorkspace(await principal(request.headers)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await mutateNewsletter(await principal(request.headers),await bodyJson(request)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}

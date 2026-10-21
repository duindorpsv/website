import {newsletterWebhook} from '@/lib/server/newsletter-delivery';
import {bodyBytes,errorResponse} from '@/lib/server/errors';
export async function POST(request:Request){try{const raw=new TextDecoder().decode(await bodyBytes(request,100000));return Response.json(await newsletterWebhook(raw,request.headers),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

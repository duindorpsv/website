import {confirmNewsletter,unsubscribeNewsletter} from '@/lib/server/newsletter';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,CmsError,errorResponse} from '@/lib/server/errors';
import {z} from 'zod';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}) {
  try {verifyOrigin(request);const {action}=await params;const {token}=z.object({token:z.string().regex(/^[0-9a-f]{64}$/)}).strict().parse(await bodyJson(request,1000));
    if(!['bevestigen','afmelden'].includes(action))throw new CmsError('missing','Onbekende actie.',404);
    return Response.json(await (action==='bevestigen'?confirmNewsletter(token):unsubscribeNewsletter(token)),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}

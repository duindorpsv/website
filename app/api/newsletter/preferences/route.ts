import {newsletterPreferences} from '@/lib/server/newsletter';
import {verifyOrigin} from '@/lib/server/permissions';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {z} from 'zod';
export async function GET(request:Request){try{return Response.json(await newsletterPreferences(new URL(request.url).searchParams.get('token')||''),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{verifyOrigin(request);const {token,...data}=z.object({token:z.string().regex(/^[0-9a-f]{64}$/),name:z.string(),topics:z.array(z.string())}).strict().parse(await bodyJson(request,10000));return Response.json(await newsletterPreferences(token,data),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}

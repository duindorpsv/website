import {createInvoicePayment,readInvoicePayment,refreshInvoicePayment} from '@/lib/server/mollie-payments';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {verifyOrigin} from '@/lib/server/permissions';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await readInvoicePayment(request),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{verifyOrigin(request);const body=await bodyJson(request,4096);return Response.json(await (body&&typeof body==='object'&&'action' in body&&body.action==='verify'?refreshInvoicePayment(request,body):createInvoicePayment(request,body)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

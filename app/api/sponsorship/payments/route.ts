import {createInvoicePayment} from '@/lib/server/mollie-payments';
import {bodyJson,errorResponse} from '@/lib/server/errors';
import {verifyOrigin} from '@/lib/server/permissions';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{verifyOrigin(request);return Response.json(await createInvoicePayment(request,await bodyJson(request,4096)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return errorResponse(error);}}

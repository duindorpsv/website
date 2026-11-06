import {processMollieWebhook} from '@/lib/server/mollie-payments';
import {bodyBytes,errorResponse,CmsError} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{const body=new TextDecoder().decode(await bodyBytes(request,2048)),fields=new URLSearchParams(body);if(fields.getAll('id').length!==1)throw new CmsError('payment-id','Ongeldige betaalmelding.',422);await processMollieWebhook(fields.get('id')!);return new Response('OK',{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}

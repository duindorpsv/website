import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {z} from 'zod';
import {env} from './env';
import {CmsError} from './errors';

const message = z.object({
  to: z.array(z.string().email()).min(1).max(1000),
  subject: z.string().min(1).max(998).regex(/^[^\r\n]+$/),
  text: z.string().min(1),
  html: z.string().min(1).max(200000).optional(),
  messageId: z.string().min(1).max(254).regex(/^[^\r\n]+$/),
  replyTo: z.string().email().optional(),
  fromName:z.string().min(1).max(150).regex(/^[^\u0000-\u001f\u007f<>]+$/).optional(),
  fromAddress:z.string().email().optional(),
  newsletterDeliveryId:z.string().uuid().optional(),
  headers:z.record(z.string().regex(/^[^\r\n]*$/)).optional(),
});
export class MailProviderError extends CmsError{
  constructor(code:string,message:string,public retryable:boolean,public uncertain:boolean){super(code,message,503);}
}

export function mailApiEndpoint(config=env()){
  let endpoint='https://api.resend.com';
  if(config.TEST_MAIL_API_URL){
    const test=new URL(config.TEST_MAIL_API_URL);
    if(config.APP_ENV!=='test'||!['127.0.0.1','localhost'].includes(test.hostname)||test.protocol!=='http:'||test.username||test.password||test.pathname!=='/'||test.search||test.hash)throw new CmsError('mail-unconfigured','De testmailserver is alleen lokaal in tests toegestaan.',503);
    endpoint=test.origin;
  }
  return endpoint;
}

export async function sendMail(input: z.infer<typeof message>) {
  const config = env();
  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    throw new CmsError('mail-unconfigured', 'E-mail wacht op Resend-configuratie.', 503);
  }
  // Development and tests must explicitly choose a safe recipient before any API call.
  if (config.APP_ENV !== 'production' && !config.TEST_MAIL_TO) {
    throw new CmsError('mail-unconfigured', 'Stel een testadres in voor developmentmail.', 503);
  }
  const data = message.safeParse(input);
  if (!data.success) throw new CmsError('mail-invalid', 'De e-mailgegevens zijn ongeldig.', 422);
  const to = [...new Set(config.APP_ENV === 'production' ? data.data.to : [config.TEST_MAIL_TO!])].sort();
  const operation = createHash('sha256').update(config.APP_ENV+'\0'+data.data.messageId).digest('hex');
  const providerIds:string[]=[];
  if(data.data.fromAddress&&data.data.fromAddress!==config.MAIL_FROM)throw new CmsError('mail-sender-changed','De vastgelegde afzender is niet meer geconfigureerd. Controleer deze editie.',422);
  // Keep addresses private, and use batches of at most 100 independent emails.
  // Stable operation keys also deduplicate partial retries within Resend's 24h window.
  const endpoint=mailApiEndpoint(config);
  for (let at=0; at<to.length; at+=100) {
    const messages = to.slice(at,at+100).map(email=>({
      from: `${/[",;\\]/.test(data.data.fromName||'')?JSON.stringify(data.data.fromName):data.data.fromName||'Duindorp SV'} <${config.MAIL_FROM}>`, to: [email],
      subject: data.data.subject, text: data.data.text,
      ...(data.data.html?{html:data.data.html}:{}),
      ...(data.data.replyTo ? {reply_to: data.data.replyTo} : {}),
      ...(data.data.headers?{headers:data.data.headers}:{}),
      tags: [{name:'cms_operation',value:operation},...(data.data.newsletterDeliveryId?[{name:'newsletter_delivery',value:data.data.newsletterDeliveryId}]:[])],
    }));
    const batch = messages.length>1;
    let response: Response;
    let accepted: unknown;
    try {
      response = await fetch(endpoint+'/emails'+(batch?'/batch':''), {
        method: 'POST', redirect: 'error',
        headers: {'Authorization': `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `cms/${operation}/${at/100}`},
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(batch?messages:messages[0]),
      });
      if(response.status===200)accepted=await response.json().catch(()=>null);
      else await response.body?.cancel();
    } catch {
      // Provider/network errors can contain credentials or message content.
      throw new MailProviderError('mail-unavailable', 'Resend is tijdelijk niet bereikbaar.',true,true);
    } finally {
      // Bound request frequency across batches, notifications and subsequent jobs.
      await pause(600);
    }
    const receipt=z.object({id:z.string().uuid()});
    const valid=batch?z.object({data:z.array(receipt).length(messages.length)}).safeParse(accepted).success:receipt.safeParse(accepted).success;
    if(response.status!==200||!valid)throw new MailProviderError('mail-rejected', 'Resend heeft de e-mail niet geaccepteerd.',response.status===429||response.status>=500||response.status===200,response.status===200||response.status>=500);
    providerIds.push(...(batch?(accepted as {data:{id:string}[]}).data.map(item=>item.id):[(accepted as {id:string}).id]));
  }
  // API acceptance is not proof of delivery. Deduplication expires after 24 hours.
  return providerIds;
}

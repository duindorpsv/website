import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {z} from 'zod';
import {env} from './env';
import {CmsError} from './errors';

const message = z.object({
  to: z.array(z.string().email()).min(1).max(1000),
  subject: z.string().min(1).max(998).regex(/^[^\r\n]+$/),
  text: z.string().min(1),
  messageId: z.string().min(1).max(254).regex(/^[^\r\n]+$/),
  replyTo: z.string().email().optional(),
});

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
  // Keep addresses private, and use batches of at most 100 independent emails.
  // Stable operation keys also deduplicate partial retries within Resend's 24h window.
  for (let at=0; at<to.length; at+=100) {
    const messages = to.slice(at,at+100).map(email=>({
      from: `Duindorp SV <${config.MAIL_FROM}>`, to: [email],
      subject: data.data.subject, text: data.data.text,
      ...(data.data.replyTo ? {reply_to: data.data.replyTo} : {}),
      tags: [{name:'cms_operation',value:operation}],
    }));
    const batch = messages.length>1;
    let response: Response;
    let accepted: unknown;
    try {
      response = await fetch('https://api.resend.com/emails'+(batch?'/batch':''), {
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
      throw new CmsError('mail-unavailable', 'Resend is tijdelijk niet bereikbaar.', 503);
    } finally {
      // Bound request frequency across batches, notifications and subsequent jobs.
      await pause(600);
    }
    const receipt=z.object({id:z.string().uuid()});
    const valid=batch?z.object({data:z.array(receipt).length(messages.length)}).safeParse(accepted).success:receipt.safeParse(accepted).success;
    if(response.status!==200||!valid)throw new CmsError('mail-rejected', 'Resend heeft de e-mail niet geaccepteerd.', 503);
  }
  // API acceptance is not proof of delivery. Deduplication expires after 24 hours.
}

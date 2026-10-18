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
  if (!config.SENDGRID_API_KEY || !config.MAIL_FROM) {
    throw new CmsError('mail-unconfigured', 'E-mail wacht op SendGrid-configuratie.', 503);
  }
  // Development and tests must explicitly choose a safe recipient before any API call.
  if (config.APP_ENV !== 'production' && !config.TEST_MAIL_TO) {
    throw new CmsError('mail-unconfigured', 'Stel een testadres in voor developmentmail.', 503);
  }
  const data = message.safeParse(input);
  if (!data.success) throw new CmsError('mail-invalid', 'De e-mailgegevens zijn ongeldig.', 422);
  const to = config.APP_ENV === 'production' ? data.data.to : [config.TEST_MAIL_TO!];
  let response: Response;
  try {
    response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      redirect: 'error',
      headers: {'Authorization': `Bearer ${config.SENDGRID_API_KEY}`, 'Content-Type': 'application/json'},
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: {email: config.MAIL_FROM, name: 'Duindorp SV'},
        // Separate envelopes keep recipients' addresses private from each other.
        personalizations: [...new Set(to)].map(email => ({to: [{email}]})),
        subject: data.data.subject,
        content: [{type: 'text/plain', value: data.data.text}],
        ...(data.data.replyTo ? {reply_to: {email: data.data.replyTo}} : {}),
        custom_args: {cms_operation_id: data.data.messageId},
        tracking_settings: {click_tracking: {enable: false, enable_text: false}, open_tracking: {enable: false}},
      }),
    });
  } catch {
    // Provider/network errors can contain credentials or message content.
    throw new CmsError('mail-unavailable', 'SendGrid is tijdelijk niet bereikbaar.', 503);
  }
  // Do not read/log provider bodies: they may echo addresses and message content.
  await response.body?.cancel();
  if (response.status !== 202) {
    throw new CmsError('mail-rejected', 'SendGrid heeft de e-mail niet geaccepteerd.', 503);
  }
  // 202 means accepted by SendGrid. The durable worker handles retries; a timeout
  // after provider acceptance may deliver a duplicate. custom_args is correlation, not deduplication.
}

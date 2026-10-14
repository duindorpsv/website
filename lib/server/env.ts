import {z} from 'zod';
const config=z.object({
  APP_ENV:z.enum(['development','test','staging','production']).default('development'),
  APP_BASE_URL:z.string().url(), DATABASE_URL:z.string().min(1),
  AUTH_SESSION_SECRET:z.string().min(32),
  MEDIA_DRIVER:z.enum(['filesystem','s3']).default('filesystem'), MEDIA_ROOT:z.string().default('.runtime/media'),
  S3_ENDPOINT:z.string().optional(), S3_REGION:z.string().default('eu-west-1'),
  S3_BUCKET:z.string().optional(), S3_ACCESS_KEY_ID:z.string().optional(),S3_SECRET_ACCESS_KEY:z.string().optional(),
  SMTP_HOST:z.string().optional(),SMTP_PORT:z.coerce.number().default(587),SMTP_SECURE:z.enum(['true','false']).default('false'),
  SMTP_USER:z.string().optional(),SMTP_PASSWORD:z.string().optional(),MAIL_FROM:z.string().optional(),TEST_MAIL_TO:z.string().optional(),
  SPORTLINK_CLIENT_ID:z.string().optional(),NEWSLETTER_PROVIDER:z.enum(['disabled','brevo']).default('disabled'),
  NEWSLETTER_API_KEY:z.string().optional(),NEWSLETTER_LIST_ID:z.coerce.number().optional(),
});
export function env(){
  const parsed=config.safeParse(process.env);
  if(!parsed.success)throw new Error(`Omgevingsconfiguratie ongeldig: ${parsed.error.issues.map(i=>i.path.join('.')).join(', ')}`);
  const value=parsed.data;
  if(['staging','production'].includes(value.APP_ENV)&&value.MEDIA_DRIVER!=='s3')throw new Error('Staging en production vereisen duurzame S3-opslag.');
  if(value.APP_ENV==='staging'&&!value.TEST_MAIL_TO)throw new Error('Staging vereist TEST_MAIL_TO.');
  if(value.MEDIA_DRIVER==='s3'&&(!value.S3_BUCKET||!value.S3_ACCESS_KEY_ID||!value.S3_SECRET_ACCESS_KEY))throw new Error('S3-configuratie ontbreekt.');
  return value;
}

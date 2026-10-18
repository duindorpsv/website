import {z} from 'zod';
const config=z.object({
  APP_ENV:z.enum(['development','test','production']).default('development'),
  APP_BASE_URL:z.string().url(), DATABASE_URL:z.string().min(1),
  AUTH_SESSION_SECRET:z.string().min(32),
  MEDIA_DRIVER:z.enum(['filesystem','s3']).default('filesystem'), MEDIA_ROOT:z.string().default('.runtime/media'),
  S3_ENDPOINT:z.string().optional(), S3_REGION:z.string().default('eu-west-1'),
  S3_BUCKET:z.string().optional(), S3_ACCESS_KEY_ID:z.string().optional(),S3_SECRET_ACCESS_KEY:z.string().optional(),
  RESEND_API_KEY:z.string().regex(/^[^\s]+$/).optional().or(z.literal('')),
  MAIL_FROM:z.string().email().optional().or(z.literal('')),TEST_MAIL_TO:z.string().email().optional().or(z.literal('')),
  SPORTLINK_CLIENT_ID:z.string().optional(),
});
export function env(){
  const parsed=config.safeParse(process.env);
  if(!parsed.success)throw new Error(`Omgevingsconfiguratie ongeldig: ${parsed.error.issues.map(i=>i.path.join('.')).join(', ')}`);
  const value=parsed.data;
  if(value.APP_ENV==='production'&&new URL(value.APP_BASE_URL).protocol!=='https:')throw new Error('Productie vereist een HTTPS-siteadres.');
  if(value.APP_ENV==='production'&&value.MEDIA_DRIVER!=='s3')throw new Error('Productie vereist duurzame S3-opslag.');
  if(value.APP_ENV==='production'&&value.TEST_MAIL_TO)throw new Error('TEST_MAIL_TO moet leeg zijn in productie.');
  if(value.APP_ENV==='production'&&(!value.RESEND_API_KEY||!value.MAIL_FROM))throw new Error('Productie vereist RESEND_API_KEY en MAIL_FROM.');
  if(value.MEDIA_DRIVER==='s3'&&(!value.S3_BUCKET||!value.S3_ACCESS_KEY_ID||!value.S3_SECRET_ACCESS_KEY))throw new Error('S3-configuratie ontbreekt.');
  return value;
}

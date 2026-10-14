import nodemailer from 'nodemailer';
import {env} from './env';
import {CmsError} from './errors';
export async function sendMail(input:{to:string[];subject:string;text:string;messageId:string;replyTo?:string}){
 const config=env();if(!config.SMTP_HOST||!config.MAIL_FROM)throw new CmsError('mail-unconfigured','E-mail wacht op transportconfiguratie.',503);
 const to=['staging','test','development'].includes(config.APP_ENV)?[config.TEST_MAIL_TO||'test@example.invalid']:input.to;
 const transport=nodemailer.createTransport({host:config.SMTP_HOST,port:config.SMTP_PORT,secure:config.SMTP_SECURE==='true',auth:config.SMTP_USER?{user:config.SMTP_USER,pass:config.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:15000});
 await transport.sendMail({...input,to,from:config.MAIL_FROM});
}

import type {CmsDoc} from './types';

export type NewsletterBlockType='text'|'article'|'image'|'button'|'divider'|'spacer';
export type NewsletterBlock={id:string;type:NewsletterBlockType;body?:CmsDoc;title?:string;text?:string;url?:string;imageUrl?:string;imageAlt?:string;sourceArticleId?:string;gap?:number};
export type NewsletterContact={id:string;name:string;email:string;status:'subscribed'|'pending'|'unsubscribed'|'suppressed';tags:string[];consentAt:string;source:'demo'|'manual'|'signup';version?:number};
export type NewsletterAudience={id:string;name:string;description:string;color:string;mode:'manual'|'tags';contactIds:string[];tags:string[]};
export type NewsletterSettings={fromName:string;replyTo:string;footer:string;siteUrl:string};
export type NewsletterSnapshot={name:string;subject:string;preheader:string;fromName:string;replyTo:string;audienceIds:string[];blocks:NewsletterBlock[];capturedAt:string;settings?:NewsletterSettings;templateVersion?:string;mailFrom?:string;editionId?:string};
export type NewsletterCampaign=Omit<NewsletterSnapshot,'capturedAt'> & {id:string;status:'draft'|'scheduled'|'queued'|'processed'|'failed'|'cancelled';deletedAt?:string;settings?:NewsletterSettings;version?:number;stats?:Record<string,number>;testStats?:Record<string,number>;updatedAt:string;scheduledAt:string;snapshot?:NewsletterSnapshot;processedAt?:string};
export type NewsletterLog={id:string;campaignId:string;kind:'test'|'queued'|'schedule'|'cancel'|'accepted'|'delivered'|'failed'|'suppressed'|'unsubscribe';at:string;count:number;target?:string;subject:string};
export type NewsletterState={campaigns:NewsletterCampaign[];contacts:NewsletterContact[];audiences:NewsletterAudience[];settings:NewsletterSettings;logs:NewsletterLog[]};

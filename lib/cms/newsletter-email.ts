import {publicNewsletterHost,newsletterDocText} from './newsletter';
import type {CmsDoc} from './types';
import type {NewsletterBlock,NewsletterCampaign,NewsletterSettings} from './newsletter-types';

export type NewsletterEmailOptions={origin?:string;contactName?:string;preview?:boolean;preferencesUrl?:string;unsubscribeUrl?:string};

const BLUE='#03438A';
const INK='#203148';
const MUTED='#6C7D90';
const FONT='Arial,Helvetica,sans-serif';
const escape=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function webOrigin(value:string|undefined):string|null{
 try{const url=new URL(value||'');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;}catch{return null;}
}

/** Relative assets and article URLs resolve against the chosen site origin.
 * Imported HTML, protocol-relative URLs and executable URL schemes are never used.
 */
function safeEmailUrl(value:unknown,origin:string,image=false):string|null{
 if(typeof value!=='string')return null;
 const input=value.trim();
 if(!input||/[\u0000-\u001f\u007f<>"\\]/.test(input)||input.startsWith('//'))return null;
 try{
  const url=new URL(input,origin);
  if(image&&url.pathname.startsWith('/api/cms/'))return null;
  const protocols=image?['https:','http:']:['https:','http:','mailto:','tel:'];
  return protocols.includes(url.protocol)&&!url.username&&!url.password&&(!['http:','https:'].includes(url.protocol)||url.origin===origin||publicNewsletterHost(url.hostname))?url.href:null;
 }catch{return null;}
}

function personalise(value:unknown,name:string):string{
 return String(value??'').replace(/\{\{\s*voornaam\s*\}\}/gi,()=>name);
}
function textAlign(node:CmsDoc):string{
 return ['left','center','right'].includes(String(node.attrs?.textAlign))?String(node.attrs?.textAlign):'left';
}
function renderDocument(node:CmsDoc|undefined,origin:string,name:string,depth=0):string{
 if(!node||depth>32)return '';
 const children=()=>node.content?.slice(0,500).map(child=>renderDocument(child,origin,name,depth+1)).join('')||'';
 switch(node.type){
  case 'doc':return children();
  case 'text':{
   let html=escape(personalise(node.text,name));
   for(const mark of (node.marks||[]).slice(0,12)){
    if(mark.type==='bold')html=`<strong>${html}</strong>`;
    else if(mark.type==='italic')html=`<em>${html}</em>`;
    else if(mark.type==='underline')html=`<u>${html}</u>`;
    else if(mark.type==='strike')html=`<s>${html}</s>`;
    else if(mark.type==='code')html=`<code style="font-family:monospace;background:#EFF3F7;padding:1px 4px;">${html}</code>`;
    else if(mark.type==='link'){
     const url=safeEmailUrl(mark.attrs?.href,origin);
     if(url)html=`<a href="${escape(url)}" style="color:${BLUE};text-decoration:underline;">${html}</a>`;
    }
   }
   return html;
  }
  case 'paragraph':return `<p style="margin:0 0 16px;font:15px/1.75 ${FONT};color:${INK};text-align:${textAlign(node)};">${children()||'&nbsp;'}</p>`;
  case 'heading':{
   const level=[2,3,4].includes(Number(node.attrs?.level))?Number(node.attrs?.level):2;
   const size={2:25,3:21,4:18}[level as 2|3|4];
   return `<h${level} style="margin:0 0 14px;font:bold ${size}px/1.3 ${FONT};letter-spacing:-.4px;color:${BLUE};text-align:${textAlign(node)};">${children()}</h${level}>`;
  }
  case 'bulletList':return `<ul style="margin:0 0 18px;padding-left:23px;font:15px/1.75 ${FONT};color:${INK};">${children()}</ul>`;
  case 'orderedList':return `<ol style="margin:0 0 18px;padding-left:23px;font:15px/1.75 ${FONT};color:${INK};">${children()}</ol>`;
  case 'listItem':return `<li style="margin-bottom:5px;">${children()}</li>`;
  case 'blockquote':return `<blockquote style="margin:0 0 18px;padding:12px 18px;border-left:3px solid #91B3DC;background:#F2F6FB;color:${MUTED};">${children()}</blockquote>`;
  case 'codeBlock':return `<pre style="margin:0 0 18px;padding:12px;background:#EFF3F7;white-space:pre-wrap;font:13px/1.6 monospace;color:${INK};"><code>${children()}</code></pre>`;
  case 'hardBreak':return '<br>';
  case 'horizontalRule':return '<hr style="margin:20px 0;border:0;border-top:1px solid #E1E8F0;">';
  case 'image':{
   const src=safeEmailUrl(node.attrs?.src,origin,true);
   return src?`<img src="${escape(src)}" alt="${escape(personalise(node.attrs?.alt,name))}" width="576" style="display:block;width:100%;max-width:576px;height:auto;border:0;margin:0 0 18px;border-radius:6px;">`:'';
  }
  case 'table':return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 18px;font:13px/1.6 ${FONT};color:${INK};">${children()}</table>`;
  case 'tableRow':return `<tr>${children()}</tr>`;
  case 'tableCell':return `<td style="border:1px solid #DFE7F0;padding:9px;vertical-align:top;">${children()}</td>`;
  case 'tableHeader':return `<th style="border:1px solid #DFE7F0;background:#F2F6FB;padding:9px;text-align:left;vertical-align:top;">${children()}</th>`;
  // Website widgets/raw HTML have no email representation. Never forward attrs.
  default:return '';
 }
}

function imageHtml(block:NewsletterBlock,origin:string,name:string,width=576):string{
 const src=safeEmailUrl(block.imageUrl,origin,true);
 return src?`<img src="${escape(src)}" alt="${escape(personalise(block.imageAlt||block.title,name))}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:6px;">`:'';
}
function contentRow(html:string,padding='0 32px 22px'):string{
 return html?`<tr><td style="padding:${padding};">${html}</td></tr>`:'';
}
function renderBlock(block:NewsletterBlock,origin:string,name:string):string{
 switch(block.type){
  case 'text':return contentRow(renderDocument(block.body,origin,name));
  case 'article':{
   const image=imageHtml(block,origin,name,574);
   const title=escape(personalise(block.title,name));
   const summary=(block.text?`<p style="margin:0 0 17px;font:14px/1.75 ${FONT};color:${MUTED};">${escape(personalise(block.text,name)).replace(/\r?\n/g,'<br>')}</p>`:'')+renderDocument(block.body,origin,name);
   const url=safeEmailUrl(block.url,origin);
   const titleHtml=title?`<h2 style="margin:0 0 11px;font:bold 23px/1.3 ${FONT};letter-spacing:-.4px;color:${BLUE};">${url?`<a href="${escape(url)}" style="color:${BLUE};text-decoration:none;">${title}</a>`:title}</h2>`:'';
   const action=url?`<a href="${escape(url)}" style="display:inline-block;font:bold 12px/1.5 ${FONT};color:${BLUE};text-decoration:none;">Lees het hele bericht &rarr;</a>`:'';
   if(!image&&!titleHtml&&!summary&&!action)return '';
   return contentRow(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #DFE7F0;border-radius:8px;background:#FFFFFF;">${image?`<tr><td style="padding:0;">${image}</td></tr>`:''}<tr><td style="padding:22px;">${titleHtml}${summary}${action}</td></tr></table>`);
  }
  case 'image':return contentRow(imageHtml(block,origin,name));
  case 'button':{
   const url=safeEmailUrl(block.url,origin);
   if(!url)return '';
   return contentRow(`<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:separate;"><tr><td bgcolor="${BLUE}" style="border-radius:5px;background:${BLUE};"><a href="${escape(url)}" style="display:inline-block;padding:14px 22px;font:bold 13px/1.4 ${FONT};color:#FFFFFF;text-decoration:none;">${escape(personalise(block.title||'Meer lezen',name))}</a></td></tr></table>`);
  }
  case 'divider':return contentRow('<div style="height:1px;line-height:1px;background:#E1E8F0;">&nbsp;</div>');
  case 'spacer':{
   const gap=typeof block.gap==='number'&&Number.isFinite(block.gap)?Math.min(120,Math.max(0,Math.round(block.gap))):24;
   return `<tr><td height="${gap}" style="height:${gap}px;font-size:1px;line-height:1px;">&nbsp;</td></tr>`;
  }
  default:return '';
 }
}

/** Provider-independent email HTML for previews and export. No request is sent.
 * Queued/simulated campaigns use their captured content, including sender fields.
 */
function renderClubpostV1(campaign:NewsletterCampaign,settings:NewsletterSettings,options:NewsletterEmailOptions={}):string{
 const content=campaign.status!=='draft'&&campaign.snapshot?campaign.snapshot:campaign;
 settings=content.settings||settings;
 const origin=webOrigin(options.origin)||webOrigin(settings.siteUrl)||'https://duindorpsv.nl';
 const name=options.contactName?.trim().split(/\s+/)[0]||'supporter';
 const subject=escape(personalise(content.subject||'De clubpost van Duindorp SV',name));
 const preheader=escape(personalise(content.preheader,name));
 const logo=escape(new URL('/assets/logo.png',origin).href);
 const website=escape(new URL('/clubmuur',origin).href);
 const preferences=escape(safeEmailUrl(options.preferencesUrl||'/clubmuur/media/nieuwsbrief?actie=voorkeuren',origin)||origin);
 const unsubscribe=escape(safeEmailUrl(options.unsubscribeUrl||'/clubmuur/media/nieuwsbrief?actie=afmelden',origin)||origin);
 const footer=escape(personalise(settings.footer||'Je ontvangt deze clubpost omdat je betrokken bent bij Duindorp SV.',name)).replace(/\r?\n/g,'<br>');
 const blocks=content.blocks.slice(0,200).map(block=>renderBlock(block,origin,name)).join('');
 const preview=options.preview?'<tr><td align="center" style="padding:9px 20px;background:#EAF0F7;font:10px/1.5 Arial,Helvetica,sans-serif;color:#63778E;">VOORBEELD &middot; GEEN E-MAIL VERZONDEN</td></tr>':'';
 return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;width:100%;background:#F1F4F8;-webkit-text-size-adjust:100%;font-family:${FONT};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#F1F4F8;"><tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background:#FFFFFF;border:1px solid #DDE5EF;border-radius:10px;overflow:hidden;">
${preview}<tr><td style="padding:26px 32px 23px;border-top:5px solid ${BLUE};border-bottom:1px solid #E2E8F0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="66" style="vertical-align:middle;"><a href="${website}" style="text-decoration:none;"><img src="${logo}" width="48" height="54" alt="Duindorp SV" style="display:block;width:48px;height:54px;object-fit:contain;border:0;"></a></td><td style="vertical-align:middle;"><p style="margin:0 0 6px;font:bold 9px/1.4 ${FONT};letter-spacing:1.8px;color:${BLUE};">DUINDORP SV &middot; NIEUWSBRIEF</p><h1 style="margin:0;font:bold 32px/1.05 ${FONT};letter-spacing:-1.2px;color:${BLUE};">De clubpost.</h1></td><td align="right" width="58" style="vertical-align:middle;font:bold 10px/1.5 ${FONT};color:#93A2B3;">SINDS<br>1950</td></tr></table></td></tr>
<tr><td height="28" style="height:28px;font-size:1px;line-height:1px;">&nbsp;</td></tr>${blocks}
<tr><td style="padding:23px 32px 25px;border-top:1px solid #E1E8F0;background:#F7F9FC;"><p style="margin:0 0 13px;font:bold 13px/1.5 ${FONT};color:${BLUE};">Onze wijk. Onze club. Onze trots.</p><p style="margin:0 0 14px;font:11px/1.8 ${FONT};color:${MUTED};">${footer}</p><p style="margin:0;font:11px/1.8 ${FONT};color:${MUTED};"><a href="${website}" style="color:${BLUE};text-decoration:underline;">Naar de website</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="${preferences}" style="color:${MUTED};text-decoration:underline;">Voorkeuren aanpassen</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="${unsubscribe}" style="color:${MUTED};text-decoration:underline;">Afmelden</a></p></td></tr>
</table><p style="margin:16px 0 0;font:10px/1.5 ${FONT};color:#90A0B1;">DUINDORP SV &middot; SPORTPARK HOUTRUST</p>
</td></tr></table></body></html>`;
}

/** Keep this versioned renderer when introducing a future template. */
export function renderNewsletterEmail(campaign:NewsletterCampaign,settings:NewsletterSettings,options:NewsletterEmailOptions={}):string{
 const version=campaign.status!=='draft'?campaign.snapshot?.templateVersion:undefined;
 if(version&&version!=='clubpost-v1')throw new Error('Deze templateversie wordt niet ondersteund.');
 return renderClubpostV1(campaign,settings,options);
}

/** The text alternative contains the same frozen article bodies and useful absolute links. */
export function renderNewsletterText(campaign:NewsletterCampaign,settings:NewsletterSettings,options:NewsletterEmailOptions={}):string{
 const content=campaign.status!=='draft'&&campaign.snapshot?campaign.snapshot:campaign;settings=content.settings||settings;
 const origin=webOrigin(options.origin)||webOrigin(settings.siteUrl)||'https://duindorpsv.nl',name=options.contactName?.trim().split(/\s+/)[0]||'supporter';
 const paragraphs=content.blocks.map(b=>[b.title,b.text,newsletterDocText(b.body),b.type==='image'&&b.imageAlt?'[Foto: '+b.imageAlt+']':'',safeEmailUrl(b.url,origin)].filter(Boolean).join('\n')).filter(Boolean);
 paragraphs.push('Onze wijk. Onze club. Onze trots.',settings.footer,'Voorkeuren: '+(safeEmailUrl(options.preferencesUrl||'/clubmuur/media/nieuwsbrief?actie=voorkeuren',origin)||origin),'Afmelden: '+(safeEmailUrl(options.unsubscribeUrl||'/clubmuur/media/nieuwsbrief?actie=afmelden',origin)||origin));
 return personalise(paragraphs.join('\n\n'),name);
}

import {parseDocument,DomUtils} from 'htmlparser2';
import {createHash} from 'node:crypto';
import type {CmsDoc} from '../cms/types';
import type {NewsImportArticle,NewsImportMedia} from '../cms/news-import';
import {safeDestination,validateDocument} from '../cms/layout/document';
import {safeArchivePath} from './news-archive';
import {CmsError} from './errors';

export const NEWS_SOURCE='duindorp-sv-nieuwsarchief';
export const archiveText=(value:unknown,max=1000)=>typeof value==='string'?value.replace(/\u0000/g,'').slice(0,max).toWellFormed():'';
export type MediaMapping={id:string;kind:'image'|'file';url:string;alt:string};
export function webUrl(input:unknown){if(typeof input!=='string'||input.length>2000||!safeDestination(input))return '';try{const url=new URL(input);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';url.hostname=url.hostname.toLowerCase().replace(/^www\./,'');url.hash='';return url.href;}catch{return '';}}
export function originalDate(input:unknown){
 if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input))return null;
 const [year,month,day]=input.slice(0,10).split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 if(month<1||month>12||day<1||day>days||Number(input.slice(11,13))>23||Number(input.slice(14,16))>59||Number(input.slice(17,19)||0)>59||!Number.isFinite(Date.parse(input)))return null;
 return new Date(input).toISOString();
}
export function normalizeMedia(input:any):NewsImportMedia{return {url:webUrl(input.url),path:safeArchivePath(input.path)?input.path:null,alt:archiveText(input.alt,500),kind:input.kind==='image'?'image':'file',status:archiveText(input.status,30)||'pending',mime:archiveText(input.mime,100)||null,bytes:Number.isSafeInteger(input.bytes)?input.bytes:null,error:archiveText(input.error)||null,exportError:archiveText(input.exportError)||null,includedInZip:typeof input.includedInZip==='boolean'?input.includedInZip:undefined};}
export function normalizeArticle(input:any):{article:NewsImportArticle|null;errors:string[];warnings:string[]}{
 const errors:string[]=[],warnings:string[]=[];
 if(!input||typeof input!=='object'||Array.isArray(input))return {article:null,errors:['Dit bericht is geen object.'],warnings};
 if(typeof input.sourceId!=='string'||!input.sourceId.trim()||input.sourceId.length>200||/[\u0000-\u001f]/.test(input.sourceId)||!input.sourceId.isWellFormed())errors.push('Een geldig bron-ID ontbreekt.');
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>500||input.title.includes('\u0000')||!input.title.isWellFormed())errors.push('Een bruikbare titel van maximaal 500 tekens ontbreekt.');
 if(typeof input.bodyHtml!=='string'||Buffer.byteLength(input.bodyHtml)>900_000||input.bodyHtml.includes('\u0000')||!input.bodyHtml.isWellFormed())errors.push('De inhoud ontbreekt, bevat ongeldige tekens of is groter dan 900 KB.');
 if(input.media!==undefined&&!Array.isArray(input.media))warnings.push('De medialijst is ongeldig; tekst kan wel worden geïmporteerd.');
 if(!originalDate(input.publishedAt))warnings.push('Oorspronkelijke publicatiedatum ontbreekt of is ongeldig. Alleen import als concept is mogelijk.');
 if(input.status==='pending')warnings.push('Dit bronbericht is nog niet volledig opgehaald.');
 if(input.sourceHtmlIncluded===false||input.sourceHtmlError)warnings.push('Oorspronkelijke bron-HTML ontbreekt; dit blokkeert de tekst niet.');
 if(!webUrl(input.sourceUrl))warnings.push('De oorspronkelijke bronlink ontbreekt of is ongeldig.');
 for(const warning of (Array.isArray(input.warnings)?input.warnings:[]).slice(0,80))if(typeof warning==='string')warnings.push(archiveText(warning));
 return {article:errors.length?null:{sourceId:input.sourceId.trim(),title:input.title.trim(),sourceUrl:webUrl(input.sourceUrl),publishedAt:originalDate(input.publishedAt),lead:archiveText(input.lead,10000),bodyHtml:input.bodyHtml,status:archiveText(input.status,30),fetchedAt:archiveText(input.fetchedAt,100),sourceHtmlPath:archiveText(input.sourceHtmlPath,600),sourceHtmlIncluded:input.sourceHtmlIncluded===true,sourceHtmlError:archiveText(input.sourceHtmlError),media:Array.isArray(input.media)?input.media.filter((m:any)=>m&&typeof m==='object'&&!Array.isArray(m)).slice(0,500).map(normalizeMedia):[],warnings:[]},errors,warnings};
}
export function rowChecksum(article:NewsImportArticle){return createHash('sha256').update(JSON.stringify([article.title,article.sourceUrl,article.publishedAt,article.lead,article.bodyHtml,article.media.map(m=>[m.url,m.path,m.kind,m.alt,m.status,m.includedInZip])])).digest('hex');}
export function mergeMedia(article:NewsImportArticle,global:NewsImportMedia[]|Map<string,NewsImportMedia>){return article.media.map(item=>{const stored=global instanceof Map?(global.get(webUrl(item.url))||global.get(item.path||'')):global.find(g=>!!item.url&&webUrl(g.url)===webUrl(item.url)||!!item.path&&g.path===item.path);return {...item,...stored,url:item.url||stored?.url||'',path:stored?.path||item.path||null,kind:item.kind,alt:typeof item.alt==='string'?item.alt:'',includedInZip:item.includedInZip===false||stored?.includedInZip===false?false:stored?.includedInZip??item.includedInZip} as NewsImportMedia;});}
export function mediaAvailable(media:NewsImportMedia,entries:Set<string>,zip:boolean){return zip&&!!media.path&&safeArchivePath(media.path)&&media.path.startsWith('media/')&&entries.has(media.path)&&media.includedInZip!==false&&(media.includedInZip===true||media.status==='saved');}
export function mediaKey(input:string){if(input.startsWith('media/')){try{const path=decodeURIComponent(input.split(/[?#]/)[0]);return safeArchivePath(path)?path:'';}catch{return '';}}return webUrl(input);}
export function convertNewsHtml(article:NewsImportArticle,mapping:Map<string,MediaMapping>=new Map(),preview?:(media:NewsImportMedia)=>string){
 const warnings:string[]=[],dom=parseDocument(article.bodyHtml,{decodeEntities:true}),sourceMedia=new Map<string,NewsImportMedia>();
 for(const media of article.media){for(const raw of [media.path,media.url]){if(!raw)continue;const key=mediaKey(raw);if(key)sourceMedia.set(key,media);}}
 const blocked=new Set(['script','style','iframe','object','embed','svg','math','template','form','input','button','video','audio','canvas','link','meta','base']);
 let count=0;
 const marks:Record<string,string>={b:'bold',strong:'bold',i:'italic',em:'italic',u:'underline',s:'strike',del:'strike',strike:'strike',code:'code'};
 function children(node:any,active:any[]=[],depth=0):CmsDoc[]{if(depth>25||++count>4500)throw new CmsError('news-html','De berichtinhoud bevat te veel geneste elementen.',422);const output:CmsDoc[]=[];for(const child of node.children||[])output.push(...visit(child,active,depth+1));return output;}
 function paragraphs(nodes:CmsDoc[]){const output:CmsDoc[]=[];let inline:CmsDoc[]=[];const flush=()=>{if(inline.some(n=>n.type!=='text'||!!n.text?.trim()))output.push({type:'paragraph',content:inline});inline=[];};for(const node of nodes){if(['text','hardBreak'].includes(node.type||''))inline.push(node);else{flush();output.push(node);}}flush();return output;}
 function visit(node:any,active:any[],depth:number):CmsDoc[]{
  if(node.type==='text')return node.data?[{type:'text',text:node.data,...(active.length?{marks:active}:{})}]:[];
  const tag=String(node.name||'').toLowerCase();if(blocked.has(tag)||!tag)return [];
  if(tag==='img'){
   const key=mediaKey(node.attribs?.src||''),mapped=mapping.get(key),media=sourceMedia.get(key),src=mapped?.kind==='image'?mapped.url:media&&preview?preview(media):'';
   const alt=archiveText(node.attribs?.alt||mapped?.alt||media?.alt||'',500);
   if(src)return [{type:'image',attrs:{src,alt,...(mapped?{mediaId:mapped.id}:{}),title:''}}];
   warnings.push('Een niet-overgenomen afbeelding is uit de inhoud verwijderd.');return alt?[{type:'text',text:`[Afbeelding: ${alt}]`}]:[];
  }
  if(tag==='a'){
   const raw=String(node.attribs?.href||''),key=mediaKey(raw),mapped=mapping.get(key),media=sourceMedia.get(key);
   let href=mapped?.url||'';let external=false;
   if(!href&&!raw.startsWith('media/')){try{const value=new URL(raw,article.sourceUrl||'https://www.duindorpsv.nl/');if(safeDestination(raw)&&!value.username&&!value.password&&['https:','http:','mailto:','tel:'].includes(value.protocol))href=value.href;}catch{}}
   if(!mapped&&media?.kind==='file'){href=webUrl(media.url);external=!!href;warnings.push('Een ontbrekende bijlage blijft alleen als herkenbare externe bronlink beschikbaar.');}
   const content=children(node,href?[...active,{type:'link',attrs:{href,target:'_blank',rel:'noopener noreferrer'}}]:active,depth);
   return external?[{type:'text',text:'Externe bron: '},...content]:content;
  }
  if(tag==='br')return [{type:'hardBreak'}];if(tag==='hr')return [{type:'horizontalRule'}];
  if(marks[tag])return children(node,[...active,{type:marks[tag]}],depth);
  const content=children(node,active,depth);
  if(/^h[1-6]$/.test(tag))return [{type:'heading',attrs:{level:Math.min(4,Math.max(2,Number(tag[1])))},content:content.filter(n=>n.type!=='image')}];
  if(tag==='p')return paragraphs(content.length?content:[{type:'hardBreak'}]);
  if(tag==='ul'||tag==='ol')return [{type:tag==='ul'?'bulletList':'orderedList',...(tag==='ol'?{attrs:{start:Math.max(1,Math.min(100000,Number(node.attribs?.start)||1))}}:{}),content:content.filter(n=>n.type==='listItem')}];
  if(tag==='li'){const blocks=paragraphs(content);if(blocks[0]?.type!=='paragraph')blocks.unshift({type:'paragraph'});return [{type:'listItem',content:blocks}];}
  if(tag==='blockquote')return [{type:'blockquote',content:paragraphs(content).length?paragraphs(content):[{type:'paragraph'}]}];
  if(tag==='pre'){const text=DomUtils.textContent(node);return [{type:'codeBlock',...(text?{content:[{type:'text',text}]}:{})}];}
  if(tag==='table')return [{type:'table',content:content.filter(n=>n.type==='tableRow')}];
  if(tag==='tr')return [{type:'tableRow',content:content.filter(n=>['tableCell','tableHeader'].includes(n.type||''))}];
  if(tag==='td'||tag==='th')return [{type:tag==='td'?'tableCell':'tableHeader',attrs:{colspan:1,rowspan:1},content:paragraphs(content).length?paragraphs(content):[{type:'paragraph'}]}];
  return content;
 }
 let content=paragraphs(children(dom));
 const lead=article.lead.replace(/\s+/g,' ').trim();
 const first=content[0];if(lead&&first?.type==='paragraph'&&docText(first).replace(/\s+/g,' ').trim()===lead)content=content.slice(1);
 const doc:CmsDoc={type:'doc',content:content.length?content:[{type:'paragraph'}]};
 if(validateDocument(doc,'article').length)throw new CmsError('news-html','Deze opmaak past niet in de bestaande nieuwseditor.',422);
 return {doc,warnings:[...new Set(warnings)],text:docText(doc)};
}
export function docText(doc:CmsDoc):string{return doc.type==='text'?doc.text||'':(doc.content||[]).map(docText).join(doc.type==='paragraph'||doc.type==='heading'?'':' ');}

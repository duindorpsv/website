import type {CmsDoc} from '../types';
export type Layout='full'|'equal'|'wide-left'|'wide-right';
export type LayoutIssue={nodeId:string;message:string};
const richTypes=new Set(['doc','paragraph','heading','text','bulletList','orderedList','listItem','blockquote','hardBreak','horizontalRule','image','table','tableRow','tableCell','tableHeader','codeBlock','taskList','taskItem']);
const marks=new Set(['bold','italic','underline','strike','code','link','highlight','subscript','superscript']);
const widgetKinds=new Set(['person','people','image','textImage','album','news','story','documents','faq','timeline','cta','team','contact','form']);
export const presets={layout:['full','equal','wide-left','wide-right'],gap:['small','normal','large'],padding:['none','small','normal','large'],tone:['default','soft','blue'],verticalAlign:['start','center','end']} as const;
export function safeDestination(value:unknown):boolean {return typeof value==='string'&&(!value||(/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value)&&!/[\u0000-\u0020\\]/.test(value)));}
function nodeId(n:CmsDoc){return String(n.attrs?.id||n.type||'document');}
export function validateDocument(doc:CmsDoc,format:'page-layout-v2'|'legacy-tiptap-v1'|'article'='page-layout-v2'):LayoutIssue[]{
 const issues:LayoutIssue[]=[];const seen=new Set<string>();let count=0;
 const add=(n:CmsDoc,message:string)=>issues.push({nodeId:nodeId(n),message});
 if(JSON.stringify(doc).length>1_000_000)return [{nodeId:'document',message:'Document is groter dan 1 MB.'}];
 function visit(n:CmsDoc,parent:string,depth:number,legacy=false){
  if(++count>5000||depth>30){add(n,'Document is te groot of te diep.');return;}
  if(!n||typeof n.type!=='string'){add(n||{},'Node mist een type.');return;}
  const structural=['cmsRow','cmsColumn','cmsRichText','cmsWidget','cmsLegacyRichText'].includes(n.type);
  if(structural&&format==='page-layout-v2'&&!legacy){const id=n.attrs?.id;if(typeof id!=='string'||!id||seen.has(id))add(n,'Structurele ID ontbreekt of is dubbel.');else seen.add(id);}
  if(n.type==='doc'){
   if(parent!=='root')add(n,'Document mag niet genest zijn.');
   if(format==='page-layout-v2'&&!legacy&&(!n.content?.length||n.content.some(c=>c.type!=='cmsRow')))add(n,'Pagina vereist minimaal één rij en uitsluitend rijen.');
  }else if(n.type==='cmsRow'){
   if(parent!=='doc'||legacy||format!=='page-layout-v2')add(n,'Rij staat buiten het document.');
   const cols=n.content||[];const layout=n.attrs?.layout;
   if(!cols.length||cols.length>2||cols.some(c=>c.type!=='cmsColumn'))add(n,'Rij vereist één of twee kolommen.');
   if((layout==='full'?1:2)!==cols.length)add(n,'Verhouding en kolomaantal verschillen.');
   for(const [key,values] of Object.entries(presets))if(!(values as readonly string[]).includes(n.attrs?.[key]))add(n,`Ongeldige preset: ${key}.`);
  }else if(n.type==='cmsColumn'){
   if(parent!=='cmsRow'||legacy)add(n,'Kolom staat buiten een rij.');
   if(n.content?.some(c=>!['cmsRichText','cmsWidget','cmsLegacyRichText'].includes(c.type||'')))add(n,'Kolom bevat een ongeldige widget.');
  }else if(n.type==='cmsRichText'){
   if(parent!=='cmsColumn'||legacy)add(n,'Tekstwidget staat buiten een kolom.');
   if(!n.content?.length)add(n,'Tekstwidget vereist een bewerkbare alinea.');
  }else if(n.type==='cmsLegacyRichText'){
   if(parent!=='cmsColumn'||!n.attrs?.sourceDoc)add(n,'Ongeldige compatibiliteitswidget.');
   if(n.content?.length)add(n,'Compatibiliteitswidget is atomair.');
   if(n.attrs?.sourceDoc)visit(n.attrs.sourceDoc,'root',depth+1,true);
  }else if(n.type==='cmsWidget'){
   if(format==='article'||(format==='page-layout-v2'&&!legacy&&parent!=='cmsColumn'))add(n,'Widget staat buiten een kolom.');
   if(n.content?.length)add(n,'Inhoudswidget is atomair.');
   const kind=n.attrs?.kind,d=n.attrs?.data;
   if(!widgetKinds.has(kind)&&!(kind==='columns'&&(legacy||format==='legacy-tiptap-v1')))add(n,'Onbekende widgetsoort.');
   if(!d||typeof d!=='object'||Array.isArray(d)){add(n,'Widgetinstellingen ontbreken.');return;}
   const allowed=['title','text','refId','ids','url','label','layout','items','contentType','storyFormat','teamId','authorId','limit','alt','caption','credit','ratio'];
   for(const [key,value] of Object.entries(d)){
    if(!allowed.includes(key))add(n,`Onbekende widgetinstelling: ${key}.`);
    if(typeof value==='string'&&value.length>50000)add(n,'Widgetinstelling is te lang.');
    if(key==='url'&&!safeDestination(value))add(n,'Onveilige link.');
   }
   if(d.contentType&&!['news','story'].includes(d.contentType))add(n,'Ongeldig inhoudstype.');
   if(format==='page-layout-v2'&&!legacy&&kind==='news'&&d.contentType!=='news')add(n,'Nieuwsselectie vereist expliciet news.');
   if(kind==='story'&&d.contentType!=='story')add(n,'Verhalenselectie vereist expliciet story.');
   if(d.ids&&(!Array.isArray(d.ids)||d.ids.some((v:unknown)=>typeof v!=='string')))add(n,'Ongeldige referenties.');
   if(d.items){if(!Array.isArray(d.items)||d.items.length>200)add(n,'Ongeldige items.');else for(const item of d.items)if(!item||typeof item.title!=='string'||typeof item.text!=='string'||(item.url&&!safeDestination(item.url)))add(n,'Ongeldig item of onveilige link.');}
  }else{
   if(!richTypes.has(n.type))add(n,`Onbekende tekstnode: ${n.type}.`);
   if(['doc','cmsColumn','cmsRow','cmsWidget','cmsLegacyRichText'].includes(parent)&&format==='page-layout-v2'&&!legacy)add(n,'Tekst staat buiten een tekstwidget.');
   if(n.type==='heading'&&![2,3,4,5,6].includes(n.attrs?.level))add(n,'Ongeldige kop; paginatitel levert H1.');
   if(n.type==='image'&&n.attrs?.src&&!safeDestination(n.attrs.src))add(n,'Onveilige afbeeldingsbron.');
   for(const mark of n.marks||[]){if(!marks.has(mark.type))add(n,'Onbekende tekstopmaak.');if(mark.type==='link'&&!safeDestination(mark.attrs?.href))add(n,'Onveilige link.');}
  }
  for(const key of Object.keys(n.attrs||{}))if(/^(on|style$|html$|class$)/i.test(key))add(n,'Vrije HTML of opmaak is niet toegestaan.');
  for(const child of n.content||[])visit(child,n.type,depth+1,legacy);
 }
 visit(doc,'root',0);return issues;
}
export function assertLayout(doc:CmsDoc){const errors=validateDocument(doc);if(errors.length)throw new Error(errors.map(e=>`${e.nodeId}: ${e.message}`).join('\n'));return doc;}
export const freshId=()=>`node-${globalThis.crypto.randomUUID()}`;
export function rich(content:CmsDoc[]=[{type:'paragraph'}],id=freshId()):CmsDoc{return {type:'cmsRichText',attrs:{id},content};}
export function column(content:CmsDoc[]=[],id=freshId()):CmsDoc{return {type:'cmsColumn',attrs:{id},content};}
export function row(layout:Layout='full',columns?:CmsDoc[],id=freshId()):CmsDoc{return {type:'cmsRow',attrs:{id,layout,gap:'normal',padding:'normal',tone:'default',verticalAlign:'start'},content:columns||Array.from({length:layout==='full'?1:2},()=>column())};}
export function emptyLayout():CmsDoc{return {type:'doc',content:[row()]};}
export function cloneStructure(node:CmsDoc):CmsDoc{const copy=structuredClone(node);function visit(n:CmsDoc){if(['cmsRow','cmsColumn','cmsRichText','cmsWidget','cmsLegacyRichText'].includes(n.type||''))n.attrs={...n.attrs,id:freshId()};n.content?.forEach(visit);}visit(copy);return copy;}
export function changeLayout(doc:CmsDoc,id:string,layout:Layout):CmsDoc{const next=structuredClone(doc);const r=next.content?.find(n=>n.attrs?.id===id);if(!r)throw new Error('Rij niet gevonden.');if(layout==='full'&&r.content?.length===2)r.content=[{...r.content[0],content:[...r.content[0].content||[],...r.content[1].content||[]]}];else if(layout!=='full'&&r.content?.length===1)r.content.push(column());r.attrs={...r.attrs,layout};return assertLayout(next);}
export function swapColumns(doc:CmsDoc,id:string):CmsDoc{const next=structuredClone(doc);const r=next.content?.find(n=>n.attrs?.id===id);if(r?.content?.length!==2)throw new Error('Rij heeft geen twee kolommen.');r.content.reverse();return assertLayout(next);}
export function moveNode(doc:CmsDoc,id:string,targetId:string,index:number):CmsDoc{
 const next=structuredClone(doc);let source:CmsDoc|undefined;let sourceParent:CmsDoc|undefined;
 function find(n:CmsDoc):CmsDoc|undefined{if(n.attrs?.id===targetId)return n;for(const c of n.content||[]){const result=find(c);if(result)return result;}}
 function locate(n:CmsDoc){for(const child of n.content||[]){if(child.attrs?.id===id){source=child;sourceParent=n;return;}locate(child);}}
 locate(next);const target=targetId==='doc'?next:find(next);
 if(!source||!sourceParent||!target||source===target)throw new Error('Ongeldige verplaatsing.');
 if(source.type==='cmsRow'&&target.type!=='doc'||source.type!=='cmsRow'&&target.type!=='cmsColumn')throw new Error('Ongeldige sleepbestemming.');
 const from=sourceParent.content!.indexOf(source);sourceParent.content!.splice(from,1);
 if(sourceParent===target&&index>from)index--;
 target.content||=[];target.content.splice(Math.max(0,Math.min(index,target.content.length)),0,source);
 return assertLayout(next);
}
function deterministicId(key:string){let hash=2166136261;for(const c of key){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return `migrated-${(hash>>>0).toString(16)}-${key.length}`;}
export function migrateLayout(body:CmsDoc,key='page'):CmsDoc{
 if(body.content?.some(n=>n.type==='cmsRow'))return assertLayout(structuredClone(body));
 const errors=validateDocument(body,'legacy-tiptap-v1');if(errors.length)throw new Error(errors.map(e=>e.message).join('; '));
 const rows:CmsDoc[]=[];let pending:CmsDoc[]=[];let serial=0;
 const id=()=>deterministicId(`${key}:${serial++}`);
 const makeRow=(content:CmsDoc[],layout:Layout='full')=>row(layout,content,id());
 const hasWidget=(n:CmsDoc):boolean=>n.type==='cmsWidget'||!!n.content?.some(hasWidget);
 const flush=()=>{if(!pending.length)return;const content=pending;pending=[];const widget=content.some(hasWidget)?{type:'cmsLegacyRichText',attrs:{id:id(),sourceDoc:{type:'doc',content:structuredClone(content)}}}:rich(structuredClone(content),id());rows.push(makeRow([column([widget],id())]));};
 for(const node of body.content||[]){
  if(node.type!=='cmsWidget'){pending.push(node);continue;}flush();
  const d=node.attrs?.data||{};
  if(node.attrs?.kind==='columns'){
   if(['text','refId','ids','url','label','layout','contentType'].some(k=>Array.isArray(d[k])?d[k].length>0:!!d[k]))throw new Error('Onverwachte kolominstellingen; handmatige beoordeling nodig.');
   if(Object.keys(d).some(k=>!['title','text','refId','ids','url','label','layout','items','contentType'].includes(k)))throw new Error('Onbekende kolominstellingen; handmatige beoordeling nodig.');
   if(d.title)rows.push(makeRow([column([rich([{type:'heading',attrs:{level:2},content:[{type:'text',text:d.title}]}],id())],id())]));
   const items=d.items||[];
   for(let i=0;i<items.length;i+=2){const chunk=items.slice(i,i+2);const columns=chunk.map((item:{title:string;text:string;url?:string})=>{
    if(Object.keys(item).some(k=>!['title','text','url'].includes(k)))throw new Error('Onbekende kolomvelden; handmatige beoordeling nodig.');
    const nodes:CmsDoc[]=[];if(item.title)nodes.push({type:'heading',attrs:{level:3},content:[{type:'text',text:item.title}]});
    nodes.push({type:'paragraph',content:item.text?[{type:'text',text:item.text}]:[]});if(item.url)nodes.push({type:'paragraph',content:[{type:'text',text:item.url,marks:[{type:'link',attrs:{href:item.url}}]}]});return column([rich(nodes,id())],id());});
    rows.push(makeRow(columns,chunk.length===2?'equal':'full'));
   }
  }else{const copy=structuredClone(node);copy.attrs={...copy.attrs,id:id()};if(copy.attrs.kind==='news'){copy.attrs.data.contentType||='news';if(copy.attrs.data.contentType==='story')copy.attrs.kind='story';}rows.push(makeRow([column([copy],id())]));}
 }
 flush();return assertLayout({type:'doc',content:rows.length?rows:[makeRow([column([],id())])]});
}
export function referencesIn(value:unknown):string[]{const refs=new Set<string>();function scan(v:unknown){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(scan);return;}for(const [key,x] of Object.entries(v)){if(['refId','mediaId','coverId','authorId','parentId'].includes(key)&&typeof x==='string'&&x)refs.add(x);else if(['ids','mediaIds','homepageArticleIds','homepageStoryIds','homepageAlbumIds','homepagePhotoIds'].includes(key)&&Array.isArray(x))x.forEach(id=>{if(typeof id==='string'&&id)refs.add(id);});else scan(x);}}scan(value);return [...refs];}

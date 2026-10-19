import {defaultFeaturedUntil} from './featured';
import type {ArticleContent,CmsArticle,CmsDoc,CmsPage,CmsState,PageContent,Permission,WidgetData} from './types';
export function contentPath(article:Pick<ArticleContent,'contentType'|'slug'>){return `${article.contentType==='story'?'verhalen':'nieuws'}/${article.slug}`;}
export const CMS_KEY='duindorp-cms-v1';
export const CMS_EVENT='duindorp-cms-change';
export const uid=(prefix='item')=>`${prefix}-${typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}`;
export const now=()=>new Date().toISOString();
export const emptySEO=()=>({title:'',description:'',noIndex:false});
export const textDoc=(paragraphs:readonly string[]):CmsDoc=>({type:'doc',content:paragraphs.map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]}))});
export const docText=(doc:CmsDoc):string=>doc.text|| (doc.content||[]).map(docText).join(doc.type==='doc'?'\n':' ');
export function slugify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
export function safeUrl(url:string){return /^(https?:\/\/|mailto:|tel:|\/(?!\/))[^\s]*$/i.test(url)&&!/[<>"\\]/.test(url);}
export function articleContent(a:CmsArticle):ArticleContent{const {contentType,storyFormat,title,slug,intro,body,coverId,authorId,author,category,tags,teamId,season,seo,featured,featuredUntil,publishedAt}=a;return structuredClone({contentType,storyFormat,title,slug,intro,body,coverId,...(authorId?{authorId}:{}),author,category,tags,teamId,season,seo,featured,...(featuredUntil!==undefined?{featuredUntil}:{}),publishedAt});}
export function pageContent(p:CmsPage):PageContent{const {bodyFormat,title,slug,intro,body,parentId,menuGroup,menuVisible,order,seo,useBuilder}=p;return structuredClone({...(bodyFormat?{bodyFormat}:{}),title,slug,intro,body,parentId,menuGroup,menuVisible,order,seo,useBuilder});}
export function allowed(state:CmsState,roleId:string,permission:Permission,teamId?:string){const role=state.roles.find(r=>r.id===roleId);if(!role?.permissions.includes(permission))return false;if(role.teamScoped){if(!teamId)return false;return state.members.some(m=>m.active&&m.roleId===roleId&&m.teamIds.includes(teamId));}return true;}
function validateDocument(doc:CmsDoc,state:CmsState):string[]{
 const errors=new Set<string>();
 const mediaReady=(id:string)=>state.media.some(m=>m.id===id&&!m.deletedAt&&m.published);
 const personReady=(id:string)=>state.people.some(p=>p.id===id&&!p.deletedAt&&p.published);
 const visit=(node:CmsDoc)=>{
  for(const mark of node.marks||[])if(mark.type==='link'&&(!mark.attrs?.href||!safeUrl(String(mark.attrs.href))))errors.add('De inhoud bevat een ongeldige link.');
  if(node.type==='image'){
   if(node.attrs?.mediaId){if(!mediaReady(String(node.attrs.mediaId)))errors.add('Een afbeelding in de inhoud is niet beschikbaar of niet gepubliceerd.');}
   else if(!node.attrs?.src||!safeUrl(String(node.attrs.src)))errors.add('Een afbeelding in de inhoud heeft geen geldige bron.');
  }
  if(node.type==='cmsWidget'){
   const kind=node.attrs?.kind,data=(node.attrs?.data||{}) as WidgetData,ref=data.refId||'';
   if(kind==='person'&&!personReady(ref))errors.add('Kies voor ieder persoonsblok een gepubliceerde persoon.');
   if(kind==='people'&&data.ids?.some(id=>!personReady(id)))errors.add('Een geselecteerde persoon is verwijderd of nog niet gepubliceerd.');
   if(['image','textImage'].includes(kind)&&!mediaReady(ref))errors.add('Kies voor ieder afbeeldingsblok een gepubliceerde foto.');
   if(kind==='album'&&!state.albums.some(a=>a.id===ref&&!a.deletedAt&&a.published))errors.add('Kies voor ieder albumblok een gepubliceerd album.');
   if(kind==='documents'&&data.ids?.some(id=>!state.documents.some(d=>d.id===id&&d.published)))errors.add('Een geselecteerd document is niet beschikbaar of niet gepubliceerd.');
   if(kind==='team'&&!state.settings.teams.some(t=>t.id===ref))errors.add('Kies voor ieder teamblok een beschikbaar team.');
   if(kind==='contact'&&!state.departments.some(d=>d.id===ref&&d.active))errors.add('Kies voor ieder contactblok een actieve afdeling.');
   if(kind==='cta'&&(!data.url||!safeUrl(data.url)))errors.add('Geef ieder oproepblok een geldige link.');
   if(data.url&&!safeUrl(data.url)||data.items?.some(item=>item.url&&!safeUrl(item.url)))errors.add('Een blok bevat een ongeldige link.');
  }
  for(const child of node.content||[])visit(child);
 };
 visit(doc);return [...errors];
}
export function validateArticle(a:CmsArticle,state:CmsState):string[]{const errors:string[]=[];if(!['news','story'].includes(a.contentType))errors.push('Kies Nieuws of Verhalen.');if(a.contentType==='story'&&!['column','interview','story'].includes(a.storyFormat))errors.push('Kies een verhaalvorm.');if(a.deletedAt)errors.push('Herstel dit artikel eerst uit de prullenbak.');if(!a.title.trim())errors.push('Vul een titel in.');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug))errors.push('Gebruik een slug met kleine letters, cijfers en streepjes.');if(state.articles.some(x=>x.id!==a.id&&!x.deletedAt&&(contentPath(x)===contentPath(a)||!!x.live&&contentPath(x.live)===contentPath(a))))errors.push('Dit pad is al in gebruik binnen dit inhoudstype.');if(!docText(a.body).trim())errors.push('Schrijf eerst de inhoud.');if(a.coverId&&!state.media.some(m=>m.id===a.coverId&&!m.deletedAt&&m.published))errors.push('De omslagfoto moet gepubliceerd zijn.');return [...errors,...validateDocument(a.body,state)];}
export function validatePage(p:CmsPage,state:CmsState):string[]{const errors:string[]=[];if(p.deletedAt)errors.push('Herstel deze pagina eerst uit de prullenbak.');if(!p.title.trim())errors.push('Vul een paginatitel in.');if(!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(p.slug))errors.push('Gebruik een geldig pad met letters, cijfers, streepjes en eventueel /.');if(['home','nieuws','verhalen','teams','wedstrijden','beheer','media/fotos'].includes(p.slug)||p.slug.startsWith('nieuws/')||p.slug.startsWith('verhalen/')||p.slug.startsWith('media/fotos/'))errors.push('Dit pad is gereserveerd voor het systeem.');if(state.pages.some(x=>x.id!==p.id&&!x.deletedAt&&(x.slug===p.slug||x.live?.slug===p.slug)))errors.push('Dit paginapad is al in gebruik.');if(p.parentId===p.id)errors.push('Een pagina kan niet onder zichzelf vallen.');let parentId=p.parentId;const seen=new Set([p.id]);while(parentId){const parent=state.pages.find(x=>x.id===parentId&&!x.deletedAt);if(!parent){errors.push('Kies een bestaande bovenliggende pagina buiten de prullenbak.');break;}if(seen.has(parent.id)){errors.push('De paginahiërarchie bevat een kringverwijzing.');break;}seen.add(parent.id);parentId=parent.parentId;}return [...errors,...validateDocument(p.body,state)];}

// A public URL is always a destination. Moving it again updates all aliases directly,
// including when an editor restores a previously used slug.
function updateRedirects(state:CmsState,previous:string|undefined,current:string){
 const links=new Map(state.redirects.filter(r=>r.from!==current&&r.from!==previous).map(r=>[r.from,r.to]));
 if(previous&&previous!==current)links.set(previous,current);
 state.redirects=[...links].flatMap(([from,target])=>{
  const visited=new Set([from]);let to=target;
  while(links.has(to)&&!visited.has(to)){visited.add(to);to=links.get(to)!;}
  return visited.has(to)?[]:[{from,to}];
 });
}
export function publishArticle(state:CmsState,id:string){const a=state.articles.find(x=>x.id===id);if(!a)return ['Artikel niet gevonden.'];const errors=validateArticle(a,state);if(errors.length)return errors;updateRedirects(state,a.live?contentPath(a.live):undefined,contentPath(a));if(!a.live||a.live.featured!==a.featured||a.live.contentType!==a.contentType){state.settings.homepageArticleIds=state.settings.homepageArticleIds.filter(item=>item!==id);state.settings.homepageStoryIds=state.settings.homepageStoryIds.filter(item=>item!==id);if(a.featured)state.settings[a.contentType==='story'?'homepageStoryIds':'homepageArticleIds'].push(id);}const stamp=now();a.publishedAt=a.publishedAt&&Date.parse(a.publishedAt)<=Date.parse(stamp)?a.publishedAt:stamp;if(a.contentType==='news'&&a.featured&&!a.featuredUntil)a.featuredUntil=defaultFeaturedUntil(a.publishedAt);a.live=articleContent(a);a.status='published';a.updatedAt=now();a.scheduledAt='';return [];}
export function publishPage(state:CmsState,id:string){const p=state.pages.find(x=>x.id===id);if(!p)return ['Pagina niet gevonden.'];const errors=validatePage(p,state);if(errors.length)return errors;updateRedirects(state,p.live?.slug,p.slug);p.live=pageContent(p);p.status='published';p.updatedAt=now();return [];}
export function mediaSource(state:CmsState,id:string){return state.media.find(m=>m.id===id&&!m.deletedAt)?.src||'';}
export const statusLabel={draft:'Concept',review:'Ter beoordeling',scheduled:'Ingepland',published:'Gepubliceerd',archived:'Gearchiveerd'} as const;

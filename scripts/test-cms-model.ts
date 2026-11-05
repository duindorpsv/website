import assert from 'node:assert/strict';
import test from 'node:test';
import type {CmsArticle,CmsPage,CmsState} from '../lib/cms/types';
import type {ClubNavigationItem} from '../lib/clubmuur-navigation';

const cms=await import(new URL('../lib/cms/model.ts',import.meta.url).href) as typeof import('../lib/cms/model');
const routes=await import(new URL('../lib/clubmuur-page-routes.ts',import.meta.url).href) as typeof import('../lib/clubmuur-page-routes');
const {cmsNavigation}=await import(new URL('../lib/cms/navigation.ts',import.meta.url).href) as typeof import('../lib/cms/navigation');

function state():CmsState{
 return {schemaVersion:1,matchPreviews:[],planning:{committees:[],locations:[],activities:[],lastSportlinkSync:null},articles:[],pages:[],people:[],media:[],folders:[],albums:[],departments:[],forms:[],submissions:[],roles:[{id:'admin',name:'Beheerder',description:'',permissions:['news','pages','media','publish'],teamScoped:false},{id:'editor',name:'Redacteur',description:'',permissions:['news','pages'],teamScoped:false},{id:'team',name:'Teamredacteur',description:'',permissions:['news','media'],teamScoped:true}],members:[{id:'team-one',name:'Redacteur eerste',email:'',roleId:'team',teamIds:['1'],active:true},{id:'inactive-two',name:'Niet actief',email:'',roleId:'team',teamIds:['2'],active:false}],documents:[],settings:{clubName:'Duindorp SV',siteDescription:'',contactEmail:'secretariaat@duindorpsv.nl',season:'2026–2027',newsCategories:[],teams:[{id:'1',name:'Eerste'}],homepageArticleIds:[],homepageStoryIds:[],homepageAlbumIds:[],homepagePhotoIds:[],homepageHeading:'',newsletterEnabled:false,newsletterLabel:'',socials:[]},redirects:[],audit:[]};
}
function article(id='article-one',slug='eerste-verhaal'):CmsArticle{
 return {id,contentType:'news',storyFormat:'story',title:'Een verhaal',slug,intro:'Voor de club',body:cms.textDoc(['Oorspronkelijke tekst.']),coverId:'',author:'Redactie',category:'Clubnieuws',tags:['club'],teamId:'',season:'2026–2027',seo:cms.emptySEO(),featured:false,publishedAt:'',status:'draft',updatedAt:'2026-10-13T09:00:00.000Z',scheduledAt:'',revisions:[]};
}
function page(id='page-one',slug='club/nieuwe-pagina'):CmsPage{
 return {id,title:'Nieuwe pagina',slug,intro:'Een introductie',body:cms.textDoc(['Inhoud.']),parentId:'',menuGroup:'club',menuVisible:true,order:0,seo:cms.emptySEO(),useBuilder:true,status:'draft',updatedAt:'2026-10-13T09:00:00.000Z',revisions:[]};
}

test('publishing takes an independent snapshot; draft edits stay out of public article content',()=>{
 const s=state(),a=article();s.articles.push(a);
 assert.deepEqual(cms.publishArticle(s,a.id),[]);
 assert.equal(a.status,'published');assert.ok(a.live?.publishedAt);
 a.title='Nog niet publiceren';a.body.content![0].content![0].text='Nieuwe concepttekst';a.tags.push('nieuw');a.seo.title='Nieuwe SEO titel';a.status='draft';
 assert.equal(a.live?.title,'Een verhaal');assert.equal(cms.docText(a.live!.body),'Oorspronkelijke tekst.');assert.deepEqual(a.live?.tags,['club']);assert.equal(a.live?.seo.title,'');
 assert.deepEqual(cms.publishArticle(s,a.id),[]);
 assert.equal(a.live?.title,'Nog niet publiceren');assert.equal(cms.docText(a.live!.body),'Nieuwe concepttekst');
});

test('published page content keeps independent widgets, menu settings and SEO',()=>{
 const s=state(),p=page();p.body={type:'doc',content:[{type:'cmsWidget',attrs:{kind:'people',data:{title:'Bestuur'}}}]};s.pages.push(p);
 assert.deepEqual(cms.publishPage(s,p.id),[]);
 (p.body.content![0].attrs!.data as {title:string}).title='Conceptwijziging';p.menuVisible=false;p.seo.noIndex=true;
 assert.equal(p.live?.body.content![0].attrs!.data.title,'Bestuur');assert.equal(p.live?.menuVisible,true);assert.equal(p.live?.seo.noIndex,false);
});

test('invalid publication leaves the previous public article untouched',()=>{
 const s=state(),a=article();s.articles.push(a);cms.publishArticle(s,a.id);const before=structuredClone(a.live);
 a.title='';a.body=cms.textDoc([]);a.slug='Onveilig / pad';a.scheduledAt='2026-11-01T12:00:00.000Z';
 assert.ok(cms.publishArticle(s,a.id).length>=3);assert.deepEqual(a.live,before);assert.equal(a.scheduledAt,'2026-11-01T12:00:00.000Z');assert.equal(s.redirects.length,0);
});

test('article slugs reserve another item’s current draft AND its currently public URL',()=>{
 const s=state(),a=article(),b=article('article-two','tweede-verhaal');s.articles.push(a,b);cms.publishArticle(s,a.id);a.slug='eerste-verhaal-aangepast';
 b.slug='eerste-verhaal';assert.ok(cms.validateArticle(b,s).some(e=>e.includes('al in gebruik')));
 b.slug='eerste-verhaal-aangepast';assert.ok(cms.validateArticle(b,s).some(e=>e.includes('al in gebruik')));
 b.slug='tweede-verhaal';assert.deepEqual(cms.validateArticle(a,s),[]);
});

test('page slugs reserve another page’s draft and live URL',()=>{
 const s=state(),p=page(),other=page('page-two','club/ander');s.pages.push(p,other);cms.publishPage(s,p.id);p.slug='club/aangepast';
 for(const slug of ['club/nieuwe-pagina','club/aangepast']){other.slug=slug;assert.ok(cms.validatePage(other,s).some(e=>e.includes('al in gebruik')));}
});

test('unpublished, missing and deleted media cannot become a news cover',()=>{
 const s=state(),a=article();s.articles.push(a);a.coverId='cover';
 assert.ok(cms.validateArticle(a,s).some(e=>e.includes('omslagfoto')));
 s.media.push({id:'cover',name:'Omslag',src:'/assets/cover.webp',folderId:'',alt:'Supporters',caption:'',credit:'',teamId:'',season:'',published:false,featured:false,order:0,focusX:50,focusY:50,createdAt:'2026-10-13T09:00:00.000Z'});
 assert.ok(cms.validateArticle(a,s).some(e=>e.includes('omslagfoto')));
 s.media[0].published=true;assert.deepEqual(cms.validateArticle(a,s),[]);
 s.media[0].deletedAt='2026-10-13T10:00:00.000Z';assert.ok(cms.validateArticle(a,s).some(e=>e.includes('omslagfoto')));assert.equal(cms.mediaSource(s,'cover'),'');
});

test('single slug changes preserve old public article and page links',()=>{
 const s=state(),a=article(),p=page();s.articles.push(a);s.pages.push(p);cms.publishArticle(s,a.id);cms.publishPage(s,p.id);
 a.slug='nieuwe-nieuwslink';p.slug='club/nieuwe-paginalink';cms.publishArticle(s,a.id);cms.publishPage(s,p.id);
 assert.deepEqual(s.redirects,[{from:'nieuws/eerste-verhaal',to:'nieuws/nieuwe-nieuwslink'},{from:'club/nieuwe-pagina',to:'club/nieuwe-paginalink'}]);
 cms.publishArticle(s,a.id);cms.publishPage(s,p.id);assert.equal(s.redirects.length,2,'unchanged republication must not add redirects');
});

test('repeated article renames flatten aliases and restoring an old slug cannot create a loop',()=>{
 const s=state(),a=article();s.articles.push(a);cms.publishArticle(s,a.id);
 a.slug='tweede-link';cms.publishArticle(s,a.id);a.slug='derde-link';cms.publishArticle(s,a.id);
 assert.deepEqual(s.redirects,[{from:'nieuws/eerste-verhaal',to:'nieuws/derde-link'},{from:'nieuws/tweede-link',to:'nieuws/derde-link'}]);
 a.slug='eerste-verhaal';cms.publishArticle(s,a.id);
 assert.deepEqual(s.redirects,[{from:'nieuws/tweede-link',to:'nieuws/eerste-verhaal'},{from:'nieuws/derde-link',to:'nieuws/eerste-verhaal'}]);
 assert.equal(s.redirects.some(r=>r.from===`nieuws/${a.live!.slug}`),false);
});

test('page aliases point directly to the current URL after successive moves',()=>{
 const s=state(),p=page();s.pages.push(p);cms.publishPage(s,p.id);p.slug='club/tweede';cms.publishPage(s,p.id);p.slug='club/derde';cms.publishPage(s,p.id);p.slug='club/nieuwe-pagina';cms.publishPage(s,p.id);
 assert.deepEqual(s.redirects,[{from:'club/tweede',to:'club/nieuwe-pagina'},{from:'club/derde',to:'club/nieuwe-pagina'}]);
});

test('first publication can reclaim an unused alias without redirecting its new page away',()=>{
 const s=state(),p=page();s.pages.push(p);s.redirects=[{from:p.slug,to:'club/oud-doel'}];
 assert.deepEqual(cms.publishPage(s,p.id),[]);assert.deepEqual(s.redirects,[]);
});

test('deleted content must be restored before publication and retains its existing snapshot',()=>{
 const s=state(),a=article(),p=page();s.articles.push(a);s.pages.push(p);cms.publishArticle(s,a.id);cms.publishPage(s,p.id);const articleLive=structuredClone(a.live),pageLive=structuredClone(p.live);
 a.deletedAt='2026-10-13T10:00:00.000Z';p.deletedAt=a.deletedAt;a.title='Deleted edit';p.title='Deleted page edit';
 assert.ok(cms.publishArticle(s,a.id).some(e=>e.includes('prullenbak')));assert.ok(cms.publishPage(s,p.id).some(e=>e.includes('prullenbak')));assert.deepEqual(a.live,articleLive);assert.deepEqual(p.live,pageLive);
});

test('role checks distinguish editing from publication and unknown roles get no access',()=>{
 const s=state();assert.equal(cms.allowed(s,'admin','publish'),true);assert.equal(cms.allowed(s,'editor','news'),true);assert.equal(cms.allowed(s,'editor','publish'),false);assert.equal(cms.allowed(s,'unknown','news'),false);
});

test('team role requires a matching active assignment and cannot edit clubwide content',()=>{
 const s=state();assert.equal(cms.allowed(s,'team','news','1'),true);assert.equal(cms.allowed(s,'team','news','2'),false);assert.equal(cms.allowed(s,'team','news'),false);assert.equal(cms.allowed(s,'team','publish','1'),false);s.members[0].active=false;assert.equal(cms.allowed(s,'team','news','1'),false);
});

test('page hierarchy rejects direct and indirect parent cycles',()=>{
 const s=state(),a=page('a','club/a'),b=page('b','club/b'),c=page('c','club/c');s.pages.push(a,b,c);
 a.parentId='a';assert.ok(cms.validatePage(a,s).length>0);
 a.parentId='b';b.parentId='c';c.parentId='a';assert.ok(cms.validatePage(a,s).some(e=>e.includes('kringverwijzing')));
 c.parentId='';assert.deepEqual(cms.validatePage(a,s),[]);
});

test('a page cannot publish under a missing or deleted parent',()=>{
 const s=state(),p=page(),parent=page('parent','club/parent');s.pages.push(p,parent);p.parentId='missing';assert.ok(cms.validatePage(p,s).some(e=>e.includes('bovenliggende')));
 p.parentId=parent.id;parent.deletedAt='2026-10-13T10:00:00.000Z';assert.ok(cms.validatePage(p,s).some(e=>e.includes('bovenliggende')));delete parent.deletedAt;assert.deepEqual(cms.validatePage(p,s),[]);
});

test('empty system placeholders remain valid while explicit unpublished widget references are rejected',()=>{
 const s=state(),p=page();s.pages.push(p);p.system=true;p.body=cms.textDoc([]);assert.deepEqual(cms.validatePage(p,s),[]);
 p.body={type:'doc',content:[{type:'cmsWidget',attrs:{kind:'person',data:{refId:'person-one'}}}]};assert.ok(cms.validatePage(p,s).length>0);
 s.people.push({id:'person-one',name:'Clubvrijwilliger',role:'Vrijwilliger',group:'Bestuur',teamId:'',bio:'',mediaId:'',email:'',phone:'',showContact:false,published:false,order:0});assert.ok(cms.validatePage(p,s).length>0);
 s.people[0].published=true;assert.deepEqual(cms.validatePage(p,s),[]);s.people[0].deletedAt='2026-10-13T10:00:00.000Z';assert.ok(cms.validatePage(p,s).length>0);
});

test('publication rejects unsafe rich-text and widget links even if imported or pasted',()=>{
 const s=state(),a=article(),p=page();s.articles.push(a);s.pages.push(p);
 a.body.content![0].content![0].marks=[{type:'link',attrs:{href:'javascript:alert(1)'}}];assert.ok(cms.validateArticle(a,s).some(e=>e.includes('ongeldige link')));
 p.body={type:'doc',content:[{type:'cmsWidget',attrs:{kind:'cta',data:{label:'Openen',url:'javascript:alert(1)'}}}]};assert.ok(cms.validatePage(p,s).some(e=>e.includes('link')));
 p.body.content![0].attrs!.data.url='/clubmuur/club/contact';assert.deepEqual(cms.validatePage(p,s),[]);
});

test('reserved public news, albums and admin paths cannot become CMS pages',()=>{
 const s=state(),p=page();s.pages.push(p);
 for(const slug of ['home','nieuws','nieuws/eigen-artikel','verhalen','verhalen/eigen-column','teams','wedstrijden','beheer','media/fotos','media/fotos/album']){p.slug=slug;assert.ok(cms.validatePage(p,s).length>0,slug);}
});

test('links accept supported local/contact/web URLs and reject executable or malformed schemes',()=>{
 for(const url of ['/clubmuur/club','https://duindorpsv.nl/nieuws','http://example.com','mailto:secretariaat@duindorpsv.nl','tel:0659019035'])assert.equal(cms.safeUrl(url),true,url);
 for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','//evil.example','/\\evil.example','https://example.com/"onmouseover=',' https://example.com','https://example.com/a\nb','ftp://example.com'])assert.equal(cms.safeUrl(url),false,url);
 assert.equal(cms.slugify(' Ons verhaal & historie! '),'ons-verhaal-historie');assert.equal(cms.slugify('Café aan zee'),'cafe-aan-zee');
});

test('dynamic CMS routes accept news, albums and custom pages without changing legacy route contracts',()=>{
 for(const path of ['nieuws/ons-eerste-verhaal','verhalen/een-column','media/fotos/zaterdag-op-houtrust','club/sponsoren','nieuwe-pagina'])assert.equal(routes.isCmsDynamicPath(path),true,path);
 assert.equal(routes.isClubPagePath('club/sponsoren'),true);assert.equal(routes.clubPageGroup('nieuws/ons-eerste-verhaal'),'nieuws');
});

test('dynamic CMS route gate rejects traversal, malformed segments, schemes and the admin path',()=>{
 for(const path of ['beheer','../beheer','club//bestuur','club/./bestuur','club/../beheer','https://example.com','club/BadSlug','club/<script>','club/with space'])assert.equal(routes.isCmsDynamicPath(path),false,path);
});

function navigationFixture(){
 const s=state(),history=page('page-history','club/verhaal'),board=page('page-board','club/bestuur');history.title='Ons verhaal';history.order=1;board.title='Bestuur';board.order=2;history.live=cms.pageContent(history);board.live=cms.pageContent(board);s.pages=[history,board];
 const originals=structuredClone(s.pages);
 const base:ClubNavigationItem[]=[{id:'home',label:'HOME',href:'/clubmuur'},{id:'club',label:'ONZE CLUB',href:'/clubmuur/club',children:[{id:'custom-history',label:'Onze geschiedenis',href:'/clubmuur/club/verhaal'},{id:'custom-board',label:'Wie doet wat',href:'/clubmuur/club/bestuur'}]},{id:'nieuws',label:'MEDIA',href:'/clubmuur/nieuws',children:[]}];
 return {s,history,board,originals,base};
}

test('unchanged CMS settings preserve all custom navigation labels and ordering',()=>{
 const {s,base,originals}=navigationFixture(),before=structuredClone(base);
 assert.deepEqual(cmsNavigation(base,s,originals),base);assert.deepEqual(base,before,'navigation must not mutate its configured base');
});

test('draft title, slug, visibility and order cannot change public navigation',()=>{
 const {s,history,base,originals}=navigationFixture();history.title='Concepttitel';history.slug='club/bestuur';history.menuVisible=false;history.order=99;history.menuGroup='nieuws';
 assert.deepEqual(cmsNavigation(base,s,originals),base);
 history.live!.title='Eerder gepubliceerde titel';const merged=cmsNavigation(base,s,originals);
 assert.ok(merged[1].children?.some(link=>link.href==='/clubmuur/club/bestuur'&&link.label==='Wie doet wat'),'a later draft slug must not hide another public page');assert.ok(merged[1].children?.some(link=>link.label==='Eerder gepubliceerde titel'&&link.href==='/clubmuur/club/verhaal'));
});

test('new published pages enter their menu in published order; new drafts stay hidden',()=>{
 const {s,base,originals}=navigationFixture(),first=page('new-first','club/nieuw-eerst'),middle=page('new-middle','club/nieuw-midden'),draft=page('new-draft','club/nog-niet');first.order=0;middle.order=1.5;first.live=cms.pageContent(first);middle.live=cms.pageContent(middle);s.pages.push(middle,draft,first);
 assert.deepEqual(cmsNavigation(base,s,originals)[1].children?.map(link=>link.href),['/clubmuur/club/nieuw-eerst','/clubmuur/club/verhaal','/clubmuur/club/nieuw-midden','/clubmuur/club/bestuur']);
});

test('unpublishing, trash and menu visibility remove old configured links',()=>{
 for(const action of ['unpublish','trash','hide'] as const){const {s,history,base,originals}=navigationFixture();if(action==='unpublish')history.live=undefined;if(action==='trash')history.deletedAt='2026-10-13T10:00:00.000Z';if(action==='hide')history.live!.menuVisible=false;assert.equal(cmsNavigation(base,s,originals)[1].children?.some(link=>link.href==='/clubmuur/club/verhaal'),false,action);}
 const {s,history,base,originals}=navigationFixture();history.live!.menuVisible=false;originals[0].live!.menuVisible=false;assert.equal(cmsNavigation(base,s,originals)[1].children?.some(link=>link.href==='/clubmuur/club/verhaal'),false,'even a default hidden page must override a manually configured link');
});

test('renamed page aliases are removed from menus, including after unpublishing',()=>{
 const {s,history,base,originals}=navigationFixture();history.live!.slug='club/nieuw-verhaal';history.slug='club/nieuw-verhaal';s.redirects=[{from:'club/verhaal',to:'club/nieuw-verhaal'},{from:'club/tussenstap',to:'club/nieuw-verhaal'}];base[1].children!.push({id:'intermediate',label:'Tussenstap',href:'/clubmuur/club/tussenstap'});
 const merged=cmsNavigation(base,s,originals);assert.equal(merged[1].children?.filter(link=>['/clubmuur/club/verhaal','/clubmuur/club/tussenstap'].includes(link.href)).length,0);assert.equal(merged[1].children?.filter(link=>link.href==='/clubmuur/club/nieuw-verhaal').length,1);
 history.live=undefined;assert.equal(cmsNavigation(base,s,originals)[1].children?.some(link=>link.id==='intermediate'),false);
});

test('friendly-match and TV pages stay out of every menu after toggling or renaming',()=>{
 for(const [id,slug] of [['page-wedstrijden-oefenwedstrijd','wedstrijden/oefenwedstrijd'],['page-media-club-tv','media/club-tv']]){
  const {s,base,originals}=navigationFixture(),hidden=page(id,slug);hidden.menuVisible=true;hidden.live=cms.pageContent(hidden);originals.push(structuredClone(hidden));s.pages.push(hidden);base[1].children!.push({id:'hidden-original',label:'Verborgen',href:`/clubmuur/${slug}`});
  assert.equal(cmsNavigation(base,s,originals).flatMap(group=>group.children||[]).some(link=>link.href===`/clubmuur/${slug}`),false);
  hidden.live!.slug='club/hernoemd-verborgen';hidden.slug=hidden.live!.slug;base[1].children!.push({id:'hidden-renamed',label:'Verborgen hernoemd',href:`/clubmuur/${hidden.live!.slug}`});
  assert.equal(cmsNavigation(base,s,originals).flatMap(group=>group.children||[]).some(link=>link.id.startsWith('hidden-')||link.id===`cms-${id}`),false);
 }
});

test('news featured changes affect homepage selection only at publication and preserve deliberate empty selection',()=>{
 const s=state(),a=article();a.featured=true;s.articles.push(a);assert.deepEqual(s.settings.homepageArticleIds,[]);
 cms.publishArticle(s,a.id);assert.deepEqual(s.settings.homepageArticleIds,[a.id]);
 s.settings.homepageArticleIds=[];a.title='Een bijgewerkte titel';cms.publishArticle(s,a.id);assert.deepEqual(s.settings.homepageArticleIds,[],'ordinary republication must preserve an intentionally empty homepage');
 a.featured=false;cms.publishArticle(s,a.id);a.featured=true;assert.deepEqual(s.settings.homepageArticleIds,[],'draft feature edits must not change the homepage');cms.publishArticle(s,a.id);assert.deepEqual(s.settings.homepageArticleIds,[a.id]);
 a.featured=false;cms.publishArticle(s,a.id);assert.deepEqual(s.settings.homepageArticleIds,[]);
});

test('changing news to a column stays isolated until publication, then moves the homepage selection and keeps the old link',()=>{
 const s=state(),a=article();a.featured=true;s.articles.push(a);cms.publishArticle(s,a.id);
 a.contentType='story';a.storyFormat='column';a.status='draft';
 assert.equal(a.live?.contentType,'news');assert.equal(a.live?.storyFormat,'story');
 assert.equal(cms.contentPath(a.live!),`nieuws/${a.slug}`);assert.deepEqual(s.settings.homepageArticleIds,[a.id]);assert.deepEqual(s.settings.homepageStoryIds,[]);
 assert.deepEqual(cms.publishArticle(s,a.id),[]);
 assert.equal(a.live?.contentType,'story');assert.equal(a.live?.storyFormat,'column');
 assert.deepEqual(s.settings.homepageArticleIds,[]);assert.deepEqual(s.settings.homepageStoryIds,[a.id]);
 assert.deepEqual(s.redirects,[{from:`nieuws/${a.slug}`,to:`verhalen/${a.slug}`}]);
 a.contentType='news';cms.publishArticle(s,a.id);
 assert.deepEqual(s.settings.homepageArticleIds,[a.id]);assert.deepEqual(s.settings.homepageStoryIds,[]);
 assert.deepEqual(s.redirects,[{from:`verhalen/${a.slug}`,to:`nieuws/${a.slug}`}]);
});

test('a news article and story can share a slug while each draft and live path stays reserved within its type',()=>{
 const s=state(),news=article('news','zaterdag'),story=article('story','zaterdag');story.contentType='story';story.storyFormat='column';s.articles.push(news,story);
 assert.deepEqual(cms.publishArticle(s,news.id),[]);assert.deepEqual(cms.publishArticle(s,story.id),[]);
 assert.equal(cms.contentPath(news.live!),'nieuws/zaterdag');assert.equal(cms.contentPath(story.live!),'verhalen/zaterdag');
 const duplicate=article('duplicate','zaterdag');s.articles.push(duplicate);assert.ok(cms.validateArticle(duplicate,s).some(e=>e.includes('al in gebruik')));
 duplicate.contentType='story';assert.ok(cms.validateArticle(duplicate,s).some(e=>e.includes('al in gebruik')));
 story.slug='volgende-zaterdag';assert.ok(cms.validateArticle(duplicate,s).some(e=>e.includes('al in gebruik')),'old live story path remains reserved');
 duplicate.slug='volgende-zaterdag';assert.ok(cms.validateArticle(duplicate,s).some(e=>e.includes('al in gebruik')),'working story path remains reserved');
 duplicate.contentType='news';assert.deepEqual(cms.validateArticle(duplicate,s),[]);
});

test('story homepage changes stay independent of the news selection and ordinary republication preserves deliberate removal',()=>{
 const s=state(),news=article('news'),story=article('story');story.contentType='story';news.featured=true;story.featured=true;s.articles.push(news,story);cms.publishArticle(s,news.id);cms.publishArticle(s,story.id);
 assert.deepEqual(s.settings.homepageArticleIds,[news.id]);assert.deepEqual(s.settings.homepageStoryIds,[story.id]);
 s.settings.homepageStoryIds=[];story.title='Aangepaste column';cms.publishArticle(s,story.id);
 assert.deepEqual(s.settings.homepageStoryIds,[]);assert.deepEqual(s.settings.homepageArticleIds,[news.id]);
});

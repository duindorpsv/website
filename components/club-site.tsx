'use client';
import {SponsorPublicPage} from './sponsor-public';
import {ArchiveProvider} from './club-archive-provider';
import {ClubArchivePage,ArchiveHomeWidget} from './club-archive';
import {siteText} from '@/lib/cms/site-copy';
import {PublicForm} from './cms/public-form';
import {useEffect,useRef,useState, type ReactNode} from 'react';
import {CalendarDays,Check,Clock,Heart,MapPin,Moon,Search,Shield,Sun,Trophy,Users,X,Plus,Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {teams,type Concept,type Article,type Team} from '@/lib/club-data';
import {useClubTheme,useDemoArticles} from '@/hooks/use-club';
import {ClubmuurContentPage} from '@/components/clubmuur-content-pages';
import {ClubHistoryPage} from '@/components/clubmuur-history-page';
import {SportlinkMatchDialog} from './sportlink-match-dialog';
import {SportlinkProvider,useSportlink} from '@/hooks/use-sportlink';
import {SportlinkTeamsPage,SportlinkMatchesPage} from '@/components/sportlink-pages';
import {type HeaderDesign} from '@/lib/clubmuur-config';
import {ClubmuurHero,ClubmuurMobileNav,ClubmuurHeader} from '@/components/clubmuur-home';
import {type HeroLayout,type HeroPhotoId} from '@/lib/clubmuur-layouts';
import {ClubmuurSectionArt} from '@/components/clubmuur-section-art';
import {ClubmuurCommunityCards} from '@/components/clubmuur-community-cards';
import {CmsProvider,useCMS} from '@/components/cms/provider';
import {CmsNewsIndex,CmsStoriesIndex,CmsArticleView,CmsPageView,CmsAlbumIndex,CmsAlbumView,CmsFeaturedPhotos,CmsFeaturedAlbums,CmsFeaturedStories} from '@/components/cms/public-content';
import {resolveCmsPath} from '@/lib/cms/public-adapters';
import {contentHref,contentPath as articlePath} from '@/lib/cms/content';
import {isClubContentPath} from '@/lib/clubmuur-page-routes';

type Actions={openArticle:(a:Article)=>void;openTeam:(t:Team)=>void;openJoin:()=>void;openMatch:()=>void};
export function Crest({className=''}:{className?:string}){return <img className={`club-crest ${className}`} src="/assets/logo.png" alt="Duindorp SV — origineel clubembleem" width="52" height="59"/>}
export function Brush({children,className=''}:{children:ReactNode;className?:string}){return <span className={`brush ${className}`}>{children}</span>}
export function ThemeSwitch({dark,toggle}:{dark:boolean;toggle:()=>void}){return <button type="button" className="theme-switch" onClick={toggle} aria-label={dark?'Lichtmodus inschakelen':'Donkermodus inschakelen'} aria-pressed={dark}>{dark?<Sun size={19}/>:<Moon size={19}/>}<span>{dark?'Licht':'Donker'}</span></button>}
function Kicker({children}:{children:ReactNode}){return <span className="kicker"><span/>{children}</span>}
function OpponentBadge({name='DH'}:{name?:string}){return <span className="opponent-badge" aria-label={name==='DH'?'Die Haghe (tekstbadge)':name}>{name}</span>}
function NewsCard({article,onOpen,index=0}:{article:Article;onOpen:()=>void;index?:number}){return <button className="news-card" onClick={onOpen}><div className="news-image"><img src={article.image} alt="" loading="lazy"/><span>{article.category}</span><span className="news-plus"><Plus size={23}/></span></div><div className="news-copy"><span className="news-meta">{article.date} <i/> {article.minutes} min lezen</span><h3>{article.title}</h3><p>{article.intro}</p><span className="news-read">Lees het verhaal</span></div></button>}
function Footer({openJoin}:{openJoin:()=>void}){const {state}=useCMS();return <footer className="site-footer"><div className="wrap footer-main"><div><a href={"/clubmuur"} className="club-brand"><Crest/><span>DUINDORP SV<small>{siteText(state,'footerTagline')}</small></span></a><p style={{whiteSpace:'pre-line'}}>{siteText(state,'footerIntro')}</p></div><div><h3>Op de club</h3><a href="/clubmuur/nieuws">Nieuws</a><a href="/clubmuur/verhalen">Verhalen & columns</a><a href={"/clubmuur/teams"}>Onze teams</a><a href={"/clubmuur/wedstrijden"}>Wedstrijdcentrum</a><button onClick={openJoin}>Lid worden</button><><a href="/clubmuur/club/tijdlijn">Clubarchief & tijdlijn</a><a href="/clubmuur/club/museum">Clubmuseum</a><a href="/clubmuur/club/bestuur">Bestuur & organisatie</a><a href="/clubmuur/club/commissies">Commissies</a></></div><div><h3>Hier vind je ons</h3><p style={{whiteSpace:'pre-line'}}>{siteText(state,'footerAddress')}</p><a href="https://www.google.com/maps/search/?api=1&query=Duindorp+SV+Houtrustlaan+1+Den+Haag" target="_blank" rel="noreferrer">Plan je route</a><><a href="/clubmuur/club/contact">Contact met de club</a><a href="/clubmuur/club/vertrouwenspersoon">Vertrouwenspersoon</a></></div><div className="footer-wordmark"><Brush>{siteText(state,'footerWordmark')}</Brush><span>{siteText(state,'footerPromise')}</span></div></div><div className="wrap footer-bottom"><span>© 2026 Duindorp SV</span><span>{siteText(state,'footerTagline')}</span></div></footer>}
function NewsPage({items,actions}:{items:Article[];actions:Actions}){const [query,setQuery]=useState('');const [category,setCategory]=useState('Alles');useEffect(()=>{const value=new URLSearchParams(window.location.search).get('categorie');if(value&&['Clubnieuws','Eerste elftal','Jeugd','Vereniging','Voetbal'].includes(value))setCategory(value);},[]);function selectCategory(value:string){setCategory(value);const url=new URL(window.location.href);if(value==='Alles')url.searchParams.delete('categorie');else url.searchParams.set('categorie',value);window.history.replaceState(null,'',url.pathname+url.search+url.hash);}const filtered=items.filter(a=>(category==='Alles'||a.category===category)&&`${a.title} ${a.intro}`.toLowerCase().includes(query.toLowerCase()));return <main className="inner-page wrap"><div className="inner-heading"><Kicker>HET VERHAAL VAN ONZE CLUB</Kicker><h1>NIEUWS &<br/><Brush>VERHALEN.</Brush></h1><p>Van de kleedkamer tot de kantine. Dit is Duindorp.</p></div><div className="listing-tools"><div className="filter-pills">{['Alles','Clubnieuws','Eerste elftal','Jeugd','Vereniging','Voetbal'].map(c=><button key={c} aria-pressed={category===c} onClick={()=>selectCategory(c)}>{c}</button>)}</div><label className="search-field"><Search size={18}/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Zoek een verhaal" aria-label="Zoek een nieuwsbericht"/>{query&&<button onClick={()=>setQuery('')} aria-label="Zoekveld leegmaken"><X size={16}/></button>}</label></div><p className="result-count" role="status">{filtered.length} {filtered.length===1?'verhaal':'verhalen'}</p><div className="news-grid">{filtered.map(a=><NewsCard key={a.id} article={a} onOpen={()=>actions.openArticle(a)}/>)}</div>{filtered.length===0&&<div className="empty-state"><Search/><h2>Even geen verhalen gevonden.</h2><p>Probeer een ander woord of bekijk al het nieuws.</p><Button className="btn btn-blue" onClick={()=>{setQuery('');selectCategory('Alles')}}>Toon alle verhalen</Button></div>}</main>}
function ClubPage({actions}:{actions:Actions}){return <main className="club-page"><div className="inner-heading wrap"><ClubmuurSectionArt scene="wijkpanorama"/><Kicker>SINDS 15 AUGUSTUS 1950</Kicker><h1>GEWORTELD IN<br/><Brush>DUINDORP.</Brush></h1><p>Een voetbalclub met het karakter van de wijk.</p></div><div className="club-story wrap"><img src="/assets/crest-close.webp" alt="Hand op het originele Duindorp-embleem op het wedstrijdshirt"/><div><span className="eyebrow">MEER DAN EEN EMBLEEM</span><h2>JE KIEST EEN CLUB.<br/>JE VINDT <Brush>EEN THUIS.</Brush></h2><p>Duindorp SV is voetbal, maar ook de mensen eromheen. De bekenden langs de lijn. De vrijwilligers die klaarstaan. De volgende generatie die voor het eerst onze kleuren draagt.</p><p>Op Sportpark Houtrust komen die verhalen samen. Met Haagse directheid, een Duindorps hart en plezier in het spel.</p><Button className="btn btn-blue" onClick={actions.openJoin}>Ontdek jouw plek</Button></div></div><div className="club-values wrap" id="clubwaarden"><div><span>01</span><h3>VOOR ELKAAR.</h3><p>Een club maken we samen. Met aandacht, inzet en ruimte voor iedereen.</p></div><div><span>02</span><h3>VOOR HET SPEL.</h3><p>Sportief, ambitieus en met plezier. Op het veld en langs de lijn.</p></div><div><span>03</span><h3>VOOR DUINDORP.</h3><p>Verbonden met onze wijk. Trots op waar we vandaan komen.</p></div></div><section className="visit-club wrap" id="bezoek"><div><span className="eyebrow">KOM EENS LANGS</span><h2>HIER IS<br/><Brush>HOUTRUST.</Brush></h2><p>Houtrustlaan 1<br/>2566 ZW Den Haag</p><a className="btn btn-blue" href="https://www.google.com/maps/search/?api=1&query=Duindorp+SV+Houtrustlaan+1+Den+Haag" target="_blank" rel="noreferrer"><MapPin size={17}/>Plan je route</a></div><div className="pitch-art"><div className="pitch-line"><span/><i/></div><Crest/><span className="pitch-name">SPORTPARK HOUTRUST</span></div></section></main>}
function ClubModals({article,team,match,join,closeArticle,closeTeam,closeMatch,closeJoin,openJoin}:{article:Article|null;team:Team|null;match:boolean;join:boolean;closeArticle:()=>void;closeTeam:()=>void;closeMatch:()=>void;closeJoin:()=>void;openJoin:()=>void}){const {data:sportlink}=useSportlink();const [kind,setKind]=useState('Spelen');useEffect(()=>{if(join)setKind('Spelen');},[join]);return <><Dialog open={!!article} onOpenChange={o=>!o&&closeArticle()}><DialogContent className="club-dialog article-dialog">{article&&<><img className="article-cover" src={article.image} alt=""/><div className="article-body"><DialogHeader><span className="eyebrow">{article.category} · {article.date}</span><DialogTitle>{article.title}</DialogTitle><DialogDescription>{article.intro}</DialogDescription></DialogHeader>{article.body.map((p,i)=><p key={i}>{p}</p>)}<div className="article-signoff"><Crest/><span>DUINDORP SV<small>ONZE WIJK. ONZE CLUB. ONZE TROTS.</small></span></div></div></>}</DialogContent></Dialog><Dialog open={!!team} onOpenChange={o=>!o&&closeTeam()}><DialogContent className="club-dialog team-dialog">{team&&<><div className="team-dialog-head"><Crest/><span className="eyebrow">{team.group}</span><DialogTitle>{team.name}</DialogTitle><DialogDescription>{team.description}</DialogDescription></div><div className="team-facts"><div><Clock/><span>Training<strong>{team.time}</strong></span></div><div><MapPin/><span>Locatie<strong>Houtrust · {team.field}</strong></span></div><div><Users/><span>Selectie<strong>{team.members} spelers</strong></span></div></div><div className="team-note"><b>Even kennismaken?</b><p>Kom de sfeer proeven bij een training. Neem contact op met de club voor een kennismaking.</p></div><Button className="btn btn-blue" onClick={()=>{closeTeam();openJoin()}}>Proeftraining aanvragen</Button></>}</DialogContent></Dialog><SportlinkMatchDialog match={match?sportlink?.nextMatch||null:null} onClose={closeMatch}/><Dialog open={join} onOpenChange={o=>!o&&closeJoin()}><DialogContent className="club-dialog join-dialog"><DialogHeader><span className="eyebrow">JOUW PLEK IS HIER</span><DialogTitle>Kom erbij.</DialogTitle><DialogDescription>Word lid of steun Duindorp SV als sponsor.</DialogDescription></DialogHeader><div className="join-options">{['Spelen','Sponsoren'].map((k,i)=><button key={k} onClick={()=>setKind(k)} aria-pressed={kind===k}>{i===0?<Trophy/>:<Shield/>}<span>{k}</span>{kind===k&&<Check/>}</button>)}</div><PublicForm key={kind} formId={kind==='Spelen'?'membership':'sponsorship'}/></DialogContent></Dialog></>}
type ClubSiteProps={archiveState?:import('@/lib/club-archive-types').ArchiveState;initialState?:import('@/lib/cms/types').CmsState;concept:Concept;section?:string;contentPath?:string;headerDesign?:HeaderDesign;heroLayout?:HeroLayout;heroPhoto?:HeroPhotoId;heroPreview?:boolean};
function CmsRoutedContent({path}:{path:string}){
 const {state,ready}=useCMS();const {data:sportlink}=useSportlink();
 if(path==='club/tijdlijn'||path.startsWith('club/tijdlijn/'))return <ClubArchivePage view="timeline" slug={path.split('/')[2]}/>;
 if(path==='club/museum'||path.startsWith('club/museum/'))return <ClubArchivePage view="museum" slug={path.split('/')[2]}/>;
 if(path.startsWith('nieuws/'))return <CmsArticleView slug={path.slice('nieuws/'.length)}/>;
 if(path==='nieuws')return <CmsNewsIndex/>;
 if(path==='verhalen')return <CmsStoriesIndex/>;
 if(path.startsWith('verhalen/'))return <CmsArticleView slug={path.slice('verhalen/'.length)} contentType="story"/>;
 if(path==='club/sponsoren'||path==='club/word-sponsor')return <SponsorPublicPage enquiry={path==='club/word-sponsor'}/>;
 if(path==='media/fotos')return <CmsAlbumIndex/>;
 if(path.startsWith('media/fotos/'))return <CmsAlbumView slug={path.slice('media/fotos/'.length)}/>;
 const record=state.pages.find(page=>page.live?.slug===path)||state.pages.find(page=>page.slug===path);
 if(record?.live&&!record.deletedAt&&record.live.slug===path)return <CmsPageView page={record.live}/>;
 if((!record||(!record.deletedAt&&record.live?.slug===path))&&isClubContentPath(path))return path==='club/ons-verhaal'?<ClubHistoryPage/>:<ClubmuurContentPage path={path}/>;
 return <main className="inner-page wrap"><div className="inner-heading"><span className="eyebrow">Duindorp SV</span><h1>{ready?'Pagina niet beschikbaar.':'Een ogenblik…'}</h1><p>{ready?'Deze pagina is nog niet gepubliceerd of is niet meer beschikbaar.':'We halen de pagina op.'}</p><a href="/clubmuur" className="btn btn-blue">Terug naar de club</a></div></main>;
}
function ClubSiteContent({section='home',contentPath,headerDesign='clubband',heroLayout='01',heroPhoto='01-trots',heroPreview=false}:ClubSiteProps){
 const {dark}=useClubTheme(false,true);
 const {state,ready}=useCMS();const {data:sportlink}=useSportlink();
 const items=useDemoArticles();
 const path=resolveCmsPath(state,contentPath||section);
 const [article,setArticle]=useState<Article|null>(null);
 const [team,setTeam]=useState<Team|null>(null);
 const [match,setMatch]=useState(false);
 const [join,setJoin]=useState(false);
 const actions:Actions={openArticle:item=>{const story=state.articles.find(row=>row.id===item.id&&!row.deletedAt&&row.live);if(story?.live)window.location.assign(contentHref(story.live));else setArticle(item);},openTeam:setTeam,openMatch:()=>sportlink?.nextMatch?setMatch(true):window.location.assign('/clubmuur/wedstrijden'),openJoin:()=>setJoin(true)};
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!ready)return;
  if(contentPath&&path!==contentPath)window.history.replaceState(null,'',`/clubmuur/${path}${window.location.search}${window.location.hash}`);
  const story=state.articles.find(a=>!a.deletedAt&&a.live&&articlePath(a.live)===path)?.live;
  const page=state.pages.find(p=>!p.deletedAt&&p.live?.slug===path)?.live;
  const content=story||page;
  if(!content)return;
  const previousTitle=document.title;document.title=`${content.seo.title||content.title} · ${state.settings.clubName}`;
  const changes=['description','robots'].map(name=>{const existing=document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);const meta=existing||document.createElement('meta');const previous=existing?.content;meta.name=name;meta.content=name==='robots'?(content.seo.noIndex?'noindex, nofollow':'index, follow'):(content.seo.description||content.intro);if(!existing)document.head.appendChild(meta);return()=>{if(existing)meta.content=previous||'';else meta.remove();};});
  return()=>{document.title=previousTitle;changes.forEach(restore=>restore());};
 },[ready,path,contentPath,state.articles,state.pages,state.settings.clubName]);
 useEffect(()=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const obs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');obs.unobserve(e.target)}}),{threshold:0.07});
  root.current?.querySelectorAll('.reveal').forEach(e=>{e.classList.add('will-reveal');obs.observe(e)});
  return()=>obs.disconnect();
 },[section,contentPath]);
 useEffect(()=>{
  const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:unknown)=>unknown}}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  try{Promise.resolve(context.registerTool({name:'open_duindorp_team',title:'Bekijk een Duindorp-team',description:'Bekijk onze teams.',inputSchema:{type:'object',properties:{teamId:{type:'string',enum:teams.map(t=>t.id)}},required:['teamId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{const id=(input as {teamId?:unknown})?.teamId;const t=teams.find(t=>t.id===id);if(!t)throw new Error('Onbekend team. Gebruik een teamId uit het schema.');setTeam(t);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {opened:true,team:t.name,demo:true};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
 },[]);
 return <div ref={root} className="club-site concept-clubmuur" data-theme={dark?'dark':'light'}>
  <a className="skip-link" href="#main-content">Naar de inhoud</a>
  <ClubmuurHeader variant={headerDesign} section={section==='verhalen'?'nieuws':section} openJoin={actions.openJoin}/>
  <div id="main-content">{contentPath?<CmsRoutedContent path={path}/>:section==='home'?<main>
   <ClubmuurHero actions={actions} items={items} layout={heroLayout} photo={heroPhoto} preview={heroPreview}/>
   <CmsFeaturedPhotos/>
   <ClubmuurCommunityCards items={items} onOpen={actions.openArticle} articleOpen={!!article}/>
   <CmsFeaturedStories/>
   <ArchiveHomeWidget/>
   <CmsFeaturedAlbums/>
  </main>:section==='nieuws'?<CmsNewsIndex/>:section==='verhalen'?<CmsStoriesIndex/>:section==='teams'?<SportlinkTeamsPage/>:section==='wedstrijden'?<SportlinkMatchesPage/>:<ClubPage actions={actions}/>}</div>
  <Footer openJoin={actions.openJoin}/>
  <ClubmuurMobileNav section={section==='verhalen'?'nieuws':section}/>
  <ClubModals article={article} team={team} match={match} join={join} closeArticle={()=>setArticle(null)} closeTeam={()=>setTeam(null)} closeMatch={()=>setMatch(false)} closeJoin={()=>setJoin(false)} openJoin={actions.openJoin}/>
 </div>;
}
export function ClubSite(props:ClubSiteProps){return <CmsProvider initialState={props.initialState}><SportlinkProvider><ArchiveProvider initialState={props.archiveState} enabled={(props.section||'home')==='home'||/^club\/(tijdlijn|museum)(?:\/|$)/.test(props.contentPath||'')}><ClubSiteContent {...props}/></ArchiveProvider></SportlinkProvider></CmsProvider>}

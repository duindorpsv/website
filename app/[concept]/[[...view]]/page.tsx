import {cache} from 'react';
import {archiveResolve} from '@/lib/server/club-archive';
import {loadPublicState,loadPublicArchive} from '@/lib/server/public-content';
const publicState=cache(loadPublicState),publicArchive=cache(loadPublicArchive),archiveItem=cache(archiveResolve);
import {sqlClient} from '@/db';
import {permanentRedirect} from 'next/navigation';
export const dynamic='force-dynamic';
import {isClubContentPath,isClubPagePath,isCmsDynamicPath,clubPathFromSegments,clubPageGroup,clubContentTitles} from '@/lib/clubmuur-page-routes';
import {resolveHeader} from '@/lib/clubmuur-config';
import { notFound, redirect } from 'next/navigation';
import { ClubSite } from '@/components/club-site';
import {cookies} from 'next/headers';
import {HERO_VISIT_COOKIE,HERO_PHOTO_COOKIE,pickHeroLayout,pickHeroPhoto,resolveHeroLayout,resolveHeroPhoto} from '@/lib/clubmuur-layouts';
import {getHeroSelection} from '@/lib/cms/hero-portraits';
export async function generateMetadata({params}:{params:Promise<{concept:string;view?:string[]}>}){
 const {concept,view}=await params;if(concept!=='clubmuur')return {};
 const path=clubPathFromSegments(view)||'home';const {state}=await publicState();
 const article=state.articles.find(a=>a.live&&`${a.live.contentType==='story'?'verhalen':'nieuws'}/${a.live.slug}`===path)?.live;
 const page=state.pages.find(p=>p.live?.slug===path)?.live;
 const archiveMatch=/^club\/(tijdlijn|museum)\/([^/]+)$/.exec(path),archive=archiveMatch?await archiveItem(archiveMatch[1]==='museum'?'object':'moment',archiveMatch[2]):null;
 const live=article||page;const title=archive?.title||live?.seo.title||live?.title||clubContentTitles[path]||(path.startsWith('teams/')?'Teaminformatie':'Onze Trots');
 const description=archive?.intro||live?.seo.description||live?.intro||state.settings.siteDescription;
 const canonical=new URL(path==='home'?'/clubmuur':`/clubmuur/${path}`,process.env.APP_BASE_URL||'http://localhost:3000').href;
 return {title:`${title} · Duindorp SV`,description,alternates:{canonical},openGraph:{title,description,url:canonical,type:article?'article':'website'},robots:{index:process.env.APP_ENV==='production'&&!live?.seo.noIndex,follow:process.env.APP_ENV==='production'}};
}
export default async function Page({ params,searchParams }: { params: Promise<{concept:string;view?:string[]}>;searchParams:Promise<{header?:string;hero?:string;photo?:string}> }) {
 const {concept,view}=await params;
 const path=clubPathFromSegments(view);
 if(path===null)notFound();
 const query=await searchParams;
 if(concept==='clubmuur'){const [alias]=await sqlClient()`select to_path from cms_redirects where from_path=${path==='home'?'/clubmuur':`/clubmuur/${path}`}`;if(alias)permanentRedirect(alias.to_path);}
 if(['v-line','clubhouse','floodlight','terrace'].includes(concept)){
  const destination=isClubPagePath(path)&&path!=='home'?`/clubmuur/${path.split('/').map(encodeURIComponent).join('/')}`:'/clubmuur';
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query)){if(typeof value==='string'&&!['header','hero','photo'].includes(key))params.set(key,value);}
  redirect(`${destination}${params.size?`?${params}`:''}`);
 }
 if(concept!=='clubmuur')notFound();
 const archivePath=/^club\/(tijdlijn|museum)(?:\/|$)/.test(path);
 let archiveState;
 if(archivePath||path==='home'){archiveState=await publicArchive();if(path.split('/').length===3){const item=await archiveItem(path.startsWith('club/museum')?'object':'moment',path.split('/')[2]);if(!item)notFound();if(item.slug!==path.split('/')[2])permanentRedirect('/clubmuur/'+(path.startsWith('club/museum')?'club/museum/':'club/tijdlijn/')+item.slug);}}
 const {state}=await publicState();
 const known=state.pages.some(p=>p.live?.slug===path)||state.articles.some(a=>a.live&&`${a.live.contentType==='story'?'verhalen':'nieuws'}/${a.live.slug}`===path)||state.albums.some(a=>`media/fotos/${a.slug}`===path);
 if(!isClubPagePath(path)&&!known)notFound();
 if(/^(nieuws|verhalen)\//.test(path)&&!known)notFound();
 const [reserved]=await sqlClient()`select live,deleted_at from cms_records where module='pages' and (slug=${path} or live->>'slug'=${path}) limit 1`;if(reserved&&(!reserved.live||reserved.deleted_at))notFound();
 const contentPage=isClubContentPath(path)||(!['home','nieuws','verhalen','teams','wedstrijden'].includes(path)&&isCmsDynamicPath(path));
 const section=contentPage?clubPageGroup(path):path;
 const headerDesign=resolveHeader(query.header);
 const {enabled,catalog}=getHeroSelection(state.appearance,state.media);
 const heroPreview=resolveHeroLayout(query.hero);
 const visit=concept==='clubmuur'&&section==='home'?await cookies():null;
 const heroLayout=pickHeroLayout(heroPreview??visit?.get(HERO_VISIT_COOKIE)?.value,Math.random(),enabled,catalog);
 const photoPreview=resolveHeroPhoto(query.photo,heroLayout,enabled,catalog);
 const heroPhoto=photoPreview??pickHeroPhoto(heroLayout,heroPreview?undefined:visit?.get(HERO_PHOTO_COOKIE)?.value,Math.random(),enabled,catalog);
 return <ClubSite archiveState={archiveState} key={`${concept}-${path}`} concept="clubmuur" initialState={state} section={section} contentPath={contentPage?path:undefined} headerDesign={headerDesign} heroLayout={heroLayout} heroPhoto={heroPhoto} heroPreview={!!heroPreview||!!photoPreview}/>;
}

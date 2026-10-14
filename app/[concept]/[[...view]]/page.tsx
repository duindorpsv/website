import {isClubContentPath,isClubPagePath,isCmsDynamicPath,clubPathFromSegments,clubPageGroup,clubContentTitles} from '@/lib/clubmuur-page-routes';
import {resolveHeader} from '@/lib/clubmuur-config';
import { notFound, redirect } from 'next/navigation';
import { ClubSite } from '@/components/club-site';
import {cookies} from 'next/headers';
import {HERO_VISIT_COOKIE,HERO_PHOTO_COOKIE,pickHeroLayout,pickHeroPhoto,resolveHeroLayout,resolveHeroPhoto} from '@/lib/clubmuur-layouts';
export async function generateMetadata({params}:{params:Promise<{concept:string;view?:string[]}>}){
 const {concept,view}=await params;
 if(concept!=='clubmuur')return {};
 const path=clubPathFromSegments(view)||'home';
 const title=clubContentTitles[path]||(path.startsWith('teams/')?'Teaminformatie':path.startsWith('verhalen/')?'Verhalen & columns':path.startsWith('nieuws/')?'Nieuws':'Onze Trots');
 return {title:`${title} · Duindorp SV`,description:'Onze wijk. Onze club. Onze trots. Ontdek de mensen, teams en verhalen van Duindorp SV en vind alle praktische club- en wedstrijdinformatie.'};
}
export default async function Page({ params,searchParams }: { params: Promise<{concept:string;view?:string[]}>;searchParams:Promise<{header?:string;hero?:string;photo?:string}> }) {
 const {concept,view}=await params;
 const path=clubPathFromSegments(view);
 if(path===null)notFound();
 const query=await searchParams;
 if(['v-line','clubhouse','floodlight','terrace'].includes(concept)){
  const destination=isClubPagePath(path)&&path!=='home'?`/clubmuur/${path.split('/').map(encodeURIComponent).join('/')}`:'/clubmuur';
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query)){if(typeof value==='string'&&!['header','hero','photo'].includes(key))params.set(key,value);}
  redirect(`${destination}${params.size?`?${params}`:''}`);
 }
 if(concept!=='clubmuur'||(!isClubPagePath(path)&&!isCmsDynamicPath(path)))notFound();
 const contentPage=isClubContentPath(path)||(!['home','nieuws','verhalen','teams','wedstrijden'].includes(path)&&isCmsDynamicPath(path));
 const section=contentPage?clubPageGroup(path):path;
 const headerDesign=resolveHeader(query.header);
 const heroPreview=resolveHeroLayout(query.hero);
 const visit=concept==='clubmuur'&&section==='home'?await cookies():null;
 const heroLayout=visit?(heroPreview??pickHeroLayout(visit.get(HERO_VISIT_COOKIE)?.value)):'01';
 const photoPreview=resolveHeroPhoto(query.photo,heroLayout);
 const heroPhoto=photoPreview??pickHeroPhoto(heroLayout,heroPreview?undefined:visit?.get(HERO_PHOTO_COOKIE)?.value);
 return <ClubSite key={`${concept}-${path}`} concept="clubmuur" section={section} contentPath={contentPage?path:undefined} headerDesign={headerDesign} heroLayout={heroLayout} heroPhoto={heroPhoto} heroPreview={!!heroPreview||!!photoPreview}/>;
}

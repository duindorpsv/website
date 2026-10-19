'use client';

import {ArrowUpRight} from 'lucide-react';
import {ClubPageFrame,PageLinkCard,PageSectionHeading} from '@/components/clubmuur-page-kit';
import {OrganisationPage} from '@/components/clubmuur-organisation-pages';
import {ClubInfoPage} from '@/components/clubmuur-info-pages';
import {ClubTeamDetailPage,ClubTrainingPage,ClubWalkingPage} from '@/components/clubmuur-team-pages';
import {ClubMatchInfoPage,ClubMediaPage} from '@/components/clubmuur-extra-pages';
import {ClubPlaceholderPage,isPlaceholderPage} from '@/components/clubmuur-placeholder-page';
import {ClubVolunteerStory} from '@/components/clubmuur-volunteer-story';

function ClubHubPage(){return <ClubPageFrame group="club" kicker="MEER DAN EEN CLUB · SINDS 1950" title="Dit is" accent="onze club." intro="Een plek om te voetballen, elkaar te ontmoeten en samen iets op te bouwen. Ontdek de mensen, de verhalen en alles wat je wilt weten over Duindorp SV." image="/assets/club-life-v28/supporters-1280.webp">
 <section><PageSectionHeading eyebrow="WEET WAAR JE MOET ZIJN" title="Samen houden we de club draaiende." description="Een aanspreekpunt voor elke vraag. Maak kennis met de mensen achter de vereniging."/><div className="cp-grid cp-grid-3"><PageLinkCard number="01" href="/clubmuur/club/bestuur" title="Het bestuur" description="De mensen en verantwoordelijkheden achter de koers van onze vereniging."/><PageLinkCard number="02" href="/clubmuur/club/commissies" title="Onze commissies" description="Van voetbalzaken tot de kantine. Ontdek wie zich waarvoor inzet."/><PageLinkCard number="03" href="/clubmuur/club/jeugdorganisatie" title="Voor onze jeugd" description="Jeugdbestuur, begeleiding en het juiste aanspreekpunt voor spelers en ouders."/></div></section>
 <section className="cp-hub-banner"><div><span className="cp-kicker">HIER KOMEN ONZE VERHALEN SAMEN</span><h2>Geworteld in de wijk.<br/>Trots op onze club.</h2><p>Van die eerste bal tot de gesprekken langs de lijn. Ons clubgevoel gaat verder dan negentig minuten.</p><a className="cp-button-secondary" href="/clubmuur/club/ons-verhaal">Lees ons verhaal <ArrowUpRight size={17}/></a></div><img src="/assets/club-life-v28/canteen-1280.webp" alt="vrijwilligers in een clubkantine" loading="lazy"/></section>
 <section><PageSectionHeading eyebrow="PRAKTISCH & DICHTBIJ" title="Alles voor jouw clubleven."/><div className="cp-grid cp-grid-3"><PageLinkCard href="/clubmuur/club/lidmaatschap" title="Lidmaatschap" description="Lid worden, contributie, kleding en wijzigingen in je lidmaatschap."/><PageLinkCard href="/clubmuur/club/accommodatie" title="Op bezoek" description="De route naar Houtrust, onze accommodatie en praktische bezoekersinformatie."/><PageLinkCard href="/clubmuur/club/vrijwilligers" title="Jouw uurtje telt" description="Vind een taak die bij je past en ontdek hoe jij mee kunt helpen."/><PageLinkCard href="/clubmuur/club/clubwaarden" title="Zo doen wij dat" description="Sportiviteit, respect en een fijne plek voor iedereen op en rond het veld."/><PageLinkCard href="/clubmuur/club/documenten" title="Clubdocumenten" description="Een overzichtelijke plek voor afspraken, reglementen en clubinformatie."/><PageLinkCard href="/clubmuur/club/contact" title="Kom in contact" description="Stel je vraag aan het juiste onderdeel van de vereniging."/></div></section>
 <div className="cp-panel cp-prose"><h3>Een veilige club maken we samen.</h3><p>Zit je ergens mee? Op de pagina van de vertrouwenspersoon lees je waar je terechtkunt en hoe we dit aanspreekpunt zichtbaar maken.</p><div className="cp-actions"><a className="cp-button-secondary" href="/clubmuur/club/vertrouwenspersoon">Naar de vertrouwenspersoon <ArrowUpRight size={16}/></a></div></div>
 </ClubPageFrame>;}

export function ClubmuurContentPage({path}:{path:string}){
 if(path==='club/vrijwilligers')return <ClubVolunteerStory/>;
 if(path==='club')return <ClubHubPage/>;
 const [group,kind]=path.split('/');
 if(group==='club'&&['bestuur','commissies','jeugdorganisatie','vertrouwenspersoon'].includes(kind))return <OrganisationPage kind={kind as 'bestuur'|'commissies'|'jeugdorganisatie'|'vertrouwenspersoon'}/>;
 if(group==='club')return <ClubInfoPage kind={kind}/>;
 if(group==='teams'){if(kind==='trainingen')return <ClubTrainingPage/>;if(kind==='walking-football')return <ClubWalkingPage/>;return <ClubTeamDetailPage teamId={decodeURIComponent(kind)}/>;}
 if(group==='wedstrijden')return <ClubMatchInfoPage kind={kind==='informatie'?'wedstrijdinformatie':kind as 'afgelastingen'|'oefenwedstrijd'}/>;
 return <ClubMediaPage kind={kind as 'fotos'|'club-tv'|'nieuwsbrief'}/>;
}

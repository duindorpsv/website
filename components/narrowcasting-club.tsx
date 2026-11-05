'use client';
import {useCMS} from './cms/provider';
type ClubScreenProps = { kind: string; portrait: boolean };

const sponsors = [
  { name: 'BNU', image: 'bnu.svg', className: 'nk-logo-square' },
  { name: 'Kwaliteit Kozijnen Holland', image: 'kwaliteit-kozijnen-holland.svg', className: '' },
  { name: 'Proto Tegelzetbedrijf', image: 'proto-tegelzetbedrijf.svg', className: '' },
  { name: 'Deelman Daktechniek', image: 'deelman-daktechniek.svg', className: '' },
  { name: 'RW Repair', image: 'rw-repair.png', className: 'nk-logo-square' },
  { name: 'DG Webservices', image: 'dg-webservices.svg', className: 'nk-logo-dg' },
];

function CanteenScreen(){return <><div className="nk-heading nk-menu-heading"><div><span className="nk-eyebrow">WELKOM IN DE KANTINE</span><h1>De koffie <em>staat klaar.</em></h1></div></div><div className="nk-menu-combo"><h2>Vraag aan de bar naar het actuele assortiment en de prijzen.</h2></div></>;}

function NewsScreen(){const {state}=useCMS();const articles=state.articles.filter(a=>a.live?.contentType==='news'&&!a.deletedAt).slice(0,3);return <><div className="nk-heading nk-news-heading"><h1>Club<em>nieuws.</em></h1></div><div className="nk-news-layout">{articles.length?articles.map(a=><article key={a.id}><h2>{a.live!.title}</h2><p>{a.live!.intro}</p></article>):<p>Er zijn nog geen gepubliceerde nieuwsberichten.</p>}</div></>;}

function PartnersScreen() {
  return <>
    <div className="nk-heading nk-partner-heading"><div><span className="nk-eyebrow">PARTNERS VAN DUINDORP SV</span><h1>Onze<br className="nk-portrait-break"/> <em>partners.</em></h1></div><span className="nk-partner-heart" aria-hidden="true">♡</span></div>
    <div className="nk-partner-grid">{sponsors.map(sponsor => <div className="nk-partner-tile" key={sponsor.name}><img className={sponsor.className} src={`/assets/sponsors/${sponsor.image}`} alt={sponsor.name}/></div>)}</div>
    <div className="nk-partner-thanks"><span className="nk-thanks-rule"/><p>Onze Club. Onze Trots.</p><b>DUINDORP SV</b></div>
  </>;
}

function WelcomeScreen() {
  return <>
    <div className="nk-welcome-wordmark" role="img" aria-label="OnzeTrots"/>
    <div className="nk-welcome-copy"><span className="nk-eyebrow">WELKOM OP HOUTRUST</span><h1>Onze Club.<br/><em>Onze Trots.</em></h1><p>Welkom bij Duindorp SV<br/>op Sportpark Houtrust.</p></div>
    <div className="nk-welcome-halo" aria-hidden="true"/>
    <span className="nk-welcome-year" aria-hidden="true">1950</span>
    <img className="nk-welcome-players" src="/assets/clubmuur-players/trio-1280.webp" alt="Drie spelers van Duindorp SV"/>
    <div className="nk-welcome-values"><div><span>01</span><b>Respecteer spelers en bezoekers.</b></div><div><span>02</span><b>Volg aanwijzingen van vrijwilligers.</b></div><div><span>03</span><b>Laat je plek schoon achter.</b></div></div>
  </>;
}

export function ClubScreen({ kind, portrait }: ClubScreenProps) {
  return <div className={`nk-club-screen nk-${kind}${portrait ? ' nk-portrait' : ''}`}>
    {kind === 'kantine' ? <CanteenScreen/> : kind === 'clubnieuws' ? <NewsScreen/> : kind === 'partners' ? <PartnersScreen/> : <WelcomeScreen/>}
  </div>;
}

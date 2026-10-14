type ClubScreenProps = { kind: string; portrait: boolean };

const menu = [
  { tag: '01', title: 'Koffie & thee', note: 'Voorbeeldprijzen per consumptie.', items: [['Koffie', '€ 2,20'], ['Cappuccino', '€ 2,50'], ['Thee', '€ 2,00'], ['Warme chocolademelk', '€ 2,75']] },
  { tag: '02', title: 'Frisdranken', note: 'Voorbeeldprijzen per consumptie.', items: [['Frisdrank', '€ 2,50'], ['Water', '€ 2,00'], ['Sportdrank', '€ 2,75'], ['Vruchtensap', '€ 2,50']] },
  { tag: '03', title: "Tosti’s & snacks", note: 'Voorbeeldassortiment van de kantine.', items: [['Tosti kaas', '€ 3,00'], ['Tosti ham-kaas', '€ 3,50'], ['Broodje kroket', '€ 3,25'], ['Portie patat', '€ 3,00']] },
];

const sponsors = [
  { name: 'BNU', image: 'bnu.svg', className: 'nk-logo-square' },
  { name: 'Kwaliteit Kozijnen Holland', image: 'kwaliteit-kozijnen-holland.svg', className: '' },
  { name: 'Proto Tegelzetbedrijf', image: 'proto-tegelzetbedrijf.svg', className: '' },
  { name: 'Deelman Daktechniek', image: 'deelman-daktechniek.svg', className: '' },
  { name: 'RW Repair', image: 'rw-repair.png', className: 'nk-logo-square' },
  { name: 'DG Webservices', image: 'dg-webservices.svg', className: 'nk-logo-dg' },
];

function CanteenScreen() {
  return <>
    <div className="nk-heading nk-menu-heading"><div><span className="nk-eyebrow">PRIJSLIJST KANTINE</span><h1>Onze <em>kantine.</em></h1></div><span className="nk-demo-pill">Voorbeeldprijzen</span></div>
    <div className="nk-menu-grid">{menu.map(category => <section className="nk-menu-card" key={category.tag}>
      <div className="nk-menu-category"><span>{category.tag}</span><h2>{category.title}</h2></div>
      <div className="nk-menu-items">{category.items.map(([name, price]) => <div className="nk-menu-item" key={name}><span>{name}</span><b>{price}</b></div>)}</div>
      <p className="nk-menu-note">{category.note}</p>
    </section>)}</div>
    <div className="nk-menu-combo"><div className="nk-combo-icon" aria-hidden="true"><svg viewBox="0 0 80 80"><path d="M17 29h40v25a15 15 0 0 1-15 15H32a15 15 0 0 1-15-15V29Zm40 5h6a10 10 0 0 1 0 20h-6M10 72h55M28 20V9m14 11V9"/></svg></div><div><span className="nk-eyebrow">VOORBEELDCOMBI</span><h2>Koffie + tosti ham-kaas</h2></div><strong>€ 5,00</strong><span className="nk-combo-caption">Voorbeeldprijs voor<br/> koffie en tosti.</span></div>
  </>;
}

function NewsScreen() {
  return <>
    <div className="nk-heading nk-news-heading"><div><span className="nk-eyebrow">BERICHTEN VAN DUINDORP SV</span><h1>Club<em>nieuws.</em></h1></div><span className="nk-header-label">TRAININGEN · VRIJWILLIGERS · JEUGD</span></div>
    <div className="nk-news-layout">
      <section className="nk-walking-feature">
        <span className="nk-feature-kicker">NIEUW BIJ DUINDORP SV</span>
        <h2>Walking<br/><em>Football.</em></h2>
        <p>Voetbal in wandeltempo.<br/>Eerste training: 27 oktober 2026.</p>
        <div className="nk-training-date"><strong>27</strong><div><span>OKTOBER 2026</span><b>Eerste training</b></div></div>
        <span className="nk-walking-word" aria-hidden="true">WALKING</span>
        <img className="nk-walking-people" src="/assets/clubmuur-portraits-v14/07-walking-1280.webp" alt="Het Walking Football-team van Duindorp SV"/>
        <div className="nk-walking-foot">Onze Club. Onze Trots.</div>
      </section>
      <div className="nk-notice-stack">
        <section className="nk-club-notice nk-volunteer"><span className="nk-notice-index">01 / VRIJWILLIGERS</span><svg className="nk-notice-symbol" viewBox="0 0 80 80" aria-hidden="true"><path d="M40 67S9 47 9 26c0-17 23-22 31-6 8-16 31-11 31 6 0 21-31 41-31 41Z"/></svg><h2>Vrijwilligers<br/>bij de club.</h2><p>Vraag bij de club naar<br/>de mogelijkheden om te helpen.</p><b>Voorbeeld van een vrijwilligersbericht.</b></section>
        <section className="nk-club-notice nk-support"><span className="nk-notice-index">02 / LANGS DE LIJN</span><h2>Jeugd &<br/>supporters.</h2><p>Respecteer spelers,<br/>scheidsrechters en begeleiding.</p><span className="nk-notice-demo">Voorbeelden van clubberichten</span></section>
      </div>
    </div>
  </>;
}

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

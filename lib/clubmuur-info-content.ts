export const clubContactSubjects = [
  { id: 'algemeen', label: 'Een algemene vraag', department: 'Secretariaat', hint: 'Voor clubzaken en vragen die je niet direct ergens anders kwijt kunt.' },
  { id: 'lidmaatschap', label: 'Lid worden of lidmaatschap', department: 'Ledenadministratie', hint: 'Voor kennismaken, aanmelden, contributie en wijzigingen in je lidmaatschap.' },
  { id: 'teams', label: 'Een team of training', department: 'Team- en jeugdcoördinatie', hint: 'Vermeld het team of de leeftijdscategorie, zodat je vraag goed terechtkomt.' },
  { id: 'walking-football', label: 'Walking Football', department: 'Walking Football', hint: 'Vertel of je wilt kennismaken, meetrainen of een praktische vraag hebt.' },
  { id: 'bestuur', label: 'Een vraag aan het bestuur', department: 'Bestuur', hint: 'Voor verenigingszaken, een idee voor de club of een vraag over de organisatie.' },
  { id: 'commissies', label: 'Een vraag aan een commissie', department: 'Commissies', hint: 'Vermeld welke commissie of welk onderwerp je zoekt.' },
  { id: 'wedstrijdzaken', label: 'Een wedstrijd', department: 'Wedstrijdzaken', hint: 'Vermeld de teams en de wedstrijddatum. Een wijziging is pas definitief na bevestiging.' },
  { id: 'vrijwilligers', label: 'Ik wil iets betekenen', department: 'Vrijwilligerscoördinatie', hint: 'Vertel wat je leuk vindt en wanneer je zou kunnen helpen.' },
  { id: 'accommodatie', label: 'Houtrust of de accommodatie', department: 'Accommodatiezaken', hint: 'Voor een bezoek, een praktische vraag of iets dat aandacht nodig heeft op het sportpark.' },
  { id: 'media', label: 'Nieuws, foto’s of sponsoring', department: 'Communicatie & sponsoring', hint: 'Voor een clubverhaal, een mooie samenwerking of een vraag over een publicatie.' },
] as const;

export const clubMembershipFees = [
  { category: 'Mini’s', fee: '€ 50' },
  { category: 'Jeugd t/m O12', fee: '€ 150' },
  { category: 'Jeugd O13 t/m O19', fee: '€ 185' },
  { category: 'Senioren', fee: '€ 300' },
  { category: 'Niet-spelende leden', fee: '€ 80' },
] as const;

export const clubVolunteerRoles = [
  { id: 'kantine', title: 'Een warm welkom.', label: 'Kantine & gastvrijheid', time: 'In overleg', description: 'Een kop koffie, een praatje en een plek waar iedereen zich welkom voelt. Help mee achter de bar of bij een clubmoment.', tasks: ['Gasten ontvangen en de kantine gastvrij houden', 'Samen met een ervaren vrijwilliger aan de slag', 'Een passende dag en inzet afspreken'] },
  { id: 'jeugd', title: 'Grote kleine stappen.', label: 'Jeugd & begeleiding', time: 'Rond een team', description: 'Beteken iets voor de volgende generatie. Van helpen bij een training tot een activiteit voor de jeugd.', tasks: ['Ondersteunen bij een training of teamactiviteit', 'Kinderen een fijne en sportieve omgeving bieden', 'Met de jeugdcoördinatie bespreken wat bij je past'] },
  { id: 'sportpark', title: 'Trots op onze plek.', label: 'Sportpark & materialen', time: 'Kleine klussen', description: 'Houtrust is van ons allemaal. Met handige handen en aandacht voor materialen maken we het verschil.', tasks: ['Helpen met een praktische klus of opruimronde', 'Materialen samen klaarzetten en verzorgen', 'Vooraf afstemmen wat veilig en nodig is'] },
  { id: 'organisatie', title: 'Achter de schermen.', label: 'Organisatie & media', time: 'Ook flexibel', description: 'Hou je van regelen, schrijven of fotograferen? Ook buiten het veld kun je een grote bijdrage leveren.', tasks: ['Meedenken over een activiteit of clubverhaal', 'Helpen met organisatie, foto’s of communicatie', 'Je talent inzetten op een manier die past'] },
] as const;

export const clubDocumentTopics = [
  { id: 'statuten', category: 'De vereniging', title: 'Statuten', description: 'De formele basis van de vereniging.', summary: 'Hier hoort de actuele, vastgestelde versie van de statuten. Dit document beschrijft onder meer het doel van de vereniging, het lidmaatschap en de inrichting van bestuur en algemene ledenvergadering.' },
  { id: 'huisreglement', category: 'Samen op de club', title: 'Huisreglement', description: 'Afspraken voor een fijne clubomgeving.', summary: 'Hier komt het door de vereniging vastgestelde huisreglement. Alleen de definitieve versie hoort als download beschikbaar te zijn, met een duidelijke datum en versienummer.' },
  { id: 'gedragscode', category: 'Samen op de club', title: 'Normen & waarden', description: 'Hoe we met elkaar en met het spel omgaan.', summary: 'De clubwaarden zijn alvast leesbaar op deze website. Een officiële, vastgestelde gedragscode kan hier worden toegevoegd zodra die beschikbaar is voor publicatie.' },
  { id: 'contributie', category: 'Lidmaatschap', title: 'Contributie & lidmaatschap', description: 'Actuele bedragen en lidmaatschapsafspraken.', summary: 'Hier komen de officiële contributietarieven, betaalinformatie en afspraken rond aan- en afmelden. Er staan in de website geen onbevestigde bedragen of termijnen.' },
  { id: 'privacy', category: 'Privacy & veiligheid', title: 'Privacy & beeldgebruik', description: 'Zorgvuldig omgaan met gegevens en beelden.', summary: 'Hier hoort de actuele privacyverklaring van de vereniging, met informatie over gegevensverwerking, foto’s en contact voor privacyvragen. De definitieve verklaring is nog niet aan de website toegevoegd.' },
  { id: 'kunstgras', category: 'Sportpark', title: 'Gebruik van velden & kunstgras', description: 'Afspraken om onze velden mooi te houden.', summary: 'Hier kan de actuele veld- en kunstgrasinstructie worden gepubliceerd. Volg bij een bezoek de aanwijzingen op het sportpark en de instructies van de vereniging.' },
] as const;

export const clubInfoPageMeta: Record<string, { title: string; accent: string; kicker: string; intro: string; image?: string }> = {
  accommodatie: { title: 'HIER IS', accent: 'HOUTRUST.', kicker: 'ONZE PLEK IN DE WIJK', intro: 'De weg naar de club. En alles wat je wilt weten voordat je langskomt.', image: '/assets/clubmuur-brush-v25/houtrust-wide-1280.webp' },
  lidmaatschap: { title: 'JOUW PLEK', accent: 'IS HIER.', kicker: 'LIDMAATSCHAP', intro: 'Voor de eerste training, je volgende seizoen en alles daaromheen.', image: '/assets/clubmuur-brush-v25/de-wijk-wide-1280.webp' },
  vrijwilligers: { title: 'JOUW UURTJE', accent: 'TELT.', kicker: 'VRIJWILLIGERS', intro: 'Grote clubtrots begint vaak met een klein gebaar. Ontdek wat bij jou past.', image: '/assets/clubmuur-brush-v25/houtrust-wide-1280.webp' },
  clubwaarden: { title: 'ZO ZIJN', accent: 'WIJ.', kicker: 'ONZE CLUBWAARDEN', intro: 'Met plezier in het spel, respect voor elkaar en een Duindorps hart.', image: '/assets/clubmuur-brush-v25/de-wijk-wide-1280.webp' },
  documenten: { title: 'HELDER', accent: 'AFGESPROKEN.', kicker: 'CLUBDOCUMENTEN', intro: 'De afspraken en informatie van onze vereniging op één overzichtelijke plek.' },
  contact: { title: 'KORTE', accent: 'LIJNEN.', kicker: 'CONTACT MET DE CLUB', intro: 'Een vraag, een idee of gewoon even kennismaken? Begin bij het juiste onderwerp.', image: '/assets/clubmuur-brush-v25/houtrust-wide-1280.webp' },
};

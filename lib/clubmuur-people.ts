/** Organisation content model. Publish names and portraits only after club verification. */
export type ClubPerson = {
  id: string;
  role: string;
  department: string;
  summary: string;
  responsibilities: string[];
  name?: string;
  portrait?: string;
  contact?: string;
  email?: string;
  phone?: string;
};

export const clubBoardContacts={
  secretariatEmail:'secretariaat@duindorpsv.nl',
  chairmanEmail:'danny.goldenbelt@duindorpsv.nl',
  chairmanPhone:'0659019035',
};

export const boardPeople: ClubPerson[] = [
  { id: 'voorzitter', name: 'Danny Goldenbelt', role: 'Voorzitter', department: 'Verbinding & koers', summary: 'Voorzitter van Duindorp SV. Ook vermeld als aanspreekpunt voor kantinezaken.', responsibilities: ['Algemene bestuurlijke vragen.', 'De verbinding tussen bestuur en vereniging.', 'Kantinezaken.'] },
  { id: 'secretaris', name: 'Corine de Jong', role: 'Secretaris', department: 'Organisatie & afspraken', summary: 'Het aanspreekpunt voor het secretariaat van onze vereniging.', responsibilities: ['Vragen voor het secretariaat.', 'Verenigingscorrespondentie.', 'Bestuurlijke afspraken en doorverwijzing.'] },
  { id: 'penningmeester', name: 'Wilco van Doorn', role: 'Penningmeester', department: 'Financiën', summary: 'De financiële portefeuille binnen het bestuur.', responsibilities: ['Financiële verenigingszaken.', 'Vragen voor de penningmeester.', 'Afstemming over inkomsten en uitgaven.'] },
  { id: 'algemene-zaken', name: 'André den Heijer', role: 'Algemene zaken', department: 'De dagelijkse club', summary: 'Verantwoordelijk voor de portefeuille algemene zaken.', responsibilities: ['Algemene verenigingszaken.', 'Praktische vragen voor het bestuur.', 'Afstemming met de betrokkenen binnen de club.'] },
  { id: 'hff', name: 'Sander Roeleveld', role: 'Coördinator HFF', department: 'Coördinatie', summary: 'Binnen het bestuur vermeld als coördinator HFF.', responsibilities: ['Vragen over de HFF-coördinatie.', 'Afstemming rondom deze portefeuille.', 'Doorverwijzing naar het juiste aanspreekpunt.'] },
  { id: 'technische-commissie', name: 'Michel Simonis', role: 'Technische commissie jeugd en senioren', department: 'Jeugd & senioren', summary: 'De technische commissie voor jeugd en senioren binnen het bestuur.', responsibilities: ['Vragen over technische voetbalzaken voor jeugd en senioren.', 'Afstemming met de technische organisatie.', 'De verbinding tussen jeugd- en seniorenvoetbal en het bestuur.'] },
].map(person=>({...person,email:person.id==='voorzitter'?clubBoardContacts.chairmanEmail:clubBoardContacts.secretariatEmail,phone:person.id==='voorzitter'?clubBoardContacts.chairmanPhone:undefined}));

export type ClubCommission = {
  id: string;
  title: string;
  category: 'Voetbal' | 'Club & mensen' | 'Accommodatie';
  summary: string;
  tasks: string[];
  contactLabel: string;
  contactName?: string;
  contactRole?: string;
};

export const clubCommissions: ClubCommission[] = [
  { id: 'wedstrijdzaken', title: 'Wedstrijdzaken', category: 'Voetbal', summary: 'Alles rondom het organiseren van onze wedstrijden.', tasks: ['Afstemming over het wedstrijdprogramma.', 'Vragen over wedstrijdorganisatie en wijzigingen.', 'Bezoekers en teams naar de juiste informatie begeleiden.'], contactLabel: 'Vraag over wedstrijdzaken', contactName: 'Ricardo Dekker · Erwin Kooijenga', contactRole: 'Wedstrijdsecretaris senioren · jeugd' },
  { id: 'technische-commissie', title: 'Technische commissie jeugd en senioren', category: 'Voetbal', summary: 'Samen werken aan de ontwikkeling van ons jeugd- en seniorenvoetbal.', tasks: ['Afstemming over voetbalinhoudelijke zaken voor jeugd en senioren.', 'Ondersteuning van trainers en teambegeleiders.', 'Samenwerking tussen de verschillende teams.'], contactLabel: 'Vraag over voetbalzaken', contactName: 'Michel Simonis', contactRole: 'Technische commissie jeugd en senioren' },
  { id: 'jeugdcommissie', title: 'Jeugdcommissie', category: 'Voetbal', summary: 'Van de eerste training tot de volgende stap.', tasks: ['Ondersteuning van jeugdteams en ouders.', 'Afstemming met jeugdcoördinatoren.', 'Meedenken over jeugdactiviteiten en voetbalplezier.'], contactLabel: 'Vraag over de jeugd', contactName: 'Anthony Pronk', contactRole: 'Voorzitter jeugdbestuur' },
  { id: 'vrijwilligers', title: 'Vrijwilligers', category: 'Club & mensen', summary: 'Een uurtje, een talent of een goed idee: iedereen kan iets bijdragen.', tasks: ['Nieuwe helpers de weg wijzen.', 'Vraag en aanbod van vrijwilligerstaken verbinden.', 'Meedenken over een passende rol binnen de club.'], contactLabel: 'Vraag over vrijwilligerswerk' },
  { id: 'activiteiten', title: 'Activiteiten & ontmoeting', category: 'Club & mensen', summary: 'De momenten die van een vereniging een club maken.', tasks: ['Meedenken over activiteiten voor leden en de wijk.', 'Samenwerking met vrijwilligers en teams.', 'Ruimte voor ideeën die mensen bij elkaar brengen.'], contactLabel: 'Deel een idee voor de club' },
  { id: 'sponsoring', title: 'Sponsoring & communicatie', category: 'Club & mensen', summary: 'Onze verhalen, onze partners en de zichtbaarheid van de club.', tasks: ['Vragen over samenwerking en sponsoring.', 'Nieuws en clubverhalen verzamelen.', 'Afstemming over communicatie en publicaties.'], contactLabel: 'Vraag over samenwerking' },
  { id: 'kantine', title: 'Kantine', category: 'Accommodatie', summary: 'Een gastvrije ontmoetingsplek voor en na het voetbal.', tasks: ['Afstemming over kantinevrijwilligers.', 'Praktische vragen over het clubhuis.', 'Meedenken over een prettige ontvangst van bezoekers.'], contactLabel: 'Vraag over de kantine', contactName: 'Danny Goldenbelt', contactRole: 'Kantinezaken' },
  { id: 'terrein', title: 'Terrein & materialen', category: 'Accommodatie', summary: 'Zorgen voor de plek waar ons voetbal begint.', tasks: ['Signaleren van onderhoud aan terrein en accommodatie.', 'Afstemming over voetbalmaterialen.', 'Samenwerken aan een verzorgd sportpark.'], contactLabel: 'Vraag over accommodatie', contactName: 'Ricardo Dekker', contactRole: 'Facilitaire zaken' },
];

export const youthPeople: ClubPerson[] = [
  { id: 'jeugdvoorzitter', name: 'Anthony Pronk', role: 'Voorzitter jeugdbestuur', department: 'Samenhang & organisatie', summary: 'Voorzitter van het jeugdbestuur van Duindorp SV.', responsibilities: ['Algemene vragen voor het jeugdbestuur.', 'De organisatie rondom de jeugdafdeling.', 'Afstemming met betrokkenen binnen de vereniging.'] },
  { id: 'jeugdbestuur', name: 'Rinus Taal', role: 'Jeugdbestuur', department: 'Jeugdorganisatie', summary: 'Onderdeel van het jeugdbestuur van onze vereniging.', responsibilities: ['Vragen over de jeugdorganisatie.', 'Doorverwijzing binnen de jeugdafdeling.', 'Afstemming over jeugdzaken.'] },
  { id: 'hjo', name: 'Herman Kooijenga', role: 'Hoofd jeugdopleiding', department: 'Voetbal & ontwikkeling', summary: 'Op de clubwebsite vermeld als HJO.', responsibilities: ['Vragen over de jeugdopleiding.', 'Afstemming over voetbalontwikkeling.', 'Voetbalinhoudelijke vragen voor de jeugdorganisatie.'] },
  { id: 'hoofdcoordinator', name: 'Ferdi Aydin', role: 'Hoofdcoördinator', department: 'Samenhang tussen teams', summary: 'Het centrale aanspreekpunt voor de jeugdcoördinatie.', responsibilities: ['Vragen over de jeugdcoördinatie.', 'Afstemming met de leeftijdscoördinatoren.', 'De verbinding tussen de verschillende jeugdgroepen.'] },
  { id: 'coordinator-junioren', name: 'Ricardo Van Gorsel', role: 'Coördinator bovenbouw', department: 'De volgende stap', summary: 'Het aanspreekpunt voor de bovenbouw.', responsibilities: ['Vragen over de bovenbouw.', 'Afstemming met de betrokken teams.', 'Doorverwijzing naar trainers en begeleiders.'] },
  { id: 'coordinator-pupillen', name: 'Edwin Kaffa', role: 'Coördinator onderbouw', department: 'Plezier in ontwikkeling', summary: 'Het aanspreekpunt voor de onderbouw.', responsibilities: ['Vragen over de onderbouw.', 'Ouders de juiste weg wijzen.', 'Afstemming met de betrokken teams.'] },
  { id: 'coordinator-meiden', name: 'Erwin Kooijenga', role: 'Coördinator meiden', department: 'Samen voetballen', summary: 'Het aanspreekpunt voor de meidenafdeling. Ook wedstrijdsecretaris jeugd.', responsibilities: ['Vragen over meidenvoetbal.', 'Afstemming met de betrokken teams.', 'Wedstrijdzaken voor de jeugd.'] },
];

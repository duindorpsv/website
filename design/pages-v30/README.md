# Clubmuur · v30 · Clubpagina’s

## Indeling
- Onze club: overzicht, ons verhaal, bestuur, commissies, jeugdorganisatie, vertrouwenspersoon, accommodatie, lidmaatschap, vrijwilligers, clubwaarden, documenten, contact.
- Onze teams: bestaand Sportlink-teamoverzicht, individuele teaminformatie (overzicht, programma, uitslagen, begeleiding), trainingen, Walking Football.
- Wedstrijden: bestaand wedstrijdcentrum plus praktische informatie, afgelastingen en een oefenwedstrijdvoorstel.
- Media: bestaand nieuws, fotogalerij, SV-TV en nieuwsbrief.

## Inhoud en interactie
Gedeelde paginatypografie, blauwe brushachtergrond, broodkruimels, kaarten, knoppen en responsive eenkolomsweergaven. Desktop en mobiel gebruiken dezelfde navigatieboom. Alleen de exacte oude standaardnavigatie wordt automatisch vervangen; aangepaste navigatie blijft behouden.

Bestuur en jeugdorganisatie gebruiken de openbare namen van de officiële clubwebsite. Portretten zijn bewust initialen/silhouetten; de officiële afbeeldingsbestanden konden niet worden opgehaald. Geen gegenereerde gezichten voor benoemde bestuursleden. Functieomschrijvingen zijn nieuwe samenvattingen. Commissies zonder bevestigd aanspreekpunt verwijzen naar contact.

Teamgegevens, wedstrijden en afgelastingen gebruiken bestaande Sportlink-data en tonen de aanwezige beschikbaarheidsstatus. Trainingsrooster: 23 teams, 46 trainingsmomenten, gecontroleerd 10 oktober 2026. Informatie over begeleiding ontbreekt nog op de nieuwe teamdetails; officiële teamfoto’s zijn nog niet toegevoegd. Sfeerbeelden staan als zodanig gemarkeerd.

Contact, oefenwedstrijd en nieuwsbrief zijn expliciete lokale voorbeelden met validatie en controleoverzicht; ze sturen niets en slaan geen persoonsgegevens op. Documenten en SV-TV tonen een eerlijke status wanneer bestanden/video’s nog ontbreken.

## Primaire bronnen
- https://www.duindorpsv.nl/630/het-bestuur/
- https://www.duindorpsv.nl/901/jeugdbestuur/
- https://www.duindorpsv.nl/909/jeugdcordinatoren/
- https://www.duindorpsv.nl/637/vertrouwenspersoon/
- https://www.duindorpsv.nl/643/trainingstijden/
- https://www.duindorpsv.nl/411/contributie/
- https://www.duindorpsv.nl/203/lid-worden/
- https://www.duindorpsv.nl/204/lidmaatschap-opzeggen/
- https://www.duindorpsv.nl/889/kleding-aanschaffen/
- https://clubs.stanno.com/nl/sv-duindorp/clubcollectie

## Controle
- TypeScript zonder fouten.
- Statische interne links en afbeeldingsbestanden gecontroleerd.
- Routevalidatie: alle vaste routes en navigatiebestemmingen, dynamische team-ID’s, ongeldige routes en onveilige menu-URL’s.
- Trainingsnaamkoppeling gecontroleerd: JO/O-normalisatie, leeftijd en teamnummer blijven onderscheidend.
- Responsive CSS en toegankelijke componentbediening door tweede reviewer nagekeken. Twee concrete fixes: contrast trainingsroosterknop en reduced-motionselector voor de fotolightbox.
- Browsercontrole niet beschikbaar: managed preview startte, maar cloudbrowser blokkeerde terminal.local met ERR_BLOCKED_BY_CLIENT. Geen visuele of fysieke mobiele test geclaimd.
- Productiebuild via officiële Sites-workflow.

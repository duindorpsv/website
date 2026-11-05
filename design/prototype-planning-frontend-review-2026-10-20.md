# Prototype-integratie: personen en planning — uitgevoerde frontendcontrole

De geselecteerde v48-componenten zijn geïntegreerd met de bestaande productieprovider en record-API. De tweede marketingkop is verwijderd en de bestaande CMS-shell toont de enige paginakop met dezelfde pagina-acties. Dit rapport claimt geen algemene pixelperfectheid.

## Reproduceerbaar bewijs

De bewijsmap `duindorpsv-planning-visual-evidence` bevat `manifest.json`, dezelfde JSON-fixture met SHA256, bron/candidate/diff/50%-overlay, de werkelijke interactieresultaten en de captureharnassen. De hoofdoplevering bundelt deze map met het overige implementatiebewijs.

- Bron: v48 `fcb53aaf1dc28779700e69e7b46e7bb0417e8da5`.
- Productie-baseline: eigen productiecode uit Git-archief van vóór deze integratie; `production-before` bevat de pagina-editor en navigatie. Deze zijn niet vervangen door het oudere prototype.
- Candidate: geïntegreerde werkboom; de hoofdoplevering koppelt deze aan het broncommit.
- Gelijke fixturebytes; vaste klok 20 oktober 2026, 12:00 Amsterdam; locale nl-NL; DPR1; reduced motion.
- Viewports: 1440×1000, 1920×1080, 1024×900, 390×844. Een afzonderlijke interactierun controleert tevens 320×844.
- Werkelijke React-componenten met hun bron-CSS, globale CSS en Tailwind-basis-CSS. De geïsoleerde harness genereert geen nieuwe Tailwind-utilityklassen. Bootstrap/mutaties zijn private testadapters. De bestaande productieprovider zelf is niet vervangen. Echte API/SQL/autorisatie worden afzonderlijk in integratie- en CI-tests gecontroleerd.

De beeldvergelijking gebruikt exacte RGB-verschillen, zonder antialiasingfilter. De percentages zijn diagnostiek, geen passgrens: de verwijderde dubbele header en de echte backendbediening veroorzaken bewuste verschillen in grote delen van het volledige viewport. Alle vergeleken PNG’s hebben dezelfde afmetingen; de fixturehashes zijn gelijk.

## Visuele matrix

| Frames | Opgenomen en beoordeeld | Uitkomst |
|---|---|---|
| Personen, Commissies, Velden & ruimtes, Reserveringen, Jaaragenda, Trainingen | Alle vier viewports | Eén H1; statistieken/filters/kalender/tijdlijn aanwezig; geen documentoverflow. |
| Persoon bewerken, bronimport, commissie bewerken | Desktop en mobiel | Prototypepanelen behouden; visual portretkiezer, echte accountkiezer, CSV-review en expliciete publicatie zijn bewuste productieaanpassingen. |
| Locatie bewerken, Sportlink-mapping | Desktop en mobiel | Kaarten/types/mappingpaneel behouden; exacte broncode is aanvullend, koppeling verwijst naar echte Sportlink-instellingen. Geen demosync. |
| Jaaragenda dag/maand/jaar, naast week | Desktop en mobiel | Kalenderperioden, witte navykop, kolommen/dagknoppen en filters intact. |
| Nieuwe activiteit, personenkeuzelijst open/zoek/geen resultaten | Desktop en mobiel | Compacte keuzelijst binnen modal; dezelfde panelstructuur. Desktopinterieur van deze vier states heeft exact 0 gewijzigde RGB-pixels in de vastgelegde interieurregio 360,56,720,888. De volledige modalrand heeft 79 gewijzigde pixels met maximale kanaaldelta12 door de gewijzigde geblurde achtergrond; geen panelgeometrieverschil. De rand is apart gemeten, niet als fout weggemarkeerd. |
| Trainingsreeks aanmaken | Desktop en mobiel | Prototypeformulier/previewverhouding behouden. Servercontrole, exacte foutstatus en maximaal364 dagen vervangen de lokale demo-succesmelding. |
| Bestaande productiepagina-editor en navigatie | Vooraf opgeslagen; actual-component regressiecontrole op vier breedtes | Bestaande editor/navboom behouden. Dubbele pagina-intro verwijderd; geen algemene heading-hide. |

Er zijn 50 bij elkaar horende bron/candidate/diff/overlay-viewportframes, plus46 afzonderlijke inhoudscrops. Alle46 inhoudsframes hebben exact dezelfde DOM-breedte en -hoogte als de bron: maximale afwijking0px, dus geen onbedoelde paneelomloop of crop groter dan1px. De rauwe element-PNG’s kunnen1px verschillen door afronding van fractionele clipcoördinaten; `panels/geometry.json` bewaart de niet-afgeronde boundingboxes en `panels/manifest.json` de ruwe RGB-uitkomsten. Zes crops hebben zonder verdere uitlijning0 gewijzigde pixels. De overige staan expliciet als review gemarkeerd; hun renderfase verschilt door de headerverplaatsing en er is geen automatische tolerantiedrempel toegepast. Een extra onderzoekscapture registreert een CSS-translate van de fractionele y-fase apart in `phase-crops/manifest.json`:20 frames met gelijke dimensies, waarvan1exact0RGB. De overige19 zijn diagnostiek en blijven als ruwe verschillen zichtbaar; deze methode geeft geen algemene nulverschilgarantie en is niet als passfilter gebruikt. Homepage/slider heeft een eigen F08-bewijsmap en wordt hier niet opnieuw als pixelgetest meegeteld.

### Geometrieverschillen groter dan1px

De verwijderde childintro verschuift inhoud bewust naar boven. Een vaste witte-paneelprobe op x310 in de desktopcaptures geeft: Personen-tabel481→381px, Commissies-filter481→381px, locaties-statistieken380→267px, kalenderinhoud473→356px en trainingstatistieken345→267px. Dit zijn bedoelde headercorrecties; de volledige beelden en overlays tonen deze verschuivingen.

Andere bedoelde verschillen: mobiele headeracties wrappen in de productieheader; aanvullende broncode/account/publicatievelden veranderen de hoogte van betreffende bewerkdialogen. Een expliciete wintertijdkeuze verschijnt alleen bij een dubbel/niet-bestaand lokaal tijdstip. Normale activiteitdialogen behouden de prototypegeometrie. De routewisseling Locaties→Reserveringen kreeg eigen React-keys: de inhoudscrops ontdekten dat anders de laatst geopende tab bleef staan. De vernieuwde capture toont de reserveringstijdlijn op iedere breedte. De tabelscroller kreeg `position:relative` zodat zijn absoluut gepositioneerde schermlezertekst geen horizontale paginaoverflow veroorzaakt op tablet.

Niet als nulverschil geclaimd: alle afzonderlijke kaart-/typografie-boundingboxes, iedere gesloten en geopende entitykiezer binnen alle bestaande managers en alle combinaties van bronconflict, trainingsverwijdering en veldhiërarchie. Daarvoor is geen algemene pixelperfectclaim gedaan. Echte reserverings-, rechten-, reeks- en migratielogica heeft afzonderlijke SQL-tests.

## Uitgevoerde functionele checks

De daadwerkelijke componentharness maakte een privépersoon met lege algemene functie, vond diens naam met accentloze meerwoordzoekopdracht, selecteerde met het toetsenbord, hield de modal open na Escape uit een geopende dropdown, maakte een commissie met eigen functie, maakte een locatie en sloeg een gekoppelde activiteit op. Vervolgens controleerde hij negen modules op vier breedtes: exact één H1, geen horizontale documentoverflow en geen JavaScript-fouten.

De afzonderlijke keuzelijstgrenzentest gebruikt zestig keuzes in een scrollende modal en controleert accent/woordfilter, Enter zonder formsubmit, Escape zonder modalverlies, verwijderen van een verdwenen selectie, disabled optie, popup binnen de modal, maximaal130px aan chips, readonly en mobiel zonder overflow. Het daadwerkelijke resultaat staat in `picker-boundaries/result.json`; deze test is een aanvullend componentonderzoek, geen vervanging van serverautorisatie.

Toegevoegd voor de volledige CI-run, hier niet als lokaal geslaagd geclaimd: duurzame E2E-tests in `tests/e2e/club-planning.spec.ts` controleren een echte51-persoonsimport, atomisch verwijderen van53 trainingsmomenten, persoonsidentiteit, twee commissiegebonden functies, deep-link, conflictbehoud en vergrendelde Sportlink-bronvelden. Bestaande tests behouden hun controles op publieke bestuursgegevens en publicatie, terwijl de oude vrije tekst voor trainingsroosters is vervangen door een concrete centrale trainingsreeks met serverpreview en publieke projectie. De navigatie/headercontrole omvat de nieuwe modules. CSV51-import is daadwerkelijk door de componentharness getest met twee requests50+1; alle51 personen blijven privé zonder account. Zowel CSV als geverifieerde Sportlink-import verwerkt maximaal50 per API-aanroep, toont voortgang en bewaart de resterende selectie bij fouten. Hele trainingsreeksen gebruiken de aparte atomische DELETE-API met volledige ID/versieset, zodat ook53 of meer momenten niet tegen de generieke50-mutatieslimiet lopen. CSV-parser: twee unit-tests geslaagd, inclusief stabiele ID’s, quotes, accenten, duplicaten en limieten. Eigen frontendtypecheck geslaagd. De uiteindelijke gedeelde CI-uitkomst wordt afzonderlijk bij de hoofdoplevering gemeld.

## Productiegedrag

Geen prototypepersonen, voorbeeldlocaties of demowedstrijden worden in productie geïmporteerd. Nieuwe personen en commissies beginnen als concept. Accountkoppeling is expliciet en maakt geen account of uitnodiging. Import selecteert stabiele bron-ID’s na review. Bestaande groepen blijven bestaan en worden alleen na bevestiging als aparte conceptcommissie voorbereid, met afzonderlijk bevestigde commissiefuncties.

Agenda- en trainingsmigratie vragen expliciete ontbrekende gegevens en serverpreview vóór apply. Ze behouden oude openbare inhoud tot de overname/publicatie bewust is bevestigd. Gewone activiteitopslag bewaart de werkversie en de operationele reservering; alleen de afzonderlijke publicatieactie werkt de goedgekeurde liveversie bij. Sportlink-titel/status/tijden en bronlocaties zijn vergrendeld; lokale betrokkenen en extra instructies blijven bewerkbaar. Fouten of versieconflicten sluiten het bewerkvenster niet en bewaren de ingevulde werkversie.

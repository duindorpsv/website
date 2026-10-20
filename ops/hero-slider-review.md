# F08 — Hero-slider: review en beheer

Reviewdatum: 20 oktober 2026. Dit onderdeel is gebouwd voor beoordeling; er is geen productiepublicatie of deployment uitgevoerd.

## Uitvoering

Homepage → **Hero-slider** beheert de achtergrond van de bestaande homepage. De spelersportretten, vier hero-vakken, bestemmingen, indelingen en bezoekselectie blijven zelfstandig bestaan.

De editor gebruikt de oorspronkelijke markup en de ongewijzigde `hero-slider-manager.css` uit prototypecommit `fcb53aaf1dc28779700e69e7b46e7bb0417e8da5`. De bestaande beelden en hun mobiele/desktopvarianten zijn behouden. De dubbele introductiekop uit het prototype is weggelaten, zoals voorgeschreven in de overdracht; de bestaande CMS-kop bevat de paginatitel en homepageknop.

| Onderdeel | Implementatie |
| --- | --- |
| Opslag | Module `heroSlider`, singleton `site-hero-slider`, rechtstreeks instellingenobject |
| Werkversie | `save` met vastgelegde `expectedVersion`; alleen in het CMS zichtbaar |
| Publicatie | Afzonderlijke actie `publish`, met paginapublicatierechten |
| Configuratie | Maximaal 20 unieke dia’s; volgorde, naam, aan/uit en focus 0–100% |
| Beelden | Bestaande collectie, gepubliceerde mediabibliotheek of echte upload via de bestaande media-API |
| Beweging | Wisseltijd, vervagen/direct, overgangsduur, zoom, muisbeweging en positiebolletjes |
| Publieke uitvoer | Alleen expliciet geselecteerde, gepubliceerde en niet-verwijderde media; geen privébestands- of blob-URL’s |
| Conflict | HTTP 409 behoudt de lokale werkversie; expliciet herladen vraagt bevestiging bij wijzigingen |
| Lege selectie | Blijft leeg na opslaan, publiceren en herladen; geen stille terugkeer naar voorbeeldbeelden |

Een ontbrekende configuratie gebruikt de drie bestaande achtergrondbeelden. Een aanwezige lege configuratie gebruikt die standaardselectie nadrukkelijk niet. Nieuwe uploads gaan door de bestaande beeldverwerking en worden met een naam en beschrijving in de bibliotheek gepubliceerd voordat ze aan de sliderwerkversie worden toegevoegd. De slider zelf wordt daarbij niet gepubliceerd. Een mislukte of nog verwerkende upload kan zonder dubbele upload worden hervat.

De achtergrondspeler gebruikt dezelfde instellingen voor CMS-preview en homepage. Hij wacht op beelddecodering, laadt het volgende beeld geleidelijk, respecteert verminderde beweging en databesparing en pauzeert wanneer het document verborgen is of de speler buiten beeld staat. De bedieningsknoppen pauzeren bij hover en focus. Een defect eerste beeld wordt overgeslagen, ook bij uitgeschakeld automatisch afspelen. Pas als alle gekozen beelden falen, wordt de bestaande fallback eenmaal geprobeerd. Een bewust lege selectie vraagt die fallback niet op.

## Visuele verificatie

De belangrijkste beelden en meetbestanden staan bij [het reviewbewijs](../design/club-planning-2026-10-20/hero-slider/). Het volledige archief met alle 47 vergelijkingen staat in het [reviewpakket](../design/club-planning-2026-10-20/README.md). Dit zijn uitsluitend synthetische testgegevens, geen productiecontent.

| Controle | Resultaat |
| --- | --- |
| CSS- en beeldbestanden vergelijken met de exacte bron | 45 van 45 SHA-256-hashes gelijk |
| Lijst, preview en bewegingspaneel op 11 breedtes | 33 vergelijkingen, 0 afwijkende pixels |
| Uitsnede, mobiele preview, toevoegen, bibliotheek, leeg en conflict op 1440 en 390 | 14 vergelijkingen, 0 afwijkende pixels |
| Horizontale overloop | Geen op de 11 gecontroleerde breedtes |

De breedtes zijn 1920, 1440, 1201, 1200, 1024, 1000, 999, 701, 700, 390 en 320 pixels. De controles gebruiken DPR 1, zoom 100%, tijdzone Europe/Amsterdam, geladen bronlettertypen en stilgezette beweging. De baseline gebruikt de exacte prototypecomponent; alleen de CMS-data-aanlevering is vervangen door dezelfde synthetische fixture als bij de kandidaat. De dubbele introductiekop is bij beide uit de DOM verwijderd. Panelen zijn zonder CSS-maskers uit volledige screenshots geknipt nadat de onderkant van het document in beeld is gebracht, zodat de sticky actiebalk de inhoud niet bedekt.

De 47 vergelijkingen hebben zowel `changedPixels: 0` als `maxChannelDifference: 0`. Dit betreft de genoemde modulepanelen en toestanden; het is geen uitspraak dat de gehele CMS-shell identiek is. Volledige screenshots zijn eveneens opgenomen.

Desktop: [baseline](../design/club-planning-2026-10-20/hero-slider/baseline-1440.png), [kandidaat](../design/club-planning-2026-10-20/hero-slider/candidate-1440.png), [verschil van de lijst](../design/club-planning-2026-10-20/hero-slider/diff-1440-list.png), [overlay](../design/club-planning-2026-10-20/hero-slider/overlay-1440-list.png).

Mobiel: [baseline](../design/club-planning-2026-10-20/hero-slider/baseline-390.png), [kandidaat](../design/club-planning-2026-10-20/hero-slider/candidate-390.png), [mobiele uitsnede](../design/club-planning-2026-10-20/hero-slider/candidate-390-crop-preview.png), [lege selectie](../design/club-planning-2026-10-20/hero-slider/candidate-390-empty-list.png), [conflictmelding](../design/club-planning-2026-10-20/hero-slider/candidate-390-conflict-notice.png).

Machineleesbaar: [geometrie en pixelmetingen](../design/club-planning-2026-10-20/hero-slider/manifest.json), [bestandshashes](../design/club-planning-2026-10-20/hero-slider/asset-verification.json), [functionele verificatie](../design/club-planning-2026-10-20/hero-slider/verification-summary.json).

Bewuste productieverschillen buiten de identieke panelen:

- De actiebalk heeft een afzonderlijke knop **Slider publiceren**. Opslaan publiceert niet.
- De mediabibliotheek behoudt de bestaande paginatie 25/50/100 en heeft een vernieuwknop.
- Uploads gebruiken de bestaande serverlimiet van 8 MB en ondersteunen JPG, PNG, WebP en AVIF. Het prototype bood ook GIF aan; de bestaande productieverwerking ondersteunt dat formaat niet.
- De previewtekst benoemt expliciet dat alleen publicatie de homepage verandert. De oorspronkelijke panelengeometrie blijft gelijk op alle gecontroleerde breedtes.

## Functionele verificatie

`pnpm exec tsx --test tests/unit/hero-slider.test.ts`: **4 tests geslaagd**. De tests controleren standaarden en aanwezige responsive assets, alle schema- en bewegingsgrenzen, unieke bronselectie, lege/uitgeschakelde selecties en onveilige of verkeerde media-URL’s.

De echte CMS-provider, editor en achtergrondspeler zijn daarnaast in een lokale browserharness gecontroleerd met een HTTP-fixture voor de API. Dit vervangt alleen de externe opslag/authomgeving; componenten en provider zijn de productieimplementatie. De controle omvat acht mutaties, upload en verwerkingspolling, expliciete mediapublicatie, afzonderlijke draft/live, herladen, focus en volgorde, max. 20, leeg publiceren, conflicten met behoud van lokale invoer en herladen na bevestiging. Screenshots op [1440](../design/club-planning-2026-10-20/hero-slider/flow-1440.png), [1024](../design/club-planning-2026-10-20/hero-slider/flow-1024.png), [390](../design/club-planning-2026-10-20/hero-slider/flow-390.png) en [320](../design/club-planning-2026-10-20/hero-slider/flow-320.png) hebben geen overloop of JavaScriptfouten.

De runtimecontrole gebruikt ook normale beweging en een bestuurde klok. Gecontroleerd zijn de decodegrens vóór wisselen, automatisch wisselen, pauze zonder bolletjes, handmatig pauzeren, hover/focus, verborgen document, buiten beeld, databesparing, verminderde beweging, handmatige keuzes bij verminderde beweging, de mobiele preview in een desktopvenster, standaard mobiele uitsnede, expliciete 30/70-focus, één afbeelding, een defect eerste beeld, een mislukte fallback zonder herhaallus, geen netwerkverzoek voor uitgesloten beelden, directe overgang en alle drie zoominstellingen.

De repositorylogica is tevens op de expliciet geïsoleerde tijdelijke PostgreSQL-database gecontroleerd: **geslaagd**. Dit omvat echte transacties voor draft/live, paginarechten zonder publicatierecht, weigering van privémedia bij publicatie, opgeslagen live-mediareferenties, versies, singleton-ID, weigering van ruwe blob/src-invoer, lege publicaties en behoud van de bibliotheekfoto bij sliderverwijdering. Dit is geen Supabase Auth-test en de bestaande Supabase-testguard is niet gewijzigd of omzeild.

Voor de volledige omgeving zijn [de integratietest](../tests/integration/hero-slider.test.ts) en [de browser-E2E-test](../tests/e2e/hero-slider.spec.ts) toegevoegd. De E2E-test gebruikt de bestaande e-mailcode-login, echte uploadverwerking, herladen en controle van publieke server-HTML. Deze twee suites moeten in de bestaande lokale Supabase/CI-omgeving draaien; zij zijn in deze reviewharness niet als geslaagd aangemerkt.

## Korte beheerinstructie

1. Open **Homepage → Hero-slider**.
2. Kies **Achtergrond toevoegen** en selecteer een collectiebeeld of bibliotheekfoto, of upload een afbeelding met naam en beschrijving.
3. Gebruik de pijlen of sleepgreep voor de volgorde. Via het instellingenknopje stel je naam en uitsnede in; controleer ook het mobiele voorbeeld.
4. Stel het gewenste ritme en de beweging rechts in. De preview verandert direct.
5. Kies **Hero-slider opslaan** om de werkversie te bewaren. Kies **Slider publiceren** om die instellingen op de homepage te gebruiken.
6. Verwijderen uit de slider bewaart de foto in de mediabibliotheek. Alle dia’s verwijderen en publiceren geeft een rustige effen achtergrond.
7. Bij een versieconflict blijven je keuzes staan. Laad de actuele instellingen bewust opnieuw voordat je verder opslaat; niet-opgeslagen keuzes worden pas na je bevestiging vervangen.

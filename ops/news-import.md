# Historisch nieuws importeren

Open **Clubbeheer → Nieuws → Nieuws importeren**. Verhalen en de algemene backupimport gebruiken deze functie niet. Er zijn geen aanvullende secrets nodig. De drie optionele uploadlimieten worden als GitHub Environment variables beheerd; zie [github-environments.md](github-environments.md).

## Werkwijze voor de redactie

1. Kies een willekeurig benoemd JSON-bestand met schemaVersion 1, of een ZIP met `nieuws.json` in de hoofdmap. ZIP neemt uitsluitend daadwerkelijk aanwezige, beschikbaar verklaarde bestanden uit `media/` mee. JSON haalt geen afbeeldingen van de oude website op.
2. Controleer de waarschuwingen en voorvertoning. Een onvolledige export blijft bruikbaar. Bronfouten onder `failures` worden uitsluitend gerapporteerd. Ontbrekende afbeeldingen blokkeren bruikbare tekst niet.
3. Selecteer expliciet berichten. Standaard is niets aangevinkt. **Alle importeerbare** betreft het hele bestand; **zichtbare berichten** betreft alleen de getoonde pagina. Zoeken, jaarfilter en statusfilter behouden de selectie.
4. Controleer aantal en publicatiestatus. **Concept** is de standaard. **Gepubliceerd** vereist de bestaande publicatierechten. De historische datum blijft behouden; een bericht zonder geldige datum of met uitsluitend een inleiding blijft concept.
5. De worker verwerkt batches van drie berichten. De pagina mag worden gesloten. Open de upload opnieuw via Eerdere imports of dezelfde beheer-URL. Bij een onderbroken upload kies je hetzelfde bestand; reeds bevestigde delen worden overgeslagen.
6. Download het importverslag en open de aangemaakte nieuwsberichten om ze verder te redigeren. Alleen mislukte, eerder geselecteerde berichten kunnen met de retryknop opnieuw worden geprobeerd. Een bekende bronidentiteit wordt nooit opnieuw aangemaakt of over bestaande redactiewijzigingen geschreven.

Alt-tekst komt uit de export. Media met ontbrekende publicatierechten, een ongeldig bestand of ontbrekende alt-tekst bij directe publicatie worden overgeslagen met een waarschuwing. De eerste werkelijk opgeslagen afbeelding wordt de omslag; wijzig die daarna in de bestaande nieuwseditor. PDF-bijlagen gebruiken de bestaande documentopslag en rechten.

## Opslag, herstel en beheer

Migratie `0012_news_archive_import.sql` voegt uploadsessies, delen, kandidaatrijen, geselecteerde assets en unieke bronidentiteiten toe. De club heeft één eigen database per omgeving; de bronidentiteit is uniek op vaste bronnaam + `sourceId`. Sessies zijn bovendien gebonden aan beheerder en omgeving. Herkomst staat apart van de bewerkbare artikelinhoud.

Uploads bestaan uit private objecten van maximaal 4 MiB in de bestaande filesystem- of S3-opslag. De ZIP-lezer gebruikt random access met maximaal twee gecachete delen. Hij leest de centrale inhoudsopgave, zodat `nieuws.json` ook achteraan mag staan. Er wordt geen volledige ZIP gebufferd of naar de beperkte container-`/tmp` uitgepakt. De manifestlimiet is 32 MiB, de artikellimiet 10.000, de sessielimiet drie actieve uploads per beheerder. Afbeeldingen en PDF's volgen de bestaande limieten van respectievelijk 12 MB en 10 MB.

De worker gebruikt bestaande duurzame jobs, hernieuwbare leases en idempotente batches. Artikel, revisie, verwijzingen en bronidentiteit worden samen in één database-transactie vastgelegd. Intrekking van account of rechten wordt opnieuw gecontroleerd tijdens verwerking. Alleen media van geselecteerde berichten worden permanent aangemaakt; gedeelde bestanden binnen een upload worden hergebruikt. Ongebruikte importmedia worden verwijderd zonder bewerkte of gerefereerde records te verwijderen.

Tijdelijke delen en ruwe manifestinhoud verlopen na zeven dagen. De bestaande retentietaak ruimt ze op; de redactie kan een inactieve upload eerder opruimen. Geïmporteerde artikelen en gebruikte media blijven bestaan. Verslagen blijven tot 90 dagen beschikbaar; de herkomst van artikelen blijft daarna bewaard. De bron-HTML wordt nooit uitgevoerd of als pagina aangeboden.

ZIP-controle weigert padtraversal, absolute paden, symlinks, canonieke dubbele namen, encryptie, onbekende compressie, buitensporige expansie en ontbrekend rootmanifest. Geselecteerde bytes worden op CRC, omvang en daadwerkelijk bestandstype gecontroleerd. HTML wordt omgezet naar het bestaande Tiptap-document en gevalideerd; scripts, embeds en niet overgenomen externe afbeeldingen verdwijnen. De bestaande publicatiedienst blijft verantwoordelijk voor validatie en toegankelijke liveverwijzingen.

Bekende oorspronkelijke `/1/<nummer>/…`-links van duindorpsv.nl krijgen bij publicatie een gerichte redirect. Die werkt alleen voor een nog gepubliceerd nieuwsbericht. Een concept krijgt geen openbare redirect.

## Verificatie en productie

`pnpm test` bevat parser-, datum-, ZIP-pad- en Tiptap-schemacontroles. `pnpm test:integration` controleert de echte PostgreSQL-opslag, expliciete selectie, bronidentiteit bij gelijktijdige imports, rechten, hervatting, lokale media/PDF, ontbrekende media en schadelijke ZIP's. Deze tests vereisen de afgeschermde `duindorp_test` database.

`pnpm test:e2e` gebruikt de echte browser, API en worker. De importtests controleren desktop/mobiel, selectie over paginering en filters, bronmetadata in de nieuwseditor en een ZIP van ruim 150 MiB met `nieuws.json` als laatste entry. De grote upload wordt na twee bevestigde delen onderbroken en na herladen hervat; slechts drie van tien berichten worden geïmporteerd. CI voert dit uit tegen het daadwerkelijke alleen-lezen containerimage, met 768 MiB geheugen voor web en 512 MiB voor worker. Het artifact `verification` bevat screenshots, het browserrapport en `news-large-proof.json` met omvang, delen, hervatting en gemeten piek-RSS.

Merge de geslaagde PR naar main; controles, imagebuild en de productiedeploy lopen via de enige GitHub Environment `production`. De echte Environment-instellingen en hostinginstallatie moeten gereed zijn; zie [github-environments.md](github-environments.md). Controleer import, publicatie en verslag op de dev-VPS met representatieve testdata. Een productieimport vereist vervolgens expliciete selectie door een bevoegde beheerder; de releaseworkflow start geen nieuwsimport.

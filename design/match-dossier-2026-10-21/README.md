# Gedeeld wedstrijddossier — 21 oktober 2026

Geïntegreerd in de bestaande Next.js/VPS-app vanaf productiecommit `40db724`. Vormgeving en interacties volgen het aangeleverde punt-4-pakket, prototypeversie 55, broncommit `0d896d74f113aab17f76e4be593b05f58fef576f`. Op verzoek van de eigenaar gaat deze oplevering via de bestaande **production**-workflow; er wordt geen stagingomgeving toegevoegd.

## Gedrag en opslag

- Eén `SportlinkMatchDialog` voor hero, livekaart, competitie, programma, uitslagen, teamdetail, afgelastingen en de oudere homepageactie. Een deel-URL opent dezelfde wedstrijd met team-, poule- en seizoencontext.
- Overzicht met echte gegevens, compacte pastelvorm (nieuwste rechts), afteller, gedeelde informatierijen en onafhankelijke publieke hoofdtrainers. Lege onderdelen verdwijnen; O10 en jonger krijgen geen openbare resultaten of vorm. Het uitgebreide historietabblad is voor het bevestigde eerste elftal.
- Alle bronwriters gebruiken conditionele volledige PostgreSQL-upserts. Request-startversies en gefencete leases beschermen records én caches tegen vertraagde responses en verouderde fout-backoff. Voor een API-response worden de gecommitteerde wedstrijdrecords opnieuw gelezen. Een poulefallback wist geen bevestigde eigen clubfaciliteiten.
- Historie en beide trainersbronnen hebben onafhankelijke caches. Alleen de benodigde publieke trainernaam wordt bewaard. Succesvol leeg wist de eerdere naam/lijst; een transportstoring bewaart de laatste inhoud met een stale-indicatie. Geen bronwebhooks of browsercredentials.
- Voorbeschouwingen staan als eigen `matchPreviews`-records in de bestaande CMS-opslag, met bestaande revisies, audit, optimistic locking, publicaties en workerjobs. Nieuws-/teamrechten bepalen bewerken; publiceren, plannen en intrekken vereisen afzonderlijke publicatierechten. De redactie kan geen Sportlink-wedstrijdgegevens aanpassen.
- Concept, live en geplande snapshot zijn onafhankelijk. De bestaande worker publiceert ook met gesloten browser. De openbare route geeft uitsluitend geldige live-inhoud voor de juiste wedstrijd en eerste-teamidentiteit terug.
- Route, UTF-8/UTC-ICS zonder verzonnen eindtijd en WhatsApp met echte regeleinden en contextlink. WhatsApp wordt uitsluitend door een gebruikersklik geopend.

## Migratie en configuratie

Migratie `0017_match_dossier_indexes` voegt uitsluitend samengestelde thuisteam-/uitteam-plus-aftrapindexen toe aan `sportlink_matches`. Bestaande wedstrijden en publicaties blijven behouden. De redactionele inhoud gebruikt de bestaande private CMS-tabellen en hun huidige autorisatie/RLS-inrichting. Er zijn **geen nieuwe secrets of GitHub-variabelen** nodig; de server gebruikt de bestaande `SPORTLINK_CLIENT_ID`.

Beheer: `/beheer#voorbeschouwingen`. Kies een reeds gesynchroniseerde eerste-elftalwedstrijd. Voor teamredacteuren is de bestaande expliciete Sportlink→CMS-teamkoppeling vereist. Ontbrekende of niet-beschikbare optionele Sportlink-artikelen worden nooit met voorbeeldinhoud aangevuld.

## Bewijs

De screenshots zijn synthetische presentatiegevallen met de echte applicatiecomponenten en clubstijlen. Ze zijn geen productiegegevens of bewijs dat ieder optioneel Sportlink-artikel met het clubaccount data levert.

| Scherm | Voorbeeld |
| --- | --- |
| Overzicht desktop | [Afbeelding](overzicht-desktop.png) |
| Historie desktop | [Afbeelding](historie-desktop.png) |
| Overzicht 390 px | [Afbeelding](overzicht-390.png) |
| Overzicht 360 px | [Afbeelding](overzicht-360.png) |
| O10 | [Afbeelding](young-360.png) |
| Ontbrekende gegevens | [Afbeelding](missing-360.png) |
| Gespeeld / afgelast | [Gespeeld](played-360.png), [afgelast](cancelled-360.png) |

[Browserresultaat](browser-result.json) bevat de lokale controle van alle zeven startpunten, kolomuitlijning, ICS/WhatsApp, 360/390 px, focustrap/focusherstel en verschillende datatoestanden. De extra Playwright-regressies draaien in de bestaande CI tegen de productiecontainer: zichtbare/minuutverversing en deel-URL's, plus de echte ingelogde CMS/publicatieflow met geïsoleerde Supabase, gesloten browsertab en de bestaande worker.

`tests/helpers/match-dossier-repository.ts` controleert echte PostgreSQL-transacties, broncorrecties en lege velden, oude responses/fout-backoff, coalescing, trainerprivacy, ontbrekende optionele bronnen, eerste-teamrechten, concept/live/planning, versieconflicten en publicatie via de worker. Alleen het externe Sportlink-transport wordt vervangen. De bestaande Sportlink-planningregressie blijft afzonderlijk draaien.

De normale CI omvat daarnaast alle unit-/integratie-/browsertests, typecheck, productie-/runtime-/containerbuild, herstart/readiness, Supabase-advisors, echte databaseback-up en host-/deploycontroles. Alleen een volledig groene mergecommit wordt door de productieworkflow uitgerold.

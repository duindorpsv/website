# Clubarchief — verificatie en referentie

Bron: prototype **v58**, commit `50b3944b78aebfe82845c0bd4d7b99288f03abc7`. `reference-1440.png` is de meegeleverde interactieve HTML, daadwerkelijk geopend in Chromium. De overige beelden komen van deze repository op echte viewports, met de bestaande header/footer en zonder nieuw ontwerp.

De lokale controles gebruiken een eigen tijdelijke PostgreSQL 17-database, eigen bestandsopslag en echte Sharp/FFmpeg-verwerking. Er is niets fictiefs aan productie toegevoegd. De CMS-beelden gebruiken de echte componenten en databasefuncties met een expliciete lokale testprincipal; dit is **geen** bewijs van een echte Supabase-login. Die login en de tweede bevoegde gebruiker worden apart getest door `tests/e2e/club-archive.spec.ts` in de bestaande GitHub CI met geïsoleerde Supabase Database/Auth/Storage en het werkelijke web/worker-image.

Bewijsbestanden:

- `migration-result.json`: upgrade 0018 → 0019, bestaande inhoud intact, zes RLS-tabellen, geen directe providerroltoegang en behoud/idempotentie van aangepaste navigatie.
- `public-browser.json`: echte publieke Next-routes, 1440/1280/768/390/360 px, leeg jaar 1987 en geen pagina-overflow of browserfouten.
- `cache-revocation.json`: aanvullende productiebuildcontrole op de image-optimizerroute vóór en na intrekken; de oorspronkelijke vieruurscache wordt afgesloten.
- `large-upload.json`: een echte 11.466.078-byte WAV bereikt de HTTP-route volledig (hash gelijk) en wordt werkelijk naar AAC/MP4 verwerkt.
- `public-e2e.json`: productiebuild met complete railbediening, broncontrole, zoomfocus, licht/donker, touch en vijf viewports.
- `cms-browser.json`: catalogusconcept werkelijk bewaard en opnieuw geladen, vijf viewports en geen browserfouten.
- `flow-browser.json`: gast, drie uploads, werkelijk verwerkende worker, verloren ontvangstbevestiging, één ontvangstnummer, twee van drie bestanden publiek, onafhankelijke tweede browser, geen publieke privé-e-mail, intrekken van pagina en media en herstel van zoomfocus.
- `home-*`, `timeline-*`, `inbox-*`, `catalogus-*`, `insturen-390.png`: daadwerkelijke browserbeelden. Definitieve image-screenshots en E2E-resultaten worden als `verification`-artifact bij de GitHub-controles bewaard.

Uitgevoerde lokale controles: TypeScript, volledige unit-/contractsuite, 29 host-/deploytests, productiebuild, runtimebundel, echte PostgreSQL-transacties/versieconflicten, herhaalde import, beeldformaten, echte WAV/MP4-conversie en de bovenstaande browsers. De bestaande fixture-afhankelijke unitcheck mag lokaal overslaan; de geïsoleerde GitHub-suite is de releasepoort voor Supabase, S3, mail en het complete image.

De productie-uitrol volgt uitsluitend de bestaande workflow na groene controles. De PR/workflow bevat het exacte releasecommit en de definitieve CI-uitslagen; er is geen aparte stagingomgeving gemaakt. De operator-/redactiehandleiding staat in [`ops/club-archive.md`](../../ops/club-archive.md).

## Koppeling met alle 64 acceptatiegevallen

Deze tabel noemt het concrete regressiebewijs. `E2E` betekent uitvoering tegen het echte geïsoleerde web/worker-image via de bestaande GitHub-job, geen lokale demoauthenticatie. De privacy-/rechtengevallen zijn daarnaast rechtstreeks tegen echte PostgreSQL-transacties getest.

| ID | Bewijs |
| --- | --- |
| H01 | Publieke browser + E2E: 16 gedateerde stops, toevoegstop en ingestelde startselectie. |
| H02 | E2E: selectie/focus en onveranderde verticale scrollpositie bij toetsenbordbediening. |
| H03 | E2E: Amerika-selectie, uitsluitend gerelateerde objecten of gerichte oproep. |
| H04 | E2E: Home/End en uitgeschakelde vorige/volgende-grenzen. |
| H05 | Gedeelde overlapfunctie, decenniumfilters en teller; browserreferentie. |
| H06 | Publieke browser + E2E: 1987 blijft leeg; formulier krijgt 1987 zonder maand. |
| H07 | E2E: overzichtsmarkering wist exact jaar en herstelt de hele reis. |
| H08 | E2E: pijlen, Home/End, focus en rail. |
| H09 | Vijf echte viewports, horizontale rail/snap en geen pagina-overflow. |
| H10 | Publieke browser/E2E met reduced-motion en blijvende bediening. |
| H11 | Integratie: instellingen uit/aan persistent; zelfstandige routes blijven bestaan. |
| H12 | Echte route-/slugresolutie, 404, bronverwijzingen, metadata en sitemap. |
| D01 | Units + integratie: jaar zonder verborgen januari. |
| D02 | Unit: seizoen 1999/2000 overlapt beide jaren en decennia; dezelfde functie in tellers/suggesties. |
| D03 | Units + correctie-integratie: circa-datering behouden. |
| D04 | Units + museum-E2E: onbekend blijft onbekend en sorteert achteraan. |
| D05 | E2E: maandkeuze uitgeschakeld zonder jaar; uitleg aanwezig. |
| D06 | Tijdlijnfilters gebruiken conjunctie, resultaten en reset; browserreferentie. |
| D07 | Integratie: echte persoon-/team-/artikel-ID’s, actuele namen en gepubliceerde zoek-/verhaallinks. |
| D08 | Museum-E2E en integratie: collecties, zoeken, aantallen en lege reset. |
| D09 | Bron-/seedunit: 15 augustus 1950 tegenover foto seizoen 1950/1951. |
| D10 | Bronunit + detail-E2E: 2009/2010, gepubliceerd 2024, opname onbekend en verschillende standpunten. |
| D11 | Museum-E2E: onbekend briefhoofd, digitale herkomst, geen verzonnen eigendom. |
| D12 | Broncomponent + browser: bewuste Beelden gezocht-presentatie en gerichte inzendroute. |
| I01 | Echte gastbrowser + PostgreSQL-ontvangst; tekst-only transacties. |
| I02 | Integratie + onafhankelijke browser: anonimiteit en afwezigheid privé-e-mail in publieke API/HTML. |
| I03 | E2E: daadwerkelijke Supabase-login, profielinvulling, accountkoppeling en eigen anonimiteitskeuze. |
| I04 | Clientvelden, gedeelde schemas en serverafwijzing vóór ontvangst. |
| I05 | Date-schema + redactie: expliciete maand zonder maand wordt geweigerd. |
| I06 | Servertest toestemming=false, native verplichte checkbox en standaard uit. |
| I07 | E2E: heen/terug door drie stappen; titel, bestanden en bijschriften blijven staan. |
| I08 | Dezelfde overlapfunctie en echte doel-ID’s in suggesties; server valideert doel bij ontvangst/publicatie. |
| I09 | Clientwissel wist ongeschikte koppeling; server normaliseert soort/doel opnieuw. |
| I10 | Gedeelde schema: tien unieke bestanden toegestaan, elfde geweigerd; manifest/owner/count op server. |
| I11 | Servertests exacte bytegrenzen 10/50 MiB; identiek clientbeleid. |
| I12 | Werkelijke decoder: leeg, HTML als foto, beschadigde WebP en corrupte audio geweigerd. |
| I13 | Werkelijke JPEG/PNG/WebP/AVIF/GIF plus WAV/MP4-decodering; worker-E2E. |
| I14 | E2E: bestandvolgorde veranderen en bijschrift blijft bij eigen bestand; gekozen volgorde opgeslagen. |
| I15 | Integratie + verloren antwoord in browser: idempotente batch/upload/ontvangst, één record. |
| I16 | Browser behoudt invoer bij netwerkfout; servertransacties rollen terug; verlopen uploadopruiming herstart uitgeputte tijdelijke verwerking en herstel zonder terugkeer van verwijderde bestanden. |
| I17 | Tijdens actieve verwerking geen Escape-/buitensluitactie; browser-busy en sluitwaarschuwing. |
| I18 | Vier aanbiedingen gevalideerd; bruikleen daadwerkelijk ontvangen, geen automatische publicatie/overdracht. |
| M01 | Integratie + tweede gastsessie: ontvangst en afgeleiden blijven privé vóór goedkeuring. |
| M02 | Servergrants: onbevoegd/read-only/team geweigerd; publieke CMS-API 401. |
| M03 | Inboxfilters soort/status/tekst/datum, serverdata en 25/50/100-paginatie. |
| M04 | Integratie + twee browsers: twee van drie bestanden publiek, derde URL geweigerd. |
| M05 | Correctie is annotatie; oorspronkelijk verhaal/proposed/revisies blijven bestaan. |
| M06 | Server weigert afwijzing zonder reden en bewaart geldige afwijzing. |
| M07 | Integratie: interne info-status zonder verzonnen mailbevestiging. |
| M08 | Integratie: verdwenen doel blokkeert de gehele publicatie. |
| M09 | Integratie: verouderde versie 409; geen stille overschrijving. |
| M10 | Integratie + browser: hoofdrecord/media meteen afgeschermd na intrekken. |
| M11 | Integratie + E2E: opnieuw publiceren behoudt ID/slug en maakt geen tweede record. |
| M12 | Integratie: object opnieuw koppelen; oude relatie aan beide kanten verdwenen. |
| M13 | Beheer gebruikt object-/momenttype bij publicatielink, ook voor aanvullingen. |
| M14 | Browserherladen en onafhankelijke tweede sessie; E2E gebruikt aparte echte beoordelaar. |
| M15 | Expliciete publieke DTO + responsecontrole: geen e-mail, notitie, storagekey of account-ID. |
| M16 | Integratie: versiegebonden homepagekeuzes; widget toont alleen bij actieve relatie passend object. |
| U01 | Werkelijke zoom, 100–300%, Escape en terugkerende triggerfocus. |
| U02 | Worker-E2E: één audio/video zonder foto, echte MP4, controls, Range en geen autoplay. |
| U03 | E2E: keyboard 0/100, standaard 50 en echte touchcontext aan beide kanten. |
| U04 | Werkelijke 360 px-viewport, lange bestandsnamen, inputs en overflowcontrole. |
| U05 | E2E: licht/donker-weergave met gelijkblijvende inhoud; keyboardfocus. |
| U06 | Verplichte bestaande CI: type/build, serverflows, Supabase/S3, backup, production-image en browsers vóór deploy. |

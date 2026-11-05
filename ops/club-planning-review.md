# Cluborganisatie, planning en Sportlink — review

Deze wijziging implementeert de overdracht van 20 oktober 2026 in de bestaande applicatie. De featurebranch is `codex/club-planning-sportlink-settings`; [PR #22](https://github.com/duindorpsv/website/pull/22) is de reviewplek. Er is geen productie-uitrol uitgevoerd. Push/merge naar `main` zou de bestaande productieworkflow starten en hoort bij een afzonderlijke releasebeslissing.

## Uitgangspunten en mapping

De gecontroleerde productiebasis is `618321bdec131d00bd443fdde4c855a6bfb4846c`, met succesvolle productie-run `39426021912`. De opgegeven prototypebron is v48, commit `fcb53aaf1dc28779700e69e7b46e7bb0417e8da5`. De pakketverificatie controleerde 620 pakketbestanden en 590 bronbestanden. De volledige prototypepatch is niet over de applicatie toegepast.

| Eis | Productie-integratie |
| --- | --- |
| F01: enkele paginakop | `components/club-cms.tsx` en `cms/page-header.tsx`; primaire acties behouden hun echte handlers/rechten via de gedeelde kop. Secties en dialogtitels blijven bestaan. |
| F02: personen en commissies | `cms/club-people.tsx`, `lib/cms/people-csv.ts`, planningtypes, bestaande records/API; expliciete accountrelatie en commissiegebonden rollen. |
| F03: velden en ruimtes | `cms/locations-manager.tsx`, `lib/server/planning.ts`; echte parentrelaties, unieke bronmapping en servercontrole van wijzigingen. |
| F04: centrale planning | `cms/planning-board.tsx`, `lib/server/planning.ts`, bestaande `records.ts`; agenda en reserveringen lezen dezelfde activiteiten. |
| F05: trainingen | `cms/training-manager.tsx`, `planning/series` en `planning/migration`; concrete reeks, voorvertoning, atomair opslaan en individuele uitzonderingen. |
| F06: publieke uitvoer | Publieke planning-/ICS-routes, `records.ts`, `public-content.tsx` en `clubmuur-community-cards.tsx`; maximaal vijf agenda-items, echte tijden/locatie, expliciete publicatie en beperkte openbare DTO’s. |
| F07: compacte keuzes | `cms/multi-select.tsx/.css`, gericht geïntegreerd in huidige `AccountsManager` en `WidgetInspector`, planning en trainingen. |
| F08: achtergrondslider | `cms/hero-slider-manager.tsx/.css`, `lib/cms/hero-slider.ts`, bestaande homepage/backgroundrenderer. Spelersportretten en vier hero-vakken blijven zelfstandig. |
| Aanvullend Sportlink-verzoek | `cms/sportlink-settings-manager.tsx`, `lib/server/sportlink-*`, private CMS-routes en bestaande worker/cache. Zie [Sportlink beheren](sportlink.md). |

De productie-navigatieboom, veilige bestemmingen en redirects, pagina-editor met layout-v2/DnD-kit/Tiptap, auth/memberships/rollen, formulieren/Resend, uploads/Hetzner-opslag, albums en nieuws-/verhalenpublicatie blijven de bestaande implementatie gebruiken. Er zijn geen wijzigingen aan workflows, runners, secrets, domeinen of hostingarchitectuur.

## Data en migratie

`0016_club_planning.sql` voegt drie private tabellen toe: reserveringsindex, persoon-accountrelaties en legacy-overnameregistratie. De tabellen krijgen RLS en geen directe rechten voor publieke Supabase-rollen. Unieke indexes beschermen bronidentiteiten. De normale CMS-commandotransactie blijft leidend voor wijzigingen, versiecontrole, revisies, audit en softdelete.

De schemamigratie wijzigt geen bestaande CMS-record-ID’s, publicaties, accounts of memberships en seedt geen prototypepersonen, wedstrijden of commissies. Het overnamepaneel toont bestaande agenda-/roostergegevens en commissievoorstellen ter beoordeling. Ontbrekende eindtijd, periode, team of locatie wordt niet geraden. Bevestigde overname bewaart checkpoints en bronversies; herhalen maakt geen dubbele activiteiten. Oude publieke gegevens blijven als compatibiliteit zichtbaar tot de nieuwe bron expliciet gepubliceerd is. Werkversies worden niet stilzwijgend meegenomen naar live.

Zie [het backendrapport](club-planning-backend-review.md) voor concrete SQL-fixtures, voor/na-controles en herstel. Er is geen productie-dry-run met de echte clubdatabase uitgevoerd. De migratiebewijzen gebruiken een uitsluitend voor deze taak gemaakte lokale SQL-testdatabase en vaste fictieve gegevens.

Reserveringen worden onder dezelfde transactie opnieuw gecontroleerd, inclusief boven-/onderliggende velden. Het tijdvak is `[begin,einde)`: aansluitende tijden zijn geldig. Een mislukte reeks wordt volledig teruggedraaid. Publicatie gebruikt dezelfde brongegevens, maar laat interne personen-/account-/bronidentiteiten weg. Personen verwijderen behoudt historische verwijzingen en het account; herstellen gebeurt als concept met dezelfde identiteit.

Sportlink houdt gezag over wedstrijddatum, tijd, status, veld en kleedkamers. Exacte koppelingen worden beheerd; een accommodatie wordt niet als veld herkend. Nieuwe wedstrijden zijn intern. Bij refresh worden bronvelden van een bestaande livewedstrijd bijgewerkt zonder privéteksten of lokale conceptkeuzes te publiceren. Een oudere netwerkresponse mag door cachefencing nieuwere gegevens niet overschrijven. Goede deelgegevens blijven bij een storing beschikbaar.

## Verificatie

| Controle | Uitkomst |
| --- | --- |
| `pnpm test` lokaal | 185 geslaagd, 1 bestaande skip, 0 mislukt |
| `pnpm typecheck` lokaal | Geslaagd |
| `pnpm build` lokaal | Geslaagd, inclusief nieuwe CMS- en publieke routes |
| Operationele Python-tests | 29 geslaagd |
| Echte SQL-transacties | Planning/concurrentie/hiërarchie/reeks/migratie/privacy/accountsoftdelete/importrollback en Sportlink-cache/mapping/taakqueue geslaagd |
| Componentbrowser | Echte provider/componenten; API-fixtures uitsluitend voor isolatie. Onder andere bewaren/herladen, 409-behoud, toetsenbord/dropdown, mobiel, upload, draft/live en motion gecontroleerd. |
| Volledige Supabase-/Auth-/Storage-/E2E-controles | Bestaande [GitHub-workflow bij PR #22](https://github.com/duindorpsv/website/pull/22/checks); de definitieve run is daar leidend. Lokale SQL-/componentharnesses vervangen deze controle niet. |

Visueel bewijs en de matrix staan in [het reviewpakket](../design/club-planning-2026-10-20/README.md). Zie [de slidervergelijking](hero-slider-review.md) en [het frontendrapport](../design/prototype-planning-frontend-review-2026-10-20.md). De sliderpanelen hebben 47 gecontroleerde vergelijkingen met nul afwijkende pixels; de CMS-shell valt buiten die uitspraak. Voor de planning zijn daarnaast 46 uitgelijnde inhoudspanelen gemeten: gelijke DOM-breedte en -hoogte, met de verschuiving door de verwijderde dubbele kop afzonderlijk gerapporteerd. Bewuste verschillen zijn de vereiste enkele kop, echte concept-/publicatiebediening, paginatie en bestaande productiebeperkingen. Een algemene claim dat iedere pixel van de volledige applicatie identiek is, wordt niet gedaan.

De officiële Sportlink-artikeldefinities en parameters zijn onderzocht. Werkelijke clubcredentials waren in de ontwikkelsessie niet beschikbaar. De implementatie is gecontroleerd met synthetische providerresponses en echte repositorytransacties; een volledige live ledenimport is niet bewezen. De openbare teambron is geen volledige ledenadministratie. Import accepteert alleen werkelijk beschikbare stabiele relatiecodes en biedt daarnaast gecontroleerde CSV-voorbereiding. Er worden geen accounts of uitnodigingen aangemaakt.

De publieke agenda behoudt de beoordeelde legacy-inhoud totdat die is overgenomen, en vult deze aan vanuit de centrale publicaties zonder dubbelen. Detail en ICS gebruiken dezelfde centrale activiteit. Een geopend detail controleert de publieke serverversie bij openen, focus en iedere dertig seconden; intrekken sluit het venster bij die controle. Tijdelijke verbindingsfouten vervangen geen goedgekeurde gegevens. De oude agendacompatibiliteit verzint geen eindtijd of locatie. De expliciete openbare keuze bij een nieuwe trainingsreeks publiceert alle momenten atomair en vereist afzonderlijke publicatierechten.

Het [aanvullende acceptatierapport](../design/prototype-planning-supplement-review-2026-10-20.md) registreert de volledige scenariomatrix, alle twintig huidige beheerkoppen, 26/51/101 personen, rol- en rechtengevallen, veldhiërarchie, dropdownranden en publieke agenda met intrekking. De echte SQL-grenscontrole gebruikt daarnaast 1.510 andere records en 1.051 personen: het personenregister blijft volledig en teambeperkte planners zien geen privégegevens van andere boekingen. De bewijspakketten en het metadata-erratum staan in het reviewpakket.

## Beheer, toekomstige release en rollback

De gewone beheerhandelingen staan in [CMS-inhoud beheren](cms-content.md), [Sportlink beheren](sportlink.md) en [Hero-slider](hero-slider-review.md).

Bij een later geautoriseerde release gelden de bestaande [deployhandleiding](first-deploy.md), [rollback- en herstelprocedure](rollback-and-restore.md) en operationele scripts. Maak de bestaande databaseback-up, laat de normale schemamigratie/provisioning lopen en controleer web/worker-readiness. Controleer daarna de overnamevoorstellen in het CMS; beoordeel en publiceer bewust. Voor Sportlink zijn geen nieuwe secrets nodig: de bestaande servercredential `SPORTLINK_CLIENT_ID` blijft in GitHub `production`. Bewaar eerst de configuratie en controleer team-/locatiemappings voordat imports worden aangezet.

Een applicatierollback gebruikt het vorige image via de bestaande deployprocedure. De nieuwe tabellen zijn toevoegingen en hoeven voor een applicatierollback niet verwijderd te worden; verwijder geen clubrecords of checkpointdata. De oude agenda-/roosterrecords blijven beschikbaar. Een terugdraaiing van contentimport gebruikt de bestaande gecontroleerde importrollback, die latere edits niet overschrijft. Werkversies, publicaties, audit en back-ups blijven de herstelbronnen. Geen van deze productiehandelingen is tijdens deze opdracht uitgevoerd.

# Backendreview cluborganisatie en planning

Reviewdatum: 20 oktober 2026. Scope: F02–F06, de aansluiting van de hero-slider en private Sportlink-instellingen op de bestaande recordopslag, en herstel van hun referenties. Dit document beschrijft ontwikkeling en synthetische tests. Er is geen productiedatabase gemigreerd, geen productiecontent omgezet en geen productiepublicatie of e-mail gestart.

## Opslag en migratie

[Migratie 0016](../db/migrations/0016_club_planning.sql) voegt drie tabellen toe:

- `cms_activity_reservations`: afgeleide reserveringsindex met activiteit, locatie en concrete begin-/eindinstanties. De versiegebonden `cms_records.draft` blijft de operationele bron.
- `cms_person_accounts`: expliciete foreign keys naar het persoonsrecord en `auth_user`; het account is uniek onder actieve persoonskoppelingen.
- `cms_planning_legacy`: checkpoint per legacybron en legacy-ID, met bronversie, centrale activiteit-ID, alle reeks-ID's en een rapport van de publieke omschakeling.

Daarnaast komen er unieke indexen voor de genormaliseerde persoonscode `upper(btrim(sportlinkId))` en voor de Sportlink-wedstrijdidentiteit. De tabellen hebben RLS en geen toegang voor `PUBLIC`, `anon`, `authenticated` of `service_role`. De bestaande [runtime-inrichting](../lib/server/database-provision.ts) verleent de serverrol `duindorp_app` toegang. Er zijn geen nieuwe toegangsrechten voor browserrollen of nieuwe `SECURITY DEFINER`-functies.

De migratie voegt geen personen, commissies, locaties, wedstrijden of trainingsboekingen toe. De nieuwe `planning`-collecties beginnen leeg; een oudere browserback-up krijgt eveneens lege collecties. Bestaande persoons-ID's, rollen, auteursverwijzingen en draft/live-versies blijven behouden.

## Concreet uitgevoerd SQL-bewijs

De repositorychecks draaiden op de afzonderlijke container `duindorp-planning-backend-test`, PostgreSQL 17, met tijdelijke RAM-opslag en database `planning_test` op `127.0.0.1:63611`. Dit was geen Supabase Auth-stack. De checks gebruikten een synthetische `Principal`, echte PostgreSQL-transacties en dezelfde repositoryfuncties als de applicatie. Bestaande Supabase-testguards zijn niet aangepast of omzeild.

Een aanvullende alleen-lezen controle van deze fixtures op **2026-10-20 14:44:38 UTC** bevestigde onderstaande toestand. De tellingen gelden uitsluitend voor de genoemde fixture-ID's, niet voor een club- of productiedataset.

| Controle | Voor de fixture | Na uitvoering |
| --- | --- | --- |
| Locaties `room`, `field`, `A`, `B`, `A1` | 0 van deze records | 5 records, ieder versie 1, allemaal intern |
| Twee gelijktijdige boekingen `concurrent-one`, `concurrent-two` | 0 | Alleen `concurrent-one` bestaat; de tweede poging kreeg een reserveringsconflict |
| Aansluitende boeking `adjacent` | 0 | 1 record en reservering; begint precies waar de eerste eindigt |
| Onafhankelijke helften `halfA` → `A`, `halfB` → `B` | 0 | Beide bestaan; `whole` en `quarter` zijn na hun afgewezen pogingen afwezig |
| Afgeleide reserveringen voor bovenstaande activiteiten | 0 | Exact 4: `concurrent-one/room`, `adjacent/room`, `halfA/A`, `halfB/B` |
| Persoonskoppelingen `person1`, `person2`, `person3` | 0 | Alleen `person1` bestaat; tweede accountkoppeling en onbevoegde koppeling zijn afgewezen |
| Bronwedstrijd `source-match` | 0 | Versie 3; draft- en live-datum beide `2026-11-23`; privéconceptbeschrijving verschilt nog van live; `cms_publications.snapshot` is gelijk aan de nieuwe liveversie |

Deze uitkomsten komen uit `.runtime/run-planning-database.ts` en de latere read-only controle `.runtime/read-planning-proof.ts`. De tijdelijke, gesaniteerde uitvoer staat in `/dev/shm/duindorp-planning-backend-proof.json`. Deze lokale hulpmiddelen zijn geen productie-installatiescripts. De blijvende regressies staan in [club-planning.test.ts](../tests/integration/club-planning.test.ts).

### Legacy-agenda en weekrooster

De migratiechecks gebruikten een transactie die na alle assertions volledig is teruggedraaid. `site-agenda` en `site-training` werden uitsluitend binnen die transactie vervangen door testfixtures met bronversies 777 en 778.

| Fase | Agenda | Training |
| --- | --- | --- |
| Voor toepassing | 1 legacy-item; goedgekeurde titel verschilt van privéwerkversie; 0 centrale doelrecords | 1 oud weekpatroon; 0 centrale doelrecords |
| Preview/toepassing | 1 centraal concept, geen publicatie van de privétekst; het goedgekeurde legacy-item blijft openbaar | Expliciete periode `2027-11-22` t/m `2027-11-29`, maandag; exact 2 interne momenten, met oorspronkelijke tijden `19:00–20:30`; het oude openbare weekrooster blijft gelijk |
| Herhaalde toepassing | `alreadyApplied: true`; dezelfde activiteit-ID; nog steeds 1 doelrecord | `alreadyApplied: true`; dezelfde reeks-ID's; nog steeds 2 doelrecords |
| Bewuste centrale publicatie | Het oude agenda-item verdwijnt; precies de centrale goedgekeurde activiteit verschijnt | Niet openbaar gepubliceerd in deze fixture; het codepad wacht totdat alle gemapte reeksleden bewust openbaar zijn gepubliceerd |
| Centrale publicatie intrekken | De oude legacyversie komt niet terug | Niet uitgevoerd in deze trainingsfixture; het checkpoint is het codepad dat terugkeer van een al overgenomen patroon voorkomt |
| Na buitenste rollback | Geen nieuwe doelrecords of mapping van deze fixture; oorspronkelijke bron hersteld | Geen nieuwe reeksrecords of mapping van deze fixture; oorspronkelijke bron hersteld |

De agenda-fixture van de laatste run had legacy-ID `legacy-79cd5807-8746-45ce-871a-e84443ea355c` en deterministisch doel `legacy-2d8db01d828f18ad8a00cb228f3cf3f2`. Trainingsbron `site-training` / `0:0` kreeg reeksleden `series-legacy-e73205d82c0b6af0eee6ff2aa02a5a2b-2027-11-22` en `series-legacy-e73205d82c0b6af0eee6ff2aa02a5a2b-2027-11-29`.

Een afzonderlijke expliciete `mode: preview`-controle gebruikte bronversie 779, legacy-ID `dry-run-review-20261020` en doel-ID `legacy-9a9654f6d6ec14ce9e696763ad9f1828`. De respons was `count: 1`, `conflicts: []`, `wasPublic: true`, `privateChanges: true`. Het aantal doelrecords was vóór en na de preview **0**; ook het aantal mappings en reserveringen bleef **0**. De tijdelijke bronfixture is teruggedraaid. Uitvoer: `.runtime/run-planning-dry-run-proof.ts`.

De preview maakt geen reserveringen. Ontbrekende eindtijd, locatie-/teammapping, ongeldige periode, DST-problemen en bestaande resourceconflicten moeten eerst worden opgelost. De server raadt geen eindtijd of veld. Na een eerste overname worden wijzigingen in de oude singleton geweigerd; resterende onderdelen worden via dezelfde review overgenomen. De implementatie staat in [planning-migration.ts](../lib/server/planning-migration.ts), [de migratieroute](../app/api/cms/planning/migration/route.ts) en `projectPublicPlanning` in [records.ts](../lib/server/records.ts).

### Back-upimport en terugdraaien

De laatste lokale v1-import had batch-ID `0343e12e-2ba1-40e9-a023-17276318c38c`. De geïmporteerde nieuwe records waren:

- `import-loc-79cd5807-8746-45ce-871a-e84443ea355c`;
- `import-activity-79cd5807-8746-45ce-871a-e84443ea355c`.

Beide waren vooraf afwezig, werden als **concept op versie 1** opgeslagen en kregen geen liveversie, ook al vermeldde de back-up `published: true`. De activiteit bouwde exact één operationele reservering op. `site-hero-slider` werd als werkversie op versie 10 hersteld, met behoud van zijn bestaande liveversie. Een herhaalde import met dezelfde checksum leverde dezelfde batch op.

Na `rollbackImport` waren de twee nieuwe records versie 2, gearchiveerd en ongepubliceerd; hun reserveringen waren **0**. De slider was versie 11 met de eerdere liveversie hersteld. Deze controle verifieert ook dat archiveren historische inhoud bewaart. Afgeleide referenties, accountkoppelingen en reserveringen worden binnen dezelfde transactie herbouwd en opnieuw gevalideerd.

De volledige serverexport bevat records, revisies, publicaties, private Sportlink-configuratie en de drie nieuwe index-/mappingtabellen. De browserimporter accepteert v1-browserback-ups; een v2-serverexport wordt niet als browserbestand geïmporteerd. Volledig serverherstel volgt de bestaande operationele back-upstraat. Sliderverwijzingen met `source: 'media'` krijgen bij het omzetten van browseruploads het nieuwe media-ID; Sportlink-bronidentiteiten en ingebouwde achtergronden worden daarbij niet herschreven. Zie [imports.ts](../lib/server/imports.ts), [browser-media-import.ts](../lib/server/browser-media-import.ts) en [exports](../app/api/cms/exports/route.ts).

## Atomair gedrag, rechten en privacy

Alle planningmutaties gebruiken de bestaande recordtransactie, verwachte recordversie en operatie-ID. De transactieslotcode `736402` serialiseert reserveringen, hiërarchiewijzigingen en import/herstel. De operatie-ID wordt na het verkrijgen van het slot opnieuw gecontroleerd. Intervallen zijn `[begin, einde)`: aansluitende boekingen mogen, overlappende boekingen op dezelfde locatie of een voorouder/velddeel niet. Onafhankelijke helften mogen tegelijk. Annuleren verwijdert de bezetting. Een toekomstige reservering blokkeert deactiveren van de betrokken locatie of gerelateerde veldonderdelen. Een reeks is één transactie; één fout laat geen gedeeltelijke reeks achter.

Een volledige handmatige trainingsreeks wordt atomair verwijderd via `DELETE /api/cms/planning/series`, met de volledige verwachte ID-/versieset en een operatie-ID. Een ontbrekend, nieuw of gewijzigd moment blokkeert de hele bewerking; alle teamrechten worden per moment gecontroleerd. De generieke mutatielimiet blijft 50. Een echte SQL-regressie verwijdert 53 momenten tegelijk, controleert 53 vrijgekomen reserveringen en een idempotente herhaling, en weigert een onvolledige, verouderde of onbevoegde selectie.

Reeksen omvatten maximaal 364 dagen tussen begin en einde, inclusief de grenzen; één weekdag kan daardoor 53 momenten opleveren. Alle momenten worden afzonderlijk gevalideerd. `Europe/Amsterdam` is leidend: niet-bestaande zomertijd wordt geweigerd; bij de dubbele wintertijd is een expliciete keuze nodig. ICS ontsnapt tekst, gebruikt CRLF en regels van maximaal 75 UTF-8-bytes, en behoudt ook de tweede wintertijdinstantie.

Activiteiten gebruiken de bestaande paginarechten, met controle van **alle** gekoppelde teams bij lezen en wijzigen. Locaties en legacy-overname vereisen clubbrede rechten. Private Sportlink-configuratie kan alleen met `settings.manage` en clubbrede bevoegdheid worden gewijzigd, ook via generieke mutations. Een persoon/account koppelen, ontkoppelen of zo'n koppeling herstellen vereist `users.manage`; personen aanmaken verleent die bevoegdheid niet. De unieke accountrelatie wijzigt geen rollen, sessies of accounts.

Een persoon naar de prullenbak verplaatsen trekt de persoonsopenbaarheid in en behoudt historische commissie-/auteursverwijzingen en het account. Toekomstige operationele activiteiten blokkeren dit totdat hun persoonskoppeling is aangepast. De SQL-regressie controleert publiceren → livecommissie → prullenbak → herstel van dezelfde ID/accountrelatie als concept → expliciet opnieuw publiceren. Het account blijft bestaan; de publieke commissie verbergt de verwijderde persoon tussentijds.

Publieke planning bevat uitsluitend bewust gepubliceerde, openbare, niet-geannuleerde momenten. De publieke DTO bevat titel, type, datum, tijden, beschrijving en locatienaam; interne persoon-, commissie-, team-, account- en bronkoppelingen ontbreken. Publieke commissies bevatten alleen goedgekeurde niet-verwijderde personen. `showContact` begrenst e-mail en telefoon. `backofficeUserId` en `sportlinkId` worden altijd verwijderd uit publieke personen, ook bij `showContact: true`. Interne locatiebeschrijvingen of accountgegevens worden niet via de publieke planning aangeboden.

## Bronownership en beperkte liveproviderbeschikbaarheid

Gewone CMS-mutaties kunnen bij een Sportlink-wedstrijd datum, tijden, type, titel, bronstatus, bronidentiteit en bronbeheerde veld-/kleedkamerindeling niet aanpassen. Lokale beschrijving, publieke keuze en aanvullende lokale relaties/resources blijven beheersbaar. `sourceData.locationIds` en optioneel `sourceData.teamIds` maken het verschil tussen bronmapping en lokale aanvullingen expliciet.

Alleen het interne, geautoriseerde integratiepad mag bronvelden verversen. Bij een bestaande livewedstrijd wordt daarvoor een nieuwe onveranderlijke publicatiesnapshot gemaakt die alleen bronvelden bijwerkt. Een privéconceptbeschrijving of andere ongepubliceerde lokale wijziging wordt niet mee gepubliceerd. Nieuwe bronactiviteiten beginnen intern. Het gedrag is met vaste providerfixtures en echte repositorytransacties getest.

De officiële Sportlink-artikeldefinities beschrijven een stabiele `relatiecode` bij teamindelingen. Dit bewijst niet dat een live client alle leden of die codes werkelijk mag ontvangen. Er is geen volledige live ledenadministratie-import bewezen. Alleen werkelijk beschikbare, niet-afgeschermde rijen met stabiele bronidentiteit komen voor review/import in aanmerking; publieke rosterhashes zijn geen identiteit. CSV blijft beschikbaar wanneer de bevoegde bron ontbreekt. Zie [Sportlink-handleiding](./sportlink.md) voor de broncontrole en operationele beperkingen.

## Verificatie en overdracht

Uitgevoerd en groen:

- `pnpm typecheck`;
- `git diff --check`;
- `pnpm exec tsx --test tests/unit/club-planning.test.ts tests/unit/browser-media-remap.test.ts`: **9 tests geslaagd**;
- lokale repositorychecks voor gelijktijdige boekingen, veldhiërarchie, autorisatie, bronlocking, privé/live-scheiding, migratie-idempotentie, compatibiliteit, import/rollback en persoon/accountherstel.

De import-/herstelregressie draait volledig binnen een buitenste rollback, met de optionele interne transactieadapter van de repository. Daardoor blijft ook een vooraf afwezige slider-singleton afwezig. Gecommitte fixtureboekingen voor de gelijktijdigheidstest worden na de suite ongepubliceerd/gearchiveerd; hun operationele indexen worden gewist. Append-only audit-, revisie- en publicatieguards blijven actief.

Blijvende testdefinities:

- [planning en ICS-unitchecks](../tests/unit/club-planning.test.ts);
- [media-ID-remap bij herstel](../tests/unit/browser-media-remap.test.ts);
- [echte planningrepository-regressies](../tests/integration/club-planning.test.ts);
- [Sportlink-integratieregressies](../tests/integration/sportlink-sync.test.ts);
- [slider-integratieregressies](../tests/integration/hero-slider.test.ts).

De integratiesuites houden hun `assertLocalSupabaseTests`-guard en horen in de afzonderlijk ingerichte Supabase-teststack/CI te draaien. De lokale PostgreSQL-checks bewijzen transacties en repositorygedrag, geen Supabase OTP-login, Data API-beleid of liveproviderbevoegdheden. De volledige Supabase-/CI-uitvoering en uiteindelijke review horen bij de PR-overdracht; dit document claimt daarvoor geen nog niet behaalde uitslag. Productie-uitrol is in deze opdracht niet uitgevoerd.

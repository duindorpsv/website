# Clubarchief, tijdlijn en digitaal museum

De bestaande Duindorp SV-app bevat één verbonden archief. De homepage heeft de interactieve tijdlijn uit prototype v58 (`50b3944b78aebfe82845c0bd4d7b99288f03abc7`), met een doorlopende rail, echte jaarverhoudingen, toetsenbordbediening, lege jaren en het museumstuk dat bij het gekozen moment hoort.

Publieke ingangen:

- `/clubmuur#clubarchief`
- `/clubmuur/club/tijdlijn` en `/clubmuur/club/tijdlijn/{slug}`
- `/clubmuur/club/museum` en `/clubmuur/club/museum/{slug}`

Beheer: `/beheer#clubarchief`. Alleen clubbrede accounts met **pagina’s lezen/bewerken/publiceren** krijgen de privé-inbox en mutaties. Teamgebonden rollen worden op de server geweigerd. Inzenders hebben geen account nodig. Een bestaande, via Supabase geverifieerde clubsessie vult naam en e-mail in; anoniem publiceren blijft een eigen keuze.

## Databaseverbindingen

De bestaande Supabase-verbinding blijft in session mode op poort 5432. Het productieproject heeft een limiet van 15 sessies per database/gebruiker. Elk Node-proces deelt daarom één raw pool van maximaal 3 verbindingen en één aparte Drizzle-pool van maximaal 1 verbinding over alle Next.js-pagina- en API-bundels. Webserver en worker gebruiken samen maximaal 8 sessies; ook tijdens het vervangen van één proces blijft ruimte over. Extra aanvragen wachten in de bestaande clientpool. De aparte pools behouden de verschillende JSON- en datumserializers. Inactieve verbindingen sluiten na 20 seconden. Hiervoor zijn geen nieuwe GitHub-secrets of variabelen nodig.

Bij `EMAXCONNSESSION` controleer je of er buiten de webserver en worker nog handmatige scripts of oude containers met hetzelfde runtime-account verbonden zijn. Verhoog niet uitsluitend de Supabase-limiet om dubbele applicatiepools te verbergen.

## Redactionele werkinstructie

1. **Moment maken:** open *Archief & verbindingen → Moment toevoegen*. Vul titel, introductie en verhaal in. Kies de juiste nauwkeurigheid: maand/jaar, alleen jaar, seizoen, circa of onbekend. Voeg bron, personen, teams, verhalen en eventuele museumstukken toe. Bewaar een concept; pas **Publiceren** maakt de gecontroleerde versie zichtbaar.
2. **Museumstuk toevoegen:** kies *Museumstuk toevoegen*. Leg soort, datering, herkomst en eventuele maker/eigenaar vast. “Digitaal archiefstuk” bewijst geen bezit van het fysieke origineel. Koppel één of meer momenten en collecties. Alleen expliciet goedgekeurde bestanden komen publiek beschikbaar.
3. **Beeld toevoegen:** kies een gepubliceerde afbeelding uit de bestaande mediabibliotheek of een ontvangen, verwerkt archiefbestand. Nieuwe beelden kunnen via de bestaande mediabibliotheek worden geüpload. Archiefgebruik krijgt een zelfstandige, veilige kopie met eigen intrekbare toegang. Bewerk bijschrift, maker/bron, volgorde en omslag. Een niet-goedgekeurd beeld kan geen publieke omslag of vergelijking zijn.
4. **Inzending beoordelen:** filter de inbox op status, soort, tekst/naam en ontvangstdatum. Open een bijdrage. Controleer tekst, datering, bron, doel en elk bestand afzonderlijk. Privé-e-mail, oorspronkelijke ontvangst en toestemming zijn alleen hier zichtbaar. Geef alleen geschikte bijlagen goedkeuring en bevestig daarna de publicatie. “Meer informatie nodig” is een interne status, geen verzonden e-mail. Afwijzen vereist een reden.
5. **Dubbele herinnering samenvoegen:** verander een nieuw moment in *Aanvulling*, kies het bestaande moment/object en publiceer. Er komt dan een herkenbare bijdrage bij de bestaande pagina in plaats van een tweede hoofdrecord.
6. **Correctie verwerken:** publiceer de correctie als herkenbare annotatie bij het juiste doel. De oorspronkelijke tekst blijft staan. Een gecontroleerde wijziging van de hoofdtekst gebeurt afzonderlijk in de catalogus, met bron, redactionele reden en revisie.
7. **Intrekken:** gebruik *Publicatie intrekken* en bevestig. De publieke hoofdpublicatie van een nieuw moment/object verdwijnt mee; een ingetrokken aanvulling verdwijnt alleen als annotatie. Nieuwe verzoeken naar afgeleide bestanden worden opnieuw op actuele publicatierechten gecontroleerd. Opnieuw publiceren gebruikt hetzelfde ID en dezelfde URL. Bij verplaatsen van een museumstuk vervalt de oude verbinding aan beide kanten. Ook de catalogusvelden en versies van de betrokken records worden bijgewerkt, zodat een later geopende of verouderde editor de koppeling niet ongemerkt terugzet. Niet meer gepubliceerde verwijzingen kun je in de editor uitvinken.
8. **Homepage:** open *Op de homepage*. Schakel de widget aan/uit en kies gepubliceerde records. De widget toont bij een geselecteerd moment uitsluitend daarmee verbonden museumstukken; zonder relatie staat er een gerichte aanmeldactie.
9. **Toen & nu:** open een moment in de catalogus, klap *Toen & nu instellen* open en kies twee goedgekeurde foto’s. Bewerk volgorde, labels/dateringen, focus X/Y en toelichting; publiceer het moment opnieuw. De Houtrust-bron vergelijkt **seizoen 2009/2010** met een foto **gepubliceerd in 2024**. De recente opnamedatum is onbekend en de standpunten verschillen. Behoud die beperkingen.
10. **Revisie herstellen:** geef een redactionele reden op en kies een revisie als concept. De huidige publicatie blijft zichtbaar totdat het herstelde concept apart wordt gepubliceerd. Een oud gepubliceerd pagina-adres blijft na een slugwijziging met HTTP 308 doorverwijzen naar het nieuwe adres.

Bij een versieconflict blijft de eigen invoer open. Controleer de melding voordat je de actuele serverversie laadt. De module overschrijft geen nieuwere redactie stilzwijgend. Tijdens actieve upload/opslag blijft het inzendvenster open. Bij opnieuw openen toont het formulier ook het laatste ontvangstnummer uit deze browser. Na een netwerkfout kun je opnieuw insturen: hetzelfde ontvangstnummer wordt teruggegeven als de server de eerdere aanvraag al had opgeslagen.

## Inzenden en bestanden

De bezoeker doorloopt *Jouw herinnering → Beeld & geluid → Controleren & insturen*. Tekst zonder bestand is toegestaan. Naam of anoniem is verplicht; privé-e-mail is optioneel. Toestemming staat standaard uit en wordt met tekstversie `clubarchief-publicatie-v1` en servertijd vastgelegd. Bruikleen/schenking zijn aanbiedingen, geen eigendomsoverdracht.

Het beleid staat centraal in `lib/club-archive-schema.ts`: maximaal 10 bestanden, 10 MiB per foto en 50 MiB per audio/video. Zowel client als server controleren. De ruwe uploadroute slaat Next Proxy’s automatische 10 MiB-bodykopie over en controleert zelf herkomst, eigenaarschap, verloop en quota vóór het lezen; zo wordt een geldige grotere opname niet stilzwijgend afgekapt. Andere beveiligde routes behouden hun bestaande Proxy. Sharp decodeert en normaliseert echte JPEG/PNG/WebP/AVIF/GIF-bestanden; EXIF/GPS gaat niet mee naar de publieke WebP. Een geanimeerde GIF krijgt een stilstaande afgeleide. De worker gebruikt FFprobe en FFmpeg om echte audio/video te controleren en naar MP4 met H.264/AAC of AAC-audio te verwerken. Geen autoplay. Onleesbare of te zware bestanden leveren een fout op, geen ontvangstbevestiging.

Originelen en afgeleiden staan in de **private bestaande Hetzner S3-bucket**, onder `archive/`. Er zijn geen publieke historische originelen in `public/assets`. Alleen de route `/api/archive/media/{id}` levert veilige afgeleiden, na actuele toegangstoets. Video/audio ondersteunt HTTP Range. Publieke antwoorden bevatten geen e-mail, account-ID, interne notitie of opslagkey. De sitemap bevat uitsluitend gepubliceerde archiefadressen en wordt na intrekken opnieuw opgebouwd. De ongebruikte Next-afbeeldingsoptimizer is uitgeschakeld: deze kon ondanks `no-store` een publieke kopie blijven cachen. De native afbeeldingen en bestaande veilige afgeleiden blijven de weergaveroute. Publieke pagina’s/API’s zijn dynamisch; media gebruikt `private, no-store` zodat ingetrokken materiaal niet via een oude servercache beschikbaar blijft. Een bestand dat nog expliciet is goedgekeurd bij een andere publicatie blijft daar beschikbaar. Een bezoeker die materiaal al heeft gezien/gedownload kan uiteraard geen lokale kopie worden ontnomen.

Een HttpOnly-cookie verbindt gastuploads aan één browser zonder extra accountstelsel. Een onafgerond inzendconcept met geüploade bestanden kan in die browser zeven dagen worden hersteld. Nog niet verstuurde lokale bestanden moeten opnieuw worden gekozen. De worker ruimt uitsluitend verlopen, ongebruikte concepten en oude opslagwezen op. Ontvangen bijdragen blijven bewaard voor redactie; er is geen automatische vernietiging van ontvangen archiefmateriaal. Verwerk concrete privacy-/verwijderverzoeken via een bevoegde beheerder en de bestaande back-upbewaartermijn.

## Integratie en database

| Prototype | Aansluiting in deze repository |
| --- | --- |
| Homepage-tijdlijn v2 + CSS | `components/club-archive-home-timeline.tsx`, `app/club-archive-home-timeline.css` |
| Tijdlijn, museum, details, zoom, vergelijking | `components/club-archive.tsx`, `app/club-archive.css`, bestaande ClubSite en routeboom |
| Browserprovider / lokale opslag | `components/club-archive-provider.tsx` → echte publieke en bevoegde CMS-API’s |
| IndexedDB-/blob-uploaddemo | `lib/server/archive-uploads.ts` → bestaande S3-opslag en duurzame `cms_jobs`-worker |
| Demo-profiel / rolselector | bestaande Supabase-authenticatie en servergrants in `lib/server/permissions.ts` |
| Moderatie + ontbrekende catalogusredactie | `components/cms/archive-manager.tsx`, `archive-catalog-editor.tsx`, `lib/server/club-archive.ts` |
| Seed/beeldmanifest | `data/club-archive/`, `lib/server/archive-seed.ts`, bestaande `scripts/seed.ts` |

Migratie **0019_club_archive** voegt catalogus, inzendconcepten, media, bijdragen, revisies en canonieke moment/objectrelaties toe. Alle zes tabellen hebben RLS; `anon`, `authenticated` en `service_role` krijgen geen directe tabeltoegang. De bestaande databaseprovisioner geeft uitsluitend de serverrol de benodigde toegang. Er is één Drizzle-migratiegeschiedenis, geen tweede Supabase-migratiepad.

Publicaties/moderatie gebruiken één transactie, archief-lock, optimistische recordversie en idempotente operation-ID. Oorspronkelijke ontvangen gegevens blijven onveranderlijk naast de redactionele versie bewaard. Personen, teams en nieuws/verhalen verwijzen naar bestaande registers; er wordt geen tweede register opgebouwd. Een niet meer gepubliceerd gekoppeld artikel/persoon wordt niet publiek weergegeven.

De seed importeert **16 momenten, 9 digitale museumstukken en 12 historische WebP-bronnen**. Hashes worden met het aangeleverde manifest gecontroleerd. Herkomst, bijschrift en bron-URL blijven bewaard; een onbekende datum wordt niet ingevuld. Herhalen overschrijft geen redactionele veranderingen en maakt geen dubbele assets of relaties. De drie fictieve voorbeeldinzendingen uit het pakket worden nooit automatisch geïmporteerd. De bestaande menuboom krijgt bij de eerste archiefimport de twee ingangen, zonder latere handmatige verwijderingen telkens terug te zetten. Bij een bewust volledig aangepast menu of 50 bestaande submenu-items blijven de footerlinks beschikbaar en kan de redacteur de nieuwe bestemmingen via Navigatie kiezen.

De menu-uitbreiding gebruikt dezelfde vergrendeling als gewone CMS-bewerkingen. Een al bestaande revisie met het huidige versienummer blijft intact; de uitbreiding krijgt een nieuwe versie en revisie. Werkversie en publicatie behouden elk hun eigen overige menu-inhoud. De upgradetest start het echte workerimage met een leeg archief én bestaande menurevisies, zodat deze productiesituatie wordt gecontroleerd.

## Omgeving, productie en herstel

**Geen nieuwe GitHub-secrets of verplichte variabelen.** De bestaande production-configuratie blijft gelden:

| Bestaande naam | Gebruik / veilig voorbeeld |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | bestaande clubsessies; `https://project.supabase.co` |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DATABASE_PASSWORD` | bestaande runtime-, migratie- en provisionerrollen |
| `SUPABASE_DB_CA_CERT_B64` | bestaande gecontroleerde database-TLS; vertaald naar `DATABASE_CA_CERT_B64` in runtime |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | bestaande private Hetzner-bucket; `https://fsn1.your-objectstorage.com`, `fsn1` |
| `APP_BASE_URL` | `https://duindorpsv.nl` |
| `RESEND_API_KEY`, `MAIL_FROM` | bestaande mailfuncties; het archief verzint geen ontvangstmail of bezorgbevestiging |
| bestaande `RESTIC_*` en `BACKUP_S3_*` | ongewijzigde versleutelde externe back-up |

FFmpeg/FFprobe zitten in het applicatie-image, niet als handmatige VPS-installatie. De bestaande productie-workflow bouwt/test het image en voert migratie en databaseprovisioning uit. De volledige CMS-seed draait alleen bij de eerste installatie. Bij een bestaande installatie voltooit de worker de eenmalige archiefimport vóór zijn eerste heartbeat; de readinesscontrole vereist het archiefinstallatierecord. Een mislukte import maakt de release dus niet gezond. Herstarts behouden bestaande archiefinhoud en redactionele instellingen. CI bootst juist deze upgrade zonder volledige seed na met het echte workerimage. Er wordt geen stagingomgeving, extra runner, poort of Caddy-route toegevoegd.

De bestaande operationele back-up maakt een volledige PostgreSQL custom dump en een kopie van de S3-bucket. Dat omvat alle zes archieftabellen, revisies, toestemming, relaties, originelen en afgeleiden onder `archive/`. De CI-backupcontrole vereist nu ook alle zes archieftabellen in de echte dump. Herstel database én bijbehorende bucket-snapshot samen via de bestaande herstelprocedure; voer daarna migraties/provisioning uit en controleer private toegang en publieke routes. De CMS-JSON-export is geen vervanging voor deze volledige database-/mediaback-up.

Uitrol naar **production via de bestaande workflow** is uitdrukkelijk de gekozen opleverroute voor deze opdracht. Referentiebeeld, browserbewijs en acceptatieresultaten staan in `design/archive-2026-10-21/`.

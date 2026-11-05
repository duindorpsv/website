# Sponsoring — overdracht versie 64

Ontwerpbron: het aangeleverde pakket van 5 november 2026, Sites-versie 64, commit `bdaefabaf5fa4fc62f104ed8246ee859d7be575a`. Alle pakketbestanden zijn met `SHA256SUMS.txt` gecontroleerd. Het pakket is een referentie; de doelapp blijft Next.js, met bestaande Supabase-identiteiten, Drizzle-migratiehistorie, Resend, private S3-opslag en worker.

## Gapmatrix vóór implementatie

| Onderdeel | Bestaande doelapp | Referentiebron in `broncode/prototype/` | Gerichte wijziging | Migratie | Regressiecontrole |
| --- | --- | --- | --- | --- | --- |
| Identiteit, personen en bedrijfsrechten | Centrale personen, Supabase-sessies, stabiele accountkoppelingen, servercontrole per bedrijfsrol | `lib/cms/accounts.ts`, `directory*.ts`, `sponsorship.ts` | Bestaande implementatie hergebruiken | Geen identiteitsmigratie | Bestaande sponsor/register-integratie: andere onderneming, marketing/financiën, geblokkeerde account, uitnodiging |
| Tien beheertabs en zes portaaldelen | Geïntegreerde v61-componenten met echte serveropslag | `components/cms/sponsorship-manager.tsx`, `components/sponsor-portal.tsx` en CSS | v64-onderdelen porteren; bestaande provider, focus en routes behouden | Geen | Browserflow, contextwissel, fout/conflict en responsive controles |
| Voorstelregels, incentives en periodes | Basisregels, korting, transacties en reserveringen | `lib/cms/sponsorship*.ts`, `components/cms/sponsor-proposal-lines.tsx` | Eigen regeltekst, itemkorting, pakketkorting/toeslag, eenmalige opmaak en regelperiodes | Optionele JSON-velden; historische payloads ongewijzigd | €705 netto / €148,05 btw / €853,05 totaal; opeenvolgende periodes; capaciteitsrace |
| Bedrijfsgegevens en templates | Bevestigde identiteit, versiecontrole, beheersjablonen en snapshots | `sponsor-contracts.ts`, `sponsor-template-manager.tsx`, `docs/template-onzetrots-2026.txt` | Nieuwe 2026-template en shortcodecatalogus naast bestaande templates; beheerde clubgegevens | Optionele instellingen/JSON-velden | Exacte template, letterlijke shortcodevervanging, historische bytes/hash, verouderd wijzigingsverzoek |
| Logo's | Geautoriseerde private materiaalopslag, decoder en goedkeuringsflow | `sponsor-logo-field.tsx` en CSS | Upload/URL/preview, maximaal 640 px, tijdelijke bestanden en claim bij relatieopslag | Additieve migratie `0021_sponsor_logo_uploads`; bestaande bestandsopslag/bucket behouden | Signatuur, decode, transparantie, annuleren, rechtenintrekking en opruimen |
| PDF | Serverrenderer, echte bytes, private definitieve archivering | `lib/cms/sponsor-pdf.ts`, fictieve PDF-voorbeelden | Exacte v64-huisstijl en regel-/kortingsspecificatie; echte bewijsregistratie behouden | Geen documentherschrijving | PDF-rendercontrole, lange tekst, accenten, gemengde btw, ondertekenstatussen |
| Ondertekenen | Twee verschillende accounts, echte server-OTP, limieten, documenthash en transacties | `sponsorship.ts`, `sponsor-portal.tsx` | Bestaande beveiligde flow hergebruiken | Geen | Volgorde, verval, verkeerde code, replay, gewijzigde context, immutable bewijs |
| Facturen, uitvoering, publicatie en herinneringen | Werkende serverflows, worker, publieke whitelist, betaalprovider uitgeschakeld | `sponsorship.ts`, `sponsorship-channels.tsx` | v64-bedragen laten doorwerken; opmaak op eerste termijn | Optionele JSON-velden | Exacte centen/btw per termijn, publicatiegoedkeuring/periode, deduplicatie |
| Development en staging | Huidige featurebasis gelijk aan `origin/main`; oude stagingbranch en online stagingrunner bestaan | Bestaande GitHub-workflows en `ops/scripts/` | Development testen; stagingcompatibiliteit en namen inventariseren | Alleen na expliciete test/staging-contextcontrole | Productiebranch/workflow niet triggeren; uitgerolde SHA/readiness controleren indien configuratie beschikbaar |

## Omgevingsinventarisatie

Gecontroleerd via GitHub op 5 november 2026, uitsluitend namen/aanwezigheid. `main` pusht automatisch naar productie. Werkbranch: `codex/sponsoring-v64`. Productie-uitrol is niet geautoriseerd.

GitHub kent `production`, `staging` en `staging-acceptance`; de bestaande stagingrunner is online. De stagingbranch is nog van de oude PostgreSQL/SMTP-architectuur. De huidige versie-5 deploymentwrapper accepteert uitsluitend `production`. Dit is geen bruikbare uitrolroute voor de huidige app zonder een gerichte staging-update.

In `staging` zijn alleen de secrets `APP_DATABASE_PASSWORD`, `AUTH_SESSION_SECRET`, `DATABASE_PASSWORD` en `RESTIC_PASSWORD` en de variabelen `NEWSLETTER_PROVIDER`, `S3_REGION`, `SMTP_PORT`, `SMTP_SECURE`, `TRUST_PROXY_IP` aanwezig. De oude auth-/SMTP-instellingen vervangen de huidige Supabase-/Resend-configuratie niet.

Voor staging ontbreken de bestaande configuratienamen: secrets `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`; variabelen `APP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_CA_CERT_B64`, `S3_ENDPOINT`, `S3_BUCKET`, `MAIL_FROM`, `RESTIC_REPOSITORY`. Staging vereist daarnaast een veilige `TEST_MAIL_TO`-ontvanger. Bestaande productiewaarden zijn niet gelezen of naar staging gekopieerd. Er wordt geen database aangemaakt, gereset of vervangen om dit te omzeilen.

## Uitgevoerde controles

Een referentietest bewijst geen staging-uitrol; een aangeboden testmail bewijst geen ontvangst in een echte mailbox.

De referentiecheckout is afzonderlijk geïnstalleerd met `pnpm@11.25.0 --frozen-lockfile`. De voorgeschreven referentiesuite slaagt met 210/210 tests. De referentietypecheck slaagt nadat uitsluitend in die tijdelijke checkout een lege `.openai/hosting.json` met `d1: null` en `r2: null` is toegevoegd: de hostingidentiteit ontbreekt bewust in het pakket. Er is geen Site geregistreerd en geen runtimebinding overgezet naar de doelapp. Beide voorgeschreven referentie-PDF-commands zijn uitgevoerd.

Op de afgeschermde lokale sponsor-teststack zijn migraties 0000–0021, provisioning en seed uitgevoerd. Herhaald migreren slaagt. De nieuwe tabel heeft RLS, intrekking van Data API-rechten en uitsluitend een policy/grants voor het bestaande beperkte backendaccount. Een applicatierollback laat de additieve tabel en opgeslagen bestanden staan; er is geen destructieve down-migratie.

De doelapp produceert echte PDF-bytes met lokale fonts en logo. Vijf uitsluitend fictieve layoutscenario's zijn gegenereerd: ongetekend, één partij, beide partijen, geannuleerd en een stresstest met lange namen, 28 regels, veel voorwaarden en vier btwbehandelingen. De eerste vier hebben zes pagina's, de stresstest negentien. Alle pagina's zijn gerenderd; tekstbegrenzingen vallen binnen het papier. De volledige stressreeks en normale prijs-/bewijspagina zijn visueel nagekeken. De layoutfixtures bevatten alleen in-memory testbewijs; daadwerkelijke OTP-testbewijzen komen uit de afzonderlijke integratie-/browserflow.

Lokale bewijspaden: `.runtime/sponsoring-v64-{unit,typecheck,build,runtime,ops,integration}.log`, `.runtime/sponsor-v64-logo-integration.log` en `.runtime/sponsoring-v64-evidence/pdf/`. GitHub CI gebruikt de bestaande geïsoleerde Supabase Database/Auth/S3-stack, codec-installatie en containercontroles. Resultaten van nog lopende controles worden niet als geslaagd opgevoerd.

## Behouden infrastructuur en grenzen

Geen tweede gebruikersstelsel, mailprovider, productiebucket of betaalprovider toegevoegd. Bestaande accounts, centrale persoons-ID's, sessies, nieuwsbrief, Sportlink, sitecontent en worker blijven in gebruik. Online betaling blijft uitgeschakeld zolang een geverifieerde providerkoppeling ontbreekt. Onderteken- en mailtests gebruiken fictieve accounts en uitsluitend de afgeschermde testontvanger.

Staging blijft geblokkeerd door de hierboven benoemde ontbrekende configuratie en de verouderde deploymentwrapper. De externe handeling is: de bestaande stagingomgeving voorzien van eigen passende Database/Auth-, Resend-, opslag-, backup- en testontvangerconfiguratie onder dezelfde namen, en de bestaande stagingwrapper/workflow op de huidige versie-5 runtime aansluiten. Kopieer geen productiedatabase of productiesecrets om deze blokkade te omzeilen. Productiebranch, productieomgeving en productiegegevens zijn niet gewijzigd.

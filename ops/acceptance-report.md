# Developmentacceptatie — 14 oktober 2026

Dit is een verslag van uitgevoerde developmentcontroles, geen productieacceptatie. Bron: Sites v44, commit e91ed87f3e5917f286885c6593fe397f8e67cdf4; repository duindorpsv/website. Private fixtures, testaccounts, logs en backups staan uitsluitend in `.runtime/` en gaan niet naar Git.

`pnpm test`: 98 scenario’s, 97 geslaagd, één bewust overgeslagen Sportlink-observed-fixture. `pnpm typecheck`: geslaagd. `pnpm test:integration`: 18 echte PostgreSQL-scenario’s geslaagd. De browsersuite heeft acht scenario’s: login/401/SSR, bouwer/undo, responsive historie, contactontvangst, pointer/menuverplaatsingen, twee-browsernieuwsopslag, emulated touch/cancel en gepubliceerde layout/metadata zonder JS. De definitieve image/runtime- en remote-CI-resultaten staan in het uitvoerlog.

Een geïsoleerde restore naar `duindorp_restore_test` plus gekopieerde private objecten is werkelijk uitgevoerd. Login, historische pagina, synthetische upload en oorspronkelijke formulierdefinitie werkten. SMTP is uitsluitend tegen de afzonderlijke lokale Mailpit getest; Brevo-responses zijn herkenbare contractfixtures. Geen werkende externe nieuwsbrief, Sportlink-schrijfactie, S3-backup of stagingdeployment wordt hiermee geclaimd.

| ID | Uitkomst | Bewijs / beperking |
| --- | --- | --- |
| AUTH01 | Geslaagd | Browser: beheerredirect en API-401 zonder sessie. |
| AUTH02 | Deels | Server weigert onbevoegde publicatie, ongeldige velden en scopewijzigingen. Niet alle manipulaties/audits als HTTP-scenario herhaald. |
| AUTH03 | Deels | Rechten voor stroom en afdeling in domeintests; detailroute toetst individuele inzending. Complete export/bijlageproef niet uitgevoerd; inzendingsbijlagen zijn niet ingeschakeld. |
| AUTH04 | Geslaagd | Echte sessies verdwijnen bij blokkering; laatste beheerder beschermd. TOTP-activatie en verse loginchallenge getest. |
| DATA01 | Deels | Twee browsers lezen dezelfde getypte nieuwsinhoud; geïsoleerde restore werkt. Definitieve containerrestart wordt apart vastgelegd. |
| DATA02 | Deels | Echte PostgreSQL-versieconflicten getest; zichtbare fout/herstelbestand geïmplementeerd. Twee gelijktijdig typende browsertabbladen nog handmatig controleren. |
| PUB01 | Geslaagd | Werkversie wijzigt eerdere live-inhoud/type niet; serverpublicaties zijn aparte snapshots. |
| PUB02 | Deels | Publicatie, slugredirect, geneste padwijziging en immutable snapshots getest; volledige UI-cyclus revisieherstel/intrekken nog handmatig nalopen. |
| PUB03 | Deels | Worker publiceert bevroren revisie eenmalig en behoudt latere draft; afzonderlijke workerherstart met toekomstige planning nog stagingproef. |
| PUB04 | Geslaagd | Amsterdam zomer-gat geweigerd; dubbel winteruur heeft expliciete keuze/UTC; latere draft verandert geplande snapshot niet. |
| PB01 | Geslaagd | Browserfixture met twee kolommen en drie zelfstandige widgets per kolom; echte IDs en herladen. |
| PB02 | Deels | Pointerdrag naar andere rij en menuverplaatsing naar andere kolom getest. Alle widgetsoorten/posities nog in redactionele acceptatie nalopen. |
| PB03 | Geslaagd | Hele rij, merge-undo en tekst-undo/redo in browser; duplicatie/unieke IDs in domeintest. |
| PB04 | Geslaagd | Samenvoegen links-dan-rechts, undo en behoud van IDs/inhoud. |
| PB05 | Deels | Verplaatsmenu en emulated touch/cancel op 390 px slagen. Echt mobiel apparaat en complete toetsenbord/focusronde ontbreken. |
| PB06 | Deels | Gepubliceerde layout en historie zonder JS op 320/768/1440; historie ook 390. Eén gedeelde renderer; volledige iedere-widget previewvergelijking nog niet uitgevoerd. |
| PB07 | Geslaagd | Deterministische migratie bewaart oude kolommen/links/geneste widgets; onbekende/ongeldige inhoud wordt geblokkeerd. |
| PB08 | Geslaagd | Schema, structuur, scriptlinks, node/depthlimieten en ongeldig publicatierequest getest. |
| NEWS01 | Geslaagd | Domein-, database- en browserproeven: news/story/column blijven gescheiden. |
| NEWS02 | Geslaagd | Typewijziging verplaatst live-URL/redirect/homepageselectie uitsluitend bij publicatie. |
| MEDIA01 | Deels | Echte decode, fouttype, private origineel en WebP-varianten getest. Grote batch/progress en grensbestand handmatig nalopen. |
| MEDIA02 | Deels | Eén origineel met albumrelaties/focus geïmplementeerd; gezamenlijke UI-proef twee albums/map/focus nog niet uitgevoerd. |
| MEDIA03 | Deels | Serverpublicatiechecks en live-only fallback geïmplementeerd. Complete private-personen/widgetproef nog uitvoeren. |
| MEDIA04 | Deels | Origineel/varianten duurzaam opgeslagen en geïsoleerde DB/mediarestore geslaagd. S3-herstel op staging ontbreekt. |
| FORM01 | Geslaagd | Contact, activiteit-aanmelding en aanvraag komen in aparte DB-stromen; contact ook via browser-201. |
| FORM02 | Geslaagd | Formulier- en afdelingssnapshot blijft historisch na wijziging. |
| FORM03 | Geslaagd | Gelijktijdige operatie-ID dedupliceert; ontbrekende SMTP geeft gecontroleerde retry; ontvangst blijft duurzaam. |
| FORM04 | Deels | Lidmaatschap krijgt waiting plus idempotente taak; activiteit krijgt geen Sportlinktaak. Echte geautoriseerde Sportlinkverwerking ontbreekt. |
| FORM05 | Deels | Preview blokkeert verzenden; development/testtransport stuurt uitsluitend naar testadres. Echte staging-mailafbakening nog toetsen. |
| FORM06 | Geslaagd | Verlopen synthetische intake, notities en notificatietaken verwijderd; audit bevat geen antwoorden. Bijlagen optioneel en niet ingeschakeld. |
| SEO01 | Geslaagd | Live-layout en title zonder JavaScript getest; metadata wordt in head afgewacht. Sitemap/canonical servergestuurd. |
| SEO02 | Deels | Echte 404 en redirectopslag getest; preview is geautoriseerd/noindex. Volledige HTTP-redirect/previewmatrix nog nalopen. |
| REG01 | Deels | Goedgekeurde historie/vrijwilligersbestanden behouden; historie responsive zonder JS gecontroleerd. Geen volledige screenshotvergelijking van alle pagina’s. |
| REG02 | Deels | Bestaande regressiescripts behouden en geslaagd; runtimeport en narrowcastingopslag aanwezig. Werkelijke Sportlink-client-ID/feed ontbreekt; één observed-fixturetest overgeslagen. |
| OPS01 | Nog te verifiëren | main-workflow bevat alleen checks. Push/remote-CI wordt in uitvoerlog vastgelegd. |
| OPS02 | Niet uitgevoerd | Staging/productionrunners en serving-host ontbreken; exacte digestpromotie geïmplementeerd. |
| OPS03 | Niet uitgevoerd | Serverlock, monotone run-ID en branch/treebinding geïmplementeerd; echte runnerwachtrij nog testen. |
| OPS04 | Niet uitgevoerd | Rollbackscript/healthfallback aanwezig; daadwerkelijke serving-host-foutrelease nog simuleren. |
| OPS05 | Deels | Geïsoleerde developmentrestore bewijst login, pagina, media en historische formulierdefinitie. Externe restic/S3-restore ontbreekt. |
| OPS06 | Niet uitgevoerd | Bestaande static-websites-VPS is nog niet bereikbaar/aangeleverd; inventaris en regressiecontrole volgen daar. |

## Specifieke paginabouwercriteria uit document 03

| IDs | Bewijs | Nog nodig |
| --- | --- | --- |
| PB-01/02 | Echte lege rij, twee containers en zelfstandige widgetfixture in browser. | — |
| PB-03/04/05 | Pointer tussen rijen, verplaatsmenu tussen kolommen, rijverplaatsing, samenvoegen en undo. | Alle kinds/posities in complete redactionele ronde. |
| PB-06/07 | Split/swap/duplicatie/unieke IDs in domeintests. | Browserproef voor iedere combinatie. |
| PB-08/09 | Server/schema/limieten, ongeldige move en touchcancel. | Alle verboden drops/focusgevallen in browser. |
| PB-10/11 | Eén document, rich-texttypen, undo/redo en bereikbaar verplaatsmenu. | Grens-Backspace/Delete/Enter/paste en volledig toetsenbord/focus. |
| PB-12 | Touchsensor en cancel op geëmuleerd mobiel apparaat. | Een echt mobiel apparaat, inclusief scrollen tijdens bedienen. |
| PB-13/14 | Publieke layout en mobiele historie zonder overflow; preview gebruikt dezelfde renderer. | Elke widget/ratio/viewport vergelijken tussen preview en publiek. |
| PB-15/16 | Gescheiden feeds; centrale persoonsreferenties en publicatiecontrole. | Twee personen wijzigen en contactzichtbaarheid als volledige browserproef. |
| PB-17/18 | Drie serverstromen en live/draftscheiding in databaseproeven. | Preview-verzending en tien drags na publicatie als gezamenlijke browserproef. |
| PB-19/20 | Idempotente legacy-fixture; historie/vrijwilligersbron behouden. | Eigen browserexport en echte persoonlijke uploads niet aangeleverd. |
| PB-21/22 | Herladen, versieconflict en onbevoegde publicatie/structuur in backend/browsertests. | Twee typende tabbladen en volledige rolronde op staging. |

## Nog aan te leveren of op de hosting-VPS uit te voeren

Hostnaam/SSH- of Tailscale-toegang; bestaande proxy/sites/poorten/gebruikers/firewall inventariseren; staging- en productiedomeinen; private S3-buckets/credentials en externe restic/rclone-backupbestemming; echte SMTP-afzender/toegang/testadres; nieuwsbriefprovider/list; Sportlink lees-client-ID en het afzonderlijk geautoriseerde ledenaanmeldcontract of bevestigde handmatige procedure; echte eigenaaractivatie/MFA; ontvangers/bewaarbeleid; eventueel eigen browserbackup/D1/narrowcastingexport. Daarna runners, GitHub-omgevingsbescherming, stagingacceptatie, rollback, externe restore en regressie van bestaande sites bewijzen. Production blijft geblokkeerd zonder hetzelfde goedgekeurde stagingdigest en restorebewijs.

## Definitieve imagecontrole

De werkende developmentcode en eerdere imagebuilds zijn lokaal gecontroleerd. De laatste volledige imageherhaling liep op de volle development-VPS vast bij uitpakken/dependencykopiëren; dit is geen geslaagde runtimecontrole. Alleen eigen gegenereerde Next-artifacts en aantoonbare Duindorp-buildcache zijn opgeruimd. De worker heeft nu een eigen klein runtimeworkspacepakket. Main-CI bouwt het image op GitHub-hosted infrastructuur, draait web/worker met readonly filesystem, voert de browsersuite uit en controleert readiness na restart. Die run moet daadwerkelijk slagen voordat het definitieve image als getest wordt gerapporteerd.

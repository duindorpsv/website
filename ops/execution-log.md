# Uitvoerlog

> Actuele inrichting vanaf 18 oktober 2026: development-VPS → main → uitsluitend GitHub Environment `production`; websitemail via Resend API en lokaal abonnee-/onderwerpbeheer. De staging-/SMTP-verwijzingen hieronder beschrijven eerdere inventarisatie en testresultaten. De actuele procedure en exacte instellingen staan in [github-environments.md](github-environments.md) en [first-deploy.md](first-deploy.md). Eerder voorbereide stagingresources zijn niet automatisch verwijderd.

## Bron en runtime

- 14 oktober 2026: verzoek en alle specificaties 00–08 gelezen. Pakket bevat Sites v44, commit e91ed87f3e5917f286885c6593fe397f8e67cdf4.
- Alle 583 aangeleverde checksums geverifieerd. Bron ongewijzigd vastgelegd in eerste commit; contractdocumenten in reference/handoff.
- Doelrepository duindorpsv/website gecontroleerd: leeg, ADMIN-toegang, geen workflows. Hosting volgt na development en main volgens eigenaar.
- Eerste baseline zonder geïnstalleerde dependencies: 79 geslaagd, één overgeslagen, importsuite kon zod niet vinden. Herhaling volgt na installatie.
- Node 24.18.0, pnpm 11.25.0. Next 16.3.4, Tiptap 3.31.4 blijven vastgepind. Geen major-upgrade. Zevendaagse dependencywachttijd behouden; S3 SDK en mailversie gekozen buiten de wachttijd. Sites-buildbestanden gearchiveerd, niet als runtime gebruikt.

## Bewijs en afhankelijkheden

Nog geen staging/productiondeployment, browserdatamigratie of externe verzending bewezen. Acceptatiematrix wordt bijgewerkt met daadwerkelijk uitgevoerde controles. Main krijgt geen deploymenttrigger.

## Gedeeld CMS en developmentcontrole

- PostgreSQL/Drizzle met aparte raw/ORM-pools, schema-/JSON-invarianten, immutable revisies/publicaties en relationele rechten/metadata. Eigen database- en testmailcontainers; andere diensten niet gewijzigd.
- Better Auth-accounts, sessie-intrekking, laatste-beheerderbescherming, TOTP, aparte news/storiesacties en team/afdelingsscopes. Geen seedlogins of standaardwachtwoord.
- Rijen/kolommen als één Tiptap-document, echte containers, pointer/menu/touchbediening, undo, duplicatie, rijpatronen en dezelfde preview/publicrenderer. Legacy-archief en compatibiliteit behouden.
- Frozen planning, Europe/Amsterdam/DST-keuze, gecontroleerde ouder/kind-paden, concept/live-scheiding, immutable herstelpunten, idempotente browserimport en versiegebonden rollback.
- Serveruploads/Sharp/private originelen, albums/mediamapping, echte formulierontvangst met historische definitie, private inboxen, outbox/retry/retentie en aparte opt-in/providerstatus. Officiële clubaanmeldroute vervangt de demo-aanmeldstap.
- Laatste controles: 98 unit/regressiescenario’s (97 geslaagd/1 overgeslagen), 15 PostgreSQL-integraties geslaagd, typecheck geslaagd; acht browserproeven geslaagd vóór de definitieve runtimeherhaling.
- Geïsoleerde DB/mediarestore uitgevoerd: login, pagina, echte synthetische upload en oorspronkelijke formulierdefinitie bruikbaar. Private evidence/logs aanwezig. Geen externe backup of productieherstel bewezen.
- Eerdere schoon opgebouwde Node/Docker-images geslaagd; definitieve artifact/runtimeherhaling volgt na de laatste beheercorrecties. Geen GHCR-/staging-/productiedigest als goedgekeurd gemarkeerd.
- Specifieke proef vond en corrigeerde lege-slugreservering, Next-streamingmetadata zonder JS en een achtergebleven developmentworker met eerdere JSON-codering. Constraints voorkomen opnieuw verkeerd gecodeerde object-/arraygegevens.
- Hosting-VPS-installatie, reverse proxy/firewall, runners, staging/production en externe credentials zijn niet uitgevoerd/aangeleverd. Acceptatiematrix in acceptance-report.md benoemt de resterende scenario’s afzonderlijk.

- Werk vastgelegd in controleerbare runtime-, database-, editor-, beheer- en opscommits. Native PostgreSQL-suite uitgebreid naar 16 geslaagde scenario’s; geplande publicaties werken ook de bevroren live-verwijzingsindex bij.
- Lokale laatste image-export liep tegen schijfcapaciteit aan. Alleen eigen gegenereerde Next-output en geverifieerde eigen buildcache aangepakt. Andere Docker-projecten/volumes blijven behouden. Eerdere imagebuilds worden niet als bewijs voor de laatste runtimewijzigingen gebruikt.
- Worker/migratie/seed/owner gebruiken een aparte runtimeworkspace met gedeelde catalog-versies; main-CI bouwt en controleert het concrete image op de GitHub-hosted runner.
- Staging-approved artifact verschijnt pas na vereiste menselijke stagingacceptatie. Production vereist passend extern restorebewijs voor hetzelfde digest; een developmentmarker is onvoldoende.

## Main en definitieve CI

- Code naar `duindorpsv/website:main` gepusht; main heeft uitsluitend de verificatieworkflow. Geen staging-/productionbranch gemaakt of deployment gestart.
- Eerste remote runs faalden bij de service-initialisatie door quoting van het PostgreSQL-healthcommando. Quoting gecorrigeerd, opnieuw gepusht.
- Broncommit `3cb0248baf194a6cbce1642736986d80f1dce6e4`: [GitHub-run 38566921981](https://github.com/duindorpsv/website/actions/runs/38566921981) volledig geslaagd. 97 unit/regressietests + 1 skip; 18 echte DB-integraties; typecheck/build/bundles; concrete imagebuild; beperkt databaseaccount; readonly web/worker; 8 browserproeven; readiness na webrestart.
- Het uiteindelijke image is op de GitHub-hosted buildrunner bewezen, zoals de afgesproken scheiding van build- en serving-host vereist. De lokale volle schijf wordt niet omzeild door andere projecten te verwijderen.
- Developmentbestandwatchers liepen daarna tegen de per-user watchercapaciteit op deze gedeelde VPS aan. Voor lokale preview wordt process-local Watchpack-polling gebruikt; systeemlimieten en andere diensten zijn niet gewijzigd.

## Aansluiting op de bestaande hostingaccounts

- Aansluitpakket van 14 oktober 2026 gecontroleerd: alle 15 checksums kloppen; de patch past zonder conflict op basiscommit `8d5263da8ae47d47e37df923694393992bdb3c9b`. De volledige main-CI van die basis is geslaagd: [run 38568026560](https://github.com/duindorpsv/website/actions/runs/38568026560).
- De negen patchbestanden zijn toegepast en vergeleken met de meegeleverde broncode. De installer hergebruikt de bestaande `duindorpsv-*`-accounts en voert eerst een controle zonder wijzigingen uit. Workflowlabels en deploy-identiteit sluiten daarbij aan.
- Alle acht gerichte Python-tests en `git diff --check` slagen. De normale main-CI controleert deze tests voortaan ook.
- GitHub API bevestigt beide Duindorp-runners als online en idle, met hun bijbehorende nieuwe labels. Er zijn nog geen GitHub Environments ingesteld.
- Het pakket bevat geen SSH-beheerlogin, bevestigde domeinen/poorten of private runtime-, mail-, opslag- en backupconfiguratie. Deze aansluiting is nog geen applicatierelease. Hostinstallatie, stagingacceptatie en extern productieherstel blijven afzonderlijk te bewijzen.

## GitHub Environment-configuratie — 16 oktober 2026

- Op verzoek van de eigenaar zijn staging- en productionworkflows aangepast om individuele Environment secrets/variables naar de vaste wrapper te sturen. Configuratieversie 2 valideert een vaste lijst waarden, scheidt runtime-/migratie-/backupcredentials en schrijft private configuratiegeneraties bij de applicatiegebruiker. GitHub blijft de beheerplek voor de waarden.
- Image en configuratie worden samen geactiveerd en teruggezet na appfalen. De eerste deployment maakt een extern herstelpunt vóór migratie en seed; retentie blijft beperkt tot de eigen omgevingshost/tag. Database-/authsleutels en medialocatie worden niet blind geroteerd.
- Gerichte lokale controles omvatten input-/identiteitsgrenzen, workflow→JSON-overdracht, permissies, echte Compose-/containerdoorgifte met synthetische waarden, deploymentvolgorde, configuratiewijziging op hetzelfde image, falende backup en herstel van de vorige image/configuratie. Externe S3/SMTP/Restic en de hosting-VPS worden hiermee niet als getest beschouwd.
- De exacte GitHub-namen, defaults, voorwaardelijke integratiekeys en eenmalige hoststappen staan in `github-environments.md`. Er zijn geen echte credentials verzonnen, uitgelezen of in Git vastgelegd. De bestaande reviewers en eis van externe restore vóór production blijven gelden.

## 18 oktober 2026 — één productieomgeving en SendGrid

- Actieve releaseflow vervangen door main → controles/build → GitHub Environment production. Stagingworkflow verwijderd en in GitHub uitgeschakeld. De bestaande production-branchpolicy staat nu op main; de vereiste productiereviewer is behouden. Oude SMTP-defaultvariables zijn uit production verwijderd.
- Alle websitemail gebruikt de SendGrid HTTPS API, met expliciete dev/testontvanger, aparte productie-enveloppen, timeout, geredigeerde fouten en duurzame retries. De Nodemailer-afhankelijkheden en lokale Mailpit-service zijn uit de applicatieconfiguratie verwijderd.
- Configuratieversie 3 vereist SENDGRID_API_KEY en MAIL_FROM. Hostwrappers, backup/rollback, API-status en operationele handleidingen zijn aangepast. De stagingdigest-/restoremarker-gate is vervallen; externe backup vóór iedere migratie blijft verplicht, externe herstelacceptatie vóór publieke ingebruikname blijft een operatorhandeling.
- Lokaal geslaagd: 113 unit/regressietests plus één skip, 31 PostgreSQL-integratietests, 27 Python-opscontroles, frozen installatie, typecheck en Next/runtimebuild. SendGrid-contracten zijn gemockt; echte verzending/bezorging is nog niet bewezen. Volledige container/browsercontrole volgt ook via de PR-workflow.
- Echte productieinstellingen voor domein, media, SendGrid en externe backup plus de versie-3-hostinstallatie zijn nog nodig. Er wordt geen uitgevoerde productiedeployment geclaimd.

## 18 oktober 2026 — Resend en lokale abonnees

Op verzoek van de eigenaar vervangt Resend de eerder toegevoegde SendGrid-koppeling. Configuratieversie 4 vereist RESEND_API_KEY en MAIL_FROM; externe nieuwsbriefprovider-/lijstsleutels vervallen. De eerdere wachtende SendGrid-productierun is geannuleerd voordat die kon deployen. De productieflow via main en de bestaande productiegoedkeuring blijven in gebruik.

Abonnees en onderwerpen worden lokaal beheerd onder Instellingen & koppelingen. Bevestiging activeert direct lokaal, afmelding werkt direct, wijzigingen vereisen beheerrecht en versiebinding en worden geaudit. Migratie 0013 bewaart bestaande data en beëindigt oude externe synchronisatietaken. Resend-requestsleutels blijven stabiel bij retries; de providerbinding verloopt na 24 uur. Echte verzending/bezorging en hostinginstallatie worden zonder werkelijke productie-instellingen niet als uitgevoerd gerapporteerd.

Lokaal gecontroleerd: 114 unit/regressietests plus één skip, 32 PostgreSQL-integratietests, 27 opscontroles, typecheck en Next/runtimebuild. De echte browser controleerde abonnee zoeken/bewerken, behoud na herladen, afmelden, de beheer-API en 390-pixelweergave. De developmentdatabase is met migratie 0013 bijgewerkt; web/worker draaien gezond. Alle mail-API-contracten zijn synthetische fixtures; er zijn geen echte mails verzonden. De volledige container-/browsercontrole volgt via de PR-workflow.

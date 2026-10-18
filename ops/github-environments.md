# GitHub Environment production: configuratie en secrets

De route is **development-VPS → pull request → main → controles/build → production**. Er is één deploymentenvironment: `production`. Development en de geïsoleerde testdatabase blijven op de dev-VPS; daarvoor zijn geen GitHub Environments nodig. De stagingworkflow en stagingacceptatie zijn vervallen. Configuratieversie **3** gebruikt de SendGrid HTTPS API voor alle websitemail.

Ga naar [Settings → Environments → production](https://github.com/duindorpsv/website/settings/environments/production). Vul onderstaande namen daar in, met de juiste scheiding tussen **Environment secrets** en **Environment variables**. Applicatie-instellingen horen niet in het image of in repositorybestanden. Ontbrekende verplichte instellingen blokkeren deployment vóór databasewijzigingen.

## Environment secrets

| Naam | Verplicht | Waarde / gebruik |
| --- | --- | --- |
| `DATABASE_PASSWORD` | Ja | Wachtwoord voor `duindorp_migration`, minimaal 24 tekens. |
| `APP_DATABASE_PASSWORD` | Ja | Ander wachtwoord voor `duindorp_app`, minimaal 24 tekens. |
| `AUTH_SESSION_SECRET` | Ja | Authenticatiesleutel van minimaal 32 tekens; genereer bijvoorbeeld 32 willekeurige bytes als 64 hextekens. |
| `S3_ACCESS_KEY_ID` | Ja | Toegang tot uitsluitend de private productiemediabucket. |
| `S3_SECRET_ACCESS_KEY` | Ja | Bijbehorende mediasleutel. |
| `SENDGRID_API_KEY` | Ja | SendGrid API-key met uitsluitend de benodigde **Mail Send**-bevoegdheid (`mail.send`). Geen SMTP-wachtwoord. |
| `RESTIC_PASSWORD` | Ja | Encryptiewachtwoord voor de externe backuprepository, minimaal 24 tekens. |
| `BACKUP_S3_ACCESS_KEY_ID` | Ja | Afzonderlijke toegang tot de externe S3-backuprepository. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Ja | Bijbehorende externe backupsleutel. |
| `SPORTLINK_CLIENT_ID` | Alleen bij Sportlink-lezen | Werkelijke geautoriseerde leesconfiguratie; verleent geen schrijfrechten voor ledenaanmeldingen. |
| `NEWSLETTER_API_KEY` | Alleen bij `NEWSLETTER_PROVIDER=brevo` | Brevo API-key voor lijstbeheer. Websitemail, waaronder bevestigingslinks, blijft via SendGrid lopen. |

Bewaar herstelkopieën van encryptiesleutels en externe toegang ook buiten GitHub en de VPS. Bestaande secrets niet opnieuw genereren als ze al in gebruik zijn. GitHub secrets kunnen niet als plaintext worden teruggelezen. Vul echte waarden uitsluitend in GitHub in; publiceer ze niet in chat, issues of commits.

Interactief instellen kan bijvoorbeeld met `gh secret set SENDGRID_API_KEY --repo duindorpsv/website --env production`; de CLI vraagt de waarde zonder die in het commando te plaatsen.

## Environment variables

| Naam | Verplicht / standaard | Waarde / gebruik |
| --- | --- | --- |
| `APP_BASE_URL` | Ja | Definitieve HTTPS-origin van productie, zonder pad. Moet gelijk zijn aan de eenmalig geïnstalleerde proxy-origin. |
| `S3_BUCKET` | Ja | Naam van de eigen private productiemediabucket. |
| `MAIL_FROM` | Ja | In SendGrid geverifieerd afzenderadres, bijvoorbeeld `website@eigen-domein.nl`. Alleen het e-mailadres; de app gebruikt de naam Duindorp SV. |
| `RESTIC_REPOSITORY` | Ja | Externe repository: `s3:https://backup-host/eigen-backupbucket/pad`. |
| `S3_ENDPOINT` | Bij S3-compatible opslag | HTTPS-origin van de objectopslag; leeg bij AWS S3. |
| `S3_REGION` | `eu-west-1` | Werkelijke regio van de mediabucket. |
| `BACKUP_S3_REGION` | Waarde van `S3_REGION` | Regio van de externe backupopslag. |
| `TRUST_PROXY_IP` | `false` | Alleen `true` wanneer de proxy X-Real-IP overschrijft en directe toegang is geblokkeerd. |
| `NEWSLETTER_PROVIDER` | `disabled` | Eventueel `brevo` voor lijstbeheer; dan zijn API-key en lijstnummer verplicht. |
| `NEWSLETTER_LIST_ID` | Bij Brevo | Positief lijstnummer. |
| `NEWS_IMPORT_MAX_MB` | `512` | Maximale ZIP-omvang in MiB; bereik 32–2048. |
| `NEWS_IMPORT_MAX_UNPACKED_MB` | `2048` | Maximale uitgepakte omvang in MiB; bereik 512–4096. |
| `NEWS_IMPORT_MAX_ENTRIES` | `10000` | Maximaal aantal ZIP-items; bereik 100–50000. |

`TEST_MAIL_TO` hoort **niet** in production en wordt niet door de productieworkflow doorgegeven. In lokale development/testconfiguratie is een expliciet testadres verplicht zodra echte API-mail wordt gebruikt; alle ontvangers worden daarheen omgeleid. Zonder SendGrid-configuratie blijft mail met gecontroleerde retries in de queue staan.

De oude `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` en `SMTP_PASSWORD` worden niet meer gebruikt en kunnen uit GitHub verwijderd worden. Er is geen SMTP-service of Mailpit nodig.

`APP_ENV=production`, `MEDIA_DRIVER=s3`, databasegebruikers, databasehost/-naam, beide database-URL’s, bestandspaden en poort worden door de vaste hostconfiguratie samengesteld. `GITHUB_TOKEN`, image-digest en releasemanifest levert Actions. Hiervoor maak je geen eigen secret of variable aan. Er zijn evenmin SSH-secrets voor de workflow nodig: de bestaande productierunner voert uitsluitend de vaste lokale wrapper uit.

## SendGrid aansluiten

1. Verifieer het afzenderdomein in SendGrid en plaats de vereiste DNS-records. `MAIL_FROM` moet onder die geverifieerde identiteit vallen. Zie [Sender Identity](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sender-identity).
2. Maak een beperkte API-key voor Mail Send en sla die op als `production` secret `SENDGRID_API_KEY`; zie [API Keys](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys).
3. De worker verstuurt activatie, wachtwoordherstel, formuliernotificaties/ontvangstbevestigingen en nieuwsbriefbevestiging via `POST https://api.sendgrid.com/v3/mail/send` met Bearer-authenticatie. De key blijft uitsluitend in de serverruntime. HTTPS-uitgaand verkeer naar `api.sendgrid.com:443` moet toegestaan zijn.
4. HTTP **202** betekent geaccepteerd door SendGrid; het is geen bewijs van bezorging in de mailbox. Andere statussen, netwerkfouten en timeouts blijven retrybaar in de bestaande queue. Providerbodies en geheime waarden komen niet in de foutmelding of het taaklog. Controleer bij de eerste echte verzending ook SendGrid Activity en de ontvangende mailbox. Zie [Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send).

Ontvangers krijgen aparte enveloppen; Reply-To en tekstinhoud blijven behouden. Klik- en open-tracking staan uit voor deze berichten. De operatie-ID wordt alleen als correlatie meegestuurd: bij een storing tussen API-acceptatie en de databasecommit kan een retry dubbel bezorgen. Er wordt geen exact-eenmaal-bezorging geclaimd.

## Branches, build en goedkeuring

De productieworkflow draait bij een push naar **main**. Developmentwerk komt via een PR en de vereiste CI-check op main. Dezelfde workflow kan handmatig via Actions op main worden gestart. Een dispatch op een andere branch krijgt geen build/deployment. Er is geen afzonderlijke productionbranch of stagingpromotie nodig.

Stel in `production` bij **Deployment branches and tags** uitsluitend branch **main** in. Behoud de bestaande vereiste reviewer voor de productiedeployjob. Daarmee is er één productieomgeving met één eventuele goedkeuring, geen stagingacceptatiestap. Een melding *Waiting for review* wordt afgehandeld met **Review deployments** bij de productierun.

Controles en Dockerbuild draaien op GitHub-hosted runners zonder applicatiesecrets. Het releaseartifact bevat alleen commit, Git-tree, migratiehash, run-ID, immutable GHCR-digest en `configVersion:3`. Alleen de deployjob gebruikt `production` en runnerlabel `duindorpsv-production`. Er wordt op die runner geen repositorycode uitgecheckt.

## Overdracht, backup en rollback

De deployjob stuurt uitsluitend toegestane instellingen via JSON op stdin naar `/usr/local/libexec/duindorp/duindorp-deploy-production`, als applicatiegebruiker `duindorpsv-production`. De wrapper controleert de succesvolle CI/build, main-commit/tree, Actions-artifact en imagelabels. De actuele main-commit moet nog overeenkomen; een oude wachtrijjob kan niet later een nieuwere bron overschrijven.

Docker-socket, loopbackpoort, Compose-bestand en proxy-origin blijven vastgelegd onder `/etc/duindorp/production/`. Gevalideerde configuraties staan met rechten 0700/0600 onder `/var/lib/duindorp/production/configuration/<hash>/`. Web/worker krijgen runtimewaarden; migratie-, provisioning- en backupcredentials blijven apart. Er worden geen secrets in artifacts of image opgeslagen.

Elke deployment maakt vóór migraties een externe versleutelde backup van database, media en bijbehorende private configuratie. De media- en backupopslag moeten vooraf bestaan. Eerste deployment kan een lege Restic-repository initialiseren; een bestaande repository met ander wachtwoord wordt niet overschreven. Bij backupfalen stopt deployment. Bewaar minimaal 14 dagelijkse herstelpunten binnen de eigen host/tag.

De eerste deployment start de eigen database, maakt het eerste externe herstelpunt, migreert, provisiont het beperkte runtime-account en seedt de broncontent. Daarna starten web/worker en wordt readiness met de release-identiteit gecontroleerd. Maak de echte eigenaar eenmalig via het operatorcommand `owner`, ontvang de activatiemail en activeer MFA.

Bij een mislukte appstart wordt het vorige image met zijn vorige configuratie teruggezet. Database en media blijven intact. Een herstelproef gebruikt een tijdelijke geïsoleerde database/bucket met mail en jobs afgeschermd; dit is geen tweede permanente deploymentenvironment. Voer de externe restoreproef en de functionele acceptatie uit vóór publieke ingebruikname en daarna periodiek; zie [rollback-and-restore.md](rollback-and-restore.md). De oude, aan een stagingdigest gekoppelde `restore-tested.json` is geen deployvoorwaarde meer. Externe backup vóór iedere migratie blijft verplicht.

## Installeren en later instellingen aanpassen

Installeer eerst de gereviewde versie-3-wrappers op de hosting-VPS volgens [first-deploy.md](first-deploy.md). Het vereiste sudo-recht is uitsluitend de vaste wrapper als de applicatiegebruiker, zonder argumenten; algemene sudo-/Dockerrechten zijn niet nodig. Oudere geïnstalleerde helpers worden bewust niet blind vervangen. Een protocol-1/2-installatie vraagt een gecontroleerde operator-upgrade met behoud van data en secretgeneraties.

Na een gewone wijziging van bijvoorbeeld SendGrid-credentials of `MAIL_FROM` voer je alleen de deployjob van de laatste main-release opnieuw uit. `gh run view RUN_ID --repo duindorpsv/website --json jobs` toont het job-ID; gebruik daarna `gh run rerun RUN_ID --repo duindorpsv/website --job JOB_ID`. Dezelfde geteste image krijgt een nieuwe configuratiegeneratie; de productiegoedkeuring wordt opnieuw gevraagd. De verifier leest de geslaagde checks/build uit de eerdere poging van dezelfde run. Bij een nieuwere main-commit gebruik je de nieuwe release.

Databasewachtwoorden, `AUTH_SESSION_SECRET` en de locatie van media worden niet zomaar geroteerd: de wrapper weigert zulke wijzigingen aan een bestaande installatie totdat een gecontroleerde migratie is uitgevoerd. Een secret in GitHub wijzigen verandert geen bestaand PostgreSQL-account of versleutelde MFA-data. Bewaar oudere backupconfiguraties en hersteltoegang.

Bestaande stagingaccounts, data en secrets worden niet automatisch verwijderd. De stagingworkflow wordt uitgeschakeld; oude resources kunnen na controle op afhankelijkheden door de operator worden opgeruimd. Ze zijn geen voorwaarde voor productie.

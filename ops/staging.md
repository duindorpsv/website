# Staging met de huidige Supabase-runtime

Deze procedure bereidt de bestaande omgeving `staging` voor op configuratieversie **5**. Productie blijft gekoppeld aan `main`, Environment `production`, zijn eigen runner en de bestaande productiehelpers. Een featurepush of draft PR voert geen stagingdeployment uit.

## Wat de workflow doet

`.github/workflows/staging.yml` accepteert uitsluitend de branch `staging`. Een push naar die branch voert checks en **read-only hostinventarisatie** uit. De inventarisatie draait onder `runner-duindorpsv-staging`, zonder checkout, secrets, configuratiewaarden, Dockeropdracht of installatie. Zij toont alleen aanwezigheid, bestandsrechten, verwachte accounts, runnerstatus en aanwezigheid van de vaste sudo-toestemming. Niet-leesbare beschermde bestanden worden als zodanig vermeld. Dat bewijst geen werkende rootless daemon, vrije proxy-poort of geldige credentials.

Een deployment vereist afzonderlijk **workflow_dispatch → operation=deploy** op `staging`. De workflow herhaalt checks, bouwt een image en bindt digest, bron/tree, migratiehash en run-ID aan het releaseartifact. De vaste wrapper verifieert de nieuwste checks/build én dat de huidige stagingbranch nog bij dat artifact hoort. Productiereleases en featurebranchbuilds worden door de stagingwrapper geweigerd; stagingreleases door de productiewrapper eveneens. Na deployment volgt de bestaande menselijke `staging-acceptance`-gate. Een provideracceptatie is geen bewijs van mailboxbezorging.

**Workflowregistratie is nog extern te verifiëren.** Op 5 november 2026 had de oude stagingworkflow ID `384323443` de status `deleted`; de oude stagingbranch bevatte geen manual-dispatchtrigger. De [GitHub-documentatie](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch) noemt de defaultbranch voor het activeren van manual dispatch en vermeldt ook dispatch via API/CLI naar andere refs nadat een workflow eerder gedraaid heeft. De nieuwe read-only push-run kan de workflow opnieuw registreren; de aanwezigheid en dispatchmogelijkheid moeten daarna worden gecontroleerd. Deze voorbereiding claimt geen geslaagde dispatch en wijzigt daarvoor geen `main` of productie. Een push wordt nooit als alternatieve deploymenttrigger gebruikt.

## Instellingen uitsluitend voor staging

Gebruik een aangewezen **afzonderlijk staging-Supabaseproject**, een **private staging-mediabucket** en afzonderlijke backupbestemming of staging-prefix. Kopieer geen productiesecrets en richt geen testomgeving in over een bestaande productiedatabase. Gebruik de URL-/TLS-/sessiepoolerregels uit [GitHub Environments](github-environments.md): achtcijferige Supabase-OTP, 600 seconden, publieke registratie uit, CA-controle aan, verschillende runtime-/migratiewachtwoorden, Resend en private Hetzner S3. Site URL en `APP_BASE_URL` moeten het stagingadres gebruiken.

Verplichte secrets:

`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DATABASE_PASSWORD`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `RESTIC_PASSWORD`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`.

Verplichte variabelen:

`APP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_CA_CERT_B64`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `MAIL_FROM`, `RESTIC_REPOSITORY`, **`TEST_MAIL_TO`**.

`TEST_MAIL_TO` is één expliciet aangewezen veilige testontvanger. De stagingruntime vereist dit adres en stuurt alle appmails daarheen, inclusief login- en ondertekeningscodes. De lokale testsink is uitsluitend toegestaan in `APP_ENV=test`. Productie blijft `TEST_MAIL_TO` weigeren. Controleer verzending en echte ontvangst alleen met aangewezen testaccounts; geen echte sponsorondertekening of betaling voor acceptatie nabootsen.

Optioneel: `BACKUP_S3_REGION` (standaard `S3_REGION`), `TRUST_PROXY_IP`, de drie `NEWS_IMPORT_MAX_*`-limieten en `SPORTLINK_CLIENT_ID`. Een Sportlink-sleutel is voor de sponsoracceptatie niet nodig. Oude `DATABASE_PASSWORD`, `AUTH_SESSION_SECRET`, SMTP- en externe nieuwsbriefproviderinstellingen worden niet gebruikt.

Bij een gedeelde staging-media-/backupbucket is uitsluitend `/.duindorp-backups/staging` toegestaan; `/.duindorp-backups/production` wordt geweigerd. De mediabackup sluit de hele `.duindorp-backups/`-prefix uit. Gebruik de productie-mediabucket ook met een staging-backupprefix niet als staging-mediabron.

Read-only namencontrole op 5 november 2026: staging heeft alleen secrets `APP_DATABASE_PASSWORD`, `AUTH_SESSION_SECRET`, `DATABASE_PASSWORD`, `RESTIC_PASSWORD` en variabelen `NEWSLETTER_PROVIDER`, `S3_REGION`, `SMTP_PORT`, `SMTP_SECURE`, `TRUST_PROXY_IP`. Repository-level secrets en variabelen zijn leeg. Ontbrekende namen moeten met de juiste stagingwaarden worden aangevuld; aanwezigheid van een naam bewijst geen geldige waarde.

## Geïsoleerde hosthelpers voorbereiden

Voer dit uitsluitend als beheerder op de **bevestigde hosting-VPS** uit vanuit de gecontroleerde releasecheckout. De huidige ontwikkelomgeving is geen bewijs van hosttoegang. De online stagingrunner bewijst evenmin dat zijn rootless socket, wrapper, proxy, poort of sudo-grant correct zijn ingericht.

Gebruik de werkelijk geïnventariseerde vrije stagingpoort en het bevestigde HTTPS-origin; de waarden hieronder zijn expliciete placeholders:

```bash
sudo python3 ops/scripts/install-staging-host.py STAGING_PORT https://STAGING_HOST --check
```

Deze preflight schrijft geen configuratie of state, installeert niets en verandert geen services. Zij controleert geïsoleerde niet-rootaccounts, rootless Docker en resources, bestaande poort/origin/socket, bestandsrechten en een vrije poort. Een bezette poort wordt geweigerd; inspecteer een eventuele oude listener eerst. Stop of verwijder geen andere site om de controle te laten slagen.

Een bestaande **`/var/lib/duindorp/staging/active.json` blokkeert de installatie en deployment**. Dit is een legacy-release, geen lege omgeving. Bewaar database, media, configuratie en state en laat de migratie naar het aangewezen staging-Supabaseproject beoordelen. Verwijder of hernoem het bestand niet als omweg. Ook bestaande versie-5 state moet een stagingmanifest bevatten; afwijkende poort/origin/socket worden niet stilzwijgend vervangen.

Na geslaagde preflight en operatorbeoordeling:

```bash
sudo python3 ops/scripts/install-staging-host.py STAGING_PORT https://STAGING_HOST --install
```

De installer schrijft uitsluitend stagingconfiguratie, de vaste staging-sudoersregel en staginghelpers onder `/usr/local/libexec/duindorp/staging-v5/HELPER_HASH/`. De vaste wrapper en staging-backupentrypoint wijzen naar die onveranderlijke, root-owned helpergeneratie. De globale productiehelpers, productieconfiguratie, productiestate en productiesudoers blijven behouden. Dit start geen container, migratie of deployment. De bestaande `install-host.sh production ...` blijft de afzonderlijke productieprocedure.

Controleer de exacte toestemming zonder uit te rollen:

```bash
sudo -u runner-duindorpsv-staging sudo -n -l -u duindorpsv-staging /usr/local/libexec/duindorp/duindorp-deploy-staging
```

Configureer en valideer de bestaande Caddy-route/DNS/HTTPS naar de bevestigde stagingpoort met de hostbeheerder. De repository reserveert geen poort en wijzigt geen proxy. Start pas daarna de expliciete deployment op de huidige stagingcommit. Backupfalen stopt vóór migraties; mislukte readiness herstelt alleen een bekende vorige versie-5 image/configuratie, zonder database- of mediawipe. Een oude lokale-PostgreSQL-release wordt nooit automatisch teruggezet.

## Opleverbewijs

Leg de actuele staging-SHA, image-digest, `/health/ready`, workerstatus, veilige testmailontvangst, één lokale fictieve sponsorflow, private logo-/documenttoegang, backup en geïsoleerde restore vast. Een draft PR, read-only inventarisatie, lokale test of candidate-image vervangt dit bewijs niet. Deze codevoorbereiding voert geen branchsync, dispatch, hostinstallatie of deployment uit.

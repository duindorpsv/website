# GitHub Environment: production

Duindorp SV heeft één deploymentdoel: `production`. De development-VPS is de werkplek. GitHub controleert een PR, bouwt na de merge naar `main` een image en levert dat image met een vast digest op de productie-VPS. Daar draaien alleen web en worker; **database en inloggen met e-mailcode gebruiken het eigen Supabase-project; privébestanden blijven in de bestaande Hetzner S3-bucket**. Alle website-, welkom- en inlogmails gaan via de Resend HTTPS API. Nieuwsbriefabonnees worden in het CMS beheerd.

De Supabase-omzetting gebruikt configuratieversie **5**. De oude release met een lokale PostgreSQL-container is geannuleerd en mag niet worden ingezet. De onderstaande configuratie vervangt de vorige handleiding.

## Secrets

Stel deze namen in onder repository → Settings → Environments → **production** → Environment secrets. Waarden blijven buiten Git, PR's en chat.

| Naam | Waarde |
| --- | --- |
| `MIGRATION_DATABASE_URL` | Supabase PostgreSQL-verbinding voor `postgres`, direct of **session pooler**, poort 5432, database `postgres`, met `?sslmode=verify-full`. Neem de host uit Supabase **Connect** over. |
| `DATABASE_URL` | Dezelfde projectdatabase, met beperkt account `duindorp_app` en het afzonderlijke runtime-wachtwoord. Bij de session pooler wordt de gebruikersnaam `duindorp_app.PROJECTREF`. Ook poort 5432 en `?sslmode=verify-full`. |
| `APP_DATABASE_PASSWORD` | Het wachtwoord uit `DATABASE_URL`, minimaal 24 willekeurige tekens. De provisioning maakt dit beperkte account aan; het mag niet gelijk zijn aan het migratiewachtwoord. |
| `SUPABASE_SECRET_KEY` | Een serversleutel `sb_secret_…` uit het eigen project, voor accountbeheer, het genereren van inlogcodes en sessiecontrole. Komt uitsluitend op de server. |
| `S3_ACCESS_KEY_ID` | De bestaande Hetzner S3-access key ID voor de mediabucket. |
| `S3_SECRET_ACCESS_KEY` | De bestaande bijbehorende Hetzner S3-secret. |
| `RESEND_API_KEY` | Resend API-sleutel met toestemming voor verzenden vanaf het geverifieerde afzenderdomein. |
| `RESTIC_PASSWORD` | Sterk wachtwoord voor de versleutelde externe backup, minimaal 24 tekens. Bewaar hersteltoegang ook buiten GitHub. |
| `BACKUP_S3_ACCESS_KEY_ID` | Schrijftoegang voor de versleutelde externe backuplocatie. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Bijbehorende backupsecret. |
| `SPORTLINK_CLIENT_ID` | Alleen nodig als de Sportlink-koppeling gebruikt wordt. |

Gebruik percent-encoding voor bijzondere tekens in database-URL's. `APP_DATABASE_PASSWORD` bevat het oorspronkelijke wachtwoord. De runtime krijgt geen migratieverbinding of backupcredentials. De certificaatcontrole blijft aan; poort 6543/transaction pooling wordt voor deze blijvende backend en migraties niet geaccepteerd.

## Variables

| Naam | Waarde |
| --- | --- |
| `APP_BASE_URL` | Het echte HTTPS-siteadres, bijvoorbeeld `https://www.example.org`; moet overeenkomen met het ingerichte reverse-proxyadres. |
| `SUPABASE_URL` | `https://PROJECTREF.supabase.co` van het **eigen Duindorp-project**. |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` uit datzelfde project. |
| `SUPABASE_DB_CA_CERT_B64` | Het database-CA-certificaat uit Supabase Database settings → SSL, als één regel Base64. Dit certificaat is openbaar en geen privésleutel. |
| `S3_ENDPOINT` | Hetzner-regioadres zonder bucketpad: `https://fsn1.your-objectstorage.com` (of de bestaande regio `nbg1`/`hel1`). De bucket staat apart in `S3_BUCKET`. |
| `S3_REGION` | De bestaande Hetzner-regio, bijvoorbeeld `fsn1`; moet overeenkomen met `S3_ENDPOINT`. |
| `S3_BUCKET` | De naam van de bestaande **privébucket**, bijvoorbeeld `duindorpsv`. |
| `MAIL_FROM` | Het geverifieerde kale e-mailadres, bijvoorbeeld `website@example.org`, zonder weergavenaam. |
| `RESTIC_REPOSITORY` | `s3:https://BACKUP-ENDPOINT/BUCKET/PAD` voor de externe backup. Bij gebruik van de bestaande mediabucket is uitsluitend `s3:https://fsn1.your-objectstorage.com/duindorpsv/.duindorp-backups/production` toegestaan. Het `s3:`-voorvoegsel hoort erbij. |
| `BACKUP_S3_REGION` | Regio van de backupbucket; standaard gelijk aan `S3_REGION`. |
| `TRUST_PROXY_IP` | Alleen `true` als de proxy `X-Real-IP` overschrijft en de app uitsluitend via die proxy bereikbaar is; anders `false`. |
| `NEWS_IMPORT_MAX_MB` | Optioneel: standaard `512`; toegestaan 32–2048 MiB. |
| `NEWS_IMPORT_MAX_UNPACKED_MB` | Optioneel: standaard `2048`; toegestaan 512–4096 MiB. |
| `NEWS_IMPORT_MAX_ENTRIES` | Optioneel: standaard `10000`; toegestaan 100–50000 bestanden. |

Base64 maken zonder het certificaat of een sleutel af te drukken: `base64 -w0 SUPABASE-CA.crt > supabase-ca.base64`. Plak de inhoud van dat bestand in de variable. Op macOS: `base64 < SUPABASE-CA.crt | tr -d '\n' > supabase-ca.base64`.

`DATABASE_PASSWORD` en `AUTH_SESSION_SECRET` worden in versie 5 niet meer gelezen. Oude SMTP-, SendGrid-, externe contactenlijst- of staginginstellingen zijn niet nodig. Bewaar oude backup-/MFA-herstelgegevens zolang de oude installatie nog moet kunnen worden hersteld.

De gereserveerde prefix `.duindorp-backups/` wordt uitgesloten van de mediabackup. Zo neemt een backup nooit eerdere backups opnieuw mee wanneer dezelfde Hetzner-bucket wordt gebruikt. Restic versleutelt de backup met `RESTIC_PASSWORD`; de backupcredentials blijven gescheiden van de runtime. Een aparte backupbucket blijft mogelijk.

## Supabase-inrichting

Gebruik een apart project voor deze applicatie. Auth → URL Configuration: Site URL is `APP_BASE_URL`. Zet openbare en anonieme registratie uit. Laat de e-mailprovider aan; stel **Email OTP length op 8** en **Email OTP expiration op 600 seconden** in. De app gebruikt uitsluitend e-mailcodes, ook voor beheerders. Een authenticator is niet nodig. Supabase genereert en verifieert de code; de eigen worker verstuurt de Duindorp SV-template via de bestaande Resend API. Configureer hiervoor geen SMTP en plak geen template in Supabase. Er is geen extra GitHub-secret voor OTP nodig.

De code is aan de aanvragende browser gebonden, eenmalig, maximaal tien minuten geldig en beperkt tot vijf verificatiepogingen. Alleen een met het bestaande servergeheim beveiligde HMAC-codehash wordt opgeslagen; ruwe codes staan niet in de jobpayload of logs. Een nieuwe code kan na een minuut worden aangevraagd. Alleen actieve, expliciet gekoppelde CMS-accounts krijgen toegang. Provider-sessies uit andere inlogmethoden geven geen CMS-toegang. De sessie verloopt uiterlijk na twaalf uur en accountblokkades/rechtenwijzigingen trekken toegang onmiddellijk in.

Behoud de bestaande Hetzner S3-bucket en objectkeys. De browser gebruikt de bestaande, geautoriseerde media-/documentroutes; hij krijgt geen S3- of serversleutel. De productie-readiness controleert bereikbaarheid, bucket-ACL en bucketpolicy en weigert publieke groeps-/wildcardtoegang. Een ontbrekende leesmachtiging voor ACL/policy stopt de uitrol. Controleer ook bestaande object-ACLs: een privébucket kan afzonderlijk openbaar gemaakte objecten bevatten. Supabase Storage is niet nodig. Voor CMS-tabellen zijn `anon`, `authenticated` en `service_role` Data API-grants ingetrokken en staat RLS aan. De server gebruikt het aparte beperkte SQL-account en CMS-rollen/teamrechten; gebruikersmetadata bepaalt geen rechten.

Migratie 0014 bewaart bestaande CMS-profiel-ID's en historische verwijzingen. Een bestaand lokaal account wordt niet automatisch op e-mailadres aan een Supabase-account gekoppeld. Bestaande accounts, database-inhoud en media moeten vóór de eerste productieoplevering gecontroleerd worden overgezet; zie [eerste deployment](first-deploy.md). Oude sessies geven geen toegang tot de nieuwe inlogflow. Oude wachtwoord-/MFA-instellingen worden niet gebruikt.

## Productie-VPS en workflow

Het bestaande rootless Docker-account en de vaste deploywrapper blijven vereist. De runner heeft geen algemeen sudo- of Dockerrecht. De beheerder moet de **versie-5** helpers en Compose-configuratie uit deze release installeren; de oude root-owned wrapper begrijpt de nieuwe configuratie niet. Het installatiescript vervangt een bestaande inrichting niet stilzwijgend.

De wrapper controleert `main`, CI, bron/tree en image-digest, bewaart de configuratie privé en maakt een externe database-/media-/configbackup vóór migraties. Daarna volgen migratie, beperkte databaseprovisioning en web/worker-readiness. Een mislukte applicatiestart herstelt de vorige combinatie van image en configuratie; database en media worden niet automatisch teruggezet. Een terugkeer naar de oude lokale-databasearchitectuur vereist een beheerde migratie.

De Environment staat alleen `main` toe. Als een reviewer is ingesteld, wacht de productiejob op die goedkeuring. De echte projectverbinding, opslag en Resend-bezorging moeten worden gecontroleerd; een geslaagde CI bewijst geen live deployment.

## Nieuwsbriefbeheer

De campagne-module gebruikt dezelfde `RESEND_API_KEY`, `MAIL_FROM` en `APP_BASE_URL`; er zijn geen nieuwe verplichte GitHub secrets of variabelen. **Nieuwsbrieven → Instellingen → Koppelen via bestaande Resend-sleutel** maakt of hergebruikt de bezorgwebhook. Daarvoor moet de bestaande Resend-sleutel webhookbeheerrechten hebben. Een beperkte verzendsleutel kan wel mails aanbieden. De UI toont apart of bezorgmeldingen gekoppeld zijn; provideracceptatie wordt niet als bezorging gepresenteerd. Contacten en doelgroepen blijven in het eigen CMS, er zijn geen externe providerlijsten nodig. Zie [de beheerdershandleiding](newsletters.md) voor de eenmalige inrichting en echte testmailcontrole.

## Sponsorportaal en centraal register

Het sponsorportaal gebruikt dezelfde Supabase-sessies, Resend-sleutel en private Hetzner S3-bucket. Er zijn **geen nieuwe verplichte GitHub secrets of variabelen**, geen SMTP en geen stagingomgeving. Houd Supabase OTP op acht cijfers/600 seconden en publieke registratie uit. `SUPABASE_SECRET_KEY` blijft alleen server-side en beveiligt ook de afzonderlijke ondertekeningschallenges. Ontvangers, voorwaarden en herinneringsdagen worden bij Sponsoring → Instellingen beheerd. De bestaande backup moet de nieuwe private tabellen en bijbehorende S3-objecten meenemen. Zie [inrichting en beheer](sponsor-portal.md).

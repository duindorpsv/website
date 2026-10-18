# GitHub Environment: production

Duindorp SV heeft één deploymentdoel: `production`. De development-VPS is de werkplek. GitHub controleert een PR, bouwt na de merge naar `main` een image en levert dat image met een vast digest op de productie-VPS. Daar draaien alleen web en worker; **database, inloggen/MFA en privébestanden gebruiken het eigen Supabase-project**. Alle website-, uitnodigings- en herstelmails gaan via de Resend HTTPS API. Nieuwsbriefabonnees worden in het CMS beheerd.

De Supabase-omzetting gebruikt configuratieversie **5**. De oude release met een lokale PostgreSQL-container is geannuleerd en mag niet worden ingezet. De onderstaande configuratie vervangt de vorige handleiding.

## Secrets

Stel deze namen in onder repository → Settings → Environments → **production** → Environment secrets. Waarden blijven buiten Git, PR's en chat.

| Naam | Waarde |
| --- | --- |
| `MIGRATION_DATABASE_URL` | Supabase PostgreSQL-verbinding voor `postgres`, direct of **session pooler**, poort 5432, database `postgres`, met `?sslmode=verify-full`. Neem de host uit Supabase **Connect** over. |
| `DATABASE_URL` | Dezelfde projectdatabase, met beperkt account `duindorp_app` en het afzonderlijke runtime-wachtwoord. Bij de session pooler wordt de gebruikersnaam `duindorp_app.PROJECTREF`. Ook poort 5432 en `?sslmode=verify-full`. |
| `APP_DATABASE_PASSWORD` | Het wachtwoord uit `DATABASE_URL`, minimaal 24 willekeurige tekens. De provisioning maakt dit beperkte account aan; het mag niet gelijk zijn aan het migratiewachtwoord. |
| `SUPABASE_SECRET_KEY` | Een serversleutel `sb_secret_…` uit het eigen project, voor accountbeheer, herstel-links en controle van de privébucket. Komt uitsluitend op de server. |
| `S3_ACCESS_KEY_ID` | Supabase Storage → S3 → gegenereerde access key ID. |
| `S3_SECRET_ACCESS_KEY` | De bijbehorende Supabase Storage S3-secret. |
| `RESEND_API_KEY` | Resend API-sleutel met toestemming voor verzenden vanaf het geverifieerde afzenderdomein. |
| `RESTIC_PASSWORD` | Sterk wachtwoord voor de versleutelde externe backup, minimaal 24 tekens. Bewaar hersteltoegang ook buiten GitHub. |
| `BACKUP_S3_ACCESS_KEY_ID` | Schrijftoegang voor de aparte externe backupbucket. |
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
| `S3_ENDPOINT` | `https://PROJECTREF.storage.supabase.co/storage/v1/s3`, overgenomen uit de S3-instellingen van hetzelfde project. Het pad hoort erbij. |
| `S3_REGION` | De regio uit die Supabase S3-instellingen. |
| `S3_BUCKET` | De naam van een **privébucket**, uitsluitend voor Duindorp. |
| `MAIL_FROM` | Het geverifieerde kale e-mailadres, bijvoorbeeld `website@example.org`, zonder weergavenaam. |
| `RESTIC_REPOSITORY` | `s3:https://BACKUP-ENDPOINT/BUCKET/PAD` voor de aparte externe backup. |
| `BACKUP_S3_REGION` | Regio van de backupbucket; standaard gelijk aan `S3_REGION`. |
| `TRUST_PROXY_IP` | Alleen `true` als de proxy `X-Real-IP` overschrijft en de app uitsluitend via die proxy bereikbaar is; anders `false`. |
| `NEWS_IMPORT_MAX_MB` | Optioneel: standaard `512`; toegestaan 32–2048 MiB. |
| `NEWS_IMPORT_MAX_UNPACKED_MB` | Optioneel: standaard `2048`; toegestaan 512–4096 MiB. |
| `NEWS_IMPORT_MAX_ENTRIES` | Optioneel: standaard `10000`; toegestaan 100–50000 bestanden. |

Base64 maken zonder het certificaat of een sleutel af te drukken: `base64 -w0 SUPABASE-CA.crt > supabase-ca.base64`. Plak de inhoud van dat bestand in de variable. Op macOS: `base64 < SUPABASE-CA.crt | tr -d '\n' > supabase-ca.base64`.

`DATABASE_PASSWORD` en `AUTH_SESSION_SECRET` worden in versie 5 niet meer gelezen. Oude SMTP-, SendGrid-, externe contactenlijst- of staginginstellingen zijn niet nodig. Bewaar oude backup-/MFA-herstelgegevens zolang de oude installatie nog moet kunnen worden hersteld.

## Supabase-inrichting

Gebruik een apart project voor deze applicatie. Auth → URL Configuration: Site URL is `APP_BASE_URL`; sta uitsluitend het exacte hersteladres `APP_BASE_URL/beheer/herstel` toe. Zet openbare en anonieme registratie uit. Zet e-mail/wachtwoord en TOTP-enrollment/verificatie aan; minimum wachtwoordlengte 12. De applicatie maakt activatie-/herstellinks met `admin.generateLink` en verstuurt deze zelf via Resend; configureer hiervoor geen SMTP.

Maak de Storage-bucket privé. De browser gebruikt de bestaande, geautoriseerde media-/documentroutes; hij krijgt geen S3- of serversleutel. De readinesscheck weigert een publieke bucket. Voor CMS-tabellen zijn `anon`, `authenticated` en `service_role` Data API-grants ingetrokken en staat RLS aan. De server gebruikt het aparte beperkte SQL-account en CMS-rollen/teamrechten; gebruikersmetadata bepaalt geen rechten.

Migratie 0014 bewaart bestaande CMS-profiel-ID's en historische verwijzingen. Een bestaand lokaal account wordt niet automatisch op e-mailadres aan een Supabase-account gekoppeld. Bestaande accounts, database-inhoud en media moeten vóór de eerste productieoplevering gecontroleerd worden overgezet; zie [eerste deployment](first-deploy.md). Oude sessies vervallen; oude MFA-instellingen werken niet als Supabase-factor.

## Productie-VPS en workflow

Het bestaande rootless Docker-account en de vaste deploywrapper blijven vereist. De runner heeft geen algemeen sudo- of Dockerrecht. De beheerder moet de **versie-5** helpers en Compose-configuratie uit deze release installeren; de oude root-owned wrapper begrijpt de nieuwe configuratie niet. Het installatiescript vervangt een bestaande inrichting niet stilzwijgend.

De wrapper controleert `main`, CI, bron/tree en image-digest, bewaart de configuratie privé en maakt een externe database-/media-/configbackup vóór migraties. Daarna volgen migratie, beperkte databaseprovisioning en web/worker-readiness. Een mislukte applicatiestart herstelt de vorige combinatie van image en configuratie; database en media worden niet automatisch teruggezet. Een terugkeer naar de oude lokale-databasearchitectuur vereist een beheerde migratie.

De Environment staat alleen `main` toe. Als een reviewer is ingesteld, wacht de productiejob op die goedkeuring. De echte projectverbinding, opslag en Resend-bezorging moeten worden gecontroleerd; een geslaagde CI bewijst geen live deployment.

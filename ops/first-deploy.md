# Eerste productieoplevering met Supabase

De architectuur is development-VPS → GitHub `main` → productie-VPS (web/worker), met Supabase Database/Auth/Storage en Resend API. De eerder gebouwde lokale-PostgreSQL-release is geannuleerd. Gebruik de [versie-5 Environment-handleiding](github-environments.md).

## Project en gegevens

1. Wijs het eigen Duindorp Supabase-project aan. Controleer projectref, PostgreSQL-versie, bestaande tabellen, accounts en buckets vóór een wijziging. Gebruik geen project van een andere applicatie. De migrator weigert een database met andere applicatietabellen.
2. Leg vast welke bestaande Duindorp-database en media de bron zijn. Bewaar een complete, versleutelde backup van die bron en de oude configuratie. Een lege Supabase-database is geen migratie van bestaand CMS-werk.
3. Zet de bestaande CMS-tabellen en hun gegevens gecontroleerd over vóór het seeden/eerste deployment. Behoud profiel-ID's, records, revisies, publicaties, importidentiteiten en het Drizzle-migratiejournaal. Supabase beheert zijn eigen `auth`- en `storage`-schema's; overschrijf die niet met schema's van een andere installatie. Zet alle benodigde opslagobjecten onder hun bestaande sleutels in de privébucket. Controleer aantallen, checksums en publicatieverwijzingen. Er is geen automatisch wissen of vervangen van een bestaande bestemming.
4. Pas de applicatiemigraties toe met het migratieaccount en richt het beperkte runtime-account in. De release voert dit ook uit; bij een gegevensmigratie moet de beheerder deze volgorde vóór de eerste publieke start coördineren. De migratie bewaart CMS-profielen en trekt oude sessies in.
5. Voor oude lokale accounts: `migrate-accounts` telt standaard de actieve, nog niet gekoppelde CMS-profielen. `migrate-accounts --apply` maakt nieuwe Supabase-identiteiten met willekeurige onbekende wachtwoorden en koppelt deze aan de bestaande CMS-ID's. Een bestaand Supabase-account met hetzelfde e-mailadres wordt **niet** automatisch gekoppeld: onderzoek zo'n conflict. Voeg uitsluitend als activatieverzending gewenst is `--queue-activation` toe. Testprofielen met een `.invalid`-mailadres krijgen geen Supabase-identiteit. Ongekoppelde historische profielen geven geen inlogtoegang en tellen niet als actieve eigenaar. Gebruikers stellen hun wachtwoord opnieuw in en richten hun Supabase-authenticator opnieuw in. De oude MFA-cryptografie wordt niet overgenomen.

Voor een werkelijk nieuwe site zonder over te nemen gegevens kan het eerste deployment de seed aanmaken. Maak daarna de eerste eigenaar met de bestaande `owner`-runtimeopdracht en het echte, afgesproken e-mailadres. Er is geen standaardwachtwoord. De bestaande beheerderbescherming voorkomt een tweede eerste-eigenaarproces. Een productiebeheerder moet TOTP controleren voordat CMS-data toegankelijk wordt.

## Host en release

De productiehost heeft de eerder afgesproken aparte runner-/app-identiteit, rootless Docker en één gereserveerde loopbackpoort. De beheerder installeert de root-owned helpers en `compose.yml` van **deze** versie. Een bestaande wrapper/configuratie wordt eerst gecontroleerd en expliciet bijgewerkt; `install-host.sh` weigert overschrijven. Er draait geen lokale productiedatabase meer in deze Compose-configuratie. Raak andere sites, Docker-daemons, volumes en reverse-proxyregels niet aan.

Vul de exacte GitHub Environment-namen in. De SQL-URL's gebruiken het juiste project, verschillende accounts/wachtwoorden, poort 5432 en certificaatcontrole met het gedownloade Supabase-CA-certificaat. Storage gebruikt de S3-credentials van hetzelfde Supabase-project en een privébucket. Configureer Resend en de geverifieerde afzender. Supabase SMTP is niet nodig: activatie/herstel gebruikt `admin.generateLink` en de bestaande Resend-outbox.

Laat de vereiste PR-controles slagen en merge naar `main`. De workflow bouwt een image en een releaseartifact met configuratieversie 5. Geef de productiejob vrij als de Environment een reviewer vereist. De wrapper verifieert bron/digest, maakt eerst een versleutelde externe backup, past migraties en databaseprovisioning toe, start web/worker en controleert readiness plus het exacte release-digest. Een fout stopt de oplevering.

## Oplevercontrole

Controleer de publieke website en `/health/ready` op de echte hostnaam, de workerheartbeat, de verwachte bestaande inhoud en privémedia. Controleer met een echt afgesproken beheerdersaccount inloggen, activeren/herstellen, TOTP en rollen/teamrechten. Controleer dat een publieke Supabase-client geen CMS-tabellen of privéobjecten kan ophalen. Voer een afgesproken mailproef uit en controleer de ontvangst in Resend; een gemockte contracttest bewijst geen bezorging.

Bewaar de release-/backupreferentie. Beproef herstel in een geïsoleerde Supabase-testomgeving voordat de nieuwe installatie als volledig hersteld/overgedragen wordt beschouwd; herstel nooit over de actieve productieomgeving om een backup te testen. Zie [rollback en herstel](rollback-and-restore.md).

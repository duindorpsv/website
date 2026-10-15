# Rollback en herstel

App-rollback en databaseherstel zijn afzonderlijke handelingen. Releases zijn immutable digests. De root-owned `rollback.py <staging|production>` is operator-only en draait als de bijbehorende `duindorpsv-*`-applicatiegebruiker. Hij gebruikt de geregistreerde `previous.json` met **image plus configuratiegeneratie**, een serverlock en de bestaande compatibele database. Na readiness/releasecontrole wordt `current.json` atomair bijgewerkt. `latest-run-id` blijft staan, zodat rollback geen oude wachtrijdeployment toelaat. Het script wist geen volumes en herstelt geen oude DB automatisch. Controleer login na rollback.

De reguliere deployer weigert oudere wachtrijjobs, valideert GitHub-build/artifactbinding, registry/digest/bron/tree, migreert onder een aparte DB-identiteit en schakelt pas na healthchecks over. Bij appfalen herstelt hij de vorige app waar het schema compatibel is. Migraties zijn uitbreidend; destructieve contractmigraties pas buiten de rollbacktermijn.

Operationele backup: database-dump, alle private originelen/afgeleiden en de bijbehorende runtime-/migratieconfiguratie. Instellingen komen uit de eigen GitHub Environment; zie [github-environments.md](github-environments.md). Restic versleutelt externe S3-backups; minimaal 14 dagelijkse herstelpunten is het startbeleid dat de eigenaar nog moet bevestigen. Retentie groepeert op de vaste omgevingshost/tag, zodat tijdelijke dumpmappen niet elk een onbeperkte eigen retentiegroep krijgen. Geen globale Docker-prune, compose down -v, schemareset of volume-verwijdering.

Restore:

1. Kies exact het DB-herstelpunt met bijbehorende objectmanifest/media en de compatibele release. Documenteer het dataverliesvenster; overschrijf productie niet als onderdeel van een automatische test.
2. Herstel naar een nieuwe geïsoleerde DB/bucket/omgeving; herstel benodigde secrets via de externe secretvoorziening. Gebruik pg_restore en behoud de versie-/publicatiehistorie.
3. Controleer aantallen/checksums, accountlogin, MFA/herstel, livepagina plus metadata, albums/afgeleiden/originelen, formulierhistorie/notities, rechten, worker en mailopvang. Contactgegevens en afdelingen blijven historisch gescheiden.
4. Meet werkelijke herstelduur en fouten; leg bewijs vast. Stel geen RTO/RPO-belofte zonder meting.
5. Alleen na een afzonderlijk herstelbesluit productie omschakelen. Rotatie/intrekking van sessies en integratietokens bij een incident; geen standaardwachtwoord of achterdeur.

`ops/scripts/restore-test.sh` is uitsluitend voor de synthetische developmentdatabase en maakt duindorp_restore_test aan. Hij raakt de bron-DB niet. Het script weigert een bestaande doeldatabase via CREATE DATABASE; een herhaling vraagt een nieuwe expliciet geïsoleerde bestemming.

## Geïsoleerde developmentproef

Met de private developmentconfiguratie en synthetische e2e-accountfixture: voer `pnpm exec tsx scripts/prepare-restore-test.ts`, `bash ops/scripts/restore-test.sh` en `pnpm exec tsx scripts/verify-restore-test.ts` uit. De restorehelper vervangt alleen de vaste geïsoleerde database `duindorp_restore_test`; de bron `duindorp` blijft behouden. Bewijs wordt privé opgeslagen in `.runtime/restore/evidence.json`. Login, pagina, eigen geüploade media en historische formulierdefinitie worden daadwerkelijk gelezen. Dit bewijst geen externe restic-backup, S3-versieherstel of productieherstel.

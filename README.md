# Duindorp SV CMS

Next.js 16.3.4 / React 19 op Node 24.18.0, Supabase PostgreSQL met Drizzle, Supabase Auth met achtcijferige e-mailcodes, privébestanden in de bestaande Hetzner S3-bucket, een zelfstandige worker en Resend API voor mail. CMS-rollen, teamrechten, nieuws, revisies en abonnee-/onderwerpbeheer blijven onderdeel van de applicatie. De goedgekeurde Sites v44-bron staat in `reference/`; bronprovenance in `ops/source-provenance.json`.

## Development en verificatie

Gebruik Node uit `.node-version` en pnpm uit `package.json`. Bewaar configuratie buiten Git volgens `.env.example`. Development/test gebruiken uitsluitend eigen geïsoleerde data en een expliciete `TEST_MAIL_TO`; koppel een ontwikkelproces niet aan de productiedatabase. De oude `compose.development.yml` beschrijft alleen de eerdere lokale PostgreSQL-inrichting en is geen volledige Supabase-omgeving.

`pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck` en `pnpm build:runtime` controleren de onafhankelijke onderdelen. Integratie-/browsertests vereisen de geïsoleerde Supabase-stack uit `supabase/config.toml`. De GitHub CI start hiervoor echte Database/Auth-services en een lokale S3-testadapter via Supabase Storage, maakt privétestdata, test het beperkte databaseaccount, inloggen met eenmalige e-mailcodes, privacy en de complete web/worker-image en stopt zijn eigen stack. Credentials worden niet als artifacts gepubliceerd. Zie [Supabase-verificatie](supabase/README.md).

`pnpm db:migrate` gebruikt `MIGRATION_DATABASE_URL`; `scripts/provision-database.ts` richt het beperkte runtime-account in. Daarna kunnen seed en web/worker starten. Het bestaande Drizzle-journaal is de enige applicatiemigratiehistorie. Bestaande CMS-identiteiten worden expliciet gemigreerd; de applicatie koppelt geen accounts op alleen hun e-mailadres.

## Productie

Er is één deployment-Environment: **production**. Na de vereiste controles gaat `main` naar de productie-VPS; de workflow gebruikt een geverifieerd image-digest en versie-5 configuratie uit GitHub. De VPS draait web/worker en gebruikt het eigen Supabase-project voor Database/Auth en de bestaande Hetzner S3-bucket voor bestanden. Website-, welkom- en inlogmails gebruiken Resend API; nieuwsbriefgegevens blijven in het CMS.

De [Environment-handleiding](ops/github-environments.md) bevat alle exacte secrets/variables. Volg [eerste deployment](ops/first-deploy.md) voor projectkeuze, bestaande inhoud/accounts/media en hostinrichting; [rollback en herstel](ops/rollback-and-restore.md) beschrijft backups. [CMS-handleiding](ops/cms-guide.md), [nieuwsimport](ops/news-import.md) en het [uitvoerlog](ops/execution-log.md) bevatten de beheerinformatie en bewezen controles.

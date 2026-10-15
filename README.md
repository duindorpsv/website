# Duindorp SV — gedeeld CMS

Next.js 16.3.4 / React 19 op Node 24.18.0, PostgreSQL 17 met Drizzle, Better Auth, één Tiptap-document voor rijen en kolommen, private objectopslag en een zelfstandige worker. De goedgekeurde Sites v44-bron en overdracht staan in `reference/`; bronprovenance staat in `ops/source-provenance.json`.

Nieuws en Verhalen hebben eigen routes, selectie en rechten. Conceptbewerkingen wijzigen de liveversie niet. Formulierontvangst, revisies, audit en taken staan in de gedeelde database. E-mail en nieuwsbrief worden verwerkt via de worker; ledenaanmelding gebruikt de officiële clubroute of aantoonbaar handmatige opvolging. Een ontbrekende koppeling wordt als wachtend weergegeven.

## Development

Gebruik Node uit `.node-version` en pnpm uit `package.json`. Kopieer `.env.example` naar een afgeschermd bestand buiten Git en vul eigen developmentwaarden in. Genereer een unieke `AUTH_SESSION_SECRET` van minimaal 32 tekens. `DATABASE_URL` moet naar de eigen developmentdatabase wijzen; `MEDIA_ROOT` naar een private, duurzame developmentmap. `compose.development.yml` gebruikt uitsluitend loopbackpoorten 62522 (DB), 62525 (test-SMTP) en 62580 (testmailweergave). Stel `DEV_DB_PASSWORD` privé in voor Compose.

```sh
corepack enable
pnpm install --frozen-lockfile
# Exporteer de private omgevingswaarden in deze shell.
docker compose -p duindorp-cms-development -f compose.development.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm owner:create
pnpm dev --port 62500
# Tweede terminal met dezelfde private configuratie:
pnpm worker
```

De webapp bindt development aan `127.0.0.1`. Open `/clubmuur`, `/beheer` en `/narrowcasting`. Een eigenaar ontvangt een activatielink via de e-mailqueue; er is geen standaardwachtwoord. `scripts/development-test-account.ts` maakt uitsluitend in development/test een privaat synthetisch testaccount voor de browserproeven. Gebruik dat niet als clubaccount.

## Verificatie

```sh
pnpm test
pnpm typecheck
# APP_ENV=test en een afzonderlijke database met naam duindorp_test:
pnpm db:migrate
pnpm db:seed
pnpm test:integration
pnpm build
pnpm build:runtime
# Alleen tegen de development/testwebapp, met een private e2e-fixture:
pnpm test:e2e
```

Integratietests weigeren de gewone development-/productiedatabase. Het [acceptatierapport](ops/acceptance-report.md) onderscheidt uitgevoerde controles van ontbrekend infrastructuur- en integratiebewijs. Een Dockerbuild voert unit- en typechecks opnieuw uit. `/health/ready` controleert migraties, seed, opslag en een recente workerheartbeat; `/health/live` is de procescontrole.

## Deployment en beheer

`main` draait uitsluitend CI. `staging` bouwt op GitHub-hosted runners en levert een onveranderlijk GHCR-digest plus bron- en migratiebinding. `production` promoveert alleen het goedgekeurde stagingdigest met dezelfde Git-tree. De afzonderlijke serving-host-runners voeren vaste geïnstalleerde scripts uit en hebben geen algemene Docker-/sudo-toegang.

- [Inventaris](ops/inventory.md), [uitvoerlog](ops/execution-log.md) en [acceptatie](ops/acceptance-report.md).
- [Eerste serverinrichting en deploy](ops/first-deploy.md), inclusief `ops/scripts/install-host.sh` na hostinventarisatie.
- [GitHub Environment secrets en variables](ops/github-environments.md): exacte namen voor staging en productie; overdracht en rollback van private runtimeconfiguratie.
- [Rollback, externe backup en herstel](ops/rollback-and-restore.md).
- [CMS-handleiding](ops/cms-guide.md) en [servercontracten](ops/api-contract.md).

Staging/production vereisen eigen private S3-buckets, beperkte databaseaccounts, HTTPS, SMTP, testmailafbakening en externe backupconfiguratie. Sportlink-lezen vereist het bevoegde club-client-ID. Het openbare leescontract verleent geen Sportlink-schrijfrechten. Bewaartermijnen en echte ontvangers worden door de club vastgesteld. De hosting-VPS en externe credentials volgen na de developmentbuild en push naar `main`; er is nog geen deployment of externe verwerking bewezen.

Op een gedeelde VPS met uitgeputte watcherlimieten kan development met `WATCHPACK_POLLING=1500 pnpm dev --port 62500 --webpack` draaien. Dit is uitsluitend een developmentoptie; het geteste productie-image gebruikt de standalone server en de eigen beperkte workerworkspace. Backendversies worden door één pnpm-catalogus gedeeld.

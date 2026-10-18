# Duindorp SV — gedeeld CMS

Next.js 16.3.4 / React 19 op Node 24.18.0, PostgreSQL 17 met Drizzle, Better Auth, één Tiptap-document voor rijen en kolommen, private objectopslag en een zelfstandige worker. De goedgekeurde Sites v44-bron en overdracht staan in `reference/`; bronprovenance staat in `ops/source-provenance.json`.

Nieuws en Verhalen hebben eigen routes, selectie en rechten. Conceptbewerkingen wijzigen de liveversie niet. Formulierontvangst, revisies, audit en taken staan in de gedeelde database. Websitemail gaat via de worker en de SendGrid HTTPS API; nieuwsbrief-lijstbeheer gebruikt de optionele provider; ledenaanmelding gebruikt de officiële clubroute of aantoonbaar handmatige opvolging. Een ontbrekende koppeling wordt als wachtend weergegeven.

## Development

Gebruik Node uit `.node-version` en pnpm uit `package.json`. Kopieer `.env.example` naar een afgeschermd bestand buiten Git en vul eigen developmentwaarden in. Genereer een unieke `AUTH_SESSION_SECRET` van minimaal 32 tekens. `DATABASE_URL` moet naar de eigen developmentdatabase wijzen; `MEDIA_ROOT` naar een private, duurzame developmentmap. `compose.development.yml` gebruikt uitsluitend loopbackpoort 62522 voor de database. Stel `DEV_DB_PASSWORD` privé in voor Compose.

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

Voor echte developmentmail zijn `SENDGRID_API_KEY`, een geverifieerde `MAIL_FROM` en een expliciete `TEST_MAIL_TO` nodig; alle mail gaat naar dit testadres. Zonder transport blijft mail retrybaar in de queue. Er is geen lokale SMTP-service nodig.

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

`main` draait controles en bouwt het productie-image op GitHub-hosted runners. Na de bestaande productiegoedkeuring deployt uitsluitend GitHub Environment `production` het onveranderlijke GHCR-digest via de productierunner. Developmentwerk komt via een geteste PR op main; er is geen stagingomgeving of aparte productiebranch nodig. De serving-host-runner voert vaste geïnstalleerde scripts uit en heeft geen algemene Docker-/sudo-toegang.

- [Inventaris](ops/inventory.md), [uitvoerlog](ops/execution-log.md) en [acceptatie](ops/acceptance-report.md).
- [Eerste serverinrichting en deploy](ops/first-deploy.md), inclusief `ops/scripts/install-host.sh` na hostinventarisatie.
- [GitHub Environment secrets en variables](ops/github-environments.md): exacte namen voor de enige deploymentomgeving `production`; overdracht en rollback van private runtimeconfiguratie.
- [Rollback, externe backup en herstel](ops/rollback-and-restore.md).
- [CMS-handleiding](ops/cms-guide.md) en [servercontracten](ops/api-contract.md).

Productie vereist een eigen private S3-bucket, beperkte databaseaccounts, HTTPS, SendGrid API met geverifieerde afzender en externe backupconfiguratie. Sportlink-lezen vereist het bevoegde club-client-ID. Het openbare leescontract verleent geen Sportlink-schrijfrechten. Bewaartermijnen en echte ontvangers worden door de club vastgesteld. De hosting-VPS en externe credentials volgen na de developmentbuild en push naar `main`; er is nog geen deployment of externe verwerking bewezen.

Op een gedeelde VPS met uitgeputte watcherlimieten kan development met `WATCHPACK_POLLING=1500 pnpm dev --port 62500 --webpack` draaien. Dit is uitsluitend een developmentoptie; het geteste productie-image gebruikt de standalone server en de eigen beperkte workerworkspace. Backendversies worden door één pnpm-catalogus gedeeld.

# Inventaris — 14 oktober 2026

> Actuele inrichting vanaf 18 oktober 2026: development-VPS → main → uitsluitend GitHub Environment `production`; websitemail via SendGrid API. De staging-/SMTP-verwijzingen hieronder beschrijven eerdere inventarisatie en testresultaten. De actuele procedure en exacte instellingen staan in [github-environments.md](github-environments.md) en [first-deploy.md](first-deploy.md). Eerder voorbereide stagingresources zijn niet automatisch verwijderd.

Doelrepository: `duindorpsv/website`, door eigenaar aangewezen. Bij aanvang van development waren de repository en lokale werkmap leeg. De Sites-bronremote is niet overgenomen. Inmiddels bevat `main` de applicatie en drie workflows; de serving-host-aansluiting wordt op die broncode afgestemd.

Development: Linux x86_64, Node 24.18.0, pnpm 11.25.0, gebruiker codex. Docker, PostgreSQL-client en GitHub CLI beschikbaar. Bestaande containers en loopbackdiensten behoren aan andere projecten; ze blijven intact. Op inventarisatiemoment circa 16 GB vrije schijf. Testdiensten krijgen eigen Duindorp-namen, volumes en uitsluitend vrije loopbackpoorten.

## Hosting-VPS bevestigd door terminaluitvoer van de eigenaar

De eigenaar heeft onderstaande inrichting op 14 oktober 2026 uitgevoerd en de uitkomsten gedeeld. Deze gegevens zijn geen bewijs van een gepubliceerde applicatie of van bereikbaarheid vanaf de ontwikkelomgeving.

- Ubuntu 24.04.4 LTS, x86_64; beheer via de bestaande private Tailscale-verbinding.
- Caddy, bestaande GitHub-runners en Next.js-processen zijn actief. Andere sites staan onder `/srv/sites`.
- De eigenaar heeft capaciteit en bezette poorten geïnventariseerd. Interne adressen, beheerdersaccount en details van andere projecten worden buiten deze publieke repository bewaard.
- De systeemunits `docker.service`, `docker.socket` en `containerd.service` zijn gemaskeerd. Alleen de eigen gebruikersdaemons worden gebruikt.

| Omgeving | Applicatieaccount | Runneraccount | Runnernaam en workflowlabel | Docker data-root |
| --- | --- | --- | --- | --- |
| Staging | duindorpsv-staging | runner-duindorpsv-staging | duindorpsv-staging-01 / duindorpsv-staging | /srv/duindorpsv/staging/docker |
| Production | duindorpsv-production | runner-duindorpsv-production | duindorpsv-production-01 / duindorpsv-production | /srv/duindorpsv/production/docker |

Beide runnerdiensten zijn `active running`. GitHub Idle-status en een werkelijk uitgevoerde deployjob zijn daarmee nog niet afzonderlijk aangetoond. De workflows gebruiken de bij registratie opgegeven labels; eerder toegevoegde `duindorp-*-deploy`-labels mogen daarnaast blijven bestaan.

Beide Docker-daemons antwoorden met `name=rootless`, `CgroupDriver=systemd`, `CgroupVersion=2` en de bovenstaande data-roots. De accounts hebben elk een eigen subuid/subgid-reeks van 65536 IDs. Docker-sockets horen bij `/run/user/APP_UID/docker.sock`; de installer bepaalt de werkelijke UID en controleert eigenaar, toegang en daemon voordat hij bestanden installeert.

## Nog niet aangesloten of bewezen

De gewijzigde hostinstaller en deploywrappers moeten nog op de VPS worden uitgevoerd. Nieuwe webpoorten en domeinen zijn niet gereserveerd. Caddy-routing, DNS, HTTPS voor de nieuwe applicatie, private S3-buckets, SMTP/testmail, externe backups, databasebootstrap en eerste eigenaaractivatie ontbreken nog. Op verzoek van de eigenaar worden applicatie- en integratie-instellingen vanaf configuratieversie 2 via GitHub Environment secrets/variables beheerd; zie `github-environments.md`. De bestaande backup-, stagingacceptatie- en productierestore-eisen blijven van kracht. Een app-release en daadwerkelijke backup/restore zijn nog niet op deze VPS getest.

Niet aangeleverd: browserbackup met persoonlijke uploads, narrowcastingexport, D1-historie, Sportlink-leesconfiguratie, geautoriseerd ledenaanmeldcontract, SMTP, nieuwsbriefprovider en bewaarbeleid. Seeds worden niet voorgesteld als volledige gebruikersmigratie; demoprofielen worden geen accounts.

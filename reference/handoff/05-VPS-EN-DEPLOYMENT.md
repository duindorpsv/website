# VPS, GitHub en deployment — Duindorp SV

Status: uitvoerbare overdrachtsafspraken voor de implementatie, geen geïnstalleerde infrastructuur. Opgesteld op 13 oktober 2026. De bestaande static-websites-VPS, GitHub-repository, domeinen, beschikbare poorten en inlogrechten zijn nog niet onderzocht. Dit hoofdstuk gebruikt daarom geen vermeende serveradressen, gebruikers of poortnummers.

## 1. Gewenste route

| Plaats of branch | Doel | Deployment |
| --- | --- | --- |
| Development-VPS | Codex ontwikkelt, migreert, test en maakt commits | Alleen de ontwikkelomgeving |
| GitHub `main` | Geteste ontwikkelcode samenvoegen | **Geen deployment** naar de serving-VPS |
| GitHub `staging` | Een geselecteerde versie van `main` testen | Alleen staging op de bestaande static-websites-VPS |
| GitHub `production` | De op staging goedgekeurde release vrijgeven | Alleen production op dezelfde serving-VPS |

De bijgevoegde DartsPoint-handleiding bepaalt deze branchroute en de scheiding tussen bouwen en uitrollen. De DartsPoint-domeinen, applicatienamen, vaste poorten, game-server, Redis- en Supabase-inrichting horen niet automatisch bij Duindorp SV. Deze VPS bestaat al en host andere websites: voer de installatiehoofdstukken voor een lege VPS niet integraal uit.

Ontwikkelen en server-side bouwen zijn twee verschillende stappen: Codex bouwt de applicatie op de development-VPS; GitHub CI maakt daarna de gecontroleerde release-artifacts. De self-hosted runners op de serving-VPS voeren uitsluitend beperkte deployments uit. Ze installeren geen npm-dependencies, bouwen geen images en voeren geen PR-tests uit.

## 2. Eerst inventariseren, daarna gericht toevoegen

Leg de uitkomst vast in `ops/inventory.md`, zonder tokens of ruwe secrets. Lees bestaande configuraties en inspecteer services; publiceer geen volledige procesomgevingen, `.env`-bestanden of registry-inlogbestanden in logs.

| Inventarisatie | Vast te leggen beslissing |
| --- | --- |
| OS, architectuur, CPU/RAM, vrije schijf, bestaande workloads | Passend runtime-image; budget voor staging en productie plus groeiruimte voor foto's |
| Bestaande Caddy/Nginx/andere proxy, virtual hosts, certificaten | Bestaande proxy behouden; alleen twee nieuwe, afgebakende site-configuraties toevoegen |
| Luisterende poorten en bestaande Docker-/systemd-services | Twee vrije loopbackpoorten kiezen; geen nummers uit de DartsPoint-handleiding overnemen |
| Docker rootful/rootless, gebruikers, netwerken, volumes | Een additioneel isolatiemodel dat bestaande websites niet raakt |
| Runners, labels, runnergroepen, repositories, serviceaccounts | Nieuwe unieke Duindorp-labels en eigen deploymentrechten |
| Bestaande firewall, IPv6, SSH/Tailscale en backupbeleid | Bestaande toegang en beveiliging behouden; geen reset of globale vervanging |
| GitHub-plan, repository-eigenaar, branchregels en Environments | Vastleggen welke branch-, geheimen- en reviewbeperkingen werkelijk beschikbaar zijn |
| Domeinen/DNS en externe mail-/Sportlinktoegang | Per omgeving expliciete, gecontroleerde waarden |

Maak vóór de eenmalige wijzigingen een herstelbare kopie van alleen de te wijzigen configuratie. Valideer de nieuwe proxyconfiguratie met het gereedschap van de aanwezige proxy en herlaad gecontroleerd. Controleer daarna ook alle bestaande websites die dezelfde proxy gebruiken. Verander geen globale firewall- of SSH-configuratie voor een applicatieprobleem. Schakel een bestaande Docker-daemon of socket niet uit.

## 3. Productieruntime is nog te bouwen

De aangeleverde broncode is een Sites-concept. `package.json` gebruikt `scripts/run-framework.mjs` voor Sites/vinext-builds; het huidige `start`-commando start **Wrangler developmentmodus lokaal**. Dat is geen gekozen productiehosting voor de VPS.

Codex moet eerst de framework- en runtimeafhankelijkheden inspecteren, inclusief API-routes, bindings, middleware, imports en de huidige lockfile. Doelarchitectuur van dit pakket: behoud de React/Next-interface en maak een reguliere Next.js standalone Node-SSR-build, PostgreSQL met Drizzle-migraties, S3-compatibele mediaopslag en een worker met een databasequeue/outbox. Er is geen Supabase-vereiste en Redis is niet standaard nodig. Leg de gekozen Node-, package-manager- en frameworkversies exact vast. Gebruik geen aanname dat de huidige `npm start`, een statische export of een willekeurige Dockerfile al passend is.

Bekende bestaande platformafhankelijkheden die daadwerkelijk moeten worden vervangen: `db/index.ts` importeert `cloudflare:workers` en `drizzle-orm/d1`; `lib/sportlink-server.ts` en `lib/sportlink-team-server.ts` gebruiken `env.DB` en D1-query's. Migreer die SQL/leases/transacties naar PostgreSQL en behoud teamhistorie en stale-cachegedrag. De bestaande leeskoppeling gebruikt de binding `SPORTLINK_CLIENT_ID`; dat is een bestaande configuratienaam, geen verzonnen nieuw integratiecontract. De nieuwe variabelen in `config/env.example` zijn verder voorstellen. Een bestaand D1-cache-/historie-export staat los van de browserlokale CMS-export.

Leveren:

- Een werkende multi-stage Dockerfile en `.dockerignore`; de runtime bevat geen brongeheimen, devserver of package-installatiestap. Neem bij de standalone-build ook de vereiste `public`- en `.next/static`-bestanden op; die worden niet vanzelf allemaal in de standalone-map gekopieerd. [N1]
- De applicatie draait als niet-root, met read-only applicatiebestanden en alleen expliciete tijdelijke/schrijfbare opslag.
- Een eigen worker indien mail, Sportlink of beeldverwerking asynchroon draait; de webserver voert zulke taken niet afhankelijk van een open browser uit.
- Een production-buildtest die pagina's, CMS-login, API, uploads en background jobs in de gekozen runtime controleert.
- Geen secrets of omgevingsspecifieke staging-URL's in de browserbuild. Openbare runtimeconfiguratie komt via een gecontroleerde allowlist; geheimen blijven server-side.

Staging en production moeten hetzelfde app-image kunnen gebruiken. Ontwerp omgevingswaarden daarom als runtimeconfiguratie. Next.js verwerkt `NEXT_PUBLIC_`-waarden tijdens de build; server-side dynamisch gelezen waarden kunnen wel per runtime verschillen. Indien een noodzakelijke frontendwaarde alleen tijdens build kan worden vastgelegd, moet Codex dat eerst oplossen; een anders gebouwde productionimage mag niet doorgaan voor exact het op staging geteste artifact. [N2]

## 4. Isolatie op de bestaande VPS

Voorkeursmodel na compatibiliteitscontrole: twee afzonderlijke applicatiegebruikers met elk een eigen rootless Docker-daemon, Compose-project, netwerk, database en volumes; daarnaast twee aparte runnergebruikers. Namen en paden krijgen een unieke Duindorp-prefix, maar worden pas na de inventarisatie gekozen. Een passend, aantoonbaar gelijkwaardig bestaand beheermodel mag worden gebruikt zonder de huidige hosting om te bouwen.

Rootless Docker heeft voorwaarden. Controleer eigen niet-overlappende subordinate UID/GID-reeksen, gebruikersservices, automatische start na reboot, en de werkelijke Docker-context. Resourcebegrenzing moet aantoonbaar werken: Docker documenteert voor cgroup-limieten cgroup v2 en systemd; controleer de gedelegeerde controllers en test CPU/geheugen/PID-limieten. Kopieer geen globale systemd-instelling zonder impactanalyse. [D1]

Webpoorten binden uitsluitend op een gekozen `127.0.0.1`-poort. De bestaande reverse proxy verzorgt TLS en bereikbaarheid. Publiceer database- of interne queuepoorten niet op de host. Controleer het daadwerkelijke bereik vanaf buiten, ook IPv6; alleen het opschrijven van een loopbackbinding is geen netwerkproef. [D2]

Houd staging kleiner dan production en begrens loggrootte, procesaantal, beeldverwerking en uploadquota. Houd rekening met dubbele opslag tijdens een release of afbeeldingsconversie. Geen gedeelde beschrijfbare volumes, Docker-sockets, uploads of databaseaccounts tussen beide omgevingen. Losse accounts maken van deze VPS geen twee onafhankelijke servers: netwerk, kernel, schijf en uitval blijven gedeeld.

## 5. Branches, release-artifacts en promotie

Configureer expliciete GitHub Environments `staging` en `production`, met uitsluitend hun gelijknamige branch als toegestane deploymentbron; geen tagwildcards. Gebruik branchbescherming en vereiste geslaagde controles voor `main`, `staging` en `production`. Onderzoek de bestaande workflowtriggers voordat de eerste merge plaatsvindt. GitHub-features verschillen per plan/repositorytype; leg de werkelijk ingestelde regels vast. [G1]

Aanbevolen pipeline:

1. Pull requests en `main`: GitHub-hosted CI test en controleert; krijgt geen deploymentsecrets en draait nooit op de serving-VPS. `main` deployt niets.
2. Push naar `staging`: CI bouwt de geselecteerde broncommit, draait tests en publiceert één OCI-image in de gekozen registry. Gebruik de digest `sha256:…` als release-identiteit, geen veranderlijke tag zoals `latest`.
3. De staging-deployjob krijgt uitsluitend een gevalideerd releasemanifest en het immutable image-digest. De stagingrunner deployt en controleert. Registreer daarna het resultaat en de tests als deploymentbewijs bij exact dat digest.
4. Goedkeuring van staging fixeert de release: broncommit, Git-tree, build-run, digests van web/worker, migratieversie, testresultaat en configuratieschemaversie. Meerdere images vormen één ondeelbaar releasepaar.
5. Push/merge naar `production`: een GitHub-hosted verificatiejob zoekt het geregistreerde, goedgekeurde staging-artifact op. Controleer dat de productietree exact overeenkomt met de geteste tree. Een mergecommit kan een andere SHA hebben; sla zowel bron-SHA, tree-SHA als promotion-SHA op. Bij inhoudelijk verschil: terug naar staging.
6. Production deployt **dezelfde digests** en voert dezelfde compatibele migraties uit. Er wordt geen nieuwe app-build gemaakt tijdens promotie. Omgevingsgeheimen worden pas op runtime geladen.

Gebruik een vast, klein JSON-schema voor het releasemanifest. De deployer accepteert uitsluitend de vaste registry/repository en `sha256` met 64 hextekens, plus gecontroleerde metadata; geen vrije image-URL, bestandspad, Compose-tekst of shellcommando. Bewaar provenance en releasebewijs duurzaam, bijvoorbeeld als OCI-artifact of beschermde releaseadministratie. De deployer mag niet alleen een willekeurig meegegeven JSON-bestand vertrouwen: controleer de toegestane repository, buildworkflow, broncommit, runresultaat en digestbinding. Production vereist bovendien geslaagde stagingregistratie.

Bescherm workflowwijzigingen en deployscripts als code die productie kan bereiken. Pin gebruikte Actions op gecontroleerde volledige commit-SHA's, of gebruik een ondersteunde dependency-lockoplossing met identiteitscontrole. Environment-regels isoleren de host niet; de runner mag geen onbeoordeelde code uitvoeren. [G2]

## 6. Klein bevoegd deploymentoppervlak

De runner heeft geen algemene sudo, geen lidmaatschap van `docker`, geen root-Docker-socket en geen schrijfrechten op de andere omgeving. Staging- en productionlabels zijn verschillend; gebruik waar beschikbaar runnergroepen die uitsluitend de bedoelde repository/workflow toelaten.

Installeer twee door root beheerde deploymentscripts op vaste paden. Een minimale sudoersregel mag uitsluitend het juiste script **als de eigen applicatiegebruiker** uitvoeren, niet als root. Het script zelf zet de bekende omgeving, vaste rootless socket, Compose-pad en projectnaam. De beheerder valideert sudoers met `visudo`. Geen algemene `sudo bash`, `sudo docker`, `sudo systemctl` of runnerbeschrijfbaar script in het bevoegd pad.

Verplicht contract van elk deploymentscript:

1. Verkrijg een server-side lock voor de omgeving. Combineer dit met GitHub `concurrency` per omgeving en `cancel-in-progress: false` voor deploymentjobs.
2. Controleer de aangeroepen identiteit, invoerschema, artifactprovenance, actuele branch/promotie en releasevolgorde. Weiger een verouderde wachtrijjob die een nieuwere release zou terugzetten; rollback is een expliciete aparte actie naar een geregistreerde vorige release.
3. Lees alleen de vaste omgevingsconfiguratie en haal alleen toegestane digests op. Registrylogin gebruikt een tijdelijk configpad en stdin; cleanup vindt ook bij fouten plaats.
4. Leg de vorige actieve release vast. Controleer migratiecompatibiliteit en het benodigde herstelpunt voordat mutaties beginnen.
5. Voer een enkelvoudige migratiejob uit met migratierechten; de normale app gebruikt een beperkter DB-account. Controleer succesvolle voltooiing vóór start of omschakeling.
6. Start de nieuwe release, wacht begrensd op readiness en voer smokechecks uit. Markeer de release pas actief na succes.
7. Bij mislukking: behoud/herstel de vorige app als het schema compatibel is; registreer de fout. Geen automatisch wissen van data of terugzetten van een DB-backup.

GitHub CI krijgt standaard `contents: read`; alleen de buildjob krijgt `packages: write`. De deploymentjob krijgt alleen vereiste leesrechten. Voor GHCR ondersteunt GitHub Actions een kortlevend `GITHUB_TOKEN`; geef de repository expliciet toegang tot het package indien nodig. Gebruik geen permanent breed accounttoken als gemak. Het lezen op digest zorgt dat de gekozen imageversie vaststaat. [G3]

## 7. Data, configuratie en integraties

Gebruik gescheiden development-, staging- en productiondatabases, opslag en credentials. Productiegegevens worden niet automatisch naar staging gekopieerd. Ontwikkeltestdata is synthetisch; een noodzakelijke kopie wordt vooraf geschikt gemaakt voor de beperkte testdoelen.

| Onderdeel | Vastleggen in implementatie |
| --- | --- |
| Database | PostgreSQL-versie, Drizzle-migraties, accounts per omgeving, schema-versietabel, herstelstrategie |
| Media/albums | S3-compatibele opslag met persistente originelen, gegenereerde formaten, referenties, quota, integriteitschecks, externe backup |
| Sessies/auth | Server-side authenticatie en rollen, beveiligde cookies, intrekking en secretsrotatie |
| Contact/Aanmeldingen/Aanvragen | Gescheiden categorieën; duurzame opslag en verzendstatus; databasequeue/outbox met retries en idempotentie |
| Mail/nieuwsbrief | Provider/SMTP, senderverificatie, afleverstatus; staging vangt berichten op en verstuurt niet naar echte leden |
| Sportlink | Eerst het beschikbare en geautoriseerde API-contract vaststellen; leesdata en inschrijfacties afzonderlijk configureren |
| Runtimeconfiguratie | Schema-validatie bij starten; ontbrekende verplichte waarden geven duidelijke fout zonder secrets te loggen |
| Audit/logging | Release-ID en correlation-ID; persoonsgegevens en formulierteksten niet ongefilterd naar infrastructuurlogs |

`config/env.example` is een contractvoorstel, geen al aangesloten configuratie. Codex koppelt de werkelijk gekozen libraries eraan en verwijdert ongebruikte variabelen. Bewaar echte waarden in een gecontroleerde secretvoorziening of alleen-leesbare omgevingsbestanden buiten git; voorkom dat runnerlogs ze tonen. Zet geen secret onder een `NEXT_PUBLIC_`-naam. Een deployment verandert applicatieconfiguratie niet via de CMS-interface.

De prototypegegevens staan nu browserlokaal. Een gitclone bevat niet automatisch de persoonlijke localStorage-/IndexedDB-inhoud. Maak vóór de gegevensmigratie een volledige CMS-backup inclusief de geüploade blobs, plus een afzonderlijke narrowcastingconfiguratie-export, controleer volledigheid/hashreferenties en importeer eerst op development/staging. De aangeleverde seeds zijn niet automatisch alle actuele gebruikerswijzigingen. Behandel iedere import herhaalbaar met een rapport over ontbrekende media en niet-ondersteunde blokken.

## 8. Backups, herstel en rollback

Geen release mag volumes verwijderen; geen automatische `docker compose down -v`, destructieve schemareset of globale Docker-prune. Database en uploads vallen buiten het image en behouden hun eigen lifecycle.

Startvoorstel voor planning: dagelijkse versleutelde externe database- en mediabackups, minimaal 14 dagelijkse herstelpunten, en een extra herstelpunt vóór risicovolle migraties. Codex legt de gekozen bewaartermijnen, opslagkosten en hersteldoelen expliciet vast. Voeg zo nodig database-logarchivering en incrementele mediabackups toe om het gewenste dataverliesvenster te halen. Backupsleutels en herstelhandleiding moeten ook buiten deze VPS beschikbaar zijn.

Test vóór livegang een complete restore naar een geïsoleerde omgeving: database, media, credentialsherstelprocedure, accountlogin, gepubliceerde pagina, albums en formulierhistorie. Meet de echte hersteltijd; een niet-geteste tijdsbelofte is geen acceptatiebewijs. Monitor geslaagde én mislukte backups, verouderde herstelpunten en schijfruimte.

Gebruik expand/contract-migraties: eerst compatibele schema-uitbreiding, dan applicatie, later eventuele opruiming wanneer de rollbacktermijn voorbij is. Houd de vorige image-digests beschikbaar. Een app-rollback gebruikt de bestaande DB; een DB-restore vereist een apart herstelbesluit met expliciet mogelijk gegevensverlies en mag niet als automatische rollback worden verkocht.

## 9. Eerste stagingrelease en dagelijkse promotie

Eenmalig, nadat repository en VPS zijn geïnspecteerd:

1. Kies domeinen, vrije poorten, accounts, directorystructuur, resourcebudget en backupbestemming. Leg alle keuzes zonder secrets vast.
2. Implementeer en test productie-runtime, database, media, authenticatie, migraties en healthchecks op development/CI.
3. Installeer uitsluitend de nieuwe afgebakende accounts/services/configuraties op de hosting-VPS; bescherm bestaande sites en controleer die na afloop.
4. Maak GitHub Environments/branchregels en de minimale runnerkoppelingen. Doe eerst een deploymentvrije runnercontrole.
5. Configureer stagingwaarden en een mailopvang. Bescherm staging met toegangstoets én `noindex`; `robots.txt` is geen toegangscontrole.
6. Merge de geselecteerde versie naar `staging`, bouw het artifact in CI en deploy de digest. Test ook persistence na herstart, één mislukte deploy en een app-rollback.
7. Leg het geslaagde staging-artifact vast. Maak productionconfiguratie en backup/restore klaar. Promoveer via de `production`-branch exact de goedgekeurde release; een push naar `main` blijft zonder deployment.

Nieuwe routes leveren minimaal liveness (proces leeft) en readiness (DB/schema/opslag bruikbaar). De precieze endpointnamen en responsschema's legt Codex vast; ze geven geen secrets of persoonsdata prijs. Deploychecks controleren HTTPS, de release-identiteit, publieke content, login/autorisatie, een beperkte media-/formulierproef en de worker. Mail- of Sportlinkproeven gebruiken vooraf ingestelde testontvangers/testfaciliteiten en voeren niet ongemerkt echte aanmeldingen uit.

Maak geen downtimevrije belofte zonder geteste omschakelstrategie. Houd bestaande aanvragen in behandeling via timeouts en nette procesafsluiting; lange achtergrondtaken moeten herstartbaar/idempotent zijn. Een reguliere app-release herschrijft de proxyconfiguratie niet.

## 10. Opleverbewijs van Codex

- Nieuwe broncode, geteste containerbuild en lockfiles; GitHub-workflows met zichtbare branchvoorwaarden.
- Werkelijke runtime- en Compose-configuratie, deployscripts, secretcontract, migraties en een éénmalige beheerprocedure.
- Infrastructuurinventarisatie plus bewijs dat bestaande websites na installatie nog werken.
- Een stagingrelease met bron-SHA, tree-SHA, build-run, image-digests, migratieversie en testresultaten.
- Bewijs dat `main` niets deployt, staging geen productiegegevens/rechten gebruikt en production dezelfde geteste digests ontvangt.
- Rapporten van herstart, mislukte deployment, rollback en geïsoleerde backuprestore.
- Korte dagelijkse instructies voor uitrollen, promotie, rollback, secretrotatie, runnerupdates en media-/DB-herstel.

## Officiële documentatie

Geraadpleegd op 13 oktober 2026; opnieuw controleren tijdens de feitelijke installatie.

- [G1 — GitHub Environments en beschikbare beschermingsregels](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [G2 — GitHub Actions: secure use en self-hosted runners](https://docs.github.com/en/actions/reference/security/secure-use)
- [G3 — GitHub Container Registry: toegang en pull op digest](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [G4 — Deploymentconcurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [D1 — Docker rootless: tips en resourcebegrenzing](https://docs.docker.com/engine/security/rootless/tips/)
- [D2 — Docker: gepubliceerde poorten](https://docs.docker.com/engine/network/port-publishing/)
- [N1 — Next.js standalone-output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [N2 — Next.js runtimeconfiguratie en self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

# GitHub Environments: configuratie en secrets

Vanaf configuratieversie 2 beheren `staging` en `production` hun applicatie-, mail-, media- en backupinstellingen via GitHub Environment secrets en variables. Vul dezelfde namen per omgeving in met afzonderlijke waarden. `staging-acceptance` bevat geen applicatiesecrets of variables; daar blijft de vereiste menselijke stagingacceptatie staan.

Ga naar [Settings → Environments](https://github.com/duindorpsv/website/settings/environments), kies de omgeving en voeg de instellingen hieronder toe. De workflows lezen uitsluitend de expliciet vermelde namen. Ontbrekende verplichte waarden stoppen deployment vóór een databasewijziging. Er worden geen voorbeeldcredentials ingevuld.

## Environment secrets

| Naam | Verplicht | Betekenis |
| --- | --- | --- |
| `DATABASE_PASSWORD` | Beide | Wachtwoord voor `duindorp_migration`, minimaal 24 tekens. |
| `APP_DATABASE_PASSWORD` | Beide | Ander wachtwoord voor `duindorp_app`, minimaal 24 tekens. |
| `AUTH_SESSION_SECRET` | Beide | Eigen authenticatiesleutel; genereer minimaal 32 willekeurige bytes, bijvoorbeeld 64 hextekens. |
| `S3_ACCESS_KEY_ID` | Beide | Toegang tot uitsluitend de eigen private mediabucket. |
| `S3_SECRET_ACCESS_KEY` | Beide | Bijbehorende mediasleutel. |
| `RESTIC_PASSWORD` | Beide | Eigen encryptiewachtwoord voor de externe backuprepository, minimaal 24 tekens. |
| `BACKUP_S3_ACCESS_KEY_ID` | Beide | Toegang tot de eigen externe S3-backuprepository. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Beide | Bijbehorende externe backupsleutel. |
| `SMTP_USER` | Bij SMTP-authenticatie | SMTP-gebruikersnaam. Samen met `SMTP_PASSWORD`; beide mogen leeg blijven bij een vertrouwde relay zonder authenticatie. |
| `SMTP_PASSWORD` | Bij SMTP-authenticatie | SMTP-wachtwoord. |
| `SPORTLINK_CLIENT_ID` | Bij Sportlink-leesfuncties | De echte geautoriseerde leesconfiguratie; geeft geen schrijfrechten voor ledenaanmeldingen. |
| `NEWSLETTER_API_KEY` | Bij `NEWSLETTER_PROVIDER=brevo` | Brevo API-key. |

Gebruik voor staging en productie eigen databasesleutels, authenticatiesleutels en buckettoegang. Houd herstelkopieën van de encryptiesleutels en externe toegang ook buiten GitHub en de VPS; GitHub secrets kunnen niet als plaintext worden teruggelezen. Plak echte waarden niet in issues, commits of commandoregelargumenten.

Interactief instellen kan bijvoorbeeld met `gh secret set AUTH_SESSION_SECRET --repo duindorpsv/website --env staging`; de CLI vraagt de waarde zonder deze in het commando te plaatsen. Herhaal met `--env production` voor de andere omgeving.

## Environment variables

| Naam | Staging | Production |
| --- | --- | --- |
| `APP_BASE_URL` | Definitieve HTTPS-origin van staging | Definitieve HTTPS-origin van productie |
| `S3_BUCKET` | Eigen private stagingbucket | Eigen private productiebucket |
| `S3_ENDPOINT` | HTTPS-origin bij S3-compatible opslag; leeg bij AWS S3 | Zelfde regel |
| `S3_REGION` | Regio; standaard `eu-west-1` | Regio; standaard `eu-west-1` |
| `SMTP_HOST` | Echte SMTP-hostnaam, verplicht | Echte SMTP-hostnaam, verplicht |
| `SMTP_PORT` | Standaard `587` | Standaard `587` |
| `SMTP_SECURE` | Standaard `false`: STARTTLS vereist; `true` voor directe TLS, gewoonlijk poort 465 | Zelfde regel |
| `MAIL_FROM` | Geverifieerd afzenderadres, bijvoorbeeld `cms@eigen-domein.nl`; verplicht | Geverifieerd afzenderadres; verplicht |
| `TEST_MAIL_TO` | Verplicht testadres; uitgaande mail gaat hierheen | Leeg laten; een ingevulde waarde wordt geweigerd |
| `TRUST_PROXY_IP` | Standaard `false`; pas `true` als de proxy X-Real-IP overschrijft en directe toegang is geblokkeerd | Zelfde regel |
| `NEWSLETTER_PROVIDER` | Standaard `disabled`; eventueel `brevo` met eigen testlijst | `disabled` of `brevo` |
| `NEWSLETTER_LIST_ID` | Positief lijstnummer, verplicht bij Brevo | Positief lijstnummer, verplicht bij Brevo |
| `RESTIC_REPOSITORY` | Externe repository, verplicht: `s3:https://backup-host/eigen-stagingbucket/pad` | Eigen externe repository, verplicht: `s3:https://backup-host/eigen-productiebucket/pad` |
| `NEWS_IMPORT_MAX_MB` | Optioneel; standaard `512`, bereik 32–2048 MiB per ZIP | Zelfde regel |
| `NEWS_IMPORT_MAX_UNPACKED_MB` | Optioneel; standaard `2048`, bereik 512–4096 MiB uitgepakt | Zelfde regel |
| `NEWS_IMPORT_MAX_ENTRIES` | Optioneel; standaard `10000`, bereik 100–50000 ZIP-items | Zelfde regel |
| `BACKUP_S3_REGION` | Standaard dezelfde waarde als `S3_REGION` | Standaard dezelfde waarde als `S3_REGION` |

De backupadapter ondersteunt hier S3 via HTTPS voor Restic. De mediabucket en externe backupopslag moeten vooraf zijn aangemaakt en toegangsrechten moeten kloppen. Eerste deployment kan een lege Restic-repository initialiseren; een bestaande repository met een ander encryptiewachtwoord wordt nooit overschreven. Elke deployment stopt wanneer backup faalt. Bewaar minimaal 14 dagelijkse herstelpunten binnen de eigen omgeving; dit is geen bevestiging van een werkelijk uitgevoerde externe backup/restore.

`APP_ENV` volgt uit het vaste staging- of production-deployscript. `MEDIA_DRIVER=s3`, DB-gebruikers/host/naam, beide database-URL's en bestandslocaties worden door dat script samengesteld. `GITHUB_TOKEN`, image-digest en releasemanifest komen uit GitHub Actions. Hiervoor hoef je geen extra Environment secret of variable aan te maken.

## Overdracht naar de VPS

De GitHub-hosted build heeft geen applicatiesecrets. Alleen de deployjob krijgt de secrets van zijn eigen Environment. Die job stuurt een JSON-bericht via stdin naar de root-owned wrapper; er wordt geen repositorycode op de deploymentrunner uitgecheckt of uitgevoerd. Waarden worden als data behandeld, nooit als shellcode.

De wrapper valideert artifact, broncommit/tree, actuele branch, omgeving en een vaste lijst configuratiesleutels. Docker-socket, loopbackpoort, Compose-bestand, proxy-origin en scriptpaden blijven eenmalig door de operator vastgelegd onder `/etc/duindorp/<omgeving>/`. `APP_BASE_URL` moet overeenkomen met die origin. Een GitHub variable kan daarmee geen andere applicatiepoort of Docker-daemon kiezen.

De gevalideerde runtimeconfiguratie krijgt onder `/var/lib/duindorp/<omgeving>/configuration/<hash>/` een private map met rechten 0700 en bestanden met rechten 0600, uitsluitend van de bijbehorende applicatiegebruiker. Web/worker krijgen alleen hun runtimewaarden; migratie-, provisioning- en backupcredentials blijven gescheiden. Het releasemanifest bevat uitsluitend metadata en `configVersion:2`; er worden geen secrets geüpload als Actions-artifact of ingebouwd in het image.

`current.json` registreert image en configuratie samen. Een mislukte appstart zet het vorige image met zijn vorige runtimeconfiguratie terug. Database en media worden niet automatisch teruggezet. Restic-backups bevatten DB, media en de bijbehorende private runtime-/migratieconfiguratie; toegang tot de backup zelf bewaar je afzonderlijk.

## Eerste deployment en wijzigingen

1. Installeer op de geïnventariseerde hosting-VPS de wrappers, helpers en Compose-configuratie uit dezelfde gereviewde broncode met `install-host.sh`. De bestaande runner-/applicatieaccounts, Docker, proxy en domeinen moeten vooraf kloppen. Dit vervangt geen bestaande installatie blind; oudere wrappers/protocol 1 vragen een gereviewde operator-upgrade.
2. Vul de GitHub Environment settings in. Laat de normale CI op main slagen. Promoveer daarna dezelfde geteste bron naar `staging`.
3. De eerste deployment start uitsluitend de eigen database, maakt een eerste extern herstelpunt, migreert, richt het beperkte runtime-account in en seedt de broncontent. Daarna starten web en worker. Eigenaaractivatie blijft een eenmalige operatorhandeling met het containercommand `owner`; er ontstaat geen standaardaccount of wachtwoord.
4. Voer echte stagingacceptatie uit en keur `staging-acceptance` goed. Production gebruikt hetzelfde goedgekeurde image-digest en vereist daarnaast het bestaande externe herstelbewijs voor dat exacte digest en goedkeuring van de production-job.
5. Na een gewone configuratiewijziging in GitHub kun je uitsluitend de deployjob van de laatste release opnieuw uitvoeren, bijvoorbeeld met `gh run rerun RUN_ID --job JOB_DATABASE_ID`. Het bestaande image/artifact blijft gelijk; de secrets worden bij de nieuwe job gelezen. Opnieuw uitvoeren van de volledige staging-build is hiervoor niet nodig. Met `gh run view RUN_ID --json jobs` vind je het job-ID. De stagingacceptatie wordt opnieuw gevraagd.

Databasesleutels wijzigen vereist een gecontroleerde DB-wachtwoordrotatie voordat je de nieuwe waarden gebruikt; alleen een GitHub secret aanpassen verandert geen bestaand PostgreSQL-account. Een wijziging van S3-bucket/endpoint/regio vereist een gecontroleerde mediamigratie. Deze wijzigingen worden bij een bestaande release geweigerd om onbereikbare data te voorkomen. Gewone SMTP-/API-credentialwijzigingen kunnen wel met dezelfde geteste release worden uitgevoerd. Ook wijziging van `AUTH_SESSION_SECRET` wordt geweigerd totdat de operator een gecontroleerde migratie voor sessies en versleutelde MFA-gegevens heeft uitgevoerd. Rollback gebruikt de oude sleutel en oudere backupgeneraties houden de oude runtimeconfiguratie.

De tests controleren de inputgrenzen, echte Compose- en containerdoorgifte met synthetische waarden, bootstrapvolgorde, foutafhandeling en image/configuratie-rollback met gemockte hosts. Externe SMTP/S3/Restic en de werkelijke hosting-VPS zijn daarmee nog niet getest.

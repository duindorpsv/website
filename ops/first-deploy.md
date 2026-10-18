# Eerste inrichting en productierelease

De actieve route is **development-VPS → main → production**. Alleen GitHub Environment `production` en de bestaande productierunner worden gebruikt. De eerder geïnventariseerde stagingaccounts zijn historische infrastructuur; deze procedure raakt die niet. Zie [inventory.md](inventory.md) voor de bevestigde hosttoestand.

De helper `ops/scripts/install-host.sh` koppelt vaste deployscripts aan bestaande accounts en rootless Docker. Hij maakt geen gebruikers aan, herstart Docker niet en wijzigt geen proxy, firewall, DNS of runnerdienst. Hij controleert servicegebruiker, UID/GID-reeksen, socketeigendom, rootless Docker, cgroup v2, resourcebegrenzing, opslag en een vrije webpoort. Bestaande deployconfiguratie, sudoersregels en releasestatus worden geweigerd; afwijkende gedeelde helpers vragen een gereviewde upgrade.

Applicatie-, Resend-, media- en backupinstellingen komen uit GitHub Environment `production`, configuratieversie **4**. De exacte namen staan in [github-environments.md](github-environments.md). De eenmalige hostconfiguratie bevat alleen Docker-identiteit, poort en proxy-origin.

Voer de installatie vanuit de gereviewde checkout op de hosting-VPS als beheergebruiker uit. Poort en domein hieronder zijn voorbeelden: bevestig de reservering en werkelijke origin vooraf. `--check` verandert geen bestanden of services en test geen DNS, HTTPS, Resend of externe backup.

```sh
sudo bash ops/scripts/install-host.sh production 3113 https://duindorpsv.nl --check
# Alleen na bevestigde hostinventarisatie en reservering, zonder --check:
sudo bash ops/scripts/install-host.sh production 3113 https://duindorpsv.nl
```

1. Gebruik applicatiegebruiker `duindorpsv-production`, runnergebruiker `runner-duindorpsv-production`, runnerlabel `duindorpsv-production` en de bestaande rootless data-root `/srv/duindorpsv/production/docker`. Controleer dat de runner de eigen rootless Docker-socket niet rechtstreeks kan gebruiken.
2. De helper installeert root-owned helpers en `/usr/local/libexec/duindorp/duindorp-deploy-production`. De runner krijgt uitsluitend `NOPASSWD` naar deze wrapper als `duindorpsv-production`, zonder argumenten. `visudo` valideert de regel. Een fout `sudo: a password is required` betekent dat deze beperkte aansluiting nog ontbreekt; los die met de helper op.
3. `/etc/duindorp/production/` bevat `compose.yml`, `backup.sh` en `deploy.json` met dockerHost/webPort/baseUrl. De applicatiegebruiker krijgt private releasestatus/configuratie onder `/var/lib/duindorp/production/`. Controleer bestaande paden vóór een upgrade; overschrijf geen gebruikte installatie of databasewachtwoorden.
4. Maak de private mediabucket en afzonderlijke externe Restic-backupopslag aan. Vul de GitHub-instellingen in, waaronder `RESEND_API_KEY` en het geverifieerde `MAIL_FROM`. Verifieer de Resend-domeinrecords en uitgaand HTTPS-verkeer. Stel nooit productiecredentials in lokale tests in.
5. Beperk het GitHub Environment `production` tot branch `main`; behoud de bestaande vereiste productiereviewer. Main vereist de CI-check `verify`. De self-hosted productierunner voert alleen de vaste deploywrapper uit; bouwen en testen gebeurt op GitHub-hosted runners.
6. Voeg alleen de eigen virtual host aan de bestaande proxy toe, na backup en configuratievalidatie. Proxy overschrijft onbevoegde forwardingheaders; logs bevatten geen tokenquerystrings. Controleer bestaande sites/certificaten na een reload, inclusief IPv6 en externe bereikbaarheid.
7. Merge een geteste PR naar main. De workflow controleert unit/integratie/browsergedrag en het echte containerimage, bouwt het GHCR-releaseimage en publiceert `release.json`. Keur vervolgens de production-job goed via **Review deployments**. Geen push naar staging of productionbranch nodig.
8. De wrapper controleert CI, build, artifact, actuele main-commit/tree en imagelabels. Eerste bootstrap start de eigen database, maakt een extern herstelpunt, migreert, provisiont het beperkte account en seedt eenmalig. Web en worker moeten readiness met de juiste digest halen. Backupfalen blokkeert migraties; appfalen herstelt de vorige image/configuratie waar het schema compatibel is.
9. Maak de eigenaar eenmalig met het containercommand `owner`; de activatie komt via de Resend-queue. Activeer MFA vóór productiebeheer. Test login, media, formulieren, bevestigingsmail, worker, persistentie na herstart en rollback. Controleer echte bezorging naast de API-acceptatie.
10. Herstel een extern backupherstelpunt naar een tijdelijk geïsoleerde database/bucket, met verzending en jobs afgeschermd. Controleer login/MFA, pagina, media en formulierhistorie; leg herstelduur en bewijs vast vóór publieke ingebruikname. Volg [rollback-and-restore.md](rollback-and-restore.md). De oude stagingacceptatie en aan een stagingdigest gebonden restoremarker zijn vervallen; backup en herstelproeven blijven onderdeel van productiebeheer.

Eenmalige installatie, bevestigde domeinen/poorten, echte opslag/Resend/backupinstellingen en daadwerkelijke productieacceptatie moeten op de serving-host bewezen worden. Een geslaagde CI-run bewijst die externe aansluitingen niet. Bestaande stagingresources worden uitsluitend na afzonderlijke inventarisatie opgeruimd; de helper verwijdert ze niet.

# Duindorp SV in productie zetten

De website gebruikt **Supabase voor database en inloggen**, de **bestaande Hetzner S3-bucket voor bestanden** en de **Resend API voor e-mail**. Er is alleen GitHub Environment `production`.

Iedereen, ook beheerders, logt in met een **achtcijferige code per e-mail**. Er is geen wachtwoord- of authenticatorstap. Nieuwe CMS-gebruikers worden door een beheerder aangemaakt. Openbare registratie blijft uit. Er zijn geen bestaande gebruikers die voor deze eerste ingebruikname moeten worden gemigreerd.

## 1. Supabase instellen — jij

Open het eigen Duindorp-project in Supabase.

- Authentication → Sign In / Providers → Email: e-mailinloggen aan.
- **Email OTP length: `8`.**
- **Email OTP expiration: `600` seconden.**
- Openbare registratie en anonieme accounts: uit. Registratie is door de eigenaar al uitgezet.
- Authentication → URL Configuration → Site URL: `https://duindorpsv.nl`.
- Een authenticator is voor deze app niet nodig. De applicatie biedt geen MFA-enrollment of wachtwoordlogin aan.

De app vraagt de code aan bij Supabase en controleert haar bij Supabase. De aanvullende applicatiecontrole bewaart alleen een met het bestaande servergeheim beveiligde codehash, bindt de code aan de browser, staat maximaal vijf pogingen toe, verloopt na tien minuten en accepteert iedere code één keer. Alleen sessies uit deze inlogflow krijgen CMS-toegang. Een los Supabase-account zonder actieve CMS-rol geeft geen toegang.

**Geen SMTP instellen en geen template in Supabase plakken.** De HTML-template met clublogo, clubkleuren en tekstversie staat in `lib/server/auth-mail.ts`. De worker verstuurt haar met Resend. Bij zes cijfers stopt de worker met foutcode `auth-otp-configuration`; verander dan de bovenstaande Supabase-instelling.

## 2. Opslag en Resend controleren — jij

- Hetzner-bucket `duindorpsv`: **Private**. Controleer ook bestaande object-ACLs; een afzonderlijk openbaar object wordt niet beschermd door alleen de bucketinstelling.
- Bestaande S3-sleutels behouden. `S3_ENDPOINT` is `https://fsn1.your-objectstorage.com`, zonder `/duindorpsv`; `S3_REGION=fsn1` en `S3_BUCKET=duindorpsv`.
- In Resend: afzenderdomein `duindorpsv.nl` geverifieerd en verzenden vanaf `noreply@duindorpsv.nl` toegestaan.

De GitHub Environment-namen zijn al ingevuld, inclusief het databasecertificaat. Er is geen extra OTP-secret nodig. De volledige namen en URL-regels staan in [github-environments.md](github-environments.md). De versleutelde Restic-backup gebruikt `.duindorp-backups/production` in de bestaande bucket; die prefix wordt uitgesloten van de mediakopie.

## 3. Deployment op de VPS aansluiten — jij

Dit gebeurt **eenmalig op de productie-VPS**, met je beheerlogin. Het gaat hier om Linux-gebruikers die de app en GitHub-runner uitvoeren. Dit zijn geen CMS-accounts.

Controleer eerst:

```bash
id runner-duindorpsv-production
id duindorpsv-production
```

Beide opdrachten moeten een gebruiker tonen. Deze accounts, hun eigen rootless Docker-daemon en de productierunner horen bij de eerder voorbereide VPS-inrichting. Ontbreekt een account of daemon, voltooi eerst die VPS-inrichting. Start geen gedeelde/root-Docker-daemon en verander geen andere websites.

Haal de gecontroleerde broncode naar een nieuwe tijdelijke map:

```bash
DUINDORP_SETUP_DIR=$(mktemp -d /tmp/duindorpsv-install.XXXXXX)
git clone https://github.com/duindorpsv/website.git "$DUINDORP_SETUP_DIR"
cd "$DUINDORP_SETUP_DIR"
```

Kies één vrije interne webpoort. Hieronder is **62600 een voorbeeld**; gebruik overal dezelfde gekozen poort. De installer weigert een bezette poort.

```bash
sudo bash ops/scripts/install-host.sh production 62600 https://duindorpsv.nl --check
```

Meldt een oudere checkout `Missing Docker resource support: CPUCfsQuota` (met `CPU` in hoofdletters)? Haal eerst de nieuwste broncode op met `git pull --ff-only` en herhaal de controle. Oudere versies lazen de Docker-velden met verkeerde hoofdletters. De huidige controle blijft vereisen dat geheugen-, proces- en CPU-limieten werkelijk beschikbaar zijn; verander hiervoor niet de Docker-installatie of de controles.

Als deze controle slaagt, installeer:

```bash
sudo bash ops/scripts/install-host.sh production 62600 https://duindorpsv.nl
```

Dit installeert de versie-5 deployhelpers, Compose-configuratie en de beperkte sudoersregel. De GitHub-runner mag uitsluitend de vaste deployopdracht als applicatiegebruiker uitvoeren, zonder wachtwoord. Hij krijgt geen algemeen sudo- of root-Dockerrecht.

Als de installer `Already exists` of een verschil in gedeelde helpers meldt: laat de bestaande bestanden staan. Controleer de bestaande installatie en werk haar beheerd bij naar dezelfde `main`-versie; wis geen state, configuratie of volumes om de controle te omzeilen. De relevante bestanden staan onder `/usr/local/libexec/duindorp/`, `/etc/duindorp/production/` en `/var/lib/duindorp/production/`. De `deploy.json` bevat de bestaande poort en proxy-origin, geen secrets.

De eerdere deployment stopte met `sudo: a password is required`. Controleer na installatie de precieze toestemming, zonder de deployment uit te voeren:

```bash
sudo -u runner-duindorpsv-production sudo -n -l -u duindorpsv-production /usr/local/libexec/duindorp/duindorp-deploy-production
```

De opdracht moet zonder wachtwoordprompt slagen. De installer maakt hiervoor deze beperkte regel:

```sudoers
runner-duindorpsv-production ALL=(duindorpsv-production) NOPASSWD: /usr/local/libexec/duindorp/duindorp-deploy-production ""
```

## 4. Domein en HTTPS aansluiten — jij

Laat de DNS-records van `duindorpsv.nl` naar de productie-VPS wijzen. Controleer ook een eventueel AAAA-record. Poorten 80 en 443 moeten bij Caddy uitkomen.

Voeg in de bestaande Caddy-inrichting het siteblok voor Duindorp toe of werk dat blok bij. Behoud de blokken van andere websites. Gebruik dezelfde interne poort als in stap 3:

```caddyfile
duindorpsv.nl {
    reverse_proxy 127.0.0.1:62600
}
```

Valideer de bestaande configuratie en herlaad Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy verzorgt het HTTPS-certificaat voor deze hostnaam. Bij de laatste controle paste het aangeboden certificaat nog niet bij `duindorpsv.nl`; dit moet opgelost zijn voor de publieke oplevering. Een 502 vóór de eerste app-deployment is mogelijk zolang er nog geen webcontainer draait.

## 5. De nieuwste release deployen — via GitHub

De codewijzigingen gaan via PR-controles naar `main`. De workflow **Build and deploy production** controleert de mergecommit, bouwt een image en maakt een releaseartifact met een vast image-digest. De productiejob gebruikt de eerder geïnstalleerde wrapper.

Na de hostcorrectie: open de workflow voor de **nieuwste `main`-commit** en kies bij een mislukte deploy **Re-run failed jobs**. Geef de Environment-goedkeuring als die gevraagd wordt. Gebruik geen oude release van vóór de e-mailcodewijziging.

De wrapper controleert de bron en het digest, maakt een externe backup, past migraties en databaseprovisioning toe en controleert web en worker. Een fout stopt de uitrol. `sudo: a password is required` betekent dat stap 3 nog niet klopt. Een geslaagde build alleen betekent niet dat de app is gedeployd.

Bij een nieuwe site worden de gecontroleerde startgegevens uit de repository aangemaakt. Dat is geen automatische overdracht van elders bewerkte content; zie de aanvulling hieronder als die moet worden bewaard.

## 6. Eerste beheerder maken en testen — jij

Voer na een geslaagde deployment op de productie-VPS, vanuit de bronmap, uit:

```bash
sudo bash ops/scripts/create-production-owner.sh
```

Vul je naam en echte e-mailadres in. De opdracht draait alleen in de eigen productiecontainer, weigert een tweede eerste-beheerderproces en maakt ook de juiste CMS-rol aan. **Maak het eerste account niet alleen handmatig in Supabase aan**, want dan ontbreekt de CMS-koppeling.

Open `https://duindorpsv.nl/beheer/login`, vul je e-mailadres in en controleer de inlogmail. Voer de acht cijfers in. Er volgt geen wachtwoord- of authenticatorvraag.

Controleer daarna:

- `/health/ready` meldt `ready` met het juiste release-digest.
- De code werkt één keer; een verlopen of foute code geeft geen toegang.
- Een account zonder actieve CMS-toegang kan niet inloggen.
- Een foto uploaden en publiceren werkt; privébestanden zijn niet rechtstreeks openbaar.
- Een formulier wordt opgeslagen en de mail wordt werkelijk ontvangen. Controleer de aflevering ook in Resend.
- De externe backup slaagt. Beproef herstel afzonderlijk in een geïsoleerde omgeving volgens [rollback-and-restore.md](rollback-and-restore.md).

## Alleen als er bestaande inhoud moet worden overgezet

Bewaar eerst een complete versleutelde bronbackup. Zet CMS-tabellen, inhoud, revisies, publicaties en het Drizzle-journaal gecontroleerd over vóór de eerste seed. Behoud record-ID's en bestaande Hetzner-objectkeys. Overschrijf niet het door Supabase beheerde Auth-/Storage-schema en wis geen bestaande bestemming.

Voor bestaande lokale accounts is `migrate-accounts` standaard alleen een telling. `--apply` maakt expliciet gekoppelde Supabase-identiteiten aan; dezelfde e-mail wordt nooit automatisch aan een ongerelateerde identiteit gekoppeld. `.invalid`-testaccounts worden overgeslagen. `--queue-activation` verstuurt de nieuwe welkommail voor inloggen met een e-mailcode. Er worden geen oude wachtwoorden of MFA-factoren overgenomen. Voor deze eerste ingebruikname zonder bestaande accounts is dit niet nodig.

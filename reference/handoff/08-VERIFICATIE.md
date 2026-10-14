# Controle van het overdrachtspakket

Datum: 13 oktober 2026. Dit rapport betreft de overdracht en de ongewijzigde broncodesnapshot. Het is geen acceptatieverklaring voor een gebouwde VPS-applicatie.

## Uitgevoerde controles

- De actuele Sites-versie is opgezocht. De lokale bron is via de bronworkflow ververst naar versie 44, commit `e91ed87f3e5917f286885c6593fe397f8e67cdf4`.
- De werkmap van de bron is schoon; voor dit pakket zijn geen Site-bronbestanden gewijzigd of nieuwe Sites-versies gepubliceerd.
- De DartsPoint-handleiding is rechtstreeks uit de aangeleverde DOCX gelezen. Branchroute en infrastructuurprincipes zijn verwerkt; DartsPoint-specifieke waarden zijn niet als Duindorp-configuratie aangenomen.
- De technische inventaris, layout en infrastructuur zijn afzonderlijk onderzocht; het gezamenlijke pakket is op onderlinge consistentie beoordeeld.
- Bekende namen/patronen voor geheime bestanden, privésleutels en tokens in getrackte bronbestanden leverden geen kandidaten op. Er zijn geen omgevingsbestanden, Git-credentials of runtimegeheimen toegevoegd. Dit is geen volledige securityaudit.
- `config/env.example` bevat uitsluitend herkenbare invulwaarden en geen werkende credentials.
- Het layoutvoorbeeld is als JSON gecontroleerd op boomstructuur, maximaal twee kolommen per rij en unieke structurele IDs. Het is een testfixture voor nog te implementeren schema's.
- Alle bronbestanden zijn byte-voor-byte uit de genoemde commit overgenomen; het manifest en de checksums maken de pakketinhoud controleerbaar.

Op de v44-bron is dit commando succesvol uitgevoerd: 56 tests, 56 geslaagd, 0 mislukt.

```sh
node --experimental-strip-types --test scripts/test-cms-model.ts scripts/test-cms-import.ts scripts/test-cms-separation.ts scripts/test-clubmuur-routes.ts scripts/test-clubmuur-destinations.ts
```

Ook `./node_modules/.bin/tsc --noEmit --incremental false` eindigde succesvol. Afhankelijkheden waren in de huidige werkruimte beschikbaar; dit is geen bewijs van een schone installatie op de development-VPS.

## Nog uit te voeren door Codex op de VPS

Een schone installatie en echte Node-productiebuild; database- en mediamigratie; browserchecks van de nieuwe bouwer; echte accounts/rechten; testmail en geautoriseerde Sportlink-koppeling; runner/deploytests; backups en restore; controles op de bestaande websites-VPS. Document 06 bevat de acceptatiematrix.

Browserdata van de eigenaar, een D1-export en servercredentials zijn niet meegeleverd. Er zijn geen servermutaties, GitHub-pushes naar de doelrepository of deployments op de VPS uitgevoerd tijdens het maken van dit overdrachtspakket.

## Pakket controleren

Na uitpakken, voer in de hoofdmap uit:

```sh
sha256sum -c SHA256SUMS.txt
```

Een succesvolle controle bevestigt dat de bestanden overeenkomen met de meegeleverde hash-lijst. `SHA256SUMS.txt` bevat alle reguliere pakketbestanden behalve zichzelf. `SOURCE-MANIFEST.json` beschrijft de broncommit en uitsluitingen. Dit controleert integriteit; het is geen cryptografische ondertekening of productietest.


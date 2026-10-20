# Reviewbewijs, 20 oktober 2026

Dit pakket hoort bij [PR #22](https://github.com/duindorpsv/website/pull/22). Alle gegevens zijn synthetisch. De beelden zijn lokale componentopnamen, geen bewerkingen van de live clubwebsite.

- [Hoofdreview en migratie/releasekaders](../../ops/club-planning-review.md)
- [Backendrapport met tellingen, identiteit, dry-run en rollback](../../ops/club-planning-backend-review.md)
- [Frontendmatrix, methode en bewuste verschillen](../prototype-planning-frontend-review-2026-10-20.md)
- [Aanvullende capturematrix en afwijkingen](../prototype-planning-supplement-review-2026-10-20.md)
- [Hero-slider: exacte panelen, motion en publicatie](../../ops/hero-slider-review.md)
- [Sportlink: instellingen en bronbeperkingen](../../ops/sportlink.md)

## Beelden openen

| Onderdeel | Bron | Kandidaat | Metingen |
| --- | --- | --- | --- |
| Jaaragenda desktop | [prototype](planning/reference/jaaragenda-1440.png) | [geïntegreerd](planning/candidate/jaaragenda-1440.png) | [overlay](planning/overlay/jaaragenda-1440.png), [diff](planning/diff/jaaragenda-1440.png) |
| Personen desktop | [prototype](planning/reference/personen-1440.png) | [geïntegreerd](planning/candidate/personen-1440.png) | [overlay](planning/overlay/personen-1440.png) |
| Commissies mobiel | [prototype](planning/reference/commissies-390.png) | [geïntegreerd](planning/candidate/commissies-390.png) | [overlay](planning/overlay/commissies-390.png) |
| Reserveringen desktop | [prototype](planning/reference/reserveringen-1440.png) | [geïntegreerd](planning/candidate/reserveringen-1440.png) | [overlay](planning/overlay/reserveringen-1440.png) |
| Trainingen desktop | [prototype](planning/reference/trainingen-1440.png) | [geïntegreerd](planning/candidate/trainingen-1440.png) | [overlay](planning/overlay/trainingen-1440.png) |
| Hero-slider desktop | [prototype](hero-slider/baseline-1440.png) | [geïntegreerd](hero-slider/candidate-1440.png) | [lijst-diff](hero-slider/diff-1440-list.png) |
| Hero-slider mobiel | [prototype](hero-slider/baseline-390.png) | [geïntegreerd](hero-slider/candidate-390.png) | [meetbestand](hero-slider/manifest.json) |
| Nieuwe Sportlink-pagina | Geen voorgeschreven prototypepaneel | [desktop](sportlink/sportlink-1440.png), [mobiel](sportlink/sportlink-390.png) | [interacties](sportlink/browser-result.json) |

De gehele viewport is bewust verschillend door de voorgeschreven enkele kop en echte serverbediening. De percentages in `planning/manifest.json` zijn diagnostiek, geen tolerantiedrempel. De uitgelijnde paneelmetingen staan in [geometry.json](planning/panels/geometry.json) en [de panelenmanifest](planning/panels/manifest.json). De slider heeft een afzonderlijke panelenvergelijking. Lees de scoped conclusies in de reviewdocumenten; een nulverschil van een paneel is geen algemene claim over het hele CMS.

## Volledig archief

[hero-slider-evidence.zip](hero-slider-evidence.zip) en [planning-evidence.zip](planning-evidence.zip) bevatten alle bron-/kandidaatbeelden, verschillen, overlays, fixtures en meetbestanden. Pak beide archieven lokaal uit in een aparte map. De mappen zijn `hero-slider`, `planning`, `sportlink` en `sql`. De planningmap bevat ook `production-before` met de vooraf vastgelegde productie-editor en navigatie, `panels` met uitgelijnde inhoudsopnamen en `picker-boundaries` met de keuzelijstgrenscontrole.

De referenties gebruiken prototypecommit `fcb53aaf1dc28779700e69e7b46e7bb0417e8da5` en productiebasis `618321bdec131d00bd443fdde4c855a6bfb4846c`. Fixturehashes, vaste tijd, tijdzone, DPR en viewports staan in de manifests. De lokale captureharnassen gebruiken de echte componenten, met uitsluitend private fixtureadapters voor API/bootstrap. Zij bewijzen geen live Supabase-login of live Sportlink-ledenbron; daarvoor gelden de aparte integratie-/E2E-tests en de expliciete bronbeperking.

`evidence-files.json` legt SHA-256 en grootte vast van ieder archiefbestand. `changed-files.txt` bevat de gewijzigde repositorypaden tegenover de productiebasis. De definitieve GitHub-checks bij de PR zijn leidend voor de volledige Supabase-/Auth-/Storage-regressies.

## Aanvullende acceptatie

[planning-supplement-1.zip](planning-supplement-1.zip) en [planning-supplement-2.zip](planning-supplement-2.zip) vullen de grensgevallen, alle beheerkoppen en publieke agenda aan. Pak beide uit naar dezelfde aparte map; de gedeelde hoofdmap heet `planning-supplement`. [supplement-evidence-files.json](supplement-evidence-files.json) bevat per bestand en archief de gecontroleerde SHA-256. Gecompileerde browserbundels zijn weggelaten; fixtures, captureharnassen, screenshots, overlays, verschillen en meetbestanden zijn opgenomen.

Direct bekijken: [volledige statusmatrix](supplement/matrix-status.json), [browser-/fontomgeving](supplement/environment.json), [vergelijkingen](supplement/comparison.json), [publieke interacties](supplement/public-report.json), [beheerinteracties](supplement/report.json).

[source-verification.json](source-verification.json) legt de hashes vast van de gewijzigde implementatie, tests en assets. Daarmee is de vastgelegde kandidaatinhoud te vergelijken met de definitieve bronboom van de PR, ook waar captures vóór de laatste commit zijn gemaakt.

| Aanvullend onderdeel | Desktop | Mobiel |
| --- | --- | --- |
| Openbare agenda | [kaart](supplement/candidate-F0-public-agenda-1440.png) | [kaart](supplement/candidate-F0-public-agenda-390.png) |
| Openbaar detail | [detail](supplement/candidate-F0-public-agenda-detail-panel-1440.png) | [detail](supplement/candidate-F0-public-agenda-detail-panel-390.png) |
| Lege agenda | Bronvergelijking in het archief | [lege kaart](supplement/candidate-F0-public-agenda-empty-panel-390.png) |
| Teamgebonden plannen | Rechten-/SQL-bewijs in het backendrapport | [eigen team](supplement/candidate-F8-scoped-activity-scoped-create-390-panel.png) |
| Conflict met behoud van invoer | [zichtbare melding](supplement/candidate-F9-activity-external-conflict-1440-panel.png) | Mobiele variant in het archief |

**Metadata-erratum:** `manifest.productionBase` in het oorspronkelijke, ongewijzigde planningarchief noemt per abuis integratiecommit `c9c7d13`. De daadwerkelijk vastgelegde oude productiebron is `618321bdec131d00bd443fdde4c855a6bfb4846c`; de bronobjecthash en controle staan in het aanvullende reviewrapport. De oude archieven zijn niet herschreven.

## Publieke hero, aanvullende F7-controle

[public-hero-evidence.zip](public-hero-evidence.zip) bevat de zes aanvullende desktop-/mobielvergelijkingen voor standaardselectie, eigen foto/focus en leeg. [public-hero-evidence-files.json](public-hero-evidence-files.json) controleert het archief en ieder bestand. Bekijk [het rapport](public-hero/review.md), [de geometrie en ruwe RGB-tellingen](public-hero/manifest.json), [desktopbron](public-hero/baseline-defaults-1440.png), [desktopkandidaat](public-hero/candidate-defaults-1440.png), [mobiele bron](public-hero/baseline-defaults-390.png) en [mobiele kandidaat](public-hero/candidate-defaults-390.png). De ruwe verschillen zijn beschikbaar voor [desktop](public-hero/diff-raw-defaults-1440.png) en [mobiel](public-hero/diff-raw-defaults-390.png).

Alle gemeten geometrie is gelijk. Desktop heeft per scenario vier randpixels met maximaal vier kleurstappen verschil; mobiel standaard heeft 67 randpixels met maximaal 22 kleurstappen verschil, eigen foto en leeg zijn exact gelijk. Er zijn geen verschillen uit de ruwe telling gemaskeerd. De direct gekoppelde huidige statusmatrix bevat deze later voltooide F7-controle; de twee bevroren planning-supplementarchieven bewaren de oorspronkelijke stand.

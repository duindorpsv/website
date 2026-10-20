# Reviewbewijs, 20 oktober 2026

Dit pakket hoort bij [PR #22](https://github.com/duindorpsv/website/pull/22). Alle gegevens zijn synthetisch. De beelden zijn lokale componentopnamen, geen bewerkingen van de live clubwebsite.

- [Hoofdreview en migratie/releasekaders](../../ops/club-planning-review.md)
- [Backendrapport met tellingen, identiteit, dry-run en rollback](../../ops/club-planning-backend-review.md)
- [Frontendmatrix, methode en bewuste verschillen](../prototype-planning-frontend-review-2026-10-20.md)
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

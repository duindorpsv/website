# Homepage v28 — clubleven

De homepage volgt na de bestaande hero, sponsoren, eerste-elftalsectie en snelkoppelingen deze volgorde:

1. **Dit zijn wij.** — een fotomuur over de volle breedte, met vier gegenereerde sfeerbeelden.
2. **Binnenkort. / Jouw uurtje telt. / De club kiest.** — drie gelijkwaardige kaarten naast elkaar op desktop en onder elkaar op mobiel.
3. De drie volgende nieuwsberichten, na de nieuwste drie in de hero. Beide onderdelen gebruiken dezelfde datumselectie.
4. De footer.

## Beelden

Vier nieuwe, fictieve sfeerbeelden: supporters langs de lijn, jeugd op het veld, vrijwilligers in de kantine en Walking Football. Ze stellen geen bestaande leden of exacte clublocaties voor. De site vermeldt dat dit gegenereerde sfeerbeelden zijn.

- Generatiemodus: nieuwe beelden met imagegen, zonder fotoreferenties.
- Exacte generatieprompts: `prompts-a.md` en `prompts-b.md`.
- Ongewijzigde originelen: `supporters-source.png`, `canteen-source.png`, `youth-original.png`, `walking-original.png` (1536 × 1024).
- Websitevarianten: `public/assets/club-life-v28/{supporters,canteen,youth,walking}-{640,1280}.webp`.
- 640px-varianten: ongeveer 34–62 kB; 1280px-varianten: ongeveer 83–164 kB. Responsive srcsets, vaste beeldverhoudingen en lazy loading.

## Interactie en motion

Rustige binnenkomstanimaties, lichte hoverbeweging en langzaam inzoomen op foto's. De mobiele fotomuur ondersteunt horizontaal vegen, vorige/volgende knoppen en een teller. De lightbox ondersteunt pijltjestoetsen, Escape en focusterugkeer. Animaties respecteren verminderde beweging.

De agenda, hulpvragen en poll zijn expliciete voorbeeldcontent. Agenda-items kunnen als voorlopig, duidelijk gemarkeerd .ics-bestand worden gedownload. Hulpkeuzes en pollkeuzes blijven alleen in de eigen browser; er wordt geen echte aanmelding verzonden en er is geen gedeelde stemmentelling.

## Controle

- TypeScriptcontrole geslaagd; git diff zonder whitespacefouten.
- Desktopweergave en 390 × 800 mobiele preview visueel gecontroleerd.
- Mobiel geen horizontale paginaoverflow; kaarten onder elkaar; nieuws gevolgd door footer.
- Fotomuur: doorschuiven, openen, volgende foto, sluiten met Escape en focusterugkeer gecontroleerd.
- Agenda- en hulpvraagmodals binnen de mobiele viewport; keuze en bevestiging gecontroleerd.
- Pollkeuze, lokale opslag, aanpassen en percentages (samen 100%) gecontroleerd.
- Drie agenda-exports gecontroleerd op all-day datums, exclusieve einddatum, escaping en UTF-8-regels van maximaal 75 bytes. Browser-downloadontvangst niet bevestigd door de download-wachter; bestandsinhoud rechtstreeks gevalideerd.
- Screenshots: `clubmuur-v28-fotomuur.jpg` en `clubmuur-v28-kaarten.jpg`.

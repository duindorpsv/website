# Publieke hero-still — F7, 20 oktober 2026

Bron: prototype fcb53aaf1dc28779700e69e7b46e7bb0417e8da5. Kandidaat: 2bd4db1acd8de164abc4db15d3deef2adc5a7d0a. Geen bronbestanden gewijzigd voor deze opname. De originele F08-editorbewijzen zijn intact.

Beide echte providers/renderers zijn gebruikt. Prototype leest een geldige eigen seed via localStorage; productie gebruikt zijn bestaande CmsProvider met initialState/public-preview. Beide krijgen dezelfde zichtbare artikelen, hero-vakken, synthetische Sportlink-response en F7-slider. De vaste eigen mediafoto is een gepubliceerde bestaande asset, geen browserblob. De bron- en kandidaat-assets/fontbestanden die zijn opgevraagd hebben gelijke SHA-256-hashes.

Omstandigheden: Chromium 153.0.8010.12, nl-NL, Europe/Amsterdam, klok 2026-10-20 12:00+02, DPR1, zoom100%, light, reduced-motion, geladen fonts en gedecodeerde beelden. Layout01 en spelersfoto01-trots zijn vastgelegd in props én visitcookies, en via .cm-opening-attributen gecontroleerd.

Scenario’s: defaults; gewijzigde volgorde met één disabled dia en een eigen gepubliceerde achtergrond met focus30/70 op plek1; bewust lege slider. Elke toestand is afzonderlijk op1440×1000 en390×844 vastgelegd. Fullpage viewportbeelden, hero-crops, diff en overlay zijn aanwezig.

| Breedte | Scenario | Alle afwijkende pixels (RGB-delta>0) | Diagnose delta>2 | Maximale kanaaldelta | Geometrie |
| --- | --- | --- | --- | --- | --- |
| 1440 | defaults | 4 / 1313280 | 1 | 4 | identiek |
| 1440 | custom | 4 / 1313280 | 1 | 4 | identiek |
| 1440 | empty | 4 / 1313280 | 1 | 4 | identiek |
| 390 | defaults | 67 / 274950 | 27 | 22 | identiek |
| 390 | custom | 0 / 274950 | 0 | 0 | identiek |
| 390 | empty | 0 / 274950 | 0 | 0 | identiek |

Desktopframe: x0,y88,1440×912. Achtergrond: x0,y88,1440×836. Mobiel frame: x0,y72,390×705.984375. Achtergrond: x0,y72,390×647.984375. Alle losse boundingboxes voor spelersfoto, kop, wedstrijd, tile-grid, achtergrond, band en controls zijn gelijk. Mobiel is de canonieke .cm-first-screen display:contents; daarom is de screenshot de zichtbare union van de achtergrond/kop/spelers/wedstrijd/band, geen CSS-override. Ook de oorspronkelijke nul-boundingbox van de display:contents-wrapper is geregistreerd.

De desktopverschillen zijn telkens4 pixels in een2×2 randgebied (maximaal4 kleurstappen) op een afgeronde rand van het nieuwsblok. De67 mobiele defaultpixels liggen uitsluitend op afgeronde randen van de wedstrijdkaart (maximaal22 kleurstappen). Mobiel custom en leeg zijn exact gelijk. Dit is beperkte gedocumenteerde raster-/antialiasvariatie; er zijn geen geometrie-, tekstomloop-, asset- of uitsnedeverschillen en er is geen regio gemaskeerd. Het hele frame wordt dus niet als een byte-identieke pixelmatch geclaimd.

Achtergronduitsneden zijn identiek: desktop standaard50/50, mobiel standaard50/0, eigen beeld30/70. De lege selectie heeft geen afbeeldings- of fallbackbron. Geen horizontale overloop of JavaScriptfouten.

Zie manifest.json voor alle waarden, fixture.json/scenarios.json voor vaste data en SHA256SUMS voor de volledige bewijslast.

Alle verschillen tellen mee: RGB-threshold0, antialias inbegrepen, geen maskers of verplaatsing van beelden. diff-raw-* en diff-* bevatten iedere afwijkende pixel; overlay-raw-* en overlay-* tonen de volledige onbeperkte beelden. diff-delta2-* bewaart uitsluitend de eerdere aanvullende diagnose, niet de primaire vergelijking.

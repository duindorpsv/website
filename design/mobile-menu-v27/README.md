# Navigatie v27

Mobiele menu-overlay gebruikt nu rechtstreeks Radix Dialog.Portal/Overlay/Content met eigen viewport-positionering. De generieke dialog-centering (50% + negatieve translate) wordt niet meer meegestuurd. De panelhoogte volgt 100dvh, met 100vh fallback; boven- en onderzijde blijven zichtbaar, alleen de navigatielijst scrollt. Bij omschakeling naar desktop sluit een geopend mobiel menu.

Desktop heeft bijpassende witte submenu’s in de bestaande blauwe clubheader. Beide navigaties lezen dezelfde useClubNavigation-configuratie en CMS-demo opslag. Dit verandert de bestaande lokale CMS-demo niet in een gedeelde server-CMS.

## Verificatie
- Mobiel 390 × 800: menu x=0, y=0, breedte=390, hoogte=800; footer binnen viewport.
- Mobiel na scrollen: opnieuw x=0, y=0.
- Mobiel 320 × 570: volledig binnen viewport, geen horizontale overflow, footer onderaan.
- Desktop 1000 en 1289 px: header en submenu binnen viewport; logo/EST en CTA passen.
- Desktop Enter opent submenu, ArrowDown focust eerste link. Uitslagen-link opent wedstrijdcentrum met Uitslagen geselecteerd.
- Mobiele sublinks en Escape sluiten; gedeelde menu-data behouden.
- Screenshots via browserpreview. Geen fysieke Samsung-browser getest.

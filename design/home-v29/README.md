# v29 — blauwe fotomuur en wedstrijdfilters

`Dit zijn wij` gebruikt hetzelfde clubblauw (#03438a) als de header, met een bestaande grungetextuur, witte brushtekst en toegankelijke lichte bediening. De fotokleuren en de witte lightbox blijven behouden.

Het wedstrijdcentrum heeft gecombineerde filters voor team, thuis/uit/beide, inclusief datumbereik in Europe/Amsterdam, categorie, competitie en zoeken op team/tegenstander/sportpark. Snelle datumkeuzes, datumvolgorde, verwijderbare selectielabels en alles wissen zijn toegevoegd. Selecties blijven in de URL behouden. Extra filters klappen op mobiel open en dicht.

De bestaande Sportlink-feed wordt gebruikt: programma over 42 dagen en recente uitslagen over 56 dagen, volgens de bestaande weekoffset-verzoeken. Dit is geen onbeperkt historisch archief; die beperking wordt onder het overzicht vermeld.

## Validatie

- Tien gerichte tests in `scripts/test-sportlink-match-filters.ts` geslaagd: gecombineerde filters, juiste eigen kant, ontbrekende teamcodes, Amsterdam-middernacht/DST, inclusiviteit, open datums, ongeldige ranges, presets en sortering zonder mutatie.
- Desktopbrowser: 38 beschikbare programmawedstrijden; Duindorp sv 1 + thuis geeft 3; 31 oktober t/m 7 november geeft 2 inclusief beide grensdagen; zoeken op Quintus geeft 1. Selectie na vernieuwen behouden.
- Ongeldige datumvolgorde geeft een duidelijke melding; wissen herstelt overzicht.
- Uitslagen + Senioren + 4e klasse C geeft 3 resultaten, nieuwste eerst.
- Mobiele preview 390 × 800: uitklapbare filters, thuis + dit weekend, 4 wedstrijden; geen horizontale overflow (375px inhoud = 375px scrollbreedte).
- Fotomuur desktop en mobiel visueel gecontroleerd; lightbox openen/sluiten gecontroleerd.
- Screenshots in deze map.

Native datuminputs luisteren naar zowel input als change zodat bewerken en de systeemdatumkiezer onmiddellijk de selectie bijwerken.

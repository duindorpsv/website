# Eigen team in de ranglijst

Op 22 oktober 2026 stond Duindorp SV 1 in de openbare Sportlink-output met
teamnummer `218380` en clubcode `BBGV51U`, maar met `own: false`. Daardoor
ontbraken zowel de blauwe markering als het vastzetten aan de scrollranden.
De bestaande CSS en de automatische scrollfunctie waren nog aanwezig.

## Oorzaak en herstel

Sportlink levert niet bij iedere standregel een teamcode. De normalisatie kon
het juiste nummer al afleiden uit de wedstrijdgegevens, maar bepaalde het
eigenaarschap vóór die stap. Het herstelde pad bepaalt beide met hetzelfde
opgeloste nummer en controleert de geverifieerde teamcatalogus en clubcode.
Een gelijkende naam of een losse `eigenteam`-vlag geeft geen eigenaarschap.

Ook bij het lezen van een opgeslagen snapshot wordt uitsluitend dit afgeleide
kenmerk opnieuw bepaald. Zo wordt een bestaande stand direct gecorrigeerd,
ook wanneer Sportlink tijdelijk niet beschikbaar is. Er is geen databasewijziging,
cacheverwijdering of extra providerverzoek nodig. Uitslagen, rangposities,
vormgegevens en tijdstempels blijven behouden.

## Validatie

- De nieuwe regressieproef faalde op de oorspronkelijke normalisatie.
- De volledige lokale testsuite: 262 geslaagd, één bestaande optionele
  bronfixture overgeslagen, geen fouten.
- TypeScript-controle en runtimebuild geslaagd.
- Drie Chromium-proeven geslaagd zonder retries of nieuwe skips: desktop,
  mobiel en een opgeslagen verouderde snapshot met verminderde beweging.
- De browserproeven gebruiken de echte normalisatie en controleren de blauwe
  kleur, automatische beweging, beide vaste scrollranden en de centreerknop.
- Vier aanvullende schermafbeeldingen met de werkelijke openbare stand tonen
  Duindorp op desktop en mobiel aan beide randen; de andere teams bewegen door.
- Gerichte ESLint-controle van de gewijzigde logica en tests geslaagd. De
  servermodule heeft twee bestaande `no-explicit-any`-meldingen, identiek aan
  de baseline; deze taak wijzigt die regels niet.

De normale PR-controles, productie-uitrol en controle van de openbare website
volgen via de bestaande workflow. De uitrol wordt pas als voltooid gemeld nadat
de gepubliceerde release en het werkelijke browsergedrag zijn gecontroleerd.

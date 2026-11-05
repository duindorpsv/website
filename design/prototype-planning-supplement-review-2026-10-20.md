# Aanvullende visuele acceptatie — 20 oktober 2026

Dit supplement vult de ontbrekende scenario’s uit `05-VISUELE-ACCEPTATIE.md` aan. Het oorspronkelijke bewijsarchief blijft ongewijzigd. De nieuwe bewijsmap heet `duindorpsv-planning-supplement-YpiqQc`; de hoofdoplevering bundelt deze afzonderlijk. Er is geen productiecontent gewijzigd of externe mail/import uitgevoerd.

`matrix-status.json` vermeldt iedere rij van de capturematrix met **uitgevoerd**, **n.v.t.** of **niet uitgevoerd**, de concrete bewijslocatie en reden. De matrix verwijst voor reeds gecontroleerde frames naar het oorspronkelijke planningarchief en voor de slider naar zijn eigen F08-archief. Nieuwe resultaten worden niet dubbel geteld.

## Omgeving en herleidbaarheid

- Prototype: `fcb53aaf1dc28779700e69e7b46e7bb0417e8da5`.
- Eigen productie-baseline: `618321bdec131d00bd443fdde4c855a6bfb4846c`. De gearchiveerde `components/club-cms.tsx` heeft Git-objecthash `4d5fda64216b5563955edbe72a37ac53b608c92a`, exact gelijk aan dit commit.
- **Metadata-erratum:** het onveranderlijke hoofdarchief noemt in `manifest.productionBase` per abuis integratiecommit `c9c7d13`. Dat is niet de daar gebruikte oude productiebron. De archiefinhoud en deze objecthash tonen de juiste productiebron; het hoofdarchief is niet herschreven.
- `environment.json` bevat het actuele candidate-HEAD plus SHA256 van de toenmalige werkboomdiff. De hoofdoplevering koppelt de definitieve broncommit aan dit bewijs.
- Chromium `153.0.8010.12`, Playwright `1.63.0`, Node `v24.18.0`, Linux x64, kernel `6.8.0-147-generic`.
- nl-NL, Europe/Amsterdam, DPR1, zoom100%, reduced motion, vaste klok `2026-10-20T10:00:00Z`.
- Desktop1440×1000, mobiel390×844; aanvullend commissie/jaar1024×900. Het eerste aanvullende F2-tabletonderzoek gebruikte1024×844; de definitieve gelijknamige F2-opname is vervangen door de gevraagde1024×900.
- De echte React-componenten, provider en hun layout-CSS worden gebouwd met esbuild en Tailwind-basis-CSS. De harness genereert geen nieuwe Tailwind-utilities. Alleen de netwerkgrens gebruikt private HTTP-fixtures; de productieprovider wordt niet vervangen. API/SQL/autorisatie blijven afzonderlijke tests.
- `styleEvidence` registreert geladen FontFaces en computed family/size/lineheight/weight. De laatste F2/F8/F9-opnames laden Manrope400/500/600/700/800 expliciet en wachten op `document.fonts.ready`. Historische F8-vóórbeelden laten ongebruikte600 terecht als unloaded zien; zij dienen uitsluitend als bugbewijs. Zichtbare afbeeldingen worden voor definitieve beheeropnames gedecodeerd.
- Fixture-JSON’s met SHA256, captureharnassen, scrollposities en boundingboxes staan in het supplement. `report.json`, `public-report.json` en `picker-boundaries/report.json` bevatten de feitelijke interactieresultaten.

## Aanvullend uitgevoerd

| Scenario | Concrete opname en controle |
| --- | --- |
| Alle beheerkoppen |20 huidige routes op desktop/mobiel,19 overeenkomstige prototyperoutes en15 oudeproductieroutes. Iedere huidige route heeft één H1 en geen horizontale documentoverloop. Overzicht is opnieuw opgenomen na verwijderen van de tweede marketingbanner. |
| Personenpaginatie |26/51/101 personen;25/50/100 en volgende pagina. Bron/current D/M voor101 en D voor26/51. |
| Importidentiteit |CSV-review met een bestaande bron-ID, dezelfde identiteit in de prullenbak en één nieuwe ID. Beide bestaande identiteiten zijn disabled; selecteer-alle kiest alleen de nieuwe persoon. Geen import of accountaanmaak in deze visuele run. |
| Commissies |Lege/inactieve commissie en één persoon met twee verschillende commissiegebonden functies, D/T/M; bewerkmodal inbegrepen. |
| Locaties/reserveringen |24okt met echte fixturewedstrijden; twee veldhelften en een kwart, indirecte blokkering, heel/half-conflict, velddeel bewerken, D/M. |
| Agenda |Lege bron en zoekopdracht zonder matches; bronwedstrijd met locked velden; wedstrijd met alleen kleedkamers blijft bij Nog in te delen; mapping zonder veld, D/M. Jaarweergave tevens1024×900. |
| Trainingen |Conflictpreview, één moment/reeks verwijderen, publicatie-opt-in met de huidige expliciete tekst, D/M. Werkelijke atomische opslag/verwijdering blijft apart op SQL/E2E getest. |
| Compacte keuzelijsten |60 opties, accenten/woordmatch, disabled keuze, verdwenen selectie, lege resultaten, veel chips en dropdown bij modalonderkant, bron/current D/M. Enter slaat niet op; Escape behoudt de modal; chipsmax130px en geen documentoverloop. |
| Rechten en conflict |Werkelijke providerprincipal met readonly en teambeperkte redacteur zonder publish, D/M. Bestaande activiteit krijgt tijdens bewaren een geïsoleerde409; titel blijft bewaard en foutmelding is zichtbaar. |
| Publieke agenda |Max5 public+planned items, plaats/tijdbereik, detail, lege agenda, werkelijke centrale ICS-download en canonical404 bij focus sluit detail, D/M. De mobiele agendakaart is afzonderlijk in beeld gescrold en gecropt. |

## Gevonden en herstelde fouten

De aanvullende F8-controle ontdekte dat een teamredacteur wel **Activiteit toevoegen** kon openen, maar vervolgens geen enkel veld kon bedienen: de nieuwe activiteit had geen team, waardoor de teamgebonden rechtencontrole de volledige fieldset inclusief teamkeuze uitschakelde. Vóórbeelden zijn apart bewaard. Nieuwe activiteiten krijgen nu voor een teamredacteur het eerste toegestane team; een onbevoegde filterkeuze wordt niet als default gebruikt. Het laatste vereiste team kan niet worden verwijderd. Clubbrede beheerders behouden een lege standaardselectie. Serverrechten worden niet verruimd. De echte componentharness controleert het herstelde formulier op desktop en mobiel; een duurzame E2E-regressie is toegevoegd. De lokale typecheck is geslaagd. De volledige CI-uitkomst wordt door de hoofdoplevering gerapporteerd.

De publieke agendacaptures toonden dat de prototype-specifieke `display:block`-regel voor de eventlijst ontbrak in de productiecomponent. De hoofdagent heeft deze gericht toegevoegd. Het definitieve lege mobiele paneel is480px hoog, exact de bron; een eerder757.875px resultaat is geen geaccepteerde baseline.

## Vergelijkingsresultaat en bewuste verschillen

`comparison.json` bewaart alle ruwe RGB-verschillen en afmetingen, met diff en50%-overlay. De vergelijking maskeert geen antialiasing en gebruikt geen procentuele passgrens. Afwijkende cropafmetingen worden als review geregistreerd en niet pixelmatig goedgekeurd.

De twintig F6-afbeeldingen vormen tien bron/current paren: negen paren zijn exact0RGB. De desktopdropdown bij de modalonderkant wijkt in28 pixels maximaal2 kanaalwaarden af; de popup- en modalgeometrie zijn gelijk. Het verschil blijft zichtbaar in de diff en is als renderfase/antialiasing gerapporteerd.

Het publieke desktopdetail is exact0RGB. Het mobiele detail heeft69 afwijkende randpixels met maximale kanaaldelta1; de DOM-maat is exact gelijk:560×441.969 desktop en358×457.906 mobiel. De lege publieke agenda en haar paneelcrops zijn op beide breedtes exact0RGB. De gevulde mobiele kaart is24.516px lager doordat de drie prototypebadges **Voorbeeldwedstrijd** bewust zijn verwijderd. De bron/currentbeelden tonen dit concreet; er is geen ontbrekende agenda-inhoud.

Andere verschillen groter dan1px zijn gericht verklaard:

- De beheer-modulecrops met hun oude childintro zijn ongeveer99–191px lager na de expliciete enkele-kopcorrectie. Dit omvat de rootcontainers, niet een claim van afwijkende tabelrij-/kalendergeometrie. De oorspronkelijke46 afzonderlijke inhoudsmetingen blijven als aanvullende geometriecontrole bestaan.
- De mappingroot verschilt tevens door de echte bronstatus en koppeling naar Sportlink-instellingen. De productieversie voert geen demonstratiesync uit.
- **Hele trainingsreeks verwijderen** heeft19.797px meer hoogte doordat de correcte productietekst uitlegt dat de momenten naar de prullenbak gaan en hun historie bewaard blijft. Het prototype zegt onomkeerbaar verwijderen. De extra tekstregel en verschoven footer staan in beide panelcrops.
- Voor de nieuwe enkele kop bestaat geen goedgekeurde oude pixelreferentie: die voldoet aan07 en behoudt productieacties. Deze wijziging wordt als bewuste nieuwe baseline beoordeeld.

Er is geen algemene pixelperfectclaim. De publieke hero-still is na deze supplementrun aanvullend uitgevoerd: defaults, eigen foto met focus30/70 en leeg op1440×1000 en390×844. Alle geometrie is gelijk; ruwe RGB-delta>0 telt desktop telkens4 randpixels (maxdelta4), mobiel standaard67 randpixels (maxdelta22), mobiel eigen foto/leeg0. Zie het [afzonderlijke F7-bewijs](club-planning-2026-10-20/public-hero/review.md). De direct gekoppelde actuele matrix is bijgewerkt; de oorspronkelijke matrix in het bevroren archief behoudt de toenmalige stand. Echte Sportlink-clubdata zijn niet beschikbaar gemaakt en een live ledenimport is niet uitgevoerd. Deze beperking verandert de uitgevoerde fixture-, component- en serverchecks niet.

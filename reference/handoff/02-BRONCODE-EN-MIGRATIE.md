# Broncode, datacontracten en migratie

Inspectie: 13 oktober 2026. Referentie: Sites-versie 44, broncommit `e91ed87f3e5917f286885c6593fe397f8e67cdf4`. De bron is tijdens de overdracht ververst naar deze laatste versie. Versie 44 bevat negen wijzigingen voor narrowcasting bovenop het CMS van versie 43; draag de nieuwste bron over, zonder terugval naar versie 43. Dit document beschrijft vastgestelde broncode en een uitvoerbaar migratieplan; de VPS-port en migraties zijn nog niet uitgevoerd.

De overdrachtsdocumenten vormen de opdracht voor de nieuwe bouwfase. De root-`README.md` bewaart de ontstaansgeschiedenis en bevat verouderde passages, waaronder “Sportlink is niet aangesloten”. Gebruik die passages niet om de huidige implementatie te beoordelen. `design/cms-vps/README.md` beschrijft het CMS van versie 43; de nieuwe rij-/kolommenbouwer in dit pakket vervangt de daarin beschreven platte blokbouwer.

## 1. Wat overgaat

De bijgevoegde broncode-snapshot bevat de bijgehouden repositorybestanden en assets van de referentiecommit. Hij bevat geen afhankelijkheden, draaiende database, browserinhoud of productieconfiguratie. Een snapshot zonder `.git` is geschikt als startinhoud voor de GitHub-repository; behoud de referentiecommit in het migratielog. Kopieer de bestaande vormgeving, routes, volledige teksten en herbruikbare editors, en bouw daarop verder.

De technische bronstructuur is Next.js App Router-compatibel, met React 19, TypeScript, Tailwind 4 en Tiptap 3. De huidige build en hosting gebruiken echter Vinext/Vite met Cloudflare Workers. Het is nog geen zelfstandige Node/VPS-applicatie. Aanwezigheid van `next.config.ts` betekent dus niet dat `pnpm start` een Next-server start.

### Bestandskaart

| Onderdeel | Bestanden | Te behouden / te wijzigen |
| --- | --- | --- |
| CMS-scherm en modules | `app/beheer/page.tsx`, `components/club-cms.tsx` | Behoud modules en bediening; vervang demorol door echte sessie en rechten |
| Entiteiten | `lib/cms/types.ts` | v1-broncontract, basis voor database- en API-contracten |
| Publicatie en validatie | `lib/cms/model.ts`, `lib/cms/validation.ts` | Behoud gedrag; voer validatie en rechten óók op de server uit |
| Lokale provider | `components/cms/provider.tsx` | Vervang opslag/mutaties door backend; los één gehele clientstaat op in beheerde queries/mutaties |
| Seed | `lib/cms/seed.ts` | Bron van begininhoud; eenmalige import, geen reset bij iedere deploy |
| Nieuws en verhalen | `components/cms/news-manager.tsx`, `rich-editor.tsx`, `lib/cms/content.ts` | Behoud afzonderlijke typen en Tiptap-documenten |
| Pagina-editor | `components/cms/pages-manager.tsx`, `block-editor.tsx`, `pages.css` | Vervang platte blokindeling door geneste rijen/kolommen |
| Media | `components/cms/media-manager.tsx`, `lib/cms/media-storage.ts` | Behoud beheer; vervang IndexedDB door serveropslag en mediaverwerking |
| Personen, rollen, instellingen | `components/cms/admin-managers.tsx` | Centraliseer records; echte identiteit/autorisatie toevoegen |
| Formulieren | `components/cms/forms-manager.tsx`, `lib/cms/forms.ts` | Drie gescheiden stromen behouden; serverinname, opslag, aflevering en koppelingen toevoegen |
| Homepage, documenten, herstel | `components/cms/site-managers.tsx` | Homepagekeuzes, exportcontract, redirects en herstelgedrag behouden |
| Publieke CMS-weergave | `components/cms/public-content.tsx`, `lib/cms/public-adapters.ts`, `app/cms-public.css` | Render gepubliceerde gegevens op server; nieuwe layoutnodes ondersteunen |
| Routekoppeling | `components/club-site.tsx`, `app/[concept]/[[...view]]/page.tsx`, `lib/clubmuur-page-routes.ts` | Werkelijke database-lookup, HTTP-status, metadata en redirects |
| Navigatie | `lib/clubmuur-navigation.ts`, `lib/cms/navigation.ts`, `hooks/use-club-navigation.ts` | Gepubliceerde menustructuur en handmatige volgorde overzetten |
| Hero | `lib/clubmuur-config.ts`, `hooks/use-club.ts`, `components/hero-editor.tsx` | Vier bestaande vakken, presentatie en gekozen bestemmingen behouden |
| Sportlink-lezen | `app/api/sportlink/**`, `lib/sportlink-server.ts`, `lib/sportlink-team-server.ts`, normalizers/types, `hooks/use-sportlink*` | Functionele serverkoppeling porten naar VPS-database; niet vervangen door demo |
| Narrowcasting | `app/narrowcasting/page.tsx`, `components/narrowcasting-studio.tsx`, `narrowcasting-wizard.tsx`, `narrowcasting-sports.tsx`, `narrowcasting-club.tsx`, `lib/narrowcasting-config.ts`, `app/narrowcasting*.css` | Schermgroepen, wizard, echte Sportlink-weergaven, 16:9/9:16, speler en links behouden; lokale instellingen overzetten |
| Huidige database | `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`, `drizzle/0000_keen_night_nurse.sql` | SQLite/D1-schema voor Sportlink; bevat géén CMS-tabellen |
| Platformbouw | `package.json`, `vite.config.ts`, `build/sites-worker.ts`, `build/sites-vite-plugin.ts`, `scripts/*` | Sites-afhankelijkheden expliciet vervangen in de VPS-port |

## 2. Werkelijk functionerend en nog lokaal

### CMS

De modules hebben werkende lokale bewerking, validatie, publicatie, revisies, prullenbak, zoeken en filters. Een artikel of pagina heeft een werkversie plus een afzonderlijke `live`-snapshot. Alleen die snapshot is voor publieke weergave bedoeld. Terugzetten van een revisie maakt een werkversie en hoort een bestaande liveversie niet te wijzigen. Artikelen bewaren maximaal 30 revisies; pagina’s 25. Dat zijn huidige UI-grenzen, geen databasevereiste.

Alle CMS-inhoud staat nu in localStorage onder `duindorp-cms-v1`. CMS-foto-uploads staan in IndexedDB-database `duindorp-cms-media`, store `blobs`, versie 1. De JSON verwijst met `blobKey`; een tijdelijke `blob:`-URL wordt bij openen opnieuw gemaakt. De agent heeft de browseropslag van de gebruiker niet ontvangen. Persoonlijke bewerkingen en uploads zitten daarom niet vanzelf in deze broncodeoverdracht.

De rolselector is een voorbeeldweergave. Er is geen CMS-login, geen gedeelde CMS-database, geen persoonlijke serveridentiteit en geen serverautorisatie. `allowed()` gebruikt momenteel actieve demoprofielen met dezelfde rol voor teamtoegang; kopieer dit niet als productiebeveiliging. De rol van één ingelogde gebruiker en diens eigen teamkoppelingen moeten doorslaggevend worden.

Geplande publicatie wordt elke 30 seconden door een geopende `CmsProvider` verwerkt, niet door een serverwerker. Bewaartermijnen op formulieren zijn instellingen zonder automatische verwijdertaak. Het wijzigingslog is browserdata, met maximaal 250 regels en een rolnaam; geen onveranderbaar gebruikersauditlog. Personen, media en albums hebben alleen een publicatievlag; zij hebben nog geen aparte werkversie/liveversie. Kies en implementeer hiervoor expliciet een workflow, zodat edits op gedeelde gepubliceerde records voorspelbaar zijn.

### Sportlink

Er is wel bestaande serverfunctionaliteit: `GET /api/sportlink`, `GET /api/sportlink/team` en `GET /api/sportlink/team/photo`. De implementatie leest voetbalgegevens via de Club.Data Service, gebruikt `SPORTLINK_CLIENT_ID` uit de Workers-omgeving en bewaart resultaten in D1-binding `DB`. Teams, wedstrijden, clubs en gecachte datasets staan in vier SQLite-tabellen. Cacheverversing gebruikt leases, meestal 15 minuten geldigheid, foutafhandeling en waar mogelijk de laatst beschikbare gegevens.

Team- en spelersfoto’s kunnen als gecontroleerde cache-inhoud aanwezig zijn. Dit is geen ledenaanmeld-API. Aanmelding, acceptatie in de formulierinbox en communicatie met ledenadministratie zijn nieuwe backendwerkzaamheden. Een knop “Geaccepteerd” mag geen geslaagde Sportlink-inschrijving suggereren zonder bevestigde verwerking. Seizoenshistorie uit de bestaande cache is niet per definitie opnieuw uit actuele endpoints op te halen: bepaal vóór migratie of D1-export nodig is om die historie te bewaren.

### Narrowcasting in versie 44

`/narrowcasting` is een aparte schermstudio met groepen, slides, selectie, volgorde, speelduur, aan/uit per slide, afspelen/pauze, fullscreen en liggende/staande presentatie. Sportslides gebruiken de bestaande Sportlink-hooks voor volgende wedstrijd, programma, uitslagen en standen. Configuratie ondersteunt competitie/teamselectie/hele club, thuis/uit en automatische/gestapelde/naast-elkaarindeling. De klok gebruikt Europe/Amsterdam.

De studio bewaart zijn configuratie in `duindorp-narrowcasting-v2`: `groups`, `groupId`, `selected`, `seconds`, `enabled`, `enabledByGroup`. Een deelbare schermlink draagt de volledige groep als JSON in het fragment `#groep=...`, aangevuld met queryinstellingen. Beide ingangen worden door `parseGroups()` begrensd en gevalideerd. Dit is geen serveropgeslagen schermconfiguratie of afgeschermd apparaatbeheer. Clubnieuws en kantineprijzen zijn nog vaste voorbeeldinhoud, herkenbaar gelabeld. Zij zijn niet aangesloten op het echte CMS-nieuws of een centraal prijslijstsysteem.

Behoud deze functionaliteit zonder regressies tijdens de VPS-port. Importeer gewenste bestaande schermgroepen naar centrale schermgroep-/playlistrecords met de huidige IDs, volgorde, oriëntatie en filterconfig. Laat displays hun gepubliceerde configuratie ophalen. Koppel clubnieuwsslides expliciet aan gepubliceerde `news`, met verhalen alleen bij een bewuste aparte selectie. Introduceer apparaat-/publieke linkrechten waar nodig, zonder editorrechten aan een schermlink te geven. Een private displayconfig hoort niet als volledige JSON in een publiek deelbare URL. Laat bestaande niet-private links gecontroleerd blijven werken of verwijs naar een gemigreerde groep. Dit staat los van de voorlopig verborgen publieke club-tv-pagina.

## 3. Datacontract v1 en voorgesteld doelmodel

`CmsState.schemaVersion` is nu letterlijk `1`. Nieuws/verhalen en formulierstromen zijn als compatibele uitbreidingen binnen versie 1 toegevoegd. De nieuwe layout maakt een expliciete migratie wenselijk. Gebruik een eigen globale overdrachtsversie 2 en daarnaast `PageContent.bodyFormat`, zoals de layoutspecificatie voorschrijft. Database-migratienummers, CMS-exportversie en layoutformaat zijn verschillende zaken.

| Bestaande collectie | Belangrijk gedrag | Voorstel voor relationele opslag |
| --- | --- | --- |
| `articles` | `contentType: news/story`, `storyFormat: column/interview/story`, draft/live/revisions, planning, SEO, cover/team | Contentrecord + versioned JSON-inhoud, publicatiepointer, revisions, team/categorie/tagrelaties |
| `pages` | Volledige relatieve slug, parentId, menuGroup/order/visible, SEO, body/useBuilder, draft/live/revisions | Pages + page_versions, gepubliceerde versie en navigatiegegevens |
| `people` | Foto, naam, functie, groep, team, bio, expliciet zichtbare contacten | People, groepen en teamrelaties; publicatiestatus |
| `media` / `folders` | Blobreferentie of assetpad; alt/bijschrift/credit/focuspunt/team/seizoen | Mediarecords, folders, permanente storage_key, checksums, MIME, formaat, grootte, varianten |
| `albums` | Volgorde, cover, foto-IDs, team/seizoen | Albums + album_media met volgorde; dezelfde foto in meerdere albums |
| `departments` | Ontvangers, actieve status, bevestigingstekst | Afdelingen + interne ontvangers; ontvangers nooit door bezoeker laten kiezen |
| `forms` | Type contact/registration/request, velden, afdeling, bewaartermijn | Formulieren + versiegegevens/veldschema |
| `submissions` | Oorspronkelijk type, formuliernaam, alle veldlabels/antwoorden, afdeling, status/notitie | Submission + onveranderlijk formulier/antwoord-snapshot, statusgeschiedenis, interne notities, aflevertaken |
| `roles` / `members` | Modules plus publish, teamScoped, demoprofielen | Echte users, rollen, rechten en user_team-relaties; demoprofielen niet als actieve accounts importeren |
| `documents` | Alleen links naar documenten, geen uploadsysteem | Documentrecords met link of gecontroleerd bestand, publicatie/status |
| `settings` | Club, seizoen, categorieën, teams, homepagekeuzes, socials | Instellingen plus gesorteerde homepageverwijzingen per inhoudstype |
| `redirects` | Relatief from/to, ketens afgevlakt bij publicatie | Unieke oude paden, actuele doelen, echte 301/308-responses |
| `audit` | Lokaal log met rolnaam | Legacy-audit apart als importbron; nieuwe serveraudit met echte actor, actie, object en tijd |

Behoud bestaande string-ID’s of maak een volledige, opgeslagen ID-mapping. Forceer niet stilzwijgend UUID-validatie op ID’s zoals `photo-supporters` of `page-club-ons-verhaal`. Bewaar artikeltypen ook in liveversies en revisies. Een artikel mag dezelfde slug hebben als een verhaal, zolang de volledige paden verschillen. Reserveer draft én livepaden van andere records; een conceptwijziging mag een bestaande publicatie niet onbereikbaar maken.

Voorstel: voeg bij mutaties een revisienummer of `version` toe voor optimistische concurrency. Publiceren, routewissel, homepageverwijzing, audit en cache-invalidation horen samen te slagen of samen te falen. Gebruik foreign keys waar mogelijk, aangevuld met een index van verwijzingen uit JSON-widgets. Vermijd één hele `CmsState`-JSON die elke beheerder ongefilterd mag ophalen.

## 4. De nieuwe paginalayout en verliesvrije conversie

**Contract:** `PageContent.bodyFormat: 'page-layout-v2'`; ontbrekend of expliciet `'legacy-tiptap-v1'` betekent het huidige formaat. `body` blijft Tiptap JSON, met `doc → cmsRow → één of twee cmsColumn → cmsRichText/cmsWidget`. Zie de afzonderlijke builderspecificatie voor interactie, drag-and-drop en toegestane attributen.

De huidige `cmsWidget` is `atom: true`: hij is één verplaatsbaar blok. De bestaande widget `kind: 'columns'` bevat een lijst met titel/tekst en toont die in kolommen, maar heeft geen geneste bewerkbare containers. Dat is niet de nieuwe gevraagde paginabouwer.

Voorgestelde migratievolgorde per pagina:

1. Bewaar de ruwe v1-body en bronchecksum in een onveranderlijk importarchief, gekoppeld aan de importbatch. Doe dit voor de werkversie, iedere liveversie en iedere revisie afzonderlijk.
2. Converteer opeenvolgende tekstnodes naar `cmsRichText` met hun oorspronkelijke ProseMirror-inhoud, inclusief marks, links, lijststructuur en koppen. Plaats deze in een volle-breedterij met één kolom.
3. Neem bestaande niet-kolomwidgets één-op-één over als `cmsWidget`, met alle refs en instellingen, in een rij met één kolom. Alleen automatische layout toevoegen mag geen semantische inhoud veranderen.
4. Converteer `columns.items` in bestaande volgorde naar echte kolommen met rich text. Bij meer dan twee items: maak meerdere opeenvolgende rijen van maximaal twee kolommen; behoud een eventuele blokkop vóór die rijen. Behoud lege items indien zij bewust bestaan. Leg afwijkende of onbekende waarden in het rapport vast, niet stilzwijgend weggooien.
5. Geef rijen, kolommen en blokken stabiele unieke ID’s volgens de builderspecificatie. Een rerun op dezelfde importbatch moet dezelfde IDs of dezelfde mapping opleveren. Een v2-document blijft ongewijzigd bij een tweede conversie.
6. Valideer diepte, toegestane nodevormen, maximaal twee kolommen, links en referenties op de server. Vergelijk tekstextractie, aantal verwijzingen en volgorde vóór/na.
7. Converteer draft, live en revisies afzonderlijk en behoud hun publicatiestatus. Een conversie is geen publicatie. Wijzig `useBuilder: false` op bestaande vaste pagina’s niet blindelings naar `true`: de CMS-body van zulke pagina’s kan leeg zijn terwijl de huidige pagina eigen componentinhoud toont.

Die laatste stap is cruciaal voor historie, vrijwilligers en placeholders: maak eerst equivalente v2-bodies/templates en controleer ze tegen de huidige publieke rendering. Houd de oude renderroute tijdelijk beschikbaar zolang een pagina nog niet veilig is geconverteerd. Bij ontbrekende of onbekende nodes: de ruwe bron behouden en de betreffende pagina voor controle markeren. Nieuws en verhalen blijven rich-textartikelen; maak daarvan geen paginalayout.

## 5. Inhoud die exact mee moet

| Inhoud | Bron | Migratieregel |
| --- | --- | --- |
| Volledig clubverhaal/historie | `lib/clubmuur-history.ts`, historiecomponent, seed | Alle paragrafen, tussenkoppen en bronvermelding behouden; niet samenvatten |
| Volledig vrijwilligersverhaal | `lib/clubmuur-volunteer-story.json`, vrijwilligerscomponent, seed | Titel en volledige tekst behouden; mag al gepubliceerd zijn |
| Bestuur/personen | `lib/clubmuur-people.ts` en centrale CMS-records | Centraal profiel per persoon; bestaande foto/contact-publicatievoorkeuren behouden |
| Bestuurscontact | `lib/clubmuur-people.ts`, seed.departments | Secretariaat `secretariaat@duindorpsv.nl`; voorzitter `danny.goldenbelt@duindorpsv.nl`, `0659019035` |
| Nieuws versus verhalen | `lib/cms/seed.ts`, content helpers en routes | Eigen overzichten, homepage-selecties en feedfilters; verhaal niet terug in nieuwsfeed plaatsen |
| Oefenwedstrijd aanvragen | `wedstrijden/oefenwedstrijd` | Route behouden, menu en automatische crosslinks verborgen |
| Club-tv | `media/club-tv` | Voorlopig verborgen houden, geen nieuwe productiefunctionaliteit verzinnen |
| Commissies, Walking Football, accommodatie/route en overige expliciete placeholders | Routes en bestaande pagina-componenten | Placeholder blijven totdat de eigenaar inhoud toevoegt |
| Clubdocumenten | Bestaande publieke pagina + eventuele CMS-documentlinks | Bestaande pagina voorlopig behouden; ontbrekende documenten niet invullen met verzonnen bestanden |

Bewaar tevens de bronvermelding bij de historie: de verwijzing naar De Haagse Voetbalhistorie en de in de tekst genoemde archieven/clubbronnen. De opdracht is overdracht, geen nieuw historisch bronnenonderzoek.

De bron bevat 198 bestanden onder `public/` op inspectiemoment, met circa 45 MB assets en circa 0,9 MB lokale fonts. Neem het originele logo in `public/assets/logo.png` ongewijzigd over. Bewaar assetpaden of lever een complete herschrijving; CSS bevat eveneens assetreferenties. Gegenereerde sfeerbeelden en voorbeeldbeelden zijn als zodanig gelabeld in de seed; die labels en credits niet als echte reportagefoto’s presenteren. Maak bij import een assetmanifest met relatief pad, bytes en SHA-256. De checksum van het geleverde bronarchief bewijst geen export van gebruikersuploads.

## 6. Browserexport ophalen vóór inhoud migreren

De eigenaar moet de browser en het profiel openen waarin eventuele CMS-bewerkingen zijn gedaan, op dezelfde Sites-origin. Ga naar `/beheer` → Herstel/back-up → “Volledige back-up maken”. Het resultaat heeft `format: 'duindorp-cms-backup-v1'`, `createdAt`, `state`, `blobs[]` en `appearance`.

`appearance` bevat de vier hero-vakken en navigatie uit `duindorp-hero-cards` en `duindorp-clubmuur-navigation-v1`. Die horen dus bij de import, naast `duindorp-cms-v1`. Het oudere `duindorp-demo-articles` wordt alleen door de huidige provider gebruikt wanneer nog geen CMS-state bestaat. Thema- en pollvoorkeuren zijn geen redactionele bron en hoeven niet mee.

**Narrowcasting apart exporteren:** de huidige CMS-back-up bevat `duindorp-narrowcasting-v2` niet. Laat Codex vóór de migratie een gerichte exportactie voor deze sleutel toevoegen of laat de eigenaar de gewenste schermgroeplinks bewaren. De lokale configuratie bevat meer studio-instellingen dan één schermgroeplink: volledige export geniet de voorkeur. Leg expliciet vast welke groepen en instellingen beschikbaar zijn. Export van Sportlink-cache uit D1 is weer een aparte bron, niet onderdeel van browserexport of broncodearchief.

De huidige export sluit aanwezige uploads als base64-blobs in. Ontbrekende IndexedDB-blobs geven een melding; een gedownload JSON-bestand kan dus onvolledig zijn. Huidige importgrenzen: 128 MB voor het bestand, circa 8 miljoen tekens voor de state, en 8 MB per afbeelding. Behandel die als huidige prototypegrenzen; bouw een serverimport met expliciete en beheerste grenzen, liefst streamend voor grotere collecties.

Als in meerdere browsers is bewerkt, verzamel afzonderlijke exports. Laat Codex eerst een vergelijking/mergeplan maken op stabiele IDs, versies en `updatedAt`. Laat niet automatisch de laatst aangeleverde export alle andere inhoud vervangen. De export kan concepten, inzendingen en verwijderde gegevens bevatten; behandel het bestand als private migratie-invoer en zet het niet in Git, een publieke downloadmap of het frontendbundle.

Geen browserexport beschikbaar? Bouw gewoon verder op de bronseed, maar registreer “gebruikersinhoud niet aangeleverd”. Zeg niet dat alle inhoud al is gemigreerd en wis de oude browseromgeving niet.

## 7. Importprocedure op development-VPS

1. **Bron vastleggen:** archiveer referentiecommit, bronarchiefchecksums en exportchecksums; importeer niets automatisch naar productie. Installeer database- en storageback-ups/restore voordat een later bestaand doelsysteem wordt bijgewerkt.
2. **Dry-run:** parse legacy-defaults met behoud van inhoud; valideer IDs, datums, nodevormen, dubbele slugs, rollen, relaties, redirects, media, folder/albumverwijzingen en homepage-selecties. Rapporteer aantallen per type en alle ontbrekende bestanden.
3. **Inhoudsmapping:** `contentType` ontbreekt → `news`; `storyFormat` ontbreekt → `story`. Classificeer bestaande gebruikersinhoud niet op titel. Formuliertype ontbreekt → `contact`; voor legacy-inzendingen de bestaande migratieregel gebruiken. Bewaar al aanwezige snapshotvelden onveranderd.
4. **Bronbestanden:** schrijf uploads naar quarantaine, controleer MIME én bestandsinhoud, afmetingen, grootte en checksum. Genereer permanente storage keys en afgeleide formaten. Bewaar originele bestanden; maak een `blobKey → media-ID/storage_key`-manifest. Statische bronassets eveneens beschikbaar maken.
5. **Relationele import:** importeer records met stabiele ID-mapping en één importbatch-ID; koppel daarna refs. Importeer demo-inzendingen uitsluitend in development indien gewenst, nooit als echte productieaanmelding. Maak echte beheerders via het nieuwe accountproces; seed-demoprofielen worden geen accounts.
6. **Documentconversie:** voer de hierboven beschreven v1→v2-conversie uit op pagina’s, inclusief live en revisions. Artikel-rich-text intact laten. `image.attrs.mediaId` blijft de duurzame referentie; herschrijf oude tijdelijke `src`-waarden. Scan ook widget `refId/ids`, cover IDs, person.mediaId, albums, documenten, teamrefs, homepage, hero en alle snapshots.
7. **Publicatie:** behoud status en gepubliceerde inhoud. Een concept, verborgen persoon of verwijderd record mag niet door de import ineens openbaar worden. Houd nieuws en verhalen gescheiden. Planning met verstreken tijd niet ongemerkt afvuren tijdens import; rapporteer en behandel via gecontroleerde workerregels.
8. **Routes:** behoud `/clubmuur/...` tijdens de eerste port. Wil de eigenaar later de clubsite onder `/`? Maak daarvoor een aparte expliciete routemigratie met oude volledige URLs naar nieuwe URLs. Import van `redirects.from/to` gebruikt de huidige relatieve conventie; bouw er echte HTTP-redirects van. Detecteer ketens, cycli en botsingen.
9. **Controlerapport:** vergelijk aantallen, tekst/checksums, referenties, media, publicatiestatus, losse nieuws-/verhalenfeeds, formulierstromen en narrowcastinggroepen/-filters. Laat ontbrekende refs herkenbaar terugkomen; verwijder ze niet stilzwijgend. Leg achtergebleven v1-pagina’s vast. Controleer narrowcastingplayer, deelbare links, portrait/landscape, teamkeuze, resultaten/standen, slideshow en Sportlink-foutweergave.
10. **Herhaalbaarheid:** tweede import van dezelfde batch creëert geen duplicaten. Rollback verwijdert of herstelt alleen wijzigingen uit die batch; productiegegevens buiten de batch blijven behouden. Een DB-restore moet met het bijbehorende media-manifest kunnen worden hersteld.

Formulierantwoorden blijven historische snapshots. Later aanpassen van formuliernaam, type, veldlabel, keuzelijst of afdeling mag niet het oorspronkelijke bericht veranderen. Scheid daarbij status van de zaak (nieuw/in behandeling/geaccepteerd/etc.) van mailafleverstatus en Sportlink-verwerkingsstatus. “Afgerond” is geen bewijs van externe verwerking.

## 8. Concrete portproblemen buiten Sites

Vastgesteld in `package.json`: `node >=22.13.0`, `packageManager: pnpm@11.25.0`, één `pnpm-lock.yaml`, geen npm-lockfile aangetroffen. React `19.2.6`, Next `16.3.4`, Tiptap-reeksen `^3.31.4`, Vinext `1.0.0-beta.5`, Vite `8.0.13`, Wrangler `4.92.0` staan in het manifest. Dit zijn bronfeiten, geen bewering dat alle versies op de doel-VPS al downloadbaar/getest zijn.

| Huidig detail | Gevolg voor de VPS-port |
| --- | --- |
| `dev` / `build` → `scripts/run-framework.mjs` | Zonder lokale execution-profile kiest dit Vinext; niet aannemen dat het Next CLI gebruikt |
| `start` → Wrangler local met `dist/server/wrangler.json` | Dit is geen productie-Node-startscript; vervangen door de afgesproken server/containerentrypoint |
| Vite importeert `.openai/hosting.json` en Workers-plugin | Platformconfig niet nodig maken voor VPS-runtime; losmaken in gerichte portcommit |
| `cloudflare:workers` in `db/index.ts` en twee Sportlink-serverbestanden | Imports en D1-aanroepen vervangen door de gekozen databaseadapter; anders faalt gewone Node-runtime |
| SQLite-schema/Drizzle-config | Niet ongewijzigd op PostgreSQL uitvoeren; nieuwe migraties maken voor gekozen doelengine |
| `build/sites-worker.ts` en connector-previewlaag | Sites-connectorcontext is platformvoorziening; de CMS-code gebruikt deze niet als authenticatie |
| `app/chatgpt-auth.ts` leest proxyheaders | Dit is geen productie-CMS-login; vertrouw deze headers niet van onbeveiligde publieke verzoeken |
| `install:ci` gebruikt `bash scripts/install-pnpm.sh` | Linux-tools `flock`/GNU `timeout`, eigen runtimepad en pinned pnpm verwacht; op VPS installatie bewust normaliseren |
| `pnpm-workspace.yaml` | Installatiebeleid incl. release-age, strict build approvals, store-config en sharpoverride behouden of gemotiveerd aanpassen; geen blinde npm-conversie |
| `scripts/install-ci.mjs` heeft oude npm-ci-route | Niet gebruiken als standaard zolang de bron alleen pnpm-lock heeft |
| Geen bestaande app-Dockerfile of GitHub-workflow aangetroffen | Deploymenttemplates uit overdracht moeten op daadwerkelijke VPS-inrichting worden afgestemd |

Voorstel voor de afgesproken Node/Next-port: eerst schone clone/snapshot op development installeren met de gekozen vastgepinde Node/pnpm-versie; daarna platformimports losmaken, echte build/dev/startscripts toevoegen en een zelfstandige serverbuild configureren. Test expliciet route handlers, `cookies()/headers()`, servermetadata, CSS, assets en rich editorhydratie. Pas dan de oude Vinext/Workers-pakketten/scripts opruimen. Een bestaand geslaagd Sites-build is geen bewijs dat de Node-port al bouwt.

De bestaande static-websites-VPS moet dynamische runtime, databasebereikbaarheid, mediaopslag en werkers kunnen hosten of doorrouteren volgens het infrastructuurplan. Alleen de `public/`-map of een statische export publiceren voldoet niet aan dit CMS.

### Configuratie zonder geheime waarden

Vastgesteld bestaand: serverbinding `DB`, secretnaam `SPORTLINK_CLIENT_ID`. `SITES_*`, Wrangler- en Miniflare-variabelen in scripts zijn ontwikkel-/platformconfig; ze zijn geen verplichte applicatievariabelen van de nieuwe VPS-runtime.

Voorgestelde applicatieconfig, na afstemming op gekozen libraries en infrastructuur: `NODE_ENV`, `APP_ENV`, `APP_BASE_URL`, `DATABASE_URL`, `AUTH_SESSION_SECRET` (of de equivalente authlibrarynaam), `SPORTLINK_CLIENT_ID`, mailtransportconfig, mediaopslagconfig, workerconfig en featureflags voor nieuwsbrief/ledenaanmelding. Gebruik `config/env.example` als uitgangspunt voor de definitieve namen, met lege of herkenbare voorbeeldwaarden. Vul geheime waarden uitsluitend via de bevoegde omgeving in. Verzin geen Sportlink-aanmeldsecret of endpoint: bepaal eerst de werkelijk ondersteunde aansluiting. Gebruik geen `NEXT_PUBLIC_*` voor secrets en geen build-argument voor productiesecrets die in images/lagen/logs kan belanden.

## 9. Bestaande controlepunten hergebruiken

De bron bevat betekenisvolle tests voor CMS-model, import, content-/formulier-scheiding, clubroutes, bestemmingen en Sportlink-normalisatie/team/matchfilters. Versie 44 bevat geen afzonderlijke narrowcastingtests; voeg die gericht toe voor de nieuwe port en configuratiemigratie:

```sh
node --experimental-strip-types --test scripts/test-cms-model.ts scripts/test-cms-import.ts scripts/test-cms-separation.ts scripts/test-clubmuur-routes.ts scripts/test-clubmuur-destinations.ts scripts/test-sportlink.ts scripts/test-sportlink-team.ts scripts/test-sportlink-match-filters.ts
pnpm exec tsc --noEmit --incremental false
```

Laat Codex deze baseline eerst draaien op de gekozen runtime en importproblemen oplossen zonder testdekking te verwijderen. Voeg daarna gerichte migratie-, backendautorisatie-, concurrency-, layout- en end-to-endtests toe zoals beschreven in de acceptatiecriteria. Tijdens deze overdracht zijn de 56 CMS-/routecontroles opnieuw geslaagd op de v44-bron, evenals TypeScript zonder emissie. De Sportlink-scripts hierboven zijn een aanvullende startopdracht voor de uitvoerende Codex en zijn in deze overdrachtsronde niet opnieuw uitgevoerd. Er is geen VPS-port, nieuwe productiebuild of nieuw visueel browseronderzoek uitgevoerd; de controles bewijzen niet dat de nog te bouwen backend of layout al werkt. Zie `08-VERIFICATIE.md`.

De overdracht is geslaagd zodra een schone developmentomgeving de bron kan installeren en draaien, bestaande inhoud aantoonbaar is behouden, het nieuwe CMS echte serveropslag gebruikt en beide kolommen van de nieuwe paginabouwer werken. Vervolgens pas de goedgekeurde commit via GitHub `main` en het afgesproken staging-/productionpad promoveren.

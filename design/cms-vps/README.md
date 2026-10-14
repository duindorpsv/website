# Duindorp SV — werkend CMS-concept en overdracht naar VPS

Bijgewerkt op 13 oktober 2026. De gebruiker heeft de bouw van het uitgebreide CMS-concept expliciet opgedragen. Deze repository bevat werkende Tiptap-editors, beheerfuncties en publieke renderers. Dit document beschrijft de huidige mogelijkheden en de resterende aansluiting voor productie op de VPS.

## Gebruik en werkelijke status

- Beheer: `/beheer`, met modulelinks via bijvoorbeeld `#nieuws`, `#paginas`, `#media`, `#albums` en `#formulieren`.
- Nieuwsindex: `/clubmuur/nieuws`; artikelen: `/clubmuur/nieuws/<slug>`.
- Fotomuur: `/clubmuur/media/fotos`; albums: `/clubmuur/media/fotos/<slug>`.
- Clubpagina’s: `/clubmuur/<paginapad>`. Nieuwe gepubliceerde bouwpagina’s gebruiken de publieke CMS-renderer.
- Inhoud en uploads worden in deze browser opgeslagen. Publiceren maakt inhoud zichtbaar op deze oorsprong, in dezelfde browser, ook voor andere tabbladen. Er is geen gedeelde CMS-database: een andere bezoeker, browser, apparaat of oorsprong ontvangt lokale wijzigingen niet automatisch.
- Een Sites-deployment levert de code en vaste startinhoud aan bezoekers. De knop **Publiceren** binnen het CMS wijzigt lokale inhoud; die knop maakt geen nieuwe Sites-broncodeversie.
- De rollenkeuze simuleert rechten. Er zijn geen echte CMS-accounts, sessies of serverautorisatie. De beheerroute is onderdeel van het openbare concept.

## Bevestigde inhoudelijke keuzes

- OnzeTrots / Clubmuur blijft de visuele basis.
- Oefenwedstrijd aanvragen blijft als directe route en in de bron bestaan, voorlopig buiten menu en publieke doorverwijzingen.
- Duindorp SV-TV blijft buiten het menu; de directe route is een placeholder. De eerdere uitwerking blijft in de bron.
- De bestaande openbare pagina Clubdocumenten blijft ongewijzigd. Nieuw documentlinkbeheer biedt verwijzingen voor de blokbouwer en vervangt die pagina niet automatisch.
- Commissies, Walking Football en Accommodatie & route blijven voorlopig placeholders. Andere bestaande pagina’s worden niet zonder opdracht leeg gemaakt of verwijderd.
- De volledige aangeleverde historie blijft gepubliceerd, inclusief bronregel. De vaste historie staat in `lib/clubmuur-history.ts`.
- Het volledige vrijwilligersverhaal is gepubliceerd en is geen placeholder. De oorspronkelijke tekst staat in `lib/clubmuur-volunteer-story.json`.
- Het bestuur is bereikbaar via `secretariaat@duindorpsv.nl`. Voorzitter Danny Goldenbelt via `danny.goldenbelt@duindorpsv.nl` en `0659019035`.
- Nieuwsbrief, echte contactverzending en ledenaanmelding worden op de VPS aangesloten. Aanmelden moet een Sportlink-integratie worden. Een bestaande publieke sportgegevenskoppeling bewijst geen schrijfrecht of ondersteunde ledenregistratie-API.

De startgegevens bevatten bestaande pagina’s en inhoud. Met de `useBuilder`-vlag blijft de oorspronkelijke vormgeving actief totdat een bouwversie bewust wordt gepubliceerd. Alleen openen of een concept bewerken vervangt een bestaande openbare pagina niet.

## Architectuur

| Onderdeel | Bestanden | Verantwoordelijkheid |
| --- | --- | --- |
| Werkplek | `app/beheer/page.tsx`, `components/club-cms.tsx` | Modules, overzicht, zoeken, rolweergave en meldingen |
| Datacontract | `lib/cms/types.ts` | CMS-entiteiten, Tiptap-documenten en schemaVersion |
| Domeinfuncties | `lib/cms/model.ts` | Rechtenhelpers, slugs, validatie, publicatie en snapshots |
| Startinhoud | `lib/cms/seed.ts` | Bestaande pagina’s, voorbeeldartikelen, foto’s, rollen en instellingen |
| Lokale opslag | `components/cms/provider.tsx` | React-context, opslaan, tabbladsynchronisatie, oudere demo-artikelen migreren en lokale planning |
| Fotobestanden | `lib/cms/media-storage.ts` | IndexedDB-blobs, bestandscontrole, laden en verwijderen |
| Nieuws | `components/cms/news-manager.tsx`, `components/cms/rich-editor.tsx` | Tiptap, workflow, preview, revisies en SEO |
| Pagina’s | `components/cms/pages-manager.tsx`, `components/cms/block-editor.tsx` | Pagina-instellingen, Tiptap-widgets, slepen, volgorde en publicatie |
| Beeld | `components/cms/media-manager.tsx` | Uploads, mappen, fotogegevens en albums |
| Organisatie | `components/cms/admin-managers.tsx` | Personen, demoprofielen, rollen, afdelingen, formulieren, inbox en instellingen |
| Websitebeheer | `components/cms/site-managers.tsx` | Homepage, documenten, herstel, back-up, wijzigingslog en redirects |
| Openbare weergave | `components/cms/public-content.tsx`, `lib/cms/public-adapters.ts` | Nieuws, artikelen, albums, lightbox, widgets en bestaande homepagecomponenten |
| Routes en menu | `components/club-site.tsx`, `app/[concept]/[[...view]]/page.tsx`, `hooks/use-club-navigation.ts` | Bestaande en dynamische paden, publicatiekeuze en navigatie |

### Opslag en schema

`CmsState` heeft `schemaVersion: 1` en bevat artikelen, pagina’s, personen, mediagegevens, mappen, albums, afdelingen, formulieren, inzendingen, rollen, demoprofielen, documentlinks, instellingen, redirects en wijzigingslog.

JSON wordt opgeslagen onder `duindorp-cms-v1` in localStorage. Geüploade foto’s staan als blobs in IndexedDB-database `duindorp-cms-media`, object store `blobs`. De JSON bewaart een `blobKey`; tijdelijke object-URL’s worden opnieuw gemaakt bij laden. Afbeeldingen worden niet als base64 in Tiptap-documenten opgeslagen. De back-upexport kan geüploade bestanden wel opnemen in een overdraagbaar bestand.

Opslagfouten en quotumproblemen worden gemeld. Browseropslag kan worden gewist; export is nuttig voor overdracht maar vervangt geen productieback-up. De huidige tabbladsynchronisatie biedt geen conflictresolutie of gelijktijdige samenwerkingsredactie.

### Publicaties en referenties

Nieuws en pagina’s bevatten een werkversie plus een aparte `live`-snapshot. De publieke renderer leest de snapshot. Conceptwijzigingen en herstel van een revisie veranderen de bestaande liveversie niet. Publiceren valideert en vervangt de snapshot; intrekken verwijdert de publieke versie.

Personen, afbeeldingen en albums hebben een publicatievlag. Wijzigingen aan gepubliceerde records kunnen direct doorwerken in gekoppelde widgets; de interface verlangt daarvoor publicatierechten. Deze entiteiten hebben nog geen afzonderlijke werkversie-/livesnapshot zoals artikelen en pagina’s.

Widgets verwijzen naar centrale personen, media, albums, teams, documenten en afdelingen. De publieke renderer controleert relevante publicatie- en verwijderstatus. De contactwidget verwijst naar de contactpagina; interne afdelingontvangers worden niet automatisch als publieke contactadressen getoond.

## Werkende beheermogelijkheden

### Nieuws & verhalen

- Tiptap 3 met tekstopmaak, koppen, lijsten, citaten, links, afbeeldingen, tabellen en uitlijning.
- Titel, intro, auteur, omslagfoto, categorie, tags, team, seizoen, slug, SEO-titel/-beschrijving, indexeringsvoorkeur en uitlichting.
- Automatisch lokaal bewaren, handmatige herstelpunten, preview en dupliceren.
- Concept, beoordeling, planning, publiceren, bijwerken, intrekken en prullenbak.
- Laatste 30 revisies en herstel naar concept, met behoud van een bestaande liveversie.
- Unieke slugs en doorverwijzingen bij een gewijzigde gepubliceerde slug.
- Publieke zoek- en categoriefilters, artikelpagina’s, leestijd, auteur, credits en gerelateerde verhalen.

Geplande publicaties worden verwerkt door de geopende provider. Er draait geen servercron of achtergrondwerker. Bij opnieuw openen kan een inmiddels verstreken publicatiemoment alsnog worden verwerkt. Op de VPS moet dit een onafhankelijke achtergrondtaak worden.

### Pagina’s en blokbouwer

- Aanmaken, bewerken, dupliceren, concept bewaren, preview, publiceren, intrekken en herstellen.
- Bovenliggende pagina, menuonderdeel, menuzichtbaarheid, volgorde, slug en SEO.
- Controle op gereserveerde paden, slugconflicten en cyclische paginahiërarchie.
- Tiptap rich text en eigen `cmsWidget`-nodes met React Node Views.
- Blokbibliotheek: persoonskaart, personengroep, afbeelding, tekst/beeld, kolommen, album, nieuws, documenten, FAQ, tijdlijn, actieknop, team en contact.
- Blokken toevoegen, configureren, slepen, met knoppen omhoog/omlaag zetten, dupliceren en verwijderen.
- Laatste 25 paginarevisies en herstel naar een werkversie.

Node Views zijn de bewerkinterface; `public-content.tsx` verzorgt de openbare weergave. Vrije HTML/CSS-invoer is niet nodig. Menusortering en menuzichtbaarheid horen bij de gepubliceerde versie. Een pagina buiten het menu blijft direct bereikbaar. Menuverbergen is geen toegangscontrole.

### Personen, beeld en homepage

- Centraal personenregister met foto, naam, functie, groep, team, introductie, optionele zichtbare contactgegevens, publicatie en volgorde.
- Interne mappen apart van publieke albums; dezelfde foto kan in meerdere albums voorkomen.
- Meerdere afbeeldingen uploaden, bestandsvalidatie, titel, alt-tekst, bijschrift, credit, focuspunt, team, seizoen en publicatie.
- Albums met titel, slug, omslag, beschrijving, datum, team, seizoen, selectie en sortering.
- Albumindex, albumdetail en lightbox met toetsenbordbediening en focusherstel.
- Homepagekeuzes voor verhalen, foto’s, albums en volgorde, met behoud van de bestaande vormgeving.
- Documentlinkbeheer voor herbruikbare documentwidgets; dit is geen PDF- of documentopslagdienst.

Een focuspunt stuurt de visuele uitsnede. Er worden nog geen servergegenereerde thumbnails of gewijzigde originelen gemaakt.

### Rollen, formulieren en instellingen

- Acht rolrechten: nieuws, pagina’s, media, personen, formulieren, instellingen, gebruikers en publiceren.
- Optionele teambeperking, demoprofielen, gekoppelde teams, vaste volledige beheerdersrol en bescherming van het laatste actieve beheerdersprofiel.
- Afdelingen met actieve status, beschrijving, ontvangers en bevestigingstekst.
- Formulieren met standaardafdeling, actieve status, velden, verplichte velden, veldvolgorde en bewaartermijn.
- Testformulier dat een lokale demo-inzending aanmaakt; inbox met zoeken, status, interne notities en verwijderen.
- Clubgegevens, seizoen, nieuwscategorieën, inhoudsteams, sociale links en nieuwsbriefinstellingen.
- Prullenbak/herstel, documentlinks, wijzigingslog, redirectoverzicht en back-up export/import met bestandscontrole.

De rechten zijn momenteel per module, plus publicatierecht. Afzonderlijke serverrechten voor lezen, maken, bewerken en verwijderen zijn nog niet geïmplementeerd. Teambeperking gebruikt de gekoppelde actieve demoprofielen en is een ontwerpvoorbeeld, geen persoonlijke identiteit. Bewaartermijnen zijn configuratie; er draait geen automatische verwijdertaak. Tests versturen geen e-mail en starten geen nieuwsbrief- of Sportlink-inschrijving.

## Grenzen van het concept

| Onderdeel | Nu | Voor productie |
| --- | --- | --- |
| Inhoud | LocalStorage en lokale publicaties | Gedeelde database, servervalidatie, transacties en migraties |
| Media | IndexedDB en tijdelijke blob-URL’s | Objectopslag, permanente URL’s, thumbnails en toegangsregels |
| Rollen | Voorbeeldweergave en UI-controles | Accounts, sessies en autorisatie bij iedere serveractie |
| Samenwerking | Eén lokale staat per browser | Conflictafhandeling en gelijktijdige updates |
| Planning | Verwerking zolang de provider open is | Achtergrondwerker met foutafhandeling |
| SEO | Velden, zoekpreview en lokale head-updates | Database-inhoud in servermetadata, canonical, sitemap en social cards |
| Redirects | Lokale padresolutie | Permanente serverredirects met passend HTTP-statusnummer |
| Formulieren | Lokale testinbox en routeringsconfiguratie | Serverendpoint, spambeperking, aflevering, retries en bewaartaak |
| Nieuwsbrief | Weergave en configuratie | Inschrijving, bevestiging, verzendplatform, afmelding en afleverstatus |
| Sportlink | Bestaande publieke leeskoppeling | Ondersteunde ledenaanmeldroute, toegang en veldmapping |
| Back-up | Handmatige browserexport/import | Geplande database- en bestandsback-ups met herstelproef |
| Audit | Lokaal wijzigingslog | Serverlog gekoppeld aan echte gebruikers |

De server kan browserinhoud niet lezen. Zonder database kan hij alleen de vaste startinhoud serverrenderen. Client-side wijziging van titel, beschrijving of `noindex` is geen volledige SEO- of afschermingsoplossing. Gebruik dit openbare concept niet als beveiligde omgeving voor vertrouwelijke of echte ledengegevens.

De bestaande Sportlink-voetbalgegevenskoppeling blijft iets anders dan ledenaanmelding. Het productie-aanmeldproces mag pas succes tonen na bevestigde verwerking via een ondersteunde route.

## Overdracht naar de development-VPS

1. **Behoud bron en inhoud.** Neem de repository over in de normale development → staging → productieprocedure. Exporteer gewenste lokale inhoud inclusief uploads; controleer ontbrekende bestanden. Behoud historie, vrijwilligersverhaal, placeholders en menukeuzes.
2. **Maak het productiedatamodel.** Vertaal `CmsState` naar tabellen en relaties. Behoud stabiele IDs, schemaVersion, revisies, redirects en liveversies. Kies of personen en albums ook een afzonderlijke werkversie krijgen. Valideer velden en widgetreferenties op de server.
3. **Sluit accounts en rechten aan.** Bepaal login, sessies, herstel en uitnodigingen. Koppel verzoeken aan één gebruiker. Controleer module-, team-, publicatie- en bestandsrechten server-side; maak bevoegde conceptpreviews. Vertrouw niet op de lokale rolselector.
4. **Vervang de opslaglaag.** Behoud editors en renderers waar mogelijk; laat CRUD en publicatie via gecontroleerde serveracties verlopen. Voeg transacties, gelijktijdigheidscontrole en foutafhandeling toe. Migreer foto’s naar objectopslag en herschrijf verwijzingen naar permanente IDs/URL’s.
5. **Maak publicatie en SEO servergestuurd.** Render gepubliceerde database-inhoud, metadata, canonical links, open-graph afbeeldingen en sitemap. Gebruik echte 301/308-redirects en passende 404-antwoorden. Lever concepten niet publiek uit. Vernieuw caches na publicatie.
6. **Werk media af.** Servervalidatie, uploadlimieten, verwerking van metadata, responsive formaten, gebruiksregistratie, archivering en verwijderregels. Test herstel van database én originelen.
7. **Koppel communicatie.** Bezoekers sturen formulier- en afdeling-ID’s; de server kiest ontvangers. Voeg rate limiting, spambeperking, veldvalidatie, retries zonder duplicaten, afleverstatus, bevestigingen en bewaartermijnen toe. Controleer de aansluiting met testadressen vóór echte verzending.
8. **Sluit nieuwsbrief en Sportlink apart aan.** Kies nieuwsbriefdienst en afmeldflow. Controleer de officiële ondersteunde Sportlink-aanmeldmogelijkheid en toegang; implementeer veldmapping, dubbele aanmeldingen en foutafhandeling. Bewaar toegangssleutels alleen op de server.
9. **Controleer de echte workflows.** Test concept versus live, publiceren/intrekken/plannen, slugs, prullenbak, referenties, rollen, mediarechten, back-up/herstel, mobiel gebruik, toetsenbordbediening en formulieren. Vergelijk bestaande publieke pagina’s met de huidige visuele basis.

De editors gebruiken de open-source Tiptap-basis en eigen CMS-revisies. Er is geen Tiptap Cloud-, collaboration- of betaalde versiehistoriedienst geconfigureerd. Controleer actuele mogelijkheden en voorwaarden wanneer zulke diensten later worden toegevoegd.

## Officiële Tiptap-documentatie

- https://tiptap.dev/docs/editor/getting-started/overview
- https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react
- https://tiptap.dev/docs/editor/core-concepts/introduction

Tiptap levert de editor. Opslag, widgets, accounts, rechten, albums en publicatieworkflows zijn verantwoordelijkheden van het CMS.


## Aanvulling: nieuws/verhalen en gescheiden formulierstromen

- Nieuws (`contentType: news`) en Verhalen (`contentType: story`) hebben eigen CMS-modules, openbare overzichten en homepage-selecties. Verhalen hebben de vorm Column, Interview of Clubverhaal. Categorieën blijven daar los van staan.
- Nieuws verschijnt op `/clubmuur/nieuws`, verhalen op `/clubmuur/verhalen`. Nieuwsfeeds en de nieuwste-berichtentegel bevatten uitsluitend gepubliceerde nieuwsberichten. De homepage kan verhalen in een aparte rubriek tonen.
- Een typewijziging blijft een concept tot publicatie. Bij publicatie verhuizen URL en homepageverwijzing naar het juiste type; de vorige URL verwijst door. Pagina-widgets kiezen expliciet nieuws of verhalen.
- Formulieren hebben `kind: contact | registration | request`. De CMS-inbox onderscheidt Contactberichten, Aanmeldingen en Aanvragen, met eigen aantallen, filters en passende opvolgstatussen.
- Inzendingen bewaren formuliernaam, type en alle veldlabels/antwoorden als momentopname. Een latere wijziging van het formulier herclassificeert eerdere inzendingen niet. Het gekozen ontvangende afdeling-ID blijft bewaard.
- Bestaande lokale inhoud en back-ups worden compatibel ingelezen: artikelen zonder type blijven nieuws; formulieren zonder type blijven contact. Bestaande berichttekst blijft behouden. Er wordt geen eerdere zelf ingevoerde inhoud verwijderd.
- Registratie of acceptatie in deze demo voert geen Sportlink-inschrijving, ledenmutatie of e-mailverzending uit. Die backendstappen blijven onderdeel van de VPS-aansluiting.

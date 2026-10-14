# Product en CMS specificatie

## Doel en ontwerp

Duindorp SV krijgt één redactioneel beheersysteem voor website, nieuws, verhalen, personen, foto's, albums, formulieren en website-instellingen. De bestaande Onze Trots / Clubmuur-vormgeving is de visuele basis. Het CMS wordt Nederlands, werkt op desktop en tablet en geeft duidelijke feedback bij bewaren, publiceren en fouten. Publieke pagina's blijven bruikbaar op telefoon en met toetsenbord.

De aanwezige editors en beheerinterfaces zijn het vertrekpunt. De backend, productiebeveiliging en echte paginalayout moeten nog worden gebouwd. Eén wijziging verschijnt na publicatie voor alle bezoekers; een nieuw apparaat ziet dezelfde gepubliceerde inhoud. Het CMS moet zonder geopende beheerbrowser geplande taken afhandelen.

## Vaststaande inhoud

| Onderdeel | Afspraak |
| --- | --- |
| Ons verhaal en historie | Volledige door de eigenaar aangeleverde tekst, inclusief bronregel, behouden. `lib/clubmuur-history.ts` is de bron. Geen samenvatting als vervanging. |
| Vrijwilligers | Volledige aangeleverde tekst “Een vereniging zijn we samen” publiceren/behouden, inclusief vereniging-geen-bedrijf en waardering. Bron: `lib/clubmuur-volunteer-story.json`. |
| Bestuur | Secretariaat: `secretariaat@duindorpsv.nl`. Voorzitter Danny Goldenbelt: `danny.goldenbelt@duindorpsv.nl`, `0659019035`. Foto's en overige personen alleen uit bestaande gegevens of nieuwe invoer. |
| Commissies | Voorlopig placeholder, later in te vullen met centrale persoonswidgets. |
| Walking Football | Eigen informatiepagina voorlopig placeholder; bestaand verhaal hierover niet automatisch verwijderen. |
| Accommodatie en route | Voorlopig placeholder. Bestaande gedeelde contact-/locatiegegevens niet onbedoeld verwijderen. |
| Oefenwedstrijd aanvragen | Route en toekomstige formuliermogelijkheid behouden, niet in menu of automatische publieke verwijzingen. |
| Duindorp SV TV | Voorlopig verborgen; bestaande directe placeholder en bron behouden. |
| Clubdocumenten | Bestaande pagina behouden. Nieuw documentenbeheer vervangt haar niet stilzwijgend. |
| Andere pagina's | Bekende lege pagina's blijven placeholders; bestaande ingevulde pagina's niet leegmaken. |
| Integraties | Nieuwsbrief, echte contactverzending en ledenaanmelding worden op de VPS aangesloten. |

Menuverbergen is geen toegangsbeveiliging. Een gepubliceerde verborgen pagina kan via de directe URL bereikbaar blijven. Staging en vertrouwelijke concepten krijgen echte toegangscontrole.

## Nieuws en verhalen

Beide gebruiken de Tiptap rich-texteditor: koppen, tekst, lijsten, citaten, links, afbeeldingen, tabellen en leesbare previews. Metadata: titel, intro, slug, auteur, omslag, categorie, tags, team, seizoen, publicatiedatum, SEO, indexering en uitlichting. Auteur wordt een centrale identiteit/vermelding met naam, optionele foto en bio; een historische vrije auteursnaam blijft behouden bij migratie.

`contentType` is een eigen veld, los van categorie. Nieuws krijgt `/clubmuur/nieuws` en detailpaden daaronder. Verhalen krijgt `/clubmuur/verhalen`, met `storyFormat` Column, Interview of Clubverhaal. Iedere module heeft eigen filters, aantallen, homepage-selectie en gerelateerde inhoud. Een widget kiest expliciet het inhoudstype. Gewone nieuwsfeeds bevatten uitsluitend gepubliceerde `news`; verhalen kunnen in een afzonderlijke rubriek of bewuste promo verschijnen.

Workflow: concept → ter beoordeling → gepland of gepubliceerd → gearchiveerd/prullenbak. Een bestaande liveversie blijft staan terwijl een redacteur een volgende versie bewerkt. Conceptpreview is beveiligd. Publicatie en intrekken zijn servertransacties. Planning gebruikt een worker met tijdstippen opgeslagen in UTC en weergegeven in Europe/Amsterdam. Revisieherstel maakt een concept en verandert de liveversie niet automatisch.

Een wijziging van nieuws naar verhaal verandert de live-URL pas bij publiceren. Dan worden oude URL's permanent doorverwezen en homepageverwijzingen naar het juiste type bijgewerkt. Bestaande content zonder type blijft nieuws tijdens migratie; niet op titel raden.

## Pagina's en menu

Beheer: aanmaken, bewerken, dupliceren, ordenen, bovenliggende pagina kiezen, slug, paginatitel/intro, SEO, menuonderdeel en zichtbaarheid, concepten, preview, plannen, revisies, publiceren en intrekken. Controleer gereserveerde routes, dubbele paden, lussen in hiërarchie en redirects. Bewaar redirects wanneer een gepubliceerde slug of bovenliggend pad verandert; werk onderliggende routes en menuverwijzingen gecontroleerd bij.

Nieuwe pagina's gebruiken de rij/kolom-bouwer uit document 03. Bestaande vaste pagina's blijven visueel intact tot een gelijkwaardige bouwversie bewust wordt gepubliceerd. Een gepubliceerde pagina kan als sjabloon worden gedupliceerd met nieuwe blok-ID's. Sla herbruikbare rijpatronen op als losse kopieën; wijzig bestaande pagina's niet onverwacht wanneer een sjabloon wordt aangepast.

Widgetbibliotheek: rich text, afbeelding, tekst/beeld, persoon, personengroep, album/galerij, nieuwsselectie, verhalenselectie, documenten, FAQ, tijdlijn, knop/actie, team en formulier/contact. Layout wordt door rijen en containers verzorgd. Widgets verwijzen naar centrale inhoud via IDs. Voeg ondersteunde formulieren daadwerkelijk in pagina's in; de huidige contactwidget is nog slechts een verwijzing.

## Personen en rollen

Personen: foto, naam, rol/functie, groep/commissie, team, introductie, optionele openbare contactgegevens, volgorde en status. Maak een persoonskaart per bestuurder/commissielid en daarnaast een dynamische groepswidget. Houd openbare personen los van CMS-loginaccounts. Publicatie van interne e-mail/telefoon is een expliciete instelling. Afdelingontvangers zijn geen openbare persoonsgegevensvelden.

Accounts: uitnodigen, activeren, sessies, uitloggen, herstel, blokkeren, rollen toekennen en audit. Gebruik een onderhouden authenticatieoplossing. Beheerders krijgen een ondersteunde tweede factor; herstel mag geen achterdeur of standaardwachtwoord bevatten. Bescherm het laatste actieve volledige beheerdersaccount.

Rechten zijn acties per module, aangevuld met teams en afdelingen: lezen, maken, wijzigen, verwijderen, publiceren en beheren waar relevant. Voorstellen voor startersrollen: beheerder, hoofdredacteur, redacteur, teamredacteur, mediabeheerder en formulierbehandelaar. Rollen zijn configureerbaar; serverautorisatie controleert iedere actie en ieder object. Een teamredacteur kan geen andere teams wijzigen of ongepubliceerde gegevens ervan lezen. Een formulierbehandelaar ziet alleen toegewezen stromen/afdelingen. Recht op nieuws bewerken geeft geen recht op ledenaanmeldingen of accountbeheer.

## Media en albums

Interne mappen zijn organisatie van de mediabibliotheek; albums zijn publieke selecties. Dezelfde foto mag in meerdere albums staan. Ondersteun upload in batches, voortgang en foutmeldingen; mapbeheer; zoeken; filters op team/seizoen/type/publicatie; titel, alt-tekst, bijschrift, credit, focuspunt en volgorde; gebruiksoverzicht en archivering. Een mapwijziging verandert foto-URL's en referenties niet.

Albums: titel, slug, datum, team, seizoen, omslag, beschrijving, foto's selecteren en verslepen, publiceren, preview en galerij/lightbox. De fotomuur krijgt album- en teamfilters. Homepage heeft afzonderlijke selectie en volgorde voor nieuws, verhalen, albums en uitgelichte foto's.

Serveropslag maakt duurzame originele bestanden en geoptimaliseerde afgeleiden. Valideer inhoud, formaat en limieten server-side. Verwijder gevoelige metadata uit publieke afgeleiden; maak originelen niet onbedoeld publiek. Bewaar credit/toestemmingsadministratie waar de club die nodig heeft. Ontbrekende foto toont een nette fallback. Verwijder een gebruikt bestand niet zonder de verwijzingen te controleren; hard verwijderen pas na afgesproken bewaartijd. Documentuploads krijgen eigen toegestane bestandstypen, limieten en downloads; uitvoerbare inhoud wordt niet inline vertrouwd.

## Formulieren en communicatie

| Stroom | Doel | Voorbeeldstatussen |
| --- | --- | --- |
| Contactberichten | Vragen voor secretariaat of andere afdeling | Nieuw, in behandeling, afgehandeld |
| Aanmeldingen | Lidmaatschap, activiteit, vrijwilligers | Nieuw, in behandeling, geaccepteerd, wachtlijst, afgewezen, afgehandeld |
| Aanvragen | Verzoek dat beoordeling/besluit vraagt | Nieuw, in behandeling, geaccepteerd, afgewezen, afgehandeld |

Deze stromen hebben afzonderlijke inboxen, badges, filters, rechten en opvolging. Formulierdefinities hebben type, naam, actieve status, ontvangers via afdeling, bevestiging, veldvolgorde en bewaartermijn. Voeg selecties, radio/checkbox, datum en expliciete toestemming toe aan de bestaande tekst/e-mail/telefoon/textarea-velden. Vermijd willekeurige scripts of HTML in velden. Bestandsbijlagen zijn optioneel per formulier en uitsluitend met private opslag, typecontrole en limieten.

Iedere inzending bewaart formulier-ID en versie, oorspronkelijke naam/type, veld-ID's, labels, types en antwoorden, bestemming, ontvangstmoment en eventuele toestemmingsversie. Een later aangepast of verwijderd formulier verandert historische antwoorden niet. Voeg behandelaar, interne notities, statushistorie en zoekfunctie toe. Interne notities gaan niet mee in ontvangstbevestigingen. E-mailafleverstatus en integratiestatus zijn gescheiden van de behandelstatus.

De browser verstuurt nooit een willekeurig ontvangeradres. De server bepaalt afdeling en ontvanger op basis van gepubliceerde configuratie, valideert alle antwoorden en slaat de inzending betrouwbaar op vóór verzending. Rate limiting, honeypot en configureerbare aanvullende spambescherming moeten normaal gebruik toelaten. Staging gebruikt een afgeschermde testmailbestemming. Herhaald verzenden of een retry veroorzaakt niet opnieuw dezelfde registratie.

Nieuwsbrief is een aparte inschrijving met gekozen provider, bevestigingsproces, afmelden en verwerkingsstatus. Er ontstaat niet automatisch een nieuwsbriefabonnement doordat iemand contact opneemt of lid wil worden. Bewaar bevestiging en afmelding passend bij het gekozen proces.

Ledenaanmelding krijgt een aparte Sportlink-adapter. Onderzoek ondersteunde toegang, velden en callbacks. Een activiteitinschrijving is geen Sportlink-lidmaatschap. Interne acceptatie betekent evenmin dat Sportlink al gesynchroniseerd is. Gebruik afzonderlijke status ontvangen/wacht op verwerking/verwerkt/fout met externe referentie, veilige retries en een gecontroleerde handmatige opvolgroute wanneer automatisering niet beschikbaar is. Verzin geen endpoint of API-bevoegdheid.

## Overige beheerfuncties

Voeg toe of werk productiegeschikt af: redirects; menu's; site- en seizoensinstellingen; herbruikbare documenten; prullenbak en herstel; concept/live-verschillen; revisies; zoekfunctie; auditlog met echte gebruiker; opslaanconflicten; heldere foutmeldingen; export/import; bewaartaken; integratiestatussen; externe backups en geteste restore. De homepage houdt de bestaande vormgeving met afzonderlijke, gerangschikte selecties.

SEO komt uit de gepubliceerde serverinhoud: titel, description, canonical, Open Graph, sitemap en robotsinstellingen. Concepten leveren geen publieke pagina's of sitemapvermeldingen. Staging heeft toegangsbeveiliging én noindex; noindex is op zichzelf geen afscherming. Toon 404 voor ontbrekende pagina's en passende permanente redirects.

Narrowcasting, bestaande clubroutes en Sportlink-programma/uitslagen/standen/teamdata moeten blijven werken. Port hun huidige opslagconfiguratie en serverafhankelijkheden; maak geen stilzwijgende reset van scherminstellingen. Een volledig nieuw narrowcastingproduct valt buiten deze opdracht.


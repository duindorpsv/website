# Sportlink beheren

Open **Instellingen & koppelingen → Synchronisatie-instellingen beheren**, of kies **Sportlink** in het beheermenu. De pagina toont de ingestelde verbinding, planning en per onderdeel de laatste geslaagde synchronisatie, volgende controle en eventuele fout. De instellingenpagina controleert de status iedere vijftien seconden en bij een gedeelde revisiemelding. Jaaragenda en Bezetting ontvangen revisiewijzigingen via een geauthenticeerde SSE-verbinding.

| Onderdeel | Standaardinterval | Verwerking |
| --- | --- | --- |
| Teams | 3 kalendermaanden | Controle van actieve teams; bestaande CMS-team-ID’s en inhoud blijven bestaan. |
| Openbare spelers en begeleiding | 1 kalendermaand | Privacygefilterde teamlijsten en toegestane foto’s; bestaande bewust geïmporteerde personen kunnen als werkversie worden bijgewerkt. |
| Wedstrijdprogramma | 6 uur | Bronwedstrijden in de centrale planning; nieuwe wedstrijden beginnen intern. |
| Velden, kleedkamers, afgelastingen | 15 minuten | Snellere controle van het programma op korte termijn, standaard drie dagen vooruit. |
| Uitslagen | 2 uur | Alleen resultaten die Sportlink openbaar beschikbaar stelt. |
| Standen en poules | 2 uur | Actuele gepubliceerde poulegegevens. |
| Teamgegevens en teamfoto’s | 1 kalendermaand | Gegevens en toegestane foto’s per team. |

De intervallen, periode voor het clubprogramma (maximaal 42 dagen), uitslagenperiode voor het cluboverzicht (maximaal 56 dagen), snelle controleperiode (maximaal zeven dagen), time-out, herhaalinterval, teamselectie en fotoverwerking zijn instelbaar. Een kalendermaand wordt in Europe/Amsterdam berekend; drie maanden zijn niet automatisch negentig dagen. Historische teamdetailpagina’s behouden hun opgeslagen seizoensarchief.

**Opslaan** activeert na clubbevestiging de ingestelde achtergrondplanning; zonder opgeslagen configuratie en bevestigde clubidentiteit wordt geen nieuwe automatische import gestart. De achtergrondwerker controleert iedere minuut welke taken aan de beurt zijn. Schakel automatisch synchroniseren of een afzonderlijk onderdeel uit om de automatische verversing te pauzeren. **Nu synchroniseren** zet één taak in de bestaande wachtrij en mag ook bij een gepauzeerde planning worden gebruikt. Een wachtrijmelding is nog geen geslaagde bronverversing. Bij een storing blijven de laatst geslaagde gegevens bewaard en wordt opnieuw geprobeerd. Een wedstrijdbronbatch commit volledig of helemaal niet. Niet-planningsonderdelen, zoals aparte openbare poulestanden, houden hun afzonderlijke caches. Een lege of ongeldige teamresponse maakt niet alle teams inactief.

## Koppelingen controleren

1. Controleer dat `SPORTLINK_CLIENT_ID` als bestaand secret in GitHub Environment `production` is ingesteld. De sleutel wordt alleen op de server gebruikt. Er zijn voor deze uitbreiding geen nieuwe GitHub-secrets, runnerinstellingen of externe API-URL’s nodig.
2. Kies **Clubbron controleren en bevestigen**. De server vergelijkt `/clubgegevens` en `/teams` onder dezelfde serversleutel. Controleer clubnaam en echte clubcode; naamherkenning of een poulestand bewijst geen eigenaarschap. Bewaar en synchroniseer **Teams**. Koppel de combinatie teamcode/lokale teamcode expliciet aan het bestaande CMS-team. Tegenstanders worden geen eigen teams. Oudere registerregels zonder vastgelegde verificatie blijven als controlepunt behouden.
3. Maak bij **Velden & ruimtes → Locaties** uitsluitend de eigen locaties en veldonderdelen aan. De gewone opening van deze module is nu **Bezetting**. Een expliciete diepverwijzing is bijvoorbeeld `/beheer?locatieTab=locations#locaties` of `?locatieTab=mapping#locaties`. Een bronupdate verandert de bewust gekozen tab niet.
4. Verifieer het echte eigen accommodatie-ID buiten deze openbare koppeling. Vul bij Sportlink **Club en eigen sportpark** het ID, de naam en de verwijzing naar die verificatie in. **Geen ID beschikbaar? Laat het park ongeconfigureerd. Verzin geen ID.** Wedstrijden kunnen wel in de agenda worden verwerkt, maar automatische eigen boekingen blijven geblokkeerd met **Mapping nodig**.
5. Synchroniseer het programma via het bestaande schema of **Nu synchroniseren** bij Sportlink. Bevestig in **Nog te beoordelen** per thuiswedstrijd dat de getoonde bronaccommodatie werkelijk het eigen park is. Dit is een expliciete controle, geen automatische koppeling op parknaam. De bevestiging bindt wedstrijd-ID, eigen park-ID en de waargenomen bronaccommodatie; een gewijzigde accommodatie moet opnieuw worden bevestigd.
6. Koppel veld-/kleedkamerwaarden aan bestaande eigen locatie-ID's en vink **Binnen ons bevestigde park** aan. De koppeling is begrensd tot provider Sportlink + clubcode + accommodatie-ID + resourcetype + expliciet bevestigde bronwaarde. Een oude losse veldnaam in de locatie is alleen een controlepunt. Bij ontbreken van een echt resource-ID wordt geen fictief ID aangemaakt.
7. Bewaar de instellingen. De volgende bestaande broncontrole past de bevestigde mappings toe. Vanaf iedere ontvangen geldige bronupdate worden agenda en bezetting samen verwerkt; er is geen tweede importactie of los bezettingsschema nodig. Thuis is blauw; Uit is lichtgrijs, met de externe speelplaats als tekst en zonder automatische eigen boeking of achterstallige eigen veldindeling. Handmatige nevenreserveringen blijven herkenbaar behouden.

Sportlink bepaalt altijd wedstrijddatum, tijd, status, veld en kleedkamerindeling. Die bronvelden zijn in de centrale planning vergrendeld. Extra lokale ruimtes, betrokkenen en redactionele gegevens blijven apart. Een update van een al openbare wedstrijd past uitsluitend de bronvelden in de gepubliceerde versie aan; privéwerkversies worden niet mee gepubliceerd. De koppeling schrijft niets terug naar Sportlink. Dit is periodieke synchronisatie, geen realtimeverbinding.

Automatische reservering van eigen velden en kleedkamers gebeurt uitsluitend bij een geverifieerd eigen thuisteam én een expliciet bevestigde wedstrijd op het eigen park. Een gelijknamig veld bij een uitwedstrijd is geen Duindorp-locatie. Bewust toegevoegde lokale extra ruimtes blijven apart behouden.

## Personen importeren

De officiële Club.Dataservice beschrijft `team-indeling` met een `relatiecode`. De import accepteert uitsluitend werkelijk beschikbare, niet-afgeschermde personen met zo’n stabiele code. De publieke beeld-/rosterhash is nooit een ledenidentiteit. Bekijk bij **Personen → Sportlink-import** de gevonden rijen, kies bewust personen en importeer de selectie. Het CMS verwerkt grotere selecties in deelbatches van maximaal vijftig en bewaart de voortgang bij een herpoging. Bestaande en verwijderde bronkoppelingen worden herkend. Nieuwe personen zijn concepten zonder openbaar contact, account of uitnodiging.

Deze openbare teambron is geen volledige ledenadministratie. Wanneer Sportlink geen toegestane stabiele broncodes levert, gebruik de CSV-voorbereiding met een bevoegde export. Een ontbrekende koppeling krijgt een concrete melding en wordt niet als succesvolle ledenimport getoond. Openbare profielen bevatten geen accountkoppeling of ledennummer; contactgegevens vereisen afzonderlijke toestemming in het CMS.

## Opslag en rechten

Instellingen staan in het private, versiegebonden record `site-sportlink`. Bewaren gebruikt de bestaande commando’s, revisies, audit en `expectedVersion`; de configuratie wordt nooit openbaar gepubliceerd. Beheer en handmatige taken vereisen clubbrede instellingenbeheerrechten. De achtergrondtaak controleert opnieuw of de betreffende beheerder nog toegang heeft. Personenimport vereist personenrechten. Nieuwe bronnen geven geen accountrechten.

De serverexport en operationele databaseback-up bevatten de configuratie en planning. De oude v1-browserback-up bevat geen private Sportlink-instellingen. Herstel en productie-uitrol volgen de bestaande procedure; deze implementatieopdracht vraagt geen productierelease.

Broncontrole op 20 oktober 2026: [officiële artikelen](https://sportlink-assist.freshdesk.com/nl/support/solutions/articles/9000062942-lijst-met-artikelen-van-club-dataservice), [parameters](https://sportlink-assist.freshdesk.com/nl/support/solutions/articles/9000211117-lijst-met-parameters-in-club-dataservice) en de [live artikeldefinities](https://data.sportlink.com/list). De implementatie is met vaste synthetische providerresponses en echte repositorytransacties getest. Een volledige live ledenimport is hiermee niet bewezen.


## Broncontract en ontbrekende velden

Gecontroleerd aan de officiële [live artikeldefinities](https://data.sportlink.com/list) op 20 oktober 2026. Er zijn geen ongedocumenteerde endpoints toegevoegd.

| Bron | Gebruikte identiteit / gegevens | Concrete beperking |
| --- | --- | --- |
| `clubgegevens` | `gegevens.clubcode`, `gegevens.clubnaam`, geautoriseerd met dezelfde serversleutel | Alleen deze twee velden worden gecachet; bank- en contactgegevens worden niet bewaard. Geen gedocumenteerd accommodatie-ID. |
| `teams` | `teamcode`, `lokaleteamcode`, competities uit de clubbron | Geen gedocumenteerde clubcode per rij; clubcontext komt uit `clubgegevens` onder dezelfde sleutel. Een expliciet afwijkende clubcode wordt geweigerd. |
| `programma` | `wedstrijdcode`, datum/tijd met offset, thuis-/uitteam-ID en clubrelatiecode, status | Accommodatie/veld/kleedkamers zijn labels; geen gedocumenteerd stabiel park-/resource-ID. Beide wedstrijdzijden blijven behouden. |
| `wedstrijd-informatie` | `wedstrijdinformatie.duur`, `veldnaam`, `wedstrijddatetime` met offset of expliciete `wedstrijddatum` + `aanvangstijd` in Amsterdam; `kleedkamers.thuis/uit/official`; `accommodatie.naam/straat/plaats` | Het accommodatiebewijs is een fingerprint voor menselijke bevestiging, geen accommodatie-ID. Zonder wedstrijdduur wordt geen eindtijd verzonnen. |
| `wedstrijd-accommodatie`, `wedstrijd-kleedkamers` | In de officiële definities gecontroleerd | Ook deze artikelen documenteren geen stabiele park-/resource-ID's; extra calls lossen het ontbrekende identiteitsbewijs niet op. |

Een adresfingerprint vervangt geen bron-ID. De eigen park-ID moet extern worden gecontroleerd; zolang die informatie ontbreekt is automatische lokale resourceboeking bewust niet beschikbaar. Een thuiswedstrijd op een ander/ongekend park boekt geen eigen velden. Zonder verifieerbare teamidentiteit of CMS-teammapping wordt een wedstrijd overgeslagen met controlebericht. Onbekende of afgeschermde personen krijgen geen nieuwe identiteit op basis van naam.

## Gedeelde verwerking en bewerkingen

Zowel een verse programmabron als een verse `wedstrijd-informatie`-response gaan vóór publicatie van hun cache door hetzelfde serverpad. Detailresponses van een programmabatch worden eerst in geheugen verzameld, met maximaal vier gelijktijdige verzoeken en een begrensde looptijd. De bestaande bronpolling blijft de transportbron; Sportlink biedt hier geen realtime bronpush.

Een databaselease voorkomt parallelle bronverwerking. Tijdens langere taken verlengt de worker zijn taaklease en heartbeat, zodat een actieve bronverwerking de bestaande readinessgrens niet overschrijdt. De definitieve transactie gebruikt dezelfde advisory lock als handmatige boekingen. Zij hercontroleert actuele instellingen en bevoegdheden, verwerkt activiteiten en annuleringen, herbouwt reserveringen, bewaart de controlelijst en schrijft pas daarna de gedeelde bronrevisie. Een late fout draait alle eerder gestagede wijzigingen terug. Een bezette automatische bronlocatie blijft ter beoordeling open; een conflicterende bewuste handmatige nevenreservering wordt nooit stilzwijgend verwijderd. Een wedstrijd die ontbreekt buiten het opgehaalde venster wordt niet verwijderd. Nieuwere waarnemingen kunnen niet door een tragere oude response worden teruggedraaid.

De SSE-route stuurt alleen private revisie/statusgegevens en controleert periodiek opnieuw de actieve sessie. Ze leest opgeslagen databasewijzigingen, doet geen Sportlink-aanvragen en voegt geen onafhankelijk bezettingspollschema toe. De browser laadt bij een revisiewijziging de actuele geautoriseerde CMS-state. De bootstrap leest inhoud, versies en revisie samen in één read-only repeatable-read-transactie, zodat de response één consistent moment weergeeft. Bij een onderbroken verbinding wordt dat zichtbaar; na herstel wordt de gedeelde toestand opnieuw geladen.

Tijdens een geopende bewerking blijft de lokale tekst staan. Bij een nieuwe activiteitversie verschijnt een melding met de actuele tijd/status en wordt opslaan geblokkeerd. Kopieer eigen wijzigingen indien nodig en kies **Actuele activiteit laden**. Ook een directe oude API-mutatie blijft door `expectedVersion` en de bronvergrendeling geweigerd. Alleen bronvelden worden in bestaande publicaties doorgewerkt; lokale beschrijvingen, publicatiekeuzes en conceptinhoud worden niet automatisch gepubliceerd.

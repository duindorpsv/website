# Sportlink beheren

Open **Instellingen & koppelingen → Synchronisatie-instellingen beheren**, of kies **Sportlink** in het beheermenu. De pagina toont de ingestelde verbinding, planning en per onderdeel de laatste geslaagde synchronisatie, volgende controle en eventuele fout. De status wordt iedere vijftien seconden bijgewerkt.

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

**Opslaan** activeert de ingestelde achtergrondplanning; zonder opgeslagen configuratie wordt geen nieuwe automatische import gestart. De achtergrondwerker controleert iedere minuut welke taken aan de beurt zijn. Schakel automatisch synchroniseren of een afzonderlijk onderdeel uit om de automatische verversing te pauzeren. **Nu synchroniseren** zet één taak in de bestaande wachtrij en mag ook bij een gepauzeerde planning worden gebruikt. Een wachtrijmelding is nog geen geslaagde bronverversing. Bij een storing blijven goede deelgegevens bewaard en wordt opnieuw geprobeerd. Een lege of ongeldige teamresponse maakt niet alle teams inactief.

## Koppelingen controleren

1. Controleer dat `SPORTLINK_CLIENT_ID` als bestaand secret in GitHub Environment `production` is ingesteld. De sleutel wordt alleen op de server gebruikt. Er zijn voor deze uitbreiding geen nieuwe GitHub-secrets, runnerinstellingen of externe API-URL’s nodig.
2. Bewaar de instellingen en synchroniseer **Teams**. Koppel elk CMS-team expliciet aan het juiste Sportlink-team. De bestaande CMS-identiteit verandert niet door een naamwijziging of nieuw seizoen.
3. Maak bij **Velden & ruimtes** de eigen velden, veldonderdelen, ruimtes en kleedkamers aan. Synchroniseer de wedstrijdindelingen. Koppel bij Sportlink de exacte bronwaarde aan de juiste CMS-locatie. De bronlijst komt uit werkelijk opgehaalde gegevens; een accommodatie is geen veldcode. Een exacte veldnaamkoppeling bij de locatie blijft eveneens ondersteund.
4. Beoordeel **Nog te beoordelen**. Zonder bevestigde wedstrijdduur wordt geen fictieve reservering gemaakt. Onbekende of conflicterende locaties blijven open, terwijl geldige andere ruimtes bewaard blijven.

Sportlink bepaalt altijd wedstrijddatum, tijd, status, veld en kleedkamerindeling. Die bronvelden zijn in de centrale planning vergrendeld. Extra lokale ruimtes, betrokkenen en redactionele gegevens blijven apart. Een update van een al openbare wedstrijd past uitsluitend de bronvelden in de gepubliceerde versie aan; privéwerkversies worden niet mee gepubliceerd. De koppeling schrijft niets terug naar Sportlink. Dit is periodieke synchronisatie, geen realtimeverbinding.

## Personen importeren

De officiële Club.Dataservice beschrijft `team-indeling` met een `relatiecode`. De import accepteert uitsluitend werkelijk beschikbare, niet-afgeschermde personen met zo’n stabiele code. De publieke beeld-/rosterhash is nooit een ledenidentiteit. Bekijk bij **Personen → Sportlink-import** de gevonden rijen, kies bewust personen en importeer maximaal vijftig tegelijk. Bestaande en verwijderde bronkoppelingen worden herkend. Nieuwe personen zijn concepten zonder openbaar contact, account of uitnodiging.

Deze openbare teambron is geen volledige ledenadministratie. Wanneer Sportlink geen toegestane stabiele broncodes levert, gebruik de CSV-voorbereiding met een bevoegde export. Een ontbrekende koppeling krijgt een concrete melding en wordt niet als succesvolle ledenimport getoond. Openbare profielen bevatten geen accountkoppeling of ledennummer; contactgegevens vereisen afzonderlijke toestemming in het CMS.

## Opslag en rechten

Instellingen staan in het private, versiegebonden record `site-sportlink`. Bewaren gebruikt de bestaande commando’s, revisies, audit en `expectedVersion`; de configuratie wordt nooit openbaar gepubliceerd. Beheer en handmatige taken vereisen clubbrede instellingenbeheerrechten. De achtergrondtaak controleert opnieuw of de betreffende beheerder nog toegang heeft. Personenimport vereist personenrechten. Nieuwe bronnen geven geen accountrechten.

De serverexport en operationele databaseback-up bevatten de configuratie en planning. De oude v1-browserback-up bevat geen private Sportlink-instellingen. Herstel en productie-uitrol volgen de bestaande procedure; deze implementatieopdracht vraagt geen productierelease.

Broncontrole op 20 oktober 2026: [officiële artikelen](https://sportlink-assist.freshdesk.com/nl/support/solutions/articles/9000062942-lijst-met-artikelen-van-club-dataservice), [parameters](https://sportlink-assist.freshdesk.com/nl/support/solutions/articles/9000211117-lijst-met-parameters-in-club-dataservice) en de [live artikeldefinities](https://data.sportlink.com/list). De implementatie is met vaste synthetische providerresponses en echte repositorytransacties getest. Een volledige live ledenimport is hiermee niet bewezen.

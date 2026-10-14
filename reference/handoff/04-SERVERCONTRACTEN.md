# Servercontracten en betrouwbaarheid

Dit hoofdstuk is een implementatiecontract. De genoemde endpoints en tabellen zijn voorstellen voor de doelapplicatie en bestaan niet als werkende CMS-backend in de meegeleverde bron. Codex mag namen aanpassen aan de repository, mits het gedrag en de acceptatie gelijk blijven. Document 02 specificeert de migratie van bestaande velden; document 03 is leidend voor het layoutschema.

## Runtime en opslag

Doel: een reguliere Node-productieruntime voor de Next/React-app, PostgreSQL en Drizzle, duurzame objectopslag en een worker. Werk het minimale datamodel uit vóór de controllers: accounts/rollen/scopes, artikelen, pagina's, revisies, publicaties, personen, media, mappen, albums en albumleden, formulieren en versies, inzendingen/antwoorden/notities/statushistorie, afdelingen, documenten, redirects, menu's, instellingen, audit, queue/outbox, importbatches en releases. Relaties krijgen foreign keys, unieke sleutels en indexes op werkelijk gebruikte filters. Publieke routes krijgen een eenduidig padregister zodat pagina's en artikeldetailpaden elkaar niet kunnen overschrijven.

Tiptap-inhoud en versieerbare snapshots mogen JSONB zijn; filterbare zakelijke gegevens, rechten en relaties horen niet uitsluitend in één reusachtige JSON-blob. De huidige localStorage-staat wordt geen gedeeld JSON-bestand op de VPS. Gebruik database-transacties, servervalidatie en objectrechten; een client mag geen volledige willekeurige `CmsState` als actuele productiestaat terugschrijven.

## API conventies

| Contract | Gedrag |
| --- | --- |
| Authenticatie | Echte accounts en sessies via een onderhouden library; sessiecookies veilig en servergecontroleerd. Geen rol uit localStorage, querystring of vrij te kiezen requestbody vertrouwen. |
| Rechten | Module + actie + objectscope + team/afdeling op iedere serverroute, export, preview en bestandsaanvraag. Alleen UI-knoppen verbergen voldoet niet. |
| CSRF en oorsprong | Gebruik de bescherming van de gekozen stack voor cookiegeauthenticeerde mutaties en controleer toegestane oorsprong. Geen permissieve wildcard voor geauthenticeerde API's. |
| Validatie | Schema aan de servergrens, expliciete veldallowlist, lengte-/omvanglimieten, veilige URL-protocollen, toegestane Tiptap-nodes, widgetdata en bestandscontrole. |
| Concurrency | Iedere bewerkbare resource heeft een oplopende versie. Mutaties dragen de verwachte versie. Bij verouderde versie: 409 met conflictinformatie; nooit stil overschrijven. |
| Pagineringscontract | Stabiele sortering, cursor of begrensde offset, vaste maximumlimiet. Geen volledige inzendingen-/mediabibliotheek in iedere response. |
| Fouten | Vaste foutcode, gebruiksvriendelijke Nederlandse uitleg, veld/node-ID waar relevant en request-ID. Geen stacktrace, token of interne secret in de response. |
| Logging | Audit voor succesvolle én relevante geweigerde beheeracties; gewone logs bevatten IDs/statussen, geen volledige formulierantwoorden of wachtwoorden. |
| Idempotentie | Unieke operatie-ID voor formulierinsturen, import, publicatietaak en externe registratie. Dezelfde operatie herhalen retourneert hetzelfde resultaat. |

## Voorgestelde endpoints

| Endpointgroep | Minimaal gedrag |
| --- | --- |
| `/api/cms/articles` en `/:id` | Gepagineerde CRUD met expliciet news/story-filter, status en scope. |
| `/api/cms/pages` en `/:id` | CRUD, layoutvalidatie, ouder/menu/padcontrole, versieconflicten. |
| `/:resource/:id/publish`, `/unpublish`, `/schedule` | Afzonderlijk publicatierecht; validatie plus transactie; idempotente acties. |
| `/:resource/:id/revisions`, `/restore` | Historie lezen; herstel naar nieuw concept met behoud van live. |
| `/api/cms/media/uploads` | Geautoriseerde tijdelijke uploadopdracht; server-finalisatie na inhoudscontrole; publicatie los van upload. |
| `/api/cms/media`, `/albums`, `/people`, `/documents` | Referentiecontrole, publicatiebeheer, filters, prullenbak en herstel. |
| `/api/cms/forms`, `/departments` | Formulieren en routeringsconfiguratie, met gescheiden beheerrechten. |
| `/api/cms/submissions` en `/:id` | Verplichte kind/scope-controle, beperkte velden, interne notities en statushistorie. |
| `/api/forms/:publicId/submissions` | Alleen gepubliceerde actieve formulierdefinitie; server bepaalt kind/afdeling/ontvangers. |
| `/api/cms/users`, `/roles` | Uitnodigen, blokkeren, rolwijziging en scope; geen eigen privilegeverhoging. |
| `/api/cms/imports`, `/exports` | Validatie/dry-run/rapport, beperkte rechten, private bestanden en vervaldatum. |
| `/api/cms/settings`, `/navigation`, `/redirects` | Getypeerde instellingen, validatie, audit, revisie en bewuste publicatie. |
| `/health/live`, `/health/ready` | Processtatus en gecontroleerde afhankelijkheden zonder gevoelige details; readiness binnen begrensde tijd. |

Publiceer een korte OpenAPI- of gelijkwaardige contractbeschrijving naast de implementatie. Exports met persoonsgegevens zijn niet publiek bereikbaar. Die links mogen niet in de sitemap of normale cache terechtkomen.

## Publiceren als transactie

1. Verifieer identiteit, publicatierecht, scope en verwachte conceptversie.
2. Valideer titel, pad, inhoudsschema, SEO en alle verplichte verwijzingen. Onbekende nieuwe blokken worden geweigerd met behoud van het concept. Legacy-inhoud heeft een expliciet ondersteunde compatibiliteitsroute.
3. Reserveer het publieke pad en archiveer de vorige snapshot. Schrijf de nieuwe immutable snapshot, livepointer, publicatiedatum, redirects en homepage/menu-aanpassingen in één transactie.
4. Voeg in dezelfde transactie audit en outboxtaken toe voor cache-invalidation en eventuele indexupdates.
5. De publieke renderer, metadata en sitemap gebruiken alleen de livepointer. Een verkeerde cache mag geen concept tonen. Preview gebruikt een afzonderlijk geautoriseerde route.

Personen, albums, menu's en andere gedeelde records krijgen een expliciete publicatiehandeling. Voorstel: ook daar draft/live-snapshots, zodat het aanpassen van een bestuurder of album niet ongemerkt iedere gekoppelde pagina verandert. Een gebruiker met alleen bewerkrecht kan nooit via een gedeeld record alsnog live-inhoud wijzigen. Leg het gekozen model in migrations en tests vast.

Bij intrekken vervalt de publieke snapshot/cache; refererende pagina's tonen de afgesproken veilige fallback. Bij verwijderen van gebruikt materiaal meldt het CMS waar dit nog voorkomt. Hard delete verbreekt geen referenties zonder afhandeling.

## Formulierontvangst en verwerking

De server accepteert alleen actieve velden van de actuele gepubliceerde formulierversie en valideert verplichte velden. Bewaar de exacte gebruikte versie, bestemming en geschoonde antwoorden. Inzending en outboxopdracht worden atomair aangemaakt. Geef pas 'ontvangen' terug na succesvolle databasecommit. E-mail is een notificatie, niet de enige opslag.

Voor contact zijn `new`, `in-progress`, `done` toegestaan. Aanmeldingen hebben daarnaast `accepted`, `declined`, `waitlist`. Aanvragen kennen `accepted` en `declined`, geen wachtlijst. De server valideert zowel de doelstatus als het recht op de overgang; invalid requests wijzigen niets. Bewaar wie en wanneer de wijziging uitvoerde.

Houd deze assen apart:

- Behandeling: nieuw/in behandeling/geaccepteerd enzovoort.
- Aflevering: nog te verzenden/verzonden/opnieuw proberen/definitief mislukt.
- Externe registratie: niet van toepassing/wacht/verwerkt/fout/handmatige opvolging.

Maak een handler voor een terugkerende retry met exponential backoff en maximumaantal pogingen. Na uitputting komt een duidelijke beheermelding met herstartmogelijkheid. E-mail kan bij time-outs een onzekere afleverstatus hebben; gebruik provider-idempotentie waar beschikbaar en claim geen gegarandeerde exact-eenmaal-bezorging. Sportlink-acties gebruiken een eigen externe referentie/idempotentiesleutel en reconciliatie vóór opnieuw aanmaken.

Nieuwsbriefinschrijving heeft een eigen proces en bevestigings-/afmeldtokens. Ontvangen formulierdata wordt niet automatisch voor een ander doel gebruikt. Bewaartijden zijn per soort/afdeling configureerbaar en door de club vast te stellen; neem geen verzonnen wettelijke termijn als productregel. Een worker verwijdert of anonimiseert ook gekoppelde bijlagen volgens die instellingen, met een auditregistratie zonder de verwijderde antwoorden opnieuw te kopiëren.

## Media

Upload loopt via een tijdelijke quarantainestatus; de server controleert authenticatie, scope, grootte, werkelijk bestandstype en decodering. Alleen geslaagde verwerking mag een bruikbaar mediarecord opleveren. Verwerk responsive formaten asynchroon en behoud het origineel in duurzame opslag. Maak downloadbestemmingen voorspelbaar op ID, niet op gebruikersbestandsnaam als onbeveiligd pad.

Origineel, afgeleiden en databaseverwijzingen hebben een samenhangend verwijder-/herstelproces. Een DB-transactie omvat geen S3-operatie: gebruik statusovergangen en opruimtaken zodat uitval geen onzichtbare halve upload achterlaat. Controleer ongebruikte tijdelijke bestanden periodiek. Private inzendingsbijlagen gebruiken afzonderlijke toegangsregels en tijdelijke geautoriseerde downloads.

## Achtergrondtaken

Gebruik een gedeelde worker/queue met lease, lock, aantal pogingen, volgende poging, correlation-ID en laatste fout. Taken: geplande publicaties, e-mail, integraties, beeldafgeleiden, bewaartermijnen, cache-invalidation en beheermeldingen. Verwerk taken veilig opnieuw na een crash; een tweede worker mag niet dezelfde mutatie onbeperkt dubbel uitvoeren. Gebruik unieke sleutels en transacties waar nodig. Achtergrondtaken zijn onderdeel van readiness/monitoring, niet afhankelijk van browseractiviteit.

Geplande publicatie verwijst naar een concrete bevroren revisie en verwacht versienummer. Een latere wijziging van het concept verandert de ingeplande inhoud niet stilzwijgend: de editor kiest expliciet opnieuw plannen of de nieuwe revisie koppelen. Annuleren en intrekken moeten races met de worker oplossen via transactie/versiecontrole.

## Migratie en operationele grenzen

Importeer nooit rechtstreeks vanuit een onbekende backup naar productie. Start met schema-validatie en een dry-run met aantallen, conflicten, gebroken referenties en ontbrekende bestanden. Koppel een importbatch aan de herkomsthash; herhaling maakt geen duplicaten. Importeer de originele v1 JSON ongewijzigd in een afgeschermd archief voor herstel en migreer draft, live en revisies afzonderlijk. Staging/demo-inzendingen worden niet als echte ledenaanmeldingen verstuurd.

Backups omvatten database, originelen, noodzakelijke configuratie en herstel van secrets via de daarvoor gekozen voorziening. Een sourcezip of Docker-image is geen databackup. Herstel moet aantoonbaar getest zijn vóór productie. Beschrijf restore en app-rollback afzonderlijk.

## Technische bronnen

Officiële Next.js-documentatie ondersteunt self-hosting als Node-server of container en beschrijft de grenzen van build- versus runtimeconfiguratie: https://nextjs.org/docs/app/guides/self-hosting. De keuze voor PostgreSQL, Drizzle, outbox en S3 is het architectuurvoorstel voor deze opdracht; dit is geen constatering dat deze CMS-backend al bestaat.


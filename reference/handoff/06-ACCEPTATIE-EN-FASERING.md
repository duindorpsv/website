# Fasering en acceptatie

Werk door de fasen heen op de development-VPS. Een fase is afgerond wanneer de genoemde uitkomst en controles aantoonbaar beschikbaar zijn. Noteer broncommit, omgeving, testcommando/resultaat en eventuele beperkingen. Schrijf tests voor daadwerkelijk risicovol gedrag; een test die slechts dezelfde implementatie overschrijft is geen bewijs.

## Werkvolgorde

| Fase | Op te leveren resultaat | Gereed wanneer |
| --- | --- | --- |
| 1 Bron en omgeving | Inventaris, doelrepository, runtimeport, dependency/lockfilekeuze, schoon productie-image | App bouwt en start op gekozen Node-runtime zonder Sites-host; bestaande openbare routes werken. |
| 2 Data en toegang | DB-migraties, accounts, serverrechten, repositorylaag, seed/import | Twee browsers zien dezelfde inhoud; onbevoegde API-toegang faalt; restart behoudt data. |
| 3 Publicatie en migratie | Draft/live/revisies, redirects, planning, v1-import | Oude export migreert zonder verlies en live blijft gelijk tijdens conceptbewerkingen. |
| 4 Paginabouwer | Geneste Tiptap-layout, widgets, renderer, responsive preview | Alle PB-scenario's hieronder en de 22 specifieke criteria uit document 03 slagen. |
| 5 Redactie en media | Nieuws/verhalen, personen, fotoverwerking, albums, homepage | Inhoudstypes blijven gescheiden; gepubliceerde media en widgets werken duurzaam. |
| 6 Communicatie | Formulierstromen, routering, inboxrechten, outbox; integratieadapters | Testontvangst, historische snapshots, retry en statusonderscheid werken; externe toegang apart bewezen. |
| 7 Staging en productie | CI, deployment, migraties, monitoring, restore, beheerdersinstructie | Staging getest; dezelfde release kan gecontroleerd naar production; bestaande sites functioneren. |

Een ontbrekende externe API-sleutel mag fasen 1–5 niet blokkeren. Bouw de adapter, foutafhandeling en contracttests met herkenbare testfixtures; markeer de echte koppeling als nog niet aangesloten. Toon nooit een gefingeerde geslaagde ledeninschrijving.

## Kernscenario's

| ID | Handeling | Verwacht bewijs |
| --- | --- | --- |
| AUTH01 | Open `/beheer` en een CMS-API zonder sessie | Geen vertrouwelijke data; correcte login/401. |
| AUTH02 | Redacteur manipuleert requestbody naar admin, ander team of publiceren | Server weigert; geen mutatie en passende audit. |
| AUTH03 | Behandelaar van contact vraagt ledenaanmeldingen van andere afdeling op | Geen toegang, ook niet via export of bijlage-URL. |
| AUTH04 | Blokkeer account, test bestaande sessie en laatste beheerder | Sessies volgens beleid ingetrokken; laatste beheerder blijft beschermd. |
| DATA01 | Bewaar in browser A, lees in browser B, herstart app/worker | Dezelfde inhoud; data blijft bestaan. |
| DATA02 | Twee redacteuren bewaren dezelfde oude versie | Tweede krijgt zichtbaar conflict; geen stil verlies. |
| PUB01 | Bewerk gepubliceerd artikel/pagina zonder publiceren | Publieke inhoud en metadata blijven vorige liveversie. |
| PUB02 | Publiceer, wijzig slug, herstel revisie, trek in | Live en redirects correct; revisieherstel alleen concept; intrekken effectief. |
| PUB03 | Plan publicatie; sluit browser en herstart worker | Eenmalige publicatie op bedoelde revisie; geen dubbelexemplaar. |
| PUB04 | Plan rond zomer-/wintertijd en wijzig concept na planning | Europe/Amsterdam duidelijk; UTC correct; gekozen revisie blijft vast. |
| PB01 | Voeg rij met twee kolommen en drie widgets per kolom toe | Echte zelfstandige nodes/IDs; opslaan en herladen behouden boom. |
| PB02 | Sleep widget binnen kolom, naar andere kolom, naar andere rij | Exact één verplaatsing; inhoud en referenties blijven behouden. |
| PB03 | Sleep volledige rij; dupliceer rij; undo/redo | Rijvolgorde klopt; kopie heeft nieuwe node-IDs; één actie per undo. |
| PB04 | Zet twee kolommen om naar één | Links gevolgd door rechts; geen verlies; undo herstelt. |
| PB05 | Bedien met toetsenbord en touch, annuleer drag | Volledige bediening, focusherstel en begrijpelijke meldingen. |
| PB06 | Bekijk preview en publieke versie op 320/768/1440 px | Dezelfde renderer; mobiele volgorde links dan rechts; geen paginaoverflow. |
| PB07 | Importeer legacy columns/nested widget en onbekende node | Legacy bewaard/gecontroleerd gemigreerd; onbekend blok gemeld, geen stil verlies. |
| PB08 | Publiceer geforceerd ongeldig of buitensporig document | Server weigert schema/limieten; eerdere liveversie blijft geldig. |
| NEWS01 | Maak één nieuwsbericht en één column | Eigen modules/routes; column nooit in gewone nieuwsfeed. |
| NEWS02 | Wijzig type van live nieuws naar verhaal als concept en publiceer | Pas bij publiceren verhuist URL, redirect en homepagekeuze. |
| MEDIA01 | Upload meerdere bestanden incl fouttype/te groot bestand | Geldige verwerkt, ongeldige duidelijk geweigerd; geen uitvoerbare publieke inhoud. |
| MEDIA02 | Foto in twee albums; verplaats map; wijzig focus | Eén origineel, blijvende referenties en juiste uitsnede. |
| MEDIA03 | Ongepubliceerde persoon/foto/album in publieke widget | Geen datalek; publicatiecheck of veilige fallback. |
| MEDIA04 | Upload, herstart, restore DB plus objecten | Origineel en afgeleiden beschikbaar; geen blob-URL-afhankelijkheid. |
| FORM01 | Dien contact, aanmelding en aanvraag in | Drie correcte inboxen/statussets; ontvanger serverbepaald. |
| FORM02 | Wijzig daarna naam/type/velden/afdeling van formulier | Eerdere snapshot en antwoorden blijven oorspronkelijk. |
| FORM03 | Verstuur tweemaal dezelfde operatie-ID; simuleer mailstoring | Eén inzending; gecontroleerde retry; geen verloren ontvangst. |
| FORM04 | Accepteer lidmaatschap terwijl Sportlink offline is | Behandeling geaccepteerd, externe status wacht/fout; geen vals succes. |
| FORM05 | Staging verzendt bevestiging, preview toont formulier | Alleen testmail; preview voert geen echte externe actie uit. |
| FORM06 | Bewaartermijn verstrijkt | Afgesproken verwijdering/anonimisering inclusief private bijlagen. |
| SEO01 | Vraag pagina zonder client-JavaScript op | Live-inhoud en metadata servergerenderd; canonical/sitemap correct. |
| SEO02 | Open oude slug, onbekende route en concept | Echte 301/308, 404 en beveiligde preview; geen conceptindexering. |
| REG01 | Controleer historie, vrijwilligers, placeholders, menu | Volledige goedgekeurde teksten; verborgen routes buiten menu; geen ongevraagde vulling. |
| REG02 | Test programma/uitslagen/standen/team en narrowcasting | Bestaande leesfuncties, routes, cachegedrag en schermconfiguratie behouden. |
| OPS01 | Push naar `main` | Tests mogen draaien; geen hostingdeployment. |
| OPS02 | Merge naar staging, daarna production | Juist gelabelde runner; production ontvangt bewezen stagingdigests. |
| OPS03 | Laat oude wachtrijjob later starten | Geen overschrijving van nieuwere release. |
| OPS04 | Simuleer foutieve release/healthcheck en rollback | Mislukking gemeld, vorige app herstelbaar, geen datavolumeverlies. |
| OPS05 | Herstel backup in geïsoleerde omgeving | Login, pagina, media en formulierhistorie aantoonbaar bruikbaar. |
| OPS06 | Controleer bestaande websites na serverinrichting | Geen regressie van bereikbaarheid, certificaten of processen. |

## Tests en visuele controle

Gebruik domeintests voor rechten, paden, publicatie, legacy-migratie en statusovergangen; integratietests tegen de echte testdatabase/objectopslag voor transacties en referenties; end-to-end browserproeven voor de editors, mobiele bediening, accounts en ontvangstflows. Test publieke pagina's zowel als browserweergave als HTTP-response voor status/SEO. Test backendautorisatie buiten de UI om.

De bron bevat bestaande regressiescripts onder `scripts/test-*.ts`. De CMS-scheiding is al getest in het concept, maar moet opnieuw worden gecontroleerd nadat serveropslag en layout worden vervangen. De huidige testbestanden zijn startmateriaal; oude lokale state-tests bewijzen geen serverbeveiliging.

Vergelijk screenshots van de bestaande homepage, historie, vrijwilligers, nieuws, verhalen, albums en narrowcasting met de nieuwe omgeving. Controleer editorfocus, selecties, oversleepzones, lange tekst, lege states, laden, opslagfouten en een onderbroken netwerkverbinding. Rapporteer ontbrekende visuele tests eerlijk.

## Overdracht na de bouw

Lever een werkende repository met versiegeschiedenis, configuratievoorbeelden zonder secrets, database- en layoutmigraties, import/export, deploymentworkflows, backup/restore en een korte CMS-handleiding. Het testrapport benoemt per scenario geslaagd/mislukt/niet uitgevoerd. Een geslaagde build is geen bewijs van een geslaagde deployment of Sportlink-aanmelding.


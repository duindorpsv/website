# Sponsoring v72

De sponsorcommissie kan vanuit dezelfde wizard een conceptvoorstel of conceptovereenkomst bewaren. Een conceptvoorstel versturen is optioneel. De overeenkomstcomposer maakt pas bij definitief bevestigen één formele overeenkomst en een vaste verzendopdracht; preview en PDF-download doen dit niet.

## Document en verzending

De composer bewaart de ontvanger, het onderwerp en persoonlijke bericht met actor, documentnummer, versie, oorspronkelijke snapshotbytes, documenthash en de exacte PDF. De bestaande serverrechten en expliciete bedrijfsrollen blijven gelden. Een bewerkbaar mailadres verleent geen portaal- of ondertekenrechten.

De verzendopdracht gebruikt de bestaande transactionele outbox en worker. Een mislukte verzending kan met dezelfde ontvanger, inhoud, PDF en provider-idempotentiesleutel opnieuw worden aangeboden. Een bewust nieuwe verzending van een nog niet ondertekende overeenkomst krijgt een eigen historie-item en verandert de overeenkomst niet. De interface toont provideracceptatie pas nadat Resend een ontvangstbewijs heeft teruggegeven; dit bewijst geen inboxbezorging. Na afloop van het veilige providerherhaalvenster vereist opnieuw verzenden een bewuste nieuwe actie.

Voor beide partijen blijven de bestaande persoonlijke accounts en afzonderlijke OTP-verificaties verplicht. Versturen maakt geen handtekening, taak voor een definitief ondertekende PDF of factuur. De bestaande facturatieregels na tweezijdige ondertekening blijven gelden.

## Concepten en historische gegevens

Een conceptovereenkomst is een voorstel met `status=draft` en optioneel `documentKind=agreement`. Ontbrekende velden blijven compatibel met oudere gegevens. Verwijderen archiveert via `deletedAt`; oude open schermen mogen een gearchiveerd of omgezet concept niet opnieuw bewerken of versturen. Donateurprojecties laten gearchiveerde concepten weg. Historische concept- en overeenkomstverzendingen blijven onder Gesprekken & historie bereikbaar en alleen-lezen.

De gerichte migratie `0025_sponsor_agreement_deliveries.sql` voegt de private verzendregistratie toe en beschermt document-/PDF-relaties met constraints en triggers. Zij overschrijft geen oude documentinhoud, bedragen of perioden. De tabel heeft RLS en uitsluitend de bestaande backendtoegang; publieke Supabase-rollen krijgen geen tabeltoegang.

Snapshots worden volledig gevalideerd met behoud van de oorspronkelijke geldige sleutelvolgorde. Bestaande `snapshotBytes` blijven de autoritatieve serialisatie. Een veranderde inhoud met een oude hash wordt geweigerd; bestaande documenten worden niet opnieuw gehasht om een mismatch te verbergen.

## Jaarperiode en vormgeving

Nieuwe sponsorconcepten en donateurbijdragen gebruiken één helper voor het clubjaar in Europe/Amsterdam: 1 augustus tot en met 31 juli. Handmatige perioden en seizoenen blijven opgeslagen. Jaarcontract herstellen gebruikt de gekozen begindatum. Nieuwe verlengconcepten beginnen op de eerste 1 augustus na de oude einddatum. Historische documenten veranderen niet en er is geen automatische proratering of verlenging.

Koppen gebruiken het bestaande lokale Permanent Marker Regular-font; leesfonts en de vaste herolettering blijven behouden. Alleen de drie blauwe homepagevlakken krijgen de headerkleur, wandtextuur en schaduwlaag. De afzonderlijke PDF- en HTML-renderers gebruiken hun eigen ingebedde/lokale koppenfont.

## Verificatie en uitrol

De actuele bewijsbestanden staan tijdens de uitwerking onder `.runtime/v72/`; deze bevatten uitsluitend fictieve testgegevens en geaggregeerde productiecontroles. Drie echte PDF-voorbeelden worden zonder database of provider gegenereerd via `pnpm exec tsx scripts/sponsor-v72-pdf-example.ts`.

De onafhankelijke PDF-controle omvat 6 previewpagina's, 6 vaste verzendpagina's en 2 conceptpagina's. Iedere conceptpagina heeft het watermerk; overeenkomstpagina's hebben dat niet. De interne fontnaam is Permanent Marker Regular en geen tekstspan valt buiten de pagina. De referentie gebruikt andere fictieve gegevens, waardoor regelafbreking en paginering per inhoud mogen verschillen.

De huidige productionworkflow is gekoppeld aan `main` en de bestaande productie-runner. De afzonderlijke staging-runner is online, maar de huidige stagingconfiguratie mist Supabase/opslaginstellingen en de vaste versie-5 wrapper. Inventarisatie is geen stagingdeployment. De wijziging wordt via PR en test-/beeldmateriaal reviewbaar gemaakt; een live staging-uitrol wordt uitsluitend gemeld wanneer die daadwerkelijk is bewezen. De gebruiker heeft uitvoering en productie-deployment expliciet gevraagd.

De definitieve CI-, browser-, migratie-, backup- en productiecontroles worden na afronding met de exacte commit en release vastgelegd in het oplevermanifest. Deze beschrijving alleen bewijst geen deployment of echte individuele mailbezorging.

## Back-up en herstel van private verzendhistorie

De gewone CMS-JSON-export bevat geen private sponsorverzendhistorie. De browserimporter accepteert deze historie evenmin; een JSON-roundtrip van het domeinschema is daarom geen herstelproef van serverregistraties en kan geen provideracceptatie aanmaken. Operationeel herstel gebruikt de vertrouwde volledige PostgreSQL-customdump met de bijbehorende privé-opslagobjecten onder dezelfde sleutels, volgens [de herstelprocedure](rollback-and-restore.md). De bestaande back-up kopieert de volledige mediabucket, behalve de aparte back-upruimte. De CI-back-upcontrole vereist ook de concept- en overeenkomstverzendingen, document- en bestandsregistraties, ondertekenbewijzen en bijbehorende audit-/accounttabellen.

De uitgevoerde lokale proef staat in `.runtime/v72/backup-restore-proof.json`: een echte PostgreSQL 17-dump van `public` en `drizzle` is teruggezet in een uniek aangemaakte, geïsoleerde database, met een afzonderlijk vastgelegde echte `auth`-schema-afhankelijkheid. De gecontroleerde rijen zijn exact gelijk gebleven, inclusief oorspronkelijke snapshotbytes, documenthashes, versies, ontvangers, onderwerpen, berichten, providerontvangstbewijzen en bestandsreferenties. Achttien beschikbare concept-/overeenkomst-PDF's zijn bytegelijk gekopieerd en alle 84 pagina's konden worden geopend; hieronder vallen alle zes lokaal geaccepteerde v72-verzendingen. Zeven oudere conceptbestanden ontbreken in de huidige lokale opslagmap en vallen buiten het bewezen bestandsherstel. De proef heeft geen brongegevens gewijzigd en geen worker of e-mail verzonden. Zij bewijst lokaal gegevensherstel met bestaande clusterrollen, geen afzonderlijke Supabase-projectinrichting, herstelde runtime-grants, externe S3-/Restic-restore of productieherstel. Ruwe dumps en gegevens blijven uitsluitend in de afgeschermde, genegeerde runtime-map.

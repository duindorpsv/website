# Sponsorbeheer en Personen & gebruikers

Deze uitbreiding is gebaseerd op de vastgelegde OnzeTrots-bronversie 61 (`a9757baadcd2897be790e12edcdc84f1d389c337`). Zij gebruikt de bestaande Next.js-applicatie, Supabase Database/Auth, Resend en private Hetzner S3-opslag. Er is één productieomgeving; uitrollen gebeurt via de bestaande GitHub-productieworkflow.

## Waar beheer je wat?

| Onderdeel | Locatie |
| --- | --- |
| Centrale personen, lidmaatschap, functies, ouders en uitnodigingen | **Personen & gebruikers**, `/beheer#register` |
| Publieke biografieën, portret en contactgegevens op de website | **Websiteprofielen**, `/beheer#personen` |
| Relaties, catalogus, voorstellen, templates, contracten, facturen en uitvoering | **Sponsoring**, `/beheer#sponsoring` |
| Persoonlijk account en goedgekeurde ouderrelaties | `/portaal` |
| Bedrijfsafspraken, ondertekenen, facturen en materialen | `/sponsorportaal` |
| Publieke partners en sponsorinteresse | `/clubmuur/club/sponsoren`, `/clubmuur/club/word-sponsor` |
| Sponsorprofielen voor een clubscherm | `/sponsorscherm` |

Lijsten beginnen met 25 resultaten; 50 en 100 zijn mogelijk. Het personenregister zoekt en pagineert op de server. Een persoonsdossier en een inlogaccount zijn verschillende zaken: een persoon mag zonder account bestaan. Er wordt nooit op gedeeld e-mailadres, naam of adres samengevoegd.

## Rollen en toegang

- **Gebruikersbeheer (`users:manage` of volledig beheer)** beheert globale accounts/rollen, blokkades en expliciete accountkoppelingen. Minimaal één actieve volledige beheerder blijft behouden.
- **Ledenadministratie (`directory`)** beheert private dossiers, lidmaatschap, functies, ouderrelaties en clubuitnodigingen. Deze rol kan geen globale accountrol uitdelen.
- **Sponsorcommissie (`sponsors`)** beheert sponsoring en relevante contactnamen, contactadressen, telefoon, bedrijfskoppelingen en uitnodigingsstatus. Geen geboortedatum, privé-adres, lidmaatschap, ouderrelaties of globale rollen.
- **Websitepersonen (`people`)** blijven onder de bestaande bewerk- en publicatieregels vallen. Een private registerwijziging publiceert niets. Gepubliceerde contactgegevens wijzigen vereist ook de bestaande personen- en publicatierechten.
- **Portaalgebruiker** ziet uitsluitend zichzelf en expliciet goedgekeurde relaties. Een functie of commissielidmaatschap verleent geen backofficerechten.

De bestaande acties Toevoegen, Bewerken, Verwijderen en Publiceren worden ook hier op de server afgedwongen. Beheren omvat alle handelingen binnen de module; clubondertekening en sponsorinstellingen vereisen Beheren. Een rol met alleen toevoegrechten kan bestaande dossiers niet overschrijven of publiceren.

Bedrijfsrollen gelden afzonderlijk per bedrijf:

| Bedrijfsrol | Mogelijkheden |
| --- | --- |
| `signer` | Voorstellen/overeenkomsten bekijken, akkoord geven, namens de sponsor tekenen, formele bedrijfswijziging aanvragen |
| `billing` | Bedrijfsdocumenten en facturen bekijken/downloaden, formele wijziging aanvragen |
| `marketing` | Materiaal/logo en publiek profiel voorstellen; geen facturen of tekenrecht |

De commissie kan bestaande bedrijfsrollen aanpassen. Een willekeurig bestaand globaal account nieuw koppelen vereist gebruikersbeheer. Nieuwe contacten worden uitgenodigd via het register. Ook een volledige beheerder heeft een expliciete `signer`-bedrijfskoppeling nodig om namens dat bedrijf te tekenen.

## Een persoon uitnodigen

1. Voeg de persoon toe. Bewaar het dossier; er ontstaat nog geen account.
2. Controleer het persoonlijke **inlogadres**. Dit mag afwijken van het gedeelde contactadres.
3. Kies clubtoegang of het bedoelde sponsorbedrijf met bedrijfsrollen en verstuur de uitnodiging.
4. De ontvanger opent de link en bevestigt het juiste adres met een echte achtcijferige Supabase-code. Pas daarna ontstaan accountkoppeling en de opgeslagen toegang.

Links zijn 72 uur geldig, eenmalig en intrekbaar. Opnieuw uitnodigen trekt de vorige open link in. De link staat uitsluitend in de e-mail; de database bewaart alleen een hash. De browser verwijdert de token uit de zichtbare URL en verzendt geen verwijzende header vanaf de uitnodigingspagina. Een geblokkeerd account wordt niet door een uitnodiging geactiveerd.

Een bestaande eenvoudige accountbasis kan alleen door gebruikersbeheer expliciet naar de juiste persoon worden overgezet. Het account-ID blijft gelijk. Een al uitgewerkt dossier wordt niet automatisch samengevoegd.

**Verzendstatus:** verwerkt/klaargezet is nog geen verzonden e-mail. Alleen acceptatie door Resend geldt als aangeboden aan de mailvoorziening; dit bewijst geen aflevering in de inbox. Bij een transportfout verschijnt een fout, blijft de mislukte status zichtbaar en kan een nieuwe uitnodiging/code worden gemaakt. Bij bulkuitnodigingen kunnen eerdere berichten al zijn geaccepteerd als een later bericht faalt; controleer de status per persoon.

## Ouders en Sportlink

De ledenadministratie maakt een gerichte persoonscode aan en deelt die met de bedoelde ouder. De code verloopt na 90 dagen en geeft zelf geen toegang. Elke ouder vraagt met het eigen account een relatie aan; de ledenadministratie keurt rechten per kind goed. Vóór goedkeuring wordt geen kindnaam getoond. Andere ouders en hun contactgegevens blijven onzichtbaar. Intrekken werkt door op volgende aanvragen en open schermen.

De bestaande publieke Sportlink-koppeling biedt geen private leden-API. Het register toont daarom eerlijk **geen live ledenkoppeling**. Gebruik een geautoriseerde export van de eigen club via **Sportlink-gegevens importeren**. Bevestig de eigen club bij Instellingen → Sportlink, controleer eerst de voorvertoning en pas die binnen 30 minuten toe.

CSV gebruikt de bestaande kolommen `bronId;naam;email;telefoon`. JSON accepteert `sportlinkId`, `name`, `email`, `phone` en optioneel `birthDate` (`YYYY-MM-DD`), `membership` (`playing`, `non-playing`, `none`) en bestaande `teamIds`. Bron-ID's zijn stabiel en uniek binnen de eigen club. Naam, contactvelden en expliciet aangeleverde bronvelden worden bijgewerkt; private adressen, accountkoppelingen, inlogadressen, lokale functies en ouderrelaties blijven behouden. Een ontbrekende rij archiveert niemand. Een ongeldige of verouderde import wordt volledig geweigerd.

## Van sponsorrelatie naar overeenkomst

1. Maak de relatie aan; onvolledige formele bedrijfsgegevens mogen als concept worden bewaard.
2. Vul de formele partij, vestigingsadres, registratie/btw, contactpersoon en factuuradres in en bevestig deze.
3. Beheer losse items, capaciteit, prijzen en pakketten. Capaciteit 0 betekent onbeperkt. Verzonden voorstellen en overeenkomsten reserveren overlappende plekken; omzetten telt dezelfde toezegging één keer.
4. Maak een voorstel met looptijd, regels, eventuele korting en een overeenkomsttemplate. De 22 shortcodes worden gecontroleerd en één keer als tekst ingevuld. Versturen zet bedrijfsgegevens, bedragen en template-inhoud vast.
5. Maak de overeenkomst van dat voorstel. Bedrijf of template later wijzigen herschrijft bestaande documenten niet. Een verouderde formele partij vereist een actueel voorstel.
6. Eerst tekent de gekoppelde sponsorondertekenaar. Daarna tekent een ander commissieaccount namens de club. Beide vragen een eigen e-mailcode aan, geven expliciete instemming en bevestigen dezelfde documenthash.
7. Na beide bewijzen ontstaat de uitvoering en archiveert de worker de definitieve PDF. De PDF-knop kan kort melden dat archivering nog loopt. Nieuwe facturen zijn pas na beide echte ondertekeningen mogelijk.

Ondertekeningscodes zijn cryptografisch willekeurig, acht cijfers, tien minuten geldig en gebonden aan account, geverifieerd adres, bedrijf, partij en documenthash. Vijf verkeerde pogingen blokkeren de challenge. Een nieuwe code vervangt de oude. Naam, tijd en eventuele vertrouwde proxy-IP komen van de server. Een gewijzigde URL of meegestuurde actor verandert de bevoegdheid niet.

Formele wijzigingen vanuit het portaal zijn wijzigingsverzoeken. Goedkeuren wijzigt de canonieke bedrijfsgegevens; een tweede verzoek op de oude basis overschrijft die niet. Login en publiek profiel veranderen hierdoor niet.

## Facturen, bestanden en communicatie

Facturen ondersteunen 1, 2, 3, 4, 6 of 12 termijnen. Alle netto-, btw- en totaalcenten worden exact verdeeld. Download een echte factuur-PDF. Registreer uitsluitend werkelijk ontvangen bedragen met **Ontvangst registreren** en een bank-/boekingsreferentie; herhaalde verzoeken boeken niet dubbel.

Er is geen bestaande geverifieerde Mollie-configuratie aangetroffen. Online betalen is daarom uitgeschakeld, ook als een browser een betalingsparameter meestuurt. Er zijn geen verzonnen betaaltransacties of productiebetalingen. Eventuele toekomstige Mollie-integratie vereist een afzonderlijke geverifieerde serverkoppeling.

Materialen accepteren maximaal 15 MB PNG, JPEG, WebP of PDF. Afbeeldingen worden werkelijk gedecodeerd en veilig naar WebP omgezet. Originelen, bewijsstukken, overeenkomsten en facturen blijven privé. Alleen een expliciet goedgekeurd logo kan via de publieke logoroute zichtbaar worden. Bedrijf of rechten wisselen wist open formulieren en lopende browseracties; upload/download controleert toegang opnieuw na verwerking.

Publieke profielen verschijnen alleen na goedkeuring en binnen hun publicatieperiode. Een sponsorrelatie geeft geen nieuwsbriefinschrijving of marketingtoestemming. De tab **Kanalen** maakt een nieuwsbericht ter beoordeling of een nieuwsbriefconcept zonder doelgroep; redactie houdt publicatie- en verzendrechten. Sponsorinteresse blijft in de bestaande Formulieren & inbox en wordt daarnaast idempotent een CRM-lead. Het bestaande formulier gebruikt de ontvangers van de sponsorafdeling.

Herinneringen draaien elke vijf minuten in de bestaande worker, ook zonder ingelogde browser. Vernieuwing gebruikt onder andere 90/60/30 dagen; factuur- en taakvensters volgen de sponsorinstellingen. Verzendregistraties en unieke jobnummers voorkomen dubbele herinneringen binnen hetzelfde venster. Actuele rechten worden vóór verzending opnieuw gecontroleerd.

## GitHub-instellingen en productie-uitrol

**Geen nieuwe verplichte secrets of variabelen.** Behoud de bestaande namen uit [GitHub Environments](github-environments.md): Supabase Database/Auth, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL`, private Hetzner S3 en bestaande backupinstellingen. Er is geen SMTP, tweede gebruikersdatabase, externe contactenlijst of stagingomgeving nodig.

Supabase openbare registratie blijft uit; e-mailprovider aan, OTP-lengte 8 en geldigheid 600 seconden. De server genereert/verifieert de code met Supabase en verstuurt de clubtemplate via Resend. Voor sponsorcommissie-mail en voorwaarden: Sponsoring → Instellingen. Bestaande secrets blijven uitsluitend in GitHub `production` en de private runtime-configuratie.

Migratie `0020_sponsor_directory.sql` breidt de bestaande `cms_person_accounts` uit en voegt private register-/sponsortabellen toe. Zij controleert conflicterende bestaande koppelingen, bewaart bestaande ID's en verstuurt niets. RLS staat aan; `anon`, `authenticated` en `service_role` hebben geen Data API-toegang tot deze tabellen. De bestaande provisioning verleent alleen het beperkte backendaccount toegang. Een databaseguard verhindert dat een nog draaiende of teruggezette oudere applicatie de centrale accountkoppelingen opnieuw opbouwt uit websiteprofielen; alleen expliciete registerhandelingen kunnen een koppeling vervangen. Originele documentbytes, bewijsrecords, factuurbedragen en definitieve PDF-metadata zijn beschermd tegen overschrijven.

Voor een goedgekeurde productie-uitrol:

Dezelfde productiekandidaat bevat de [beperking van database-egress](database-egress.md), met een gedeelde publieke cache die bij bronwijzigingen direct ongeldig wordt. Private dossiers en rechten worden niet gecachet.

1. Beoordeel de feature-PR en de volledige groene CI-controles. Merge naar `main` start automatisch de productie-uitrol; voer die merge uit zodra de uitrol is goedgekeurd.
2. De CI bewaart een gecontroleerd image `candidate-<commit>` en `production-candidate.json` met digest, broncommit en controlerun. Dit is een buildbewijs, geen productie-release-manifest of deployment.
3. De bestaande productie-workflow controleert de mergecommit en bouwt het release-image. De deploywrapper maakt eerst de externe database-/media-/configbackup, migreert, provisiont en controleert web plus worker. Geen handmatige SQL-reset of nieuwe hostinstallatie nodig.
4. Controleer daarna de publieke pagina's, portaltoegang en web-/worker-readiness. De volledige uitnodigings-, onderteken-, download- en rolintrekkingsflows worden in de geïsoleerde testomgeving gecontroleerd; maak bij een productiecontrole geen fictieve overeenkomst of betaling namens een echte derde.

De schema-upgrade is op een herstelde afgeschermde kopie getest. Een mislukte applicatiestart gebruikt de bestaande image-/configrollback; de database wordt niet automatisch teruggezet. Herstel van register/sponsoring vereist de volledige PostgreSQL-backup met bestaande Auth-ID's plus private S3-bestanden. Browserexports importeren deze private modules niet stilzwijgend. Bewaar originele UTF-8-snapshotbytes en PDF-bestandshashes; bouw historische hashes niet opnieuw op uit JSONB. Zie [herstelprocedure](rollback-and-restore.md).

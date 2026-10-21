# Nieuwsbrieven — beheer en productie

De module staat onder **Nieuwsbrieven** (`/beheer#nieuwsbrieven`) en gebruikt de bestaande Supabase-database, CMS-rechten, Hetzner-mediabibliotheek, worker en Resend API. Development en CI gebruiken geïsoleerde data en testtransport. De eigenaar heeft voor deze opdracht expliciet **productie via de bestaande workflow** gekozen; er is geen stagingomgeving toegevoegd.

## Eenmalig instellen

1. Open **Nieuwsbrieven → Instellingen**. Controleer afzendernaam, antwoordadres en clubgegevens in de footer; bewaar de instellingen. Het websiteadres komt uit `APP_BASE_URL`. Het daadwerkelijke afzenderadres komt uitsluitend uit de bestaande GitHub Environment-variable `MAIL_FROM`.
2. Klik **Koppelen via bestaande Resend-sleutel**. Dit gebruikt de bestaande GitHub Environment-secret `RESEND_API_KEY` en maakt of hergebruikt uitsluitend de webhook voor `https://duindorpsv.nl/api/webhooks/resend`. Daarvoor vereist Resend webhookbeheerrechten. Een alleen-verzenden-sleutel kan wel mail aanbieden, maar deze koppeling niet beheren. Pas desgewenst de bestaande sleutel in GitHub `production` aan en deploy opnieuw. Er zijn geen nieuwe verplichte GitHub secrets of variabelen.
3. Als alternatief kan een beheerder in Resend een webhook met dat adres maken voor `email.delivered`, `email.bounced`, `email.complained`, `email.failed` en `email.suppressed`, en de signing secret via **Handmatig koppelen** invoeren. Deze sleutel wordt alleen in private backendopslag bewaard en nooit teruggegeven aan de browser of HTML-export. De voorkeur heeft koppelen met de bestaande GitHub-sleutel.
4. Maak onder **Doelgroepen** bijvoorbeeld een dynamische groep met interesse `clubnieuws`, `jeugd` of `vrijwilligers`, of een handmatige selectie. De start bevat geen fictieve contacten. Bestaande inschrijvingen blijven behouden; kies passende tags of neem ze handmatig op.
5. Verstuur vóór de eerste ledeneditie een **Testmail** naar je eigen expliciete testadres. Bekijk die in de gebruikte echte e-mailclients, ook met geblokkeerde afbeeldingen. Tijdens de implementatie worden geen ledenedities verstuurd.

Het koppelen van de webhook verstuurt zelf geen e-mail. Domeinverificatie voor `MAIL_FROM` blijft onderdeel van de bestaande Resend-inrichting. De app laat geen vrij afzenderadres uit een browserverzoek door.

## Een editie maken

- **Campagnes → Nieuwsbrief maken** start De clubpost. Bewerk interne naam, onderwerp, preheader en de zes bloktypen. De echte TipTap-editor ondersteunt koppen, vet/cursief, lijsten, citaten, links, uitlijning, veilige afbeeldingen en tabellen. `{{voornaam}}` gebruikt de eerste naam, of `supporter`.
- Blokken kunnen slepen, omhoog/omlaag, met Alt+pijlen, dupliceren, inklappen en verwijderen. Iedere kopie krijgt een eigen ID. De volgorde blijft gelijk in preview, export en aflevering.
- **Nieuwsbericht** invoegen kopieert een gepubliceerde teaser. **Als e-mail** in de nieuwsredactie maakt een nieuw concept met de volledige gepubliceerde artikeltekst. Beide blijven onafhankelijk van latere artikelwijzigingen of intrekking.
- Gebruik gepubliceerde foto's. De editor vertaalt beschermde CMS-thumbnails naar de openbare afbeeldingsroute. `blob:`-adressen en niet-beschikbare foto's zijn niet bruikbaar voor aflevering.
- Controleer de desktop-/mobielpreview en kies doelgroepen. Meerdere groepen vormen een ontdubbelde unie. Zonder toestemming of na afmelden/blokkeren is een contact niet selecteerbaar.
- **Testmail** verstuurt alleen naar het ingevoerde testadres. **Verzending starten** en **Inplannen** zijn afzonderlijke acties met een controle vooraf. Planning gebruikt Nederlandse tijd en slaat UTC op; ontbrekende of dubbelzinnige uren rond zomer-/wintertijd worden zichtbaar geweigerd.
- Een ingeplande/verwerkte editie is vergrendeld. Trek een planning vóór de workerclaim in om te bewerken; maak voor een volgende editie een kopie.

Een verwijderd concept verdwijnt uit de werkplek; eerdere testafleveringen en audit blijven voor traceerbaarheid in de private opslag.

Concepten worden automatisch gedeeld bewaard met versiecontrole. Bij mislukken blijft de invoer open. Met **Werkversie downloaden en serverversie laden** bewaar je eerst de eigen invoer. Navigeren binnen het CMS wacht op het bewaren van wijzigingen.

## Aflevering en toestemming

Bij plannen/starten worden inhoud, templateversie `clubpost-v1`, afzender, antwoordadres, siteadres en footer vastgelegd. De versiegebonden V1-renderer blijft beschikbaar voor deze snapshots. Dynamische groepen worden bij de verschuldigde workerclaim geëvalueerd. Dan worden unieke afleveringen per editie en genormaliseerd adres vastgelegd. De persoonlijke naam en afmeldlinks horen bij deze aflevering.

De worker controleert vóór iedere aanbieding opnieuw de actuele globale aanmeldstatus en publicatierechten. Afmelden en verzenden gebruiken dezelfde adreslock. Een afmelding of suppression wint ook van een dubbele actieve contactregel. Een gewone import kan een blokkade niet opheffen. Een afgemeld adres vereist een nieuwe bevestiging; een suppressed adres vereist eerst de expliciete beheeractie **Blokkade opheffen** en daarna opnieuw bevestiging.

De publieke pagina gebruikt dezelfde opslag. Aanmelden verstuurt een echte bevestigingsmail met een persoonlijk token dat 24 uur geldig is. GET/scannen bevestigt niets. Voorkeuren vereisen een persoonlijk token; een verzoek op e-mailadres geeft een neutraal antwoord en stuurt uitsluitend naar de eigenaar van dat adres. Afmelden vraagt geen nieuwe opt-in. De bewuste mailbox-provider-POST volgt RFC 8058; GET op die API wijzigt niets.

**Aangeboden aan Resend** is geen bezorgbewijs. Alleen een authentiek, gevalideerd Resend-event maakt een aflevering **bezorgd bij de mailserver**. Webhooks worden met Svix over de ongewijzigde requestbody gecontroleerd en op event-ID ontdubbeld. Vertraagde events starten geen nieuwe verzending. Bounces/klachten blokkeren het adres globaal. Opens, klikken en fictieve percentages worden niet getoond. Testresultaten blijven apart van ledenafleveringen.

Er zijn maximaal vijf automatische pogingen. Permanente providerfouten stoppen direct; netwerkproblemen, rate limits en tijdelijke fouten krijgen begrensde retries. Alle pogingen gebruiken dezelfde Resend-idempotencykey en hetzelfde bericht. Na 23 uur wordt niet opnieuw aangeboden: Resend bewaart idempotencykeys 24 uur. **Uitkomst onzeker** vereist controle in Resend voordat een beheerder een nieuwe editie overweegt; maak niet blind een kopie.

## Migratie en back-up

`0018_newsletter_delivery` voegt vier private tabellen toe: resources, afleveringen, tokens en minimale provider-events. De bestaande `cms_newsletter` krijgt herkomst en toestemmingsmoment; eerdere bevestigingen worden behouden. Bestaande rollen, artikelen, personen, planning en afmeldtokens worden niet vervangen. RLS en de bestaande beperkte backendrol beschermen de nieuwe tabellen; anon/authenticated/service_role krijgen geen toegang.

Oude browserback-ups zonder nieuwsbriefproperty blijven geldig en initialiseren niets bij lezen. Een aanwezige module wordt eerst volledig gevalideerd. Import neemt edities uitsluitend als nieuwe concepten over, bewaart bestaande contactstatussen en globale blokkades en activeert geen contacten. Demo's en `example.invalid`-contacten worden overgeslagen. Er wordt geen oude verzendsimulatie of planning hervat.

De bestaande admin-export bevat ook de logische nieuwsbriefinhoud. Transportgegevens, persoonlijke tokens en webhookcredentials blijven in de operationele databaseback-up. Gebruik voor volledig herstel de bestaande PostgreSQL/restic-procedure, met behoud van provider-ID's en afleveringssleutels. Een gemengde nieuwsbriefimport kan niet met de oude content-rollbackknop worden teruggedraaid: die mag geen latere toestemming, blokkade of aflevering wissen.

## Controlebewijs en grenzen

De gerichte tests omvatten echte PostgreSQL-transacties, HTTP via de Resend-adapter naar een lokale verificatieserver, retries/ontdubbeling, bronkopieën, rechten, snapshots en ondertekende events. De bestaande CI voert de module tegen geïsoleerde Supabase en de productiecontainer uit. De browsercontrole omvat 1440/1024/390 px, TipTap, gedeelde opslag, heropenen en sandboxed preview; screenshots staan in `design/newsletter-2026-10-21`.

Dit is geen bewijs van ontvangst in Outlook, Gmail of Apple Mail. Een eigen productie-testmail en de echte providerwebhook zijn afzonderlijke operationele controles. Er is geen bulkmail naar leden verstuurd tijdens implementatie of oplevering.

Providercontracten: [verzenden](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [webhookverificatie](https://resend.com/docs/webhooks/verify-webhooks-requests), [bezorgmelding](https://resend.com/docs/webhooks/emails/delivered).

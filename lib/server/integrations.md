# Integratieonderzoek — 14 oktober 2026

Sportlink Club.Data Service is de bestaande leesadapter; zonder SPORTLINK_CLIENT_ID worden gegevens niet gefingeerd. De officiële KNVB-documentatie beschrijft het online ledenaanmeldformulier en opvolging in Sportlink Club, niet een generieke schrijf-API: https://www.knvb.nl/assist-bestuurders/leden/aanmelden-van-leden.

De club publiceert een ledenaanmeldroute op https://www.duindorpsv.nl/705/inschrijven/, vanuit https://www.duindorpsv.nl/203/lid-worden/. De technische schrijfbevoegdheid en een callback-/reconciliatiecontract zijn daarmee niet vastgesteld. De CMS-adapter bewaart ontvangen aanvragen, zet externe verwerking op wacht/handmatige opvolging en bevestigt verwerkt alleen na door een bevoegd behandelaar ingevoerde externe referentie. Activiteitinschrijvingen worden nooit als ledenregistratie naar Sportlink gestuurd.

Nog nodig: door club/Sportlink bevestigd ledenaanmeldcontract, clubcode/toegang, veldmapping en testvoorziening; Resend API-key en geverifieerde afzender; Resend-domeinverificatie. Websitemail gebruikt de Resend HTTPS API; zie [de configuratiehandleiding](../../ops/github-environments.md). Development/test vereist TEST_MAIL_TO en leidt alle ontvangers daarnaartoe om. API-acceptatie (200 met geldig bericht-ID) is geen bezorgbewijs. Bij uitval tussen acceptatie en statuscommit kan een retry dubbel bezorgen; stabiele operatie-/batchsleutels beperken dubbele verzending bij retries gedurende het 24-uursvenster van Resend. Exact-eenmaal-bezorging wordt niet geclaimd.

Nieuwsbriefabonnees en onderwerpen worden uitsluitend lokaal in het CMS beheerd. Bevestiging activeert direct lokaal; afmelding is lokaal direct van kracht. De externe Brevo-synchronisatie is vervallen.

Nieuwsbriefcampagnes, doelgroepen en voorkeuren gebruiken nu de gedeelde module onder `/beheer#nieuwsbrieven`. De bestaande worker verwerkt vastgelegde edities en unieke afleveringen. De Resend-adapter bewaart provider-ID's en verwerkt uitsluitend ondertekende bezorgevents. Er worden geen externe providerlijsten gebruikt. Configuratie en betekenis van aangeboden/bezorgd/onzeker: [nieuwsbriefbeheer](../../ops/newsletters.md).

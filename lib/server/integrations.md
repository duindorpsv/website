# Integratieonderzoek — 14 oktober 2026

Sportlink Club.Data Service is de bestaande leesadapter; zonder SPORTLINK_CLIENT_ID worden gegevens niet gefingeerd. De officiële KNVB-documentatie beschrijft het online ledenaanmeldformulier en opvolging in Sportlink Club, niet een generieke schrijf-API: https://www.knvb.nl/assist-bestuurders/leden/aanmelden-van-leden.

De club publiceert een ledenaanmeldroute op https://www.duindorpsv.nl/705/inschrijven/, vanuit https://www.duindorpsv.nl/203/lid-worden/. De technische schrijfbevoegdheid en een callback-/reconciliatiecontract zijn daarmee niet vastgesteld. De CMS-adapter bewaart ontvangen aanvragen, zet externe verwerking op wacht/handmatige opvolging en bevestigt verwerkt alleen na door een bevoegd behandelaar ingevoerde externe referentie. Activiteitinschrijvingen worden nooit als ledenregistratie naar Sportlink gestuurd.

Nog nodig: door club/Sportlink bevestigd ledenaanmeldcontract, clubcode/toegang, veldmapping en testvoorziening; SMTP en geverifieerde afzender; nieuwsbriefprovider en bevestigings-/afmeldcontract. Testmail gaat uitsluitend naar TEST_MAIL_TO. SMTP kan bij uitval tussen verzending en statuscommit een bericht opnieuw bezorgen; Message-ID is stabiel, exact-eenmaal-bezorging wordt niet geclaimd.

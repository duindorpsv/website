# Nieuwsbriefbeheer — 21 oktober 2026

De implementatie volgt het aangeleverde nieuwsbriefpakket, Sites-versie 56, broncommit `0f401a9f861f3f1d9d6084c0423cda737e9e9256`. De manager- en blokeditor-CSS en blokstructuur zijn gericht overgenomen. De browserlokale simulaties zijn vervangen door de bestaande Supabase/VPS-opslag, serverrechten, worker en Resend-adapter. Er zijn geen Sites-identiteit, hostingbestanden of demo-contacten geïmporteerd.

De eigenaar heeft expliciet gekozen voor productie via de bestaande workflow. De geïsoleerde verificatie vervangt pakketverwijzingen naar een niet-bestaande stagingomgeving. Voor beheer, configuratie, migratie, toestemming en herstel: [handleiding](../../ops/newsletters.md).

De onderstaande beelden tonen de echte applicatiecomponenten en PostgreSQL-opslag in een geïsoleerde lokale browserharness met een testbeheerder. De namen/adressen zijn synthetisch; er is geen externe mail verstuurd. Echte ingelogde Supabase-/containercontroles staan daarnaast in de bestaande Playwright-CI.

- [Campagnes, 1440 px](campagnes-1440.png)
- [Editor, 1440 px](editor-1440.png)
- [Editor, 1024 px](editor-1024.png)
- [Editor, 390 px](editor-390.png)
- [Mobiele e-mailpreview](preview-390.png)
- [Contacten, 390 px](contacten-390.png)
- [Publieke inschrijving, 1440 px](inschrijving-1440.png)
- [Publieke inschrijving, 390 px](inschrijving-390.png)
- [Migratie van een bestaande abonnee](migration-result.json)
- [Browserresultaat](browser-result.json)

De preview is HTML-controle in Chromium; er is geen inboxcontrole in echte e-mailclients geclaimd. Gebruik vóór de eerste ledeneditie de echte Testmail-actie naar een eigen testadres.

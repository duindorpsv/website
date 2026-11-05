# Donateurs en factuurnummering v65

De uitbreiding gebruikt het vastgelegde OnzeTrots-prototype `fc0df593bc6561fa81c4778de34078bd07d8f878`, pakketdatum 6 november 2026. Alle 708 pakketchecksums zijn gecontroleerd. Actuele main bij aanvang: `29b59f45daf9a3be03d9d11526590a949191b8af`. Werkbranch: `codex/donateurs-v65`. De gebruiker heeft de implementatie en productie-uitrol expliciet opgedragen. Productie wordt pas na de vereiste controles en bestaande Environment-goedkeuring uitgerold.

## Gapmatrix vóór implementatie

| Onderdeel | Bestaande doelapp | Referentie v65 | Integratie en regressie |
| --- | --- | --- | --- |
| Donateursmodule | Beveiligde sponsorworkspace, centraal account en personenregister | `donors-manager.tsx/.css`, `donors.ts` | Afzonderlijke serverworkspace met zelfstandige donors/bijdragen, vier afzonderlijke grants en beperkte sponsorbronsamenvatting; directe API- en rechtenintrekkingstests |
| Catalogus en sponsorbronnen | Gedeelde items, pakketten, bevroren voorstellen/overeenkomsten | `SponsorItem.isDonorItem`, `getDonorEntries` | Optionele markering, afgeleide bronregels zonder factureerbare kopieën; conversie-/periode-/geen-tweede-factuurtests |
| Zelfstandige facturen | Sponsorinvoice vereist overeenkomst; private PDF-opslag bestaat | Donorfactuursnapshot en documentdialogen | Eigen donorrecord zonder nep-overeenkomst, permanente server-PDF, private download, bestaande mail-/auditarchitectuur; herladen, snapshotbytes en autorisatietests |
| Factuurnummers | Server overschrijft nieuwe nummers met hardcoded sponsorserie/huidig jaar | `invoice-numbering.ts`, reeksformulieren | Gezamenlijke databasegarantie, aparte configureerbare reeksen en tellers per factuurjaar, transactieve batches; echte concurrentie en historische/cancelled nummers |
| Sponsorinstellingen en periodes | v64 clubpartij, expliciete opslag, BigInt-bedragen, modalfooters en maatwerkfix | Instellingenpaneel, regelperioden en incentives | Alleen ontbrekende v65-aansluitingen; behoud nummering bij andere opslag en historische snapshots; bestaande regressies opnieuw uitvoeren |
| Visuele oplevering | OnzeTrots fonts, sidebar, provider, toegankelijke modals | 28 beelden in screenshotindex, TSX/CSS | Alle gewijzigde toestanden vergelijken, modals op 1440/1024/768/390/360 px; productiecontrole beperkt tot openbare lezingen |
| Uitrol | Bestaande GitHub CI, beschermde main, productie-VPS en v5-wrapper | Bestaande infrastructuur blijft leidend | Additieve Drizzle-migratie eerst geïsoleerd; normale PR/CI, verplichte backup en exacte live digest controleren |

## Behouden infrastructuur

De app blijft Next.js met bestaande Supabase-identiteiten en actuele sessiecontroles, Drizzle-migratiehistorie, Resend, private Hetzner S3 en worker. Geen productie-demoaccounts, voorbeeldprijzen of bijdragen worden geïmporteerd. De vier donorgrants zijn `donors/read`, `donors/manage`, `donors/invoice` en `donors/settings`. Iedere mutatiebevoegdheid vereist daarnaast leesrecht; teamgebonden rollen krijgen geen globale donateurstoegang.

## Actuele platformdocumentatie

De bij Next.js geïnstalleerde documentatie voor server/clientcomponenten en routehandlers is gelezen. De [Supabase-changelog](https://supabase.com/changelog) en actuele [RLS-documentatie](https://supabase.com/docs/guides/database/postgres/row-level-security) zijn geraadpleegd. De bestaande CLI blijft op `2.121.0` vastgelegd; de CLI-v3-omschakeling wordt niet in deze feature meegenomen. Nummeruitgifte combineert de bestaande transactie-/lockvolgorde met [database-uniciteit](https://www.postgresql.org/docs/current/indexes-unique.html).

## Uitgevoerde developmentcontroles

Migratie `0022_donor_invoices` is op de eigen geïsoleerde testdatabase uitgevoerd en herhaald. Het journaal telt 23 migraties; alle 79 vooraf aanwezige overeenkomst-/factuurrecords behouden hun oorspronkelijke nummer-/snapshotfingerprint. De 36 bestaande factuurnummers zijn permanent gereserveerd. Beide nieuwe tabellen hebben RLS en uitsluitend backendtoegang; het runtime-account `duindorp_app` heeft geen toegang tot het beheerde Auth-schema. De eerste migratieproef vond een PL/pgSQL-parsefout; die transactie is volledig teruggedraaid en de gecorrigeerde migratie is daarna geslaagd.

De eerste volledige unitsuite slaagt met 326 tests en één bestaande Sportlink-fixtureskip. Aanvullende rechten-/projectietests slagen met 5/5; de definitieve CI herhaalt de volledige actuele suite. Typecheck, Next-productiebuild en runtimebundle slagen. De nieuwe echte donorintegratiesuite slaagt met 9/9: standalone vrije bijdrage en lege einddatum na herladen, private definitieve PDF, financiële vergrendeling, afzonderlijke rechten en intrekking, gelijktijdige nummeruitgifte/idempotentie, permanente annulering, sponsor-OTP en bronontdubbeling, providerfout en vervolgens echte acceptatie door de lokale testmailsink met dezelfde PDF-bijlage. Er zijn geen echte ontvangers gebruikt.

Het vastgelegde prototype is afzonderlijk opnieuw geïnstalleerd met het frozen lockbestand: 308 tests, 307 geslaagd en één bestaande live-Sportlinkskip. De 639 oorspronkelijke bronbestanden blijven bytegelijk. De volledige prototype-typecheck kan drie bewust niet meegeleverde hostingimports niet vinden; de afzonderlijke applicatietypecheck zonder de hostingconfiguratie slaagt. Er zijn geen hostingstubs of prototype-runtimebindings aan de doelapp toegevoegd.

De donorvoorbeeld-PDF telt één pagina; de lange gemengde-btw-stresstest zeven. Alle acht pagina's zijn gerenderd en bekeken: geen tekst buiten de pagina, afgesneden bedragen of overlap, beide lokale fonts ingebed. Het stresstotaal is onafhankelijk gecontroleerd: €3.702,00 netto plus €171,03 en €79,96 btw is €3.952,99. De witte documentopbouw volgt D09; de browservoorvertoning gebruikt de bewaarde financiële snapshot in het brongetrouwe HTML-ontwerp, downloaden levert de bij uitgifte opgeslagen echte PDF.

Browseracceptatie, gepaarde schermvergelijkingen, definitieve CI en daadwerkelijke productiecommit/digest worden na uitvoering vastgelegd. Een lokale build wordt niet als externe staging- of productie-uitrol opgevoerd.
